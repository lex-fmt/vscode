/**
 * Import/Export commands for converting between Lex and other formats.
 * All conversions go through the LSP using lex.export and lex.import commands.
 * See README.lex "Import & Export Commands" section for full documentation.
 */
import * as vscode from 'vscode';
import { join } from 'node:path';
import { ExecuteCommandRequest, LanguageClient } from 'vscode-languageclient/node.js';
import type {
  Location as LspLocation,
  WorkspaceEdit as LspWorkspaceEdit,
} from 'vscode-languageserver-types';

async function openConvertedDocument(content: string, languageId: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: languageId,
  });
  await vscode.window.showTextDocument(doc);
}

async function getReadyClient(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<LanguageClient> {
  await waitForClientReady();
  const client = getClient();
  if (!client) {
    throw new Error('Lex language server is not running.');
  }
  return client;
}

async function exportViaLsp(
  format: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>,
  outputPath?: string
): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor with content to export.');
  }

  if (editor.document.languageId !== 'lex') {
    throw new Error(`Export to ${format} is only available for .lex files.`);
  }

  const client = await getReadyClient(getClient, waitForClientReady);
  const content = editor.document.getText();
  const sourceUri = editor.document.uri.toString();

  const args = outputPath ? [format, content, sourceUri, outputPath] : [format, content, sourceUri];

  const result = (await client.sendRequest(ExecuteCommandRequest.type, {
    command: 'lex.export',
    arguments: args,
  })) as unknown;

  if (typeof result !== 'string') {
    throw new Error('Export failed: unexpected response from language server.');
  }

  return result;
}

async function importViaLsp(
  format: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('No active editor with content to import.');
  }

  const client = await getReadyClient(getClient, waitForClientReady);
  const content = editor.document.getText();

  const result = (await client.sendRequest(ExecuteCommandRequest.type, {
    command: 'lex.import',
    arguments: [format, content],
  })) as unknown;

  if (typeof result !== 'string') {
    throw new Error('Import failed: unexpected response from language server.');
  }

  return result;
}

function createExportCommand(
  format: string,
  languageId: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    try {
      const result = await exportViaLsp(format, getClient, waitForClientReady);
      await openConvertedDocument(result, languageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
  };
}

function createExportToPdfCommand(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor with content to export.');
      return;
    }

    if (editor.document.languageId !== 'lex') {
      vscode.window.showErrorMessage('Export to PDF is only available for .lex files.');
      return;
    }

    // Suggest a default filename based on the source file
    const sourceUri = editor.document.uri;
    const sourceName = sourceUri.path.split('/').pop() || 'document';
    const defaultName = sourceName.replace(/\.lex$/, '.pdf');

    // Show save dialog
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(join(sourceUri.fsPath, '..', defaultName)),
      filters: { 'PDF Documents': ['pdf'] },
      title: 'Export to PDF',
    });

    if (!saveUri) {
      return; // User cancelled
    }

    try {
      const outputPath = await exportViaLsp('pdf', getClient, waitForClientReady, saveUri.fsPath);
      vscode.window.showInformationMessage(`PDF exported to ${outputPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
  };
}

const CONVERTIBLE_LANGUAGES: Record<string, string> = {
  markdown: 'markdown',
};

function createConvertToLexCommand(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor with content to convert.');
      return;
    }

    const format = CONVERTIBLE_LANGUAGES[editor.document.languageId];
    if (!format) {
      const supported = Object.keys(CONVERTIBLE_LANGUAGES).join(', ');
      vscode.window.showErrorMessage(
        `Convert to Lex is available for: ${supported}. Current file is ${editor.document.languageId}.`
      );
      return;
    }

    // Determine default output path: same directory, same base name, .lex extension
    const sourceUri = editor.document.uri;
    const sourceName = sourceUri.path.split('/').pop() || 'document';
    const defaultName = sourceName.replace(/\.[^.]+$/, '.lex');

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(join(sourceUri.fsPath, '..', defaultName)),
      filters: { 'Lex Documents': ['lex'] },
      title: 'Convert to Lex',
    });

    if (!saveUri) {
      return; // User cancelled
    }

    try {
      const result = await importViaLsp(format, getClient, waitForClientReady);
      await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(result));
      const doc = await vscode.workspace.openTextDocument(saveUri);
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Convert to Lex failed: ${message}`);
    }
  };
}

export function registerCommands(
  context: vscode.ExtensionContext,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'lex.exportToMarkdown',
      createExportCommand('markdown', 'markdown', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.exportToHtml',
      createExportCommand('html', 'html', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.exportToPdf',
      createExportToPdfCommand(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.convertToLex',
      createConvertToLexCommand(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.insertAssetReference', (uri?: vscode.Uri) =>
      insertAssetReference(uri)
    ),
    vscode.commands.registerCommand('lex.insertVerbatimBlock', (uri?: vscode.Uri) =>
      insertVerbatimBlock(uri)
    ),
    vscode.commands.registerCommand('lex.goToNextAnnotation', () =>
      navigateAnnotation('lex.next_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.goToPreviousAnnotation', () =>
      navigateAnnotation('lex.previous_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.resolveAnnotation', () =>
      applyAnnotationEditCommand('lex.resolve_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.toggleAnnotationResolution', () =>
      applyAnnotationEditCommand('lex.toggle_annotations', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.formatTable', () =>
      formatTableAtCursor(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.table.nextCell', () => navigateTableCell('next')),
    vscode.commands.registerCommand('lex.table.previousCell', () => navigateTableCell('previous'))
  );
}

import { commands } from '@lex/shared';
import { VSCodeEditorAdapter } from './adapter.js';
import { dirname, relative } from 'node:path';

async function insertAssetReference(providedUri?: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.');
    return;
  }

  const fileUri = providedUri ?? (await pickWorkspaceFile('Select asset to insert'));
  if (!fileUri) {
    return;
  }

  const docPath = editor.document.uri.fsPath;
  const assetPath = fileUri.fsPath;
  const relativePath = relative(dirname(docPath), assetPath);

  const adapter = new VSCodeEditorAdapter(editor);
  await commands.InsertAssetCommand.execute(adapter, {
    path: relativePath,
  });
}

async function insertVerbatimBlock(providedUri?: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.');
    return;
  }

  const fileUri =
    providedUri ?? (await pickWorkspaceFile('Select file to embed as verbatim block'));
  if (!fileUri) {
    return;
  }

  const assetPath = fileUri.fsPath;

  // Read file content
  const fileContent = await vscode.workspace.fs.readFile(fileUri);
  const decoder = new TextDecoder();
  const content = decoder.decode(fileContent);

  // Infer language from extension
  const ext = assetPath.split('.').pop() || 'txt';
  const language =
    ext === 'py' ? 'python' : ext === 'js' ? 'javascript' : ext === 'ts' ? 'typescript' : ext;

  const adapter = new VSCodeEditorAdapter(editor);
  await commands.InsertVerbatimCommand.execute(adapter, {
    content: content.trim(),
    language,
  });
}

async function navigateAnnotation(
  lspCommand: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.');
    return;
  }

  if (editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Annotation navigation works only inside Lex documents.');
    return;
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady);
    const protocolPosition = client.code2ProtocolConverter.asPosition(editor.selection.active);
    const response = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: lspCommand,
      arguments: [editor.document.uri.toString(), protocolPosition],
    })) as unknown;

    if (!response) {
      vscode.window.showInformationMessage('No annotations were found in this document.');
      return;
    }

    const targetLocation = client.protocol2CodeConverter.asLocation(response as LspLocation);
    const targetDocument = await vscode.workspace.openTextDocument(targetLocation.uri);
    const targetEditor = await vscode.window.showTextDocument(targetDocument);
    const targetPosition = targetLocation.range.start;
    targetEditor.selection = new vscode.Selection(targetPosition, targetPosition);
    targetEditor.revealRange(targetLocation.range, vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to navigate annotations: ${message}`);
  }
}

async function applyAnnotationEditCommand(
  lspCommand: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.');
    return;
  }

  if (editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Annotation commands are only available for .lex files.');
    return;
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady);
    const protocolPosition = client.code2ProtocolConverter.asPosition(editor.selection.active);
    const response = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: lspCommand,
      arguments: [editor.document.uri.toString(), protocolPosition],
    })) as unknown;

    if (!response) {
      vscode.window.showInformationMessage('No annotation was resolved at the current position.');
      return;
    }

    const workspaceEdit = await client.protocol2CodeConverter.asWorkspaceEdit(
      response as LspWorkspaceEdit
    );
    if (!workspaceEdit) {
      throw new Error('Language server returned an invalid workspace edit.');
    }

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
      throw new Error('Failed to apply workspace edit.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to update annotation: ${message}`);
  }
}

async function formatTableAtCursor(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'lex') {
    return;
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady);
    const content = editor.document.getText();
    const position = editor.selection.active;

    const result = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: 'lex.table.format',
      arguments: [content, position.line, position.character],
    })) as { start: number; end: number; newText: string } | null;

    if (!result) {
      vscode.window.showInformationMessage('No table found at cursor position.');
      return;
    }

    // Convert byte offsets to VS Code positions
    const startPos = editor.document.positionAt(result.start);
    const endPos = editor.document.positionAt(result.end);
    const range = new vscode.Range(startPos, endPos);

    await editor.edit((editBuilder) => {
      editBuilder.replace(range, result.newText);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Format table failed: ${message}`);
  }
}

async function navigateTableCell(direction: 'next' | 'previous'): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'lex') {
    return;
  }

  const position = editor.selection.active;
  const line = editor.document.lineAt(position.line);
  const lineText = line.text;

  // Check if we're in a pipe row
  if (!lineText.trim().startsWith('|')) {
    // Not in a table — fall through to default Tab behavior
    if (direction === 'next') {
      await vscode.commands.executeCommand('tab');
    } else {
      await vscode.commands.executeCommand('outdent');
    }
    return;
  }

  // Find pipe positions in the current line
  const pipePositions: number[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '|') {
      pipePositions.push(i);
    }
  }

  if (pipePositions.length < 2) {
    return;
  }

  // Find which cell we're in (between which pipes)
  const cursorCol = position.character;

  if (direction === 'next') {
    // Find the next pipe after cursor, then position after it + 1 space
    const nextPipe = pipePositions.find((p) => p > cursorCol);
    if (nextPipe !== undefined) {
      const nextPipeIdx = pipePositions.indexOf(nextPipe);
      if (nextPipeIdx < pipePositions.length - 1) {
        // Move to content of next cell (after pipe + space)
        const targetCol = nextPipe + 2;
        const newPos = new vscode.Position(position.line, Math.min(targetCol, lineText.length));
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
      }
    }

    // We're in the last cell — move to first cell of next row
    const nextLine = position.line + 1;
    if (nextLine < editor.document.lineCount) {
      const nextLineText = editor.document.lineAt(nextLine).text;
      if (nextLineText.trim().startsWith('|')) {
        const firstPipe = nextLineText.indexOf('|');
        const targetCol = firstPipe + 2;
        const newPos = new vscode.Position(nextLine, Math.min(targetCol, nextLineText.length));
        editor.selection = new vscode.Selection(newPos, newPos);
        return;
      }
    }
  } else {
    // Find the pipe before cursor, then find the pipe before that
    const prevPipes = pipePositions.filter((p) => p < cursorCol);
    if (prevPipes.length >= 2) {
      // Move to content of previous cell
      const targetPipe = prevPipes[prevPipes.length - 2];
      const targetCol = targetPipe + 2;
      const newPos = new vscode.Position(position.line, Math.min(targetCol, lineText.length));
      editor.selection = new vscode.Selection(newPos, newPos);
      return;
    }

    // We're in the first cell — move to last cell of previous row
    const prevLine = position.line - 1;
    if (prevLine >= 0) {
      const prevLineText = editor.document.lineAt(prevLine).text;
      if (prevLineText.trim().startsWith('|')) {
        const prevPipePositions: number[] = [];
        for (let i = 0; i < prevLineText.length; i++) {
          if (prevLineText[i] === '|') {
            prevPipePositions.push(i);
          }
        }
        if (prevPipePositions.length >= 2) {
          // Move to last cell content
          const targetPipe = prevPipePositions[prevPipePositions.length - 2];
          const targetCol = targetPipe + 2;
          const newPos = new vscode.Position(prevLine, Math.min(targetCol, prevLineText.length));
          editor.selection = new vscode.Selection(newPos, newPos);
          return;
        }
      }
    }
  }
}

async function pickWorkspaceFile(title: string): Promise<vscode.Uri | undefined> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  const selection = await vscode.window.showOpenDialog({
    title,
    canSelectMany: false,
    canSelectFolders: false,
    canSelectFiles: true,
    defaultUri: workspaceRoot,
    openLabel: 'Select',
  });

  return selection?.[0];
}
