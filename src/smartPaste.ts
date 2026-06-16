/**
 * Smart paste — editor-side glue for the `lex/preparePaste` LSP request.
 *
 * All transform logic lives in lex-lsp (lex-fmt/lex#708, shipped in
 * lexd-lsp v0.17.0). This module is the thin VS Code shim: it registers a
 * `DocumentPasteEditProvider` (stable since VS Code 1.87) for Lex documents,
 * forwards each paste to `lex/preparePaste`, and wraps the server's returned
 * text in a `DocumentPasteEdit`.
 *
 * The server advertises support under `experimental.lexPreparePaste` in its
 * initialize response (see `crates/lex-lsp/src/server.rs`). We guard on that
 * flag and otherwise fall back to native paste — and any request failure or
 * a stopped server also falls back — so smart paste is purely an enhancement
 * over correct default behaviour, never a precondition for pasting at all.
 *
 * Wire contract (mirrors `lex_lsp_core::prepare_paste`):
 *   request  `lex/preparePaste`
 *   params   { textDocument: TextDocumentIdentifier, range: Range, pastedText: string }
 *   response { text: string, mode: string }
 */
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import type { Range as LspRange } from 'vscode-languageserver-types';
import {
  PREPARE_PASTE_METHOD,
  PREPARE_PASTE_CAPABILITY,
  serverSupportsPreparePaste,
  isUsableServerResult,
  type PreparePasteResult,
} from './smartPasteCore.js';

export {
  PREPARE_PASTE_METHOD,
  PREPARE_PASTE_CAPABILITY,
  serverSupportsPreparePaste,
  isUsableServerResult,
  type PreparePasteResult,
};

/**
 * MIME type smart paste handles. `text/plain` is the clipboard flavour VS Code
 * provides for ordinary text pastes; that is exactly the input the re-anchor
 * transform operates on.
 */
const TEXT_PLAIN = 'text/plain';

/**
 * The paste-edit kind we contribute. Identifies our edit among any other
 * providers' so the editor can attribute and (if configured) prefer it.
 */
const SMART_PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append(
  'text',
  'lex',
  'smartPaste'
);

type GetClient = () => LanguageClient | undefined;

/**
 * The `DocumentPasteEditProvider` for Lex documents. Stateless apart from the
 * client accessor; one instance is registered for the whole session.
 */
export class LexSmartPasteProvider implements vscode.DocumentPasteEditProvider {
  constructor(private readonly getClient: GetClient) {}

  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    const client = this.getClient();
    // Guard on capability + a live client. Returning undefined yields native
    // paste — the correct fallback when the server can't re-anchor (§1, §5).
    if (!client || !serverSupportsPreparePaste(client)) {
      return undefined;
    }

    // Only the plain-text flavour is re-anchored; richer flavours (files,
    // images) are left to native handling.
    const item = dataTransfer.get(TEXT_PLAIN);
    if (!item) {
      return undefined;
    }
    // Reading the clipboard flavour can reject; a failed read must not throw
    // out of the provider and disrupt the paste — fall back to native instead.
    let pastedText: string;
    try {
      pastedText = await item.asString();
    } catch {
      return undefined;
    }
    // Empty clipboard: no edit, native (no-op) paste proceeds (§6).
    if (pastedText.length === 0 || token.isCancellationRequested) {
      return undefined;
    }

    // Re-anchor only the single-caret case. A multi-cursor paste reports one
    // range per cursor; the server would re-anchor for the first cursor's
    // structural context only, and VS Code would then apply that one edit to
    // every cursor — wrong indentation everywhere but the first. Leave
    // multi-cursor (and the degenerate zero-range case) to native handling.
    if (ranges.length !== 1) {
      return undefined;
    }
    const range = ranges[0];

    let result: PreparePasteResult;
    try {
      const lspRange: LspRange = client.code2ProtocolConverter.asRange(range);
      result = await client.sendRequest<PreparePasteResult>(
        PREPARE_PASTE_METHOD,
        {
          textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
          range: lspRange,
          pastedText,
        },
        token
      );
    } catch {
      // Server down, request unavailable, or any transport error → native
      // paste. Smart paste never blocks the basic operation (§1).
      return undefined;
    }

    if (token.isCancellationRequested) {
      return undefined;
    }
    // `isUsableServerResult` filters malformed payloads (missing/non-string
    // `text`) and the identity case where re-anchoring left the input
    // unchanged — both fall back to native paste (no redundant entry in the
    // edit picker).
    if (!isUsableServerResult(result, pastedText)) {
      return undefined;
    }

    const edit = new vscode.DocumentPasteEdit(result.text, 'Lex: smart paste', SMART_PASTE_KIND);
    return [edit];
  }
}

/**
 * Register the Lex smart-paste provider. Safe to call unconditionally at
 * activation: the per-paste capability guard means an old server simply never
 * triggers the request. Returns a disposable for `context.subscriptions`.
 */
export function registerSmartPaste(getClient: GetClient): vscode.Disposable {
  return vscode.languages.registerDocumentPasteEditProvider(
    { scheme: 'file', language: 'lex' },
    new LexSmartPasteProvider(getClient),
    {
      providedPasteEditKinds: [SMART_PASTE_KIND],
      pasteMimeTypes: [TEXT_PLAIN],
    }
  );
}
