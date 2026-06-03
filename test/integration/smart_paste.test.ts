import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import {
  LexSmartPasteProvider,
  PREPARE_PASTE_METHOD,
  serverSupportsPreparePaste,
} from '../../src/smartPaste.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument, TEST_DOCUMENT_PATH } from './helpers.js';

interface PreparePasteResult {
  text: string;
  mode: string;
}

async function activeClient(): Promise<
  NonNullable<Awaited<ReturnType<LexExtensionApi['clientReady']>>>
> {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');
  const api = await extension.activate();
  const client = await api.clientReady();
  assert.ok(client, 'Language client should be running for smart-paste tests');
  return client;
}

// The pin is at lexd-lsp v0.17.0, the first release implementing
// `lex/preparePaste`. The server must advertise the capability so editors
// enable interception only against a server that implements it (spec §5).
integrationTest('server advertises the experimental.lexPreparePaste capability', async () => {
  const client = await activeClient();
  assert.strictEqual(
    serverSupportsPreparePaste(client),
    true,
    'lexd-lsp >= v0.17.0 must advertise experimental.lexPreparePaste'
  );
});

// End-to-end through the real running server: a multi-line block pasted into a
// session body should be re-anchored to the caret's structural level rather
// than landing at its clipboard indentation. We drive the provider exactly as
// VS Code would, with a real DataTransfer.
integrationTest('smart paste re-anchors a multi-line block via lex/preparePaste', async () => {
  const client = await activeClient();
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);

  try {
    // Caret on a fresh blank line inside the document body. The exact anchor
    // indent is the server's call (derived from the enclosing container); the
    // invariant we pin here is fixture-independent: re-anchoring shifts the
    // block as a whole and preserves its *relative* nesting (spec §4.2–4.3).
    const anchorLine = Math.min(1, document.lineCount - 1);
    const caret = new vscode.Range(anchorLine, 0, anchorLine, 0);

    // A two-line block whose second line is nested +4 under the first.
    const pastedText = 'first line\n    nested line';

    const provider = new LexSmartPasteProvider(() => client);
    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set('text/plain', new vscode.DataTransferItem(pastedText));

    const edits = await provider.provideDocumentPasteEdits(
      document,
      [caret],
      dataTransfer,
      {
        only: undefined,
        triggerKind: vscode.DocumentPasteTriggerKind.Automatic,
      },
      new vscode.CancellationTokenSource().token
    );

    // When the server re-anchors (delta != 0) we get one edit; when the anchor
    // already matches the clipboard baseline (delta == 0) the transform is an
    // identity and the provider correctly yields native paste (undefined).
    // Either way the relative-nesting invariant must hold on whatever text the
    // round-trip produced.
    const lines = (() => {
      if (!edits) {
        return pastedText.split('\n');
      }
      assert.strictEqual(edits.length, 1, 'Provider should yield at most one paste edit');
      const inserted = edits[0].insertText;
      return (typeof inserted === 'string' ? inserted : inserted.value).split('\n');
    })();

    assert.strictEqual(lines.length, 2, 'Two-line block stays two lines');
    const indentOf = (s: string) => s.length - s.trimStart().length;
    assert.strictEqual(
      indentOf(lines[1]) - indentOf(lines[0]),
      4,
      `relative +4 nesting must be preserved; got ${JSON.stringify(lines)}`
    );
  } finally {
    await closeAllEditors();
  }
});

// The capability guard short-circuits to native paste (undefined) when no
// client is available — smart paste is an enhancement, never a precondition.
integrationTest('smart paste falls back to native when the client is absent', async () => {
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  try {
    const provider = new LexSmartPasteProvider(() => undefined);
    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set('text/plain', new vscode.DataTransferItem('something'));

    const edits = await provider.provideDocumentPasteEdits(
      document,
      [new vscode.Range(0, 0, 0, 0)],
      dataTransfer,
      {
        only: undefined,
        triggerKind: vscode.DocumentPasteTriggerKind.Automatic,
      },
      new vscode.CancellationTokenSource().token
    );

    assert.strictEqual(edits, undefined, 'No client → native paste (undefined)');
  } finally {
    await closeAllEditors();
  }
});

// Direct sanity check on the wire contract: the request echoes single-line
// clipboard text unchanged (passthrough — single line, spec §3).
integrationTest('lex/preparePaste echoes single-line clipboard text', async () => {
  const client = await activeClient();
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  try {
    const result = await client.sendRequest<PreparePasteResult>(PREPARE_PASTE_METHOD, {
      textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
      range: client.code2ProtocolConverter.asRange(new vscode.Range(0, 0, 0, 0)),
      pastedText: 'just one line',
    });
    assert.strictEqual(result.text, 'just one line', 'single-line paste is passed through');
  } finally {
    await closeAllEditors();
  }
});
