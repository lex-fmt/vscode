import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { LanguageClient } from 'vscode-languageclient/node.js';
import {
  buildLexExtensionConfig,
  LEX_CONFIGURATION_SECTION,
  LSP_BINARY_SETTING
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
  type PathCompletionDiagnostics
} from './pathCompletion.js';

export interface LexExtensionApi {
  clientReady(): Promise<void>;
  pathCompletionDiagnostics(): PathCompletionDiagnostics;
}

let client: LanguageClient | undefined;
let resolveClientReady: (() => void) | undefined;
const clientReadyPromise = new Promise<void>(resolve => {
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
    clientReady: () => clientReadyPromise,
    pathCompletionDiagnostics: () => getPathCompletionDiagnostics()
  };
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<LexExtensionApi> {
  // Apply monochrome theme for .lex files (adapts to light/dark mode)
  await applyLexTheme();
  setupThemeListeners(context);

  const config = vscode.workspace.getConfiguration(LEX_CONFIGURATION_SECTION);
  const configuredLspPath = config.get<string | null>(LSP_BINARY_SETTING, null);
  const resolvedConfig = buildLexExtensionConfig(
    context.extensionUri.fsPath,
    configuredLspPath
  );

  // Register import/export commands (requires LSP for conversions)
  registerCommands(
    context,
    () => client,
    () => clientReadyPromise
  );
  registerPreviewCommands(context, () => client, () => clientReadyPromise);
  registerPathCompletion();

  if (shouldSkipLanguageClient()) {
    console.info('[lex] Skipping language client startup (LEX_VSCODE_SKIP_SERVER=1).');
    signalClientReady();
    return createApi();
  }

  if (!existsSync(resolvedConfig.lspBinaryPath)) {
    console.warn(`[lex] LSP binary not found at ${resolvedConfig.lspBinaryPath}. Language features disabled.`);
    signalClientReady();
    return createApi();
  }

  client = createLexClient(resolvedConfig.lspBinaryPath, context);
  context.subscriptions.push(client);
  await client.start();
  signalClientReady();
  return createApi();
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }

  await client.stop();
  client = undefined;
}
