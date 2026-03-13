import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { LanguageClient } from 'vscode-languageclient/node.js';
import {
  buildLexExtensionConfig,
  LEX_CONFIGURATION_SECTION,
  LSP_BINARY_SETTING,
} from './config.js';
import { createLexClient } from './client.js';
import { applyLexTheme, setupThemeListeners } from './theme.js';
// Import/export commands - see README.lex "Import & Export Commands" for docs
import { registerCommands } from './commands.js';
// Live preview - see README.lex "Preview" for docs
import { registerPreviewCommands } from './preview.js';
// Path completion - triggered by @ in lex files
import {
  registerPathCompletion,
  getPathCompletionDiagnostics,
  type PathCompletionDiagnostics,
} from './pathCompletion.js';
import { initTreeSitter, type LexTreeSitter } from './treesitter.js';
import { createInjectionHighlighter, type InjectionHighlighterApi } from './injections.js';

export interface LexExtensionApi {
  clientReady(): Promise<LanguageClient | undefined>;
  pathCompletionDiagnostics(): PathCompletionDiagnostics;
  treeSitter(): LexTreeSitter | null;
  injectionHighlighter(): InjectionHighlighterApi | null;
}

let client: LanguageClient | undefined;
let treeSitter: LexTreeSitter | null = null;
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
    injectionHighlighter: () => injectionHl,
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<LexExtensionApi> {
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

  // Initialize tree-sitter (optional — extension works without it)
  treeSitter = await initTreeSitter(context.extensionUri.fsPath);
  if (treeSitter) {
    context.subscriptions.push({ dispose: () => treeSitter?.dispose() });

    // Initialize injection highlighting (tree-sitter powered)
    injectionHl = createInjectionHighlighter(treeSitter);
    context.subscriptions.push({ dispose: () => injectionHl?.dispose() });
  }

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
  } catch (err) {
    log.appendLine(`[lex] LSP client failed to start: ${String(err)}`);
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
