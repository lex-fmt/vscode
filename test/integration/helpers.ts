import path from 'node:path';
import * as vscode from 'vscode';
import { Buffer } from 'node:buffer';

export const TEST_DOCUMENT_PATH = 'documents/getting-started.lex';
export const SEMANTIC_TOKENS_DOCUMENT_PATH = 'documents/semantic-tokens.lex';
export const HOVER_DOCUMENT_PATH = 'documents/semantic-tokens.lex';
export const NAVIGATION_DOCUMENT_PATH = 'documents/semantic-tokens.lex';
export const FORMATTING_DOCUMENT_PATH = 'documents/formatting.lex';
export const EXPORT_DOCUMENT_PATH = 'documents/getting-started.lex';
export const IMPORT_DOCUMENT_PATH = 'documents/sample.md';

export interface PositionMatch {
  line: number;
  character: number;
}

export function findPosition(
  document: vscode.TextDocument,
  searchText: string
): PositionMatch | undefined {
  const text = document.getText();
  const index = text.indexOf(searchText);
  if (index === -1) {
    return undefined;
  }

  const prefix = text.slice(0, index);
  const line = (prefix.match(/\n/g) || []).length;
  const lastLineBreak = prefix.lastIndexOf('\n');
  const character = index - (lastLineBreak + 1);
  return { line, character };
}

export function requireWorkspaceFolder(): vscode.WorkspaceFolder {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Workspace folder should be available during integration tests');
  }

  return folder;
}

export async function openWorkspaceDocument(
  relativePath: string
): Promise<vscode.TextDocument> {
  const folder = requireWorkspaceFolder();
  const documentUri = vscode.Uri.file(
    path.join(folder.uri.fsPath, relativePath)
  );
  const document = await vscode.workspace.openTextDocument(documentUri);
  await vscode.window.showTextDocument(document);
  return document;
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function typeText(text: string): Promise<void> {
  for (const char of text) {
    await vscode.commands.executeCommand('default:type', { text: char });
  }
}

function splitRelativePath(relativePath: string): string[] {
  return relativePath
    .split('/')
    .filter(segment => segment.length > 0);
}

export async function writeWorkspaceFile(
  relativePath: string,
  contents: Uint8Array | string
): Promise<vscode.Uri> {
  const folder = requireWorkspaceFolder();
  const segments = splitRelativePath(relativePath);
  const fileUri = vscode.Uri.joinPath(folder.uri, ...segments);
  const dirUri = segments.length > 1
    ? vscode.Uri.joinPath(folder.uri, ...segments.slice(0, -1))
    : folder.uri;
  await vscode.workspace.fs.createDirectory(dirUri);
  const data = typeof contents === 'string' ? Buffer.from(contents) : contents;
  await vscode.workspace.fs.writeFile(fileUri, data);
  return fileUri;
}

export async function removeWorkspacePath(relativePath: string): Promise<void> {
  const folder = requireWorkspaceFolder();
  const segments = splitRelativePath(relativePath);
  if (segments.length === 0) {
    return;
  }
  const targetUri = vscode.Uri.joinPath(folder.uri, ...segments);
  try {
    await vscode.workspace.fs.delete(targetUri, { recursive: true, useTrash: false });
  } catch {
    // ignore missing paths
  }
}

export async function waitForExtensionActivation<T>(
  extensionId: string,
  timeoutMs = 10000
): Promise<vscode.Extension<T>> {
  const extension = vscode.extensions.getExtension<T>(extensionId);
  if (!extension) {
    throw new Error(`Extension ${extensionId} is not installed`);
  }

  if (extension.isActive) {
    return extension;
  }

  const start = Date.now();
  const pollIntervalMs = 200;

  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    if (extension.isActive) {
      return extension;
    }
  }

  throw new Error(`Timed out waiting for ${extensionId} activation`);
}
