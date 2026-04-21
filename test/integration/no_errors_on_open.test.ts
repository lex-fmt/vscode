import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { getCapturedErrors } from './runtime_errors.js';
import { closeAllEditors, TEST_DOCUMENT_PATH, openWorkspaceDocument } from './helpers.js';

// Regression guard for the class of bug where extension code fires an
// error into a channel nobody watches (the historical analogue:
// `vim.lsp.semantic_tokens.enable` hard-erroring on Neovim 0.12.1+
// while the nvim plugin's test suite stayed green).
//
// The harness installs `process`-level `unhandledRejection` and
// `uncaughtException` listeners (see `./runtime_errors.ts`) and
// auto-asserts after every test. Note that VS Code's test-electron
// runs the extension-under-test and the test extension in separate
// module contexts, so per-API shims on `vscode.window.showErrorMessage`
// don't cross the boundary — popups surfaced through that channel are
// *not* covered here. What this spec does cover: activate the
// extension, open a .lex document, wait for the LSP handshake, and
// confirm no unhandled rejection or uncaught exception fired during
// activation or post-attach async work. If a future change introduces
// one, the offending message is printed verbatim in the failure.
integrationTest('no runtime errors fire while activating and opening a .lex document', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api.clientReady();

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  assert.strictEqual(document.languageId, 'lex', 'Document should be recognised as lex');

  // Give LSP initialisation and any async post-attach activity a
  // chance to finish so errors produced there are captured before
  // the harness runs its auto-assertion.
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // Direct read for a nicer failure message than the harness's
    // generic post-test assertion.
    const errors = getCapturedErrors();
    assert.strictEqual(
      errors.length,
      0,
      `expected no runtime errors during activation + open, got:\n${errors
        .map((e, i) => `  [${i + 1}] (${e.source}) ${e.message}`)
        .join('\n')}`
    );
  } finally {
    await closeAllEditors();
  }
});
