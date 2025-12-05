import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
} from 'vscode-languageclient/node.js';

export function createLexClient(
  binaryPath: string,
  context: vscode.ExtensionContext
): LanguageClient {
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.lex');
  context.subscriptions.push(fileWatcher);

  const outputChannel = vscode.window.createOutputChannel('Lex LSP');
  context.subscriptions.push(outputChannel);

  const serverOptions: ServerOptions = {
    command: binaryPath,
    args: [],
    options: {
      env: process.env,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'lex' }],
    synchronize: {
      fileEvents: fileWatcher
    },
    outputChannel
  };

  return new LanguageClient(
    'lexLsp',
    'Lex Language Server',
    serverOptions,
    clientOptions
  );
}
