import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { LanguageClient } from 'vscode-languageclient/node.js';
import {
  buildLexExtensionConfig,
  defaultLspBinaryPath,
  LEX_CONFIGURATION_SECTION,
  LSP_BINARY_SETTING,
} from './config.js';
import { createLexClient } from './client.js';
import { installLogMirror } from './instrumentation.js';
import { registerTrustPrompt } from './trustPrompt.js';
import { applyLexTheme, setupThemeListeners } from './theme.js';
// Import/export commands - see README.lex "Import & Export Commands" for docs
import { registerCommands } from './commands.js';
// Live preview - see README.lex "Preview" for docs
import { registerPreviewCommands, getActivePreviewCount } from './preview.js';
// Path completion - triggered by @ in lex files
import {
  registerPathCompletion,
  getPathCompletionDiagnostics,
  type PathCompletionDiagnostics,
} from './pathCompletion.js';
import { initTreeSitter, type LexTreeSitter } from './treesitter.js';
import { createInjectionHighlighter, type InjectionHighlighterApi } from './injections.js';
import { createEmbeddedTokenizer, type EmbeddedTokenizer } from './embedded.js';
import { injections } from '@lex/shared';

export interface TreeSitterInitFailure {
  stage: string;
  error: string;
  resourcesDir: string;
}

export interface LexExtensionApi {
  clientReady(): Promise<LanguageClient | undefined>;
  pathCompletionDiagnostics(): PathCompletionDiagnostics;
  treeSitter(): LexTreeSitter | null;
  treeSitterInitError(): TreeSitterInitFailure | null;
  injectionHighlighter(): InjectionHighlighterApi | null;
  injectionStatus(): injections.InjectionStatus | null;
  activePreviewCount(): number;
}

let client: LanguageClient | undefined;
let treeSitter: LexTreeSitter | null = null;
let treeSitterInitFailure: TreeSitterInitFailure | null = null;
let embeddedTokenizer: EmbeddedTokenizer | null = null;
let injectionHl: InjectionHighlighterApi | null = null;
let resolveClientReady: (() => void) | undefined;
const clientReadyPromise = new Promise<void>((resolve) => {
  resolveClientReady = resolve;
});

function signalClientReady(): void {
  resolveClientReady?.();
}

function shouldSkipLanguageClient(): boolean {
  return process.env.LEX_VSCODE_SKIP_SERVER === '1';
}

function createApi(): LexExtensionApi {
  return {
    clientReady: () => clientReadyPromise.then(() => client),
    pathCompletionDiagnostics: () => getPathCompletionDiagnostics(),
    treeSitter: () => treeSitter,
    treeSitterInitError: () => treeSitterInitFailure,
    injectionHighlighter: () => injectionHl,
    injectionStatus: () => injectionHl?.getStatus() ?? null,
    activePreviewCount: () => getActivePreviewCount(),
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<LexExtensionApi> {
  // Install the file+stderr mirror first so any subsequent log /
  // notification call (including activation failures wrapped in
  // try/catch) is captured. Gated on LEX_LOG_TO_STDERR=1.
  installLogMirror();

  const log = vscode.window.createOutputChannel('Lex');
  context.subscriptions.push(log);
  log.appendLine(`[lex] Activating from: ${context.extensionUri.fsPath}`);
  log.appendLine(`[lex] Extension mode: ${context.extensionMode}`);

  // Apply monochrome theme for .lex files (adapts to light/dark mode)
  await applyLexTheme();
  setupThemeListeners(context);

  const config = vscode.workspace.getConfiguration(LEX_CONFIGURATION_SECTION);
  const configuredLspPath = config.get<string | null>(LSP_BINARY_SETTING, null);
  log.appendLine(`[lex] Configured LSP path: ${configuredLspPath ?? '(default)'}`);
  const resolvedConfig = buildLexExtensionConfig(context.extensionUri.fsPath, configuredLspPath);
  log.appendLine(`[lex] Resolved LSP path: ${resolvedConfig.lspBinaryPath}`);
  log.appendLine(`[lex] Binary exists: ${existsSync(resolvedConfig.lspBinaryPath)}`);
  if (resolvedConfig.warning) {
    log.appendLine(`[lex] Warning: ${resolvedConfig.warning}`);
  }

  // Sync lex.formatOnSave → editor.formatOnSave for [lex] files
  applyFormatOnSave();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lex.formatOnSave')) {
        applyFormatOnSave();
      }
    })
  );

  // Track whether cursor is inside a table pipe row (for Tab hijacking)
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor.document.languageId !== 'lex') {
        return;
      }
      const line = e.textEditor.document.lineAt(e.selections[0].active.line);
      const inTable = line.text.trim().startsWith('|');
      void vscode.commands.executeCommand('setContext', 'lex.inTableCell', inTable);
    })
  );

  // Register import/export commands (requires LSP for conversions)
  registerCommands(
    context,
    () => client,
    () => clientReadyPromise
  );
  registerPreviewCommands(
    context,
    () => client,
    () => clientReadyPromise
  );
  registerPathCompletion();

  // Initialize tree-sitter (optional — extension works without it).
  // The init logger writes one breadcrumb per stage to the Lex channel so
  // failures are attributable instead of swallowed by `console.warn`.
  const tsResult = await initTreeSitter(context.extensionUri.fsPath, (msg) => log.appendLine(msg));
  if (tsResult.ok) {
    treeSitter = tsResult.ts;
    context.subscriptions.push({ dispose: () => treeSitter?.dispose() });

    // Embedded-language tokenizer for verbatim-block highlighting.
    // Reuses the runtime that initTreeSitter loaded; lazy-loads each
    // language grammar on first use.
    embeddedTokenizer = createEmbeddedTokenizer(context.extensionUri.fsPath, (msg) =>
      log.appendLine(msg)
    );
    context.subscriptions.push({ dispose: () => embeddedTokenizer?.dispose() });

    injectionHl = createInjectionHighlighter(treeSitter, embeddedTokenizer);
    context.subscriptions.push({ dispose: () => injectionHl?.dispose() });
  } else {
    treeSitterInitFailure = {
      stage: tsResult.stage,
      error: tsResult.error,
      resourcesDir: tsResult.resourcesDir,
    };
  }

  // Debug command: dump injection status to the Lex output channel.
  // Visible in manual exploration via Command Palette → "Lex: Dump Injection
  // Status". Tests use `api.injectionStatus()` directly.
  context.subscriptions.push(
    vscode.commands.registerCommand('lex.injection.dumpStatus', async () => {
      log.appendLine('');
      if (!injectionHl) {
        log.appendLine('[lex] Injection highlighter not initialized.');
        if (treeSitterInitFailure) {
          log.appendLine(
            `[lex]   tree-sitter init failed at stage "${treeSitterInitFailure.stage}":`
          );
          log.appendLine(`[lex]   ${treeSitterInitFailure.error}`);
          log.appendLine(`[lex]   resources dir = ${treeSitterInitFailure.resourcesDir}`);
        } else {
          log.appendLine('[lex] No init failure recorded — extension may not have activated.');
        }
        log.show(true);
        return;
      }
      await injectionHl.refresh();
      const status = injectionHl.getStatus();
      if (!status) {
        log.appendLine('[lex] Injection status unavailable (no document refreshed yet).');
      } else {
        log.appendLine(injections.formatInjectionStatus(status));
      }
      log.show(true);
    })
  );

  if (shouldSkipLanguageClient()) {
    log.appendLine('[lex] Skipping language client (LEX_VSCODE_SKIP_SERVER=1)');
    signalClientReady();
    return createApi();
  }

  if (!existsSync(resolvedConfig.lspBinaryPath)) {
    const msg = `Lex language server not found at ${resolvedConfig.lspBinaryPath}. Language features (outline, formatting, diagnostics) are disabled.`;
    log.appendLine(`[lex] ${msg}`);
    log.show(true);
    void vscode.window.showWarningMessage(msg, 'Open Settings').then((choice) => {
      if (choice === 'Open Settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'lex.lspBinaryPath');
      }
    });
    signalClientReady();
    return createApi();
  }

  log.appendLine(`[lex] Starting LSP client with binary: ${resolvedConfig.lspBinaryPath}`);
  client = createLexClient(resolvedConfig.lspBinaryPath, context);
  context.subscriptions.push(client);
  try {
    await client.start();
    log.appendLine('[lex] LSP client started successfully');
    // Register `lex/trustRequest` handler now that the client is
    // running. The LSP fires this during extension boot when a
    // subprocess handler hasn't been pinned in the workspace trust
    // store; without a handler, the request would error out and the
    // namespace would register schema-only with a "request failed"
    // diagnostic.
    context.subscriptions.push(registerTrustPrompt(client));
  } catch (err) {
    log.appendLine(`[lex] LSP client failed to start: ${String(err)}`);
  }

  // Show status bar when using a custom (non-bundled) LSP binary
  const lspSource = process.env.LEX_LSP_SOURCE;
  const isCustom =
    lspSource || resolvedConfig.lspBinaryPath !== defaultLspBinaryPath(context.extensionUri.fsPath);
  if (isCustom) {
    const label = lspSource ?? resolvedConfig.lspBinaryPath;
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
    item.text = '$(beaker) lexd-lsp: custom';
    item.tooltip = `LSP binary: ${label}`;
    item.name = 'Lex LSP Binary';
    item.show();
    context.subscriptions.push(item);
    log.appendLine(`[lex] Custom LSP binary indicator shown: ${label}`);
  }

  signalClientReady();
  return createApi();
}

function applyFormatOnSave(): void {
  const lexConfig = vscode.workspace.getConfiguration(LEX_CONFIGURATION_SECTION);
  const enabled = lexConfig.get<boolean>('formatOnSave', false);
  const editorConfig = vscode.workspace.getConfiguration('editor', { languageId: 'lex' });
  void editorConfig.update('formatOnSave', enabled, vscode.ConfigurationTarget.Global, true);
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }

  await client.stop();
  client = undefined;
}
