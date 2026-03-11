import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  DidChangeConfigurationNotification,
} from 'vscode-languageclient/node.js';
import { LEX_CONFIGURATION_SECTION } from './config.js';

/** Config file name — must match `CONFIG_FILE_NAME` in lex-config. */
export const LEX_CONFIG_FILE = '.lex.toml';

export function createLexClient(
  binaryPath: string,
  context: vscode.ExtensionContext
): LanguageClient {
  const lexWatcher = vscode.workspace.createFileSystemWatcher('**/*.lex');
  context.subscriptions.push(lexWatcher);

  const configWatcher = vscode.workspace.createFileSystemWatcher(`**/${LEX_CONFIG_FILE}`);
  context.subscriptions.push(configWatcher);

  const outputChannel = vscode.window.createOutputChannel('Lex LSP');
  context.subscriptions.push(outputChannel);

  const serverOptions: ServerOptions = {
    command: binaryPath,
    args: [],
    options: {
      env: process.env,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'lex' }],
    synchronize: {
      fileEvents: [lexWatcher, configWatcher],
    },
    outputChannel,
  };

  const client = new LanguageClient('lexLsp', 'Lex Language Server', serverOptions, clientOptions);

  // Notify LSP when .lex.toml changes on disk
  const onConfigFile = () => {
    void client.sendNotification(DidChangeConfigurationNotification.type, {
      settings: null,
    });
  };
  configWatcher.onDidChange(onConfigFile);
  configWatcher.onDidCreate(onConfigFile);
  configWatcher.onDidDelete(onConfigFile);

  // Notify LSP when VS Code lex.formatting.* settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(LEX_CONFIGURATION_SECTION)) {
        void client.sendNotification(DidChangeConfigurationNotification.type, {
          settings: null,
        });
      }
    })
  );

  return client;
}
