import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument, TEST_DOCUMENT_PATH } from './helpers.js';

/**
 * End-to-end test for the `lex/trustRequest` LSP custom request handler
 * registered in PR #67.
 *
 * Setup (in `test/fixtures/sample-workspace/`):
 *   - `.lex.toml` declares `[labels] acme = "path:acme-schemas"`.
 *   - `acme-schemas/task.yaml` declares a subprocess handler at a
 *     non-existent binary.
 *
 * On extension activation + LSP boot, lexd-lsp:
 *   1. Reads `[labels]` from `.lex.toml` and resolves the namespace.
 *   2. Loads `acme-schemas/task.yaml`, sees `transport: subprocess`.
 *   3. Trust gate finds no pin in `<workspace>/.lex/trust.json`.
 *   4. Fires `lex/trustRequest` to the client with the request shape.
 *
 * This test monkey-patches `vscode.window.showWarningMessage` to
 * record the prompt invocation, returns "Deny", and asserts the
 * params arriving on the client match what the lex-side gate
 * documented to send. Restores the patch before exiting so it
 * doesn't bleed into other tests.
 */
integrationTest('forwards lex/trustRequest from lexd-lsp to a vscode warning modal', async () => {
  // Clear any persisted trust decision left by a prior test session.
  // Without this, the lex-side gate sees a pin in
  // `<workspace>/.lex/trust.json` (a "denied" cached from a previous
  // run, or from vscode's DialogService refusing to show the modal
  // in tests when the shim wasn't installed yet) and short-circuits
  // without firing `lex/trustRequest`.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const trustFile = path.join(workspaceFolder.uri.fsPath, '.lex', 'trust.json');
    rmSync(trustFile, { force: true });
  }

  const extensionId = 'lex.lex-vscode';
  const extension = vscode.extensions.getExtension<LexExtensionApi>(extensionId);
  assert.ok(extension, `Extension ${extensionId} should be available`);
  const api = await extension.activate();
  await api?.clientReady();

  interface Capture {
    message: string;
    detail: string | undefined;
  }
  const captured: Capture[] = [];
  const original = vscode.window.showWarningMessage;

  // Replace the modal so the test doesn't actually block on a
  // user click. The patched fn captures the message + detail and
  // immediately returns "Deny", which our handler maps to
  // { decision: "denied", reason }. Keep the patch tight — restore
  // before assertions so any failure-path UI in subsequent tests
  // sees the real implementation.
  const patchedShim = ((message: string, ...rest: unknown[]): Thenable<string | undefined> => {
    // The real signature has overloads — for our usage the first
    // arg after the message is the options object, which we read
    // for the `detail` field.
    const options = rest[0] as { modal?: boolean; detail?: string } | undefined;
    captured.push({ message, detail: options?.detail });
    return Promise.resolve('Deny');
  }) as typeof vscode.window.showWarningMessage;
  (vscode.window as unknown as Record<string, unknown>).showWarningMessage = patchedShim;

  try {
    // Open a doc + trigger an extension-aware request. The LSP
    // boots its extension registry lazily on the first hover /
    // completion / code-action request — opening alone won't wake
    // it, so we follow up with executeHoverProvider to force the
    // boot path that fires `lex/trustRequest`.
    const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
    // Position at line 0, character 0 — content may not have a
    // labelled annotation there, but we don't need a hover hit;
    // we just need the LSP's hover handler to fire so its
    // `extension_state()` lazy boot runs.
    await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      document.uri,
      new vscode.Position(0, 0)
    );

    // Wait up to 30s for the prompt to fire. The lex-side boot is
    // serialised behind a tokio mutex and runs on spawn_blocking,
    // so timing depends on schema load + subprocess spawn attempt.
    // The "trust request to editor failed" 60s timeout in the
    // lex-side prompt handler is unrelated — that timeout caps
    // the *editor's* response time, not the time to fire.
    const timeoutMs = 30_000;
    const startedAt = Date.now();
    while (captured.length === 0 && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.ok(
      captured.length > 0,
      `expected at least one lex/trustRequest within ${timeoutMs}ms; got none`
    );
    const prompt = captured[0];
    // Headline names the namespace + transport.
    assert.match(prompt.message, /"acme"/);
    assert.match(prompt.message, /subprocess handler/);
    // Detail mentions the source (lex.toml entry), command (the
    // non-existent binary path from the fixture), and capability
    // (pure: fs:false net:false).
    const detail = prompt.detail;
    assert.ok(detail, 'expected detail body to be set');
    assert.match(detail, /lex\.toml.*"acme"/);
    assert.match(detail, /lex-test-trust-prompt-acme-handler-does-not-exist/);
    assert.match(detail, /pure/);
  } finally {
    vscode.window.showWarningMessage = original;
    await closeAllEditors();
  }
});
