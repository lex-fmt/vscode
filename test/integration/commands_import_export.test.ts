import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  EXPORT_DOCUMENT_PATH,
  IMPORT_DOCUMENT_PATH,
  openWorkspaceDocument
} from './helpers.js';

async function waitForNewUntitledDocument(
  expectedLanguageId: string,
  timeoutMs = 5000
): Promise<vscode.TextDocument | undefined> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check all open documents, not just visible editors
    const allDocs = vscode.workspace.textDocuments;
    const matchingDoc = allDocs.find(
      doc => doc.uri.scheme === 'untitled' && doc.languageId === expectedLanguageId
    );

    if (matchingDoc) {
      return matchingDoc;
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return undefined;
}

integrationTest('export to markdown produces valid markdown output', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(EXPORT_DOCUMENT_PATH);
  assert.strictEqual(document.languageId, 'lex', 'Document should be recognized as lex');

  try {
    await vscode.commands.executeCommand('lex.exportToMarkdown');

    // Wait for new untitled document to appear
    const newDoc = await waitForNewUntitledDocument('markdown');

    // Debug: log all documents if not found
    if (!newDoc) {
      const allDocs = vscode.workspace.textDocuments;
      console.log('All open documents:', allDocs.map(d => ({
        uri: d.uri.toString(),
        languageId: d.languageId,
        scheme: d.uri.scheme
      })));
    }

    assert.ok(newDoc, 'Export should open a new untitled markdown document');

    const content = newDoc.getText();
    assert.ok(content.length > 0, 'Exported content should not be empty');
    // Markdown output should start with a heading marker
    assert.ok(content.startsWith('#'), 'Markdown output should start with a heading (#)');
  } finally {
    await closeAllEditors();
  }
});

integrationTest('import from markdown produces valid lex output', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(IMPORT_DOCUMENT_PATH);
  assert.strictEqual(document.languageId, 'markdown', 'Document should be recognized as markdown');

  try {
    await vscode.commands.executeCommand('lex.importFromMarkdown');

    // Wait for new untitled document to appear
    const newDoc = await waitForNewUntitledDocument('lex');

    // Debug: log all documents if not found
    if (!newDoc) {
      const allDocs = vscode.workspace.textDocuments;
      console.log('All open documents:', allDocs.map(d => ({
        uri: d.uri.toString(),
        languageId: d.languageId,
        scheme: d.uri.scheme
      })));
    }

    assert.ok(newDoc, 'Import should open a new untitled lex document');

    const content = newDoc.getText();
    assert.ok(content.length > 0, 'Imported content should not be empty');
    // Lex output should contain the document title from markdown
    assert.ok(content.includes('Sample Markdown'), 'Lex output should contain the original title');
  } finally {
    await closeAllEditors();
  }
});

integrationTest('export to html produces valid html output', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(EXPORT_DOCUMENT_PATH);
  assert.strictEqual(document.languageId, 'lex', 'Document should be recognized as lex');

  try {
    await vscode.commands.executeCommand('lex.exportToHtml');

    // Wait for new untitled document to appear
    const newDoc = await waitForNewUntitledDocument('html');

    // Debug: log all documents if not found
    if (!newDoc) {
      const allDocs = vscode.workspace.textDocuments;
      console.log('All open documents:', allDocs.map(d => ({
        uri: d.uri.toString(),
        languageId: d.languageId,
        scheme: d.uri.scheme
      })));
    }

    assert.ok(newDoc, 'Export should open a new untitled html document');

    const content = newDoc.getText();
    assert.ok(content.length > 0, 'Exported content should not be empty');
    // HTML output should contain typical HTML tags
    assert.ok(content.includes('<'), 'HTML output should contain HTML tags');
  } finally {
    await closeAllEditors();
  }
});
