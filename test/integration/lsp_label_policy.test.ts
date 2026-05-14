import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, findPosition, openWorkspaceDocument } from './helpers.js';

const LABEL_POLICY_DOCUMENT_PATH = 'documents/label-policy.lex';

async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');
  const api = await extension.activate();
  await api.clientReady();
}

async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (d: readonly vscode.Diagnostic[]) => boolean,
  timeoutMs = 5000
): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now();
  const pollMs = 100;
  let current: readonly vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);
  while (!predicate(current)) {
    if (Date.now() - start > timeoutMs) {
      const summary = current
        .map((d) => `${diagnosticCode(d) || '(no code)'}:${d.message.slice(0, 60)}`)
        .join(' | ');
      throw new Error(`Timed out waiting for diagnostics; last: [${summary}]`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    current = vscode.languages.getDiagnostics(uri);
  }
  return current;
}

function diagnosticCode(d: vscode.Diagnostic): string {
  if (typeof d.code === 'string') return d.code;
  if (typeof d.code === 'number') return String(d.code);
  if (d.code && typeof d.code === 'object' && 'value' in d.code) return String(d.code.value);
  return '';
}

integrationTest('label-policy: doc.* and unknown lex.* labels surface as diagnostics', async () => {
  await activateExtension();
  const document = await openWorkspaceDocument(LABEL_POLICY_DOCUMENT_PATH);

  const diagnostics = await waitForDiagnostics(document.uri, (ds) => {
    const codes = ds.map(diagnosticCode);
    return (
      codes.filter((c) => c === 'forbidden-label-prefix').length >= 2 &&
      codes.some((c) => c === 'unknown-lex-canonical')
    );
  });

  const forbidden = diagnostics.filter((d) => diagnosticCode(d) === 'forbidden-label-prefix');
  assert.equal(
    forbidden.length,
    2,
    `expected 2 forbidden-label-prefix diagnostics (doc.table + doc.unknownthing), got ${forbidden.length}`
  );

  const unknown = diagnostics.filter((d) => diagnosticCode(d) === 'unknown-lex-canonical');
  assert.equal(
    unknown.length,
    1,
    `expected 1 unknown-lex-canonical diagnostic (lex.notarealsemantic), got ${unknown.length}`
  );

  // Diagnostic ranges should point at the offending label, not the
  // whole document. Verify the doc.table diagnostic intersects the
  // line containing `:: doc.table ::`.
  const docTablePos = findPosition(document, ':: doc.table ::');
  assert.ok(docTablePos, 'doc.table label should appear in fixture');
  const docTableDiag = forbidden.find((d) => d.range.start.line === docTablePos.line);
  assert.ok(
    docTableDiag,
    `expected a forbidden-label-prefix diagnostic on line ${docTablePos.line}`
  );

  await closeAllEditors();
});

integrationTest('label-policy: quickfix rewrites doc.table to table', async () => {
  await activateExtension();
  const document = await openWorkspaceDocument(LABEL_POLICY_DOCUMENT_PATH);

  const diagnostics = await waitForDiagnostics(document.uri, (ds) =>
    ds.some((d) => diagnosticCode(d) === 'forbidden-label-prefix')
  );

  const docTablePos = findPosition(document, ':: doc.table ::');
  assert.ok(docTablePos, 'doc.table label should appear in fixture');
  const docTableDiag = diagnostics.find(
    (d) => diagnosticCode(d) === 'forbidden-label-prefix' && d.range.start.line === docTablePos.line
  );
  assert.ok(docTableDiag, 'doc.table should have a forbidden-label-prefix diagnostic');

  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    document.uri,
    docTableDiag.range,
    vscode.CodeActionKind.QuickFix.value
  );
  assert.ok(actions, 'code actions should be returned');
  const rewrite = actions.find(
    (a) => a.title.includes('table') && a.title.toLowerCase().includes('rewrite')
  );
  assert.ok(
    rewrite,
    `expected a "Rewrite doc.table to table" quickfix; got titles: [${actions.map((a) => a.title).join(', ')}]`
  );
  assert.equal(rewrite.kind?.value, vscode.CodeActionKind.QuickFix.value);

  // Apply the edit and verify the source line flipped to the blessed
  // shortcut. Apply through the workspace API so a server-issued
  // edit (vs a client-command edit) both round-trip.
  if (rewrite.edit) {
    const applied = await vscode.workspace.applyEdit(rewrite.edit);
    assert.ok(applied, 'workspace edit should apply');
    const newLine = document.lineAt(docTablePos.line).text;
    assert.ok(
      newLine.includes(':: table ::') && !newLine.includes('doc.table'),
      `expected line to become ":: table ::", got "${newLine}"`
    );
  } else if (rewrite.command) {
    // The LSP may model the quickfix as a command that the client
    // executes; in that case the underlying edit comes back through
    // `workspace/applyEdit`. Executing it here mirrors what happens
    // when a user clicks the lightbulb action.
    const args: unknown[] = rewrite.command.arguments ?? [];
    await vscode.commands.executeCommand(rewrite.command.command, ...args);
    const newLine = document.lineAt(docTablePos.line).text;
    assert.ok(
      newLine.includes(':: table ::') && !newLine.includes('doc.table'),
      `expected line to become ":: table ::" after command exec, got "${newLine}"`
    );
  } else {
    assert.fail('quickfix had neither edit nor command');
  }

  // Revert so the fixture stays usable for subsequent tests in the
  // same workspace (the test runner doesn't recreate fixtures).
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await closeAllEditors();
});

integrationTest('label-policy: hover annotates shortcut / stripped / community forms', async () => {
  await activateExtension();
  const document = await openWorkspaceDocument(LABEL_POLICY_DOCUMENT_PATH);

  // Wait for LSP to settle so hover hits the analysis pass.
  await waitForDiagnostics(document.uri, (ds) => ds.length > 0);

  const cases = [
    { search: ':: title ::', expect: 'Shortcut for' },
    { search: ':: metadata.author ::', expect: 'Prefix-stripped form' },
    { search: ':: acme.task ::', expect: 'Community label' },
  ];

  for (const { search, expect } of cases) {
    const pos = findPosition(document, search);
    assert.ok(pos, `fixture should contain "${search}"`);
    // Aim the hover at the label token itself (after `:: `), not the
    // opening colons.
    const labelStart = new vscode.Position(pos.line, pos.character + 3);

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      labelStart
    );

    const text = (hovers ?? [])
      .flatMap((h) => h.contents)
      .map((c) => (typeof c === 'string' ? c : 'value' in c ? c.value : ''))
      .join('\n');

    assert.ok(
      text.includes(expect),
      `hover on "${search}" should include "${expect}"; got:\n${text}`
    );
  }

  await closeAllEditors();
});

integrationTest('label-policy: completion offers blessed shortcuts after "::"', async () => {
  await activateExtension();
  const document = await openWorkspaceDocument(LABEL_POLICY_DOCUMENT_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'editor should be active');

  // Append a fresh line + `:: ` to drive the trigger, so the test
  // doesn't depend on cursor position vs other label sites in the
  // fixture.
  const lastLine = document.lineCount - 1;
  const lastChar = document.lineAt(lastLine).text.length;
  const insertAt = new vscode.Position(lastLine, lastChar);

  await editor.edit((eb) => {
    eb.insert(insertAt, '\n\n:: ');
  });

  const triggerLine = lastLine + 2;
  const triggerChar = 3;
  const triggerPos = new vscode.Position(triggerLine, triggerChar);
  editor.selection = new vscode.Selection(triggerPos, triggerPos);

  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    triggerPos,
    ' '
  );

  assert.ok(completions, 'completion list should be returned');
  const labels = completions.items.map((item) =>
    typeof item.label === 'string' ? item.label : item.label.label
  );
  const expected = ['table', 'image', 'video', 'audio'];
  for (const label of expected) {
    assert.ok(
      labels.includes(label),
      `expected blessed shortcut "${label}" in completions; got: [${labels.join(', ')}]`
    );
  }
  // Reserved `doc.*` should never be suggested.
  assert.ok(
    !labels.some((l) => l.startsWith('doc.')),
    `completion should not suggest reserved doc.* labels; got: [${labels.join(', ')}]`
  );

  await vscode.commands.executeCommand('workbench.action.files.revert');
  await closeAllEditors();
});
