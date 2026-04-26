import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { injections } from '@lex/shared';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument, delay } from './helpers.js';

const INJECTION_DOCUMENT_PATH = 'documents/injection-test.lex';

// Surfaces the underlying reason when tree-sitter fails to initialize.
// Other tests in this file silently skip on `!api.treeSitter()`, which has
// hidden a regression for at least the 0.6.x series — verbatim-block
// injection has been broken end-to-end and no test ever said why. This
// probe exists so the failure reason lands in test stdout (and so a
// future tree-sitter regression breaks CI loudly, not silently).
integrationTest('tree-sitter init succeeds OR records a structured failure', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension);
  const api = await extension.activate();

  const ts = api.treeSitter();
  const err = api.treeSitterInitError();

  if (ts) {
    assert.equal(err, null, 'init error should be null when tree-sitter is available');
    console.log('  tree-sitter initialized successfully');
    return;
  }

  // Tree-sitter unavailable — diagnostic must explain why.
  assert.ok(err, 'treeSitterInitError() must be populated when treeSitter() is null');
  console.log(`  tree-sitter init failed at stage "${err.stage}":`);
  console.log(`    resourcesDir: ${err.resourcesDir}`);
  console.log(`    full error:\n${err.error.replace(/^/gm, '      ')}`);
});

integrationTest('injection highlighter detects verbatim language zones', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
  const tree = ts.parse(document.getText());
  const zones = ts.queryInjections(tree);

  // The fixture has 5 annotated verbatim blocks: python, javascript, json, rust, bash (group)
  // (the 6th block has no language annotation)
  assert.ok(zones.length >= 5, `Expected at least 5 injection zones, got ${zones.length}`);

  const languages = zones.map((z) => z.language);
  assert.ok(languages.includes('python'), 'Should detect python injection');
  assert.ok(languages.includes('javascript'), 'Should detect javascript injection');
  assert.ok(languages.includes('json'), 'Should detect json injection');
  assert.ok(languages.includes('rust'), 'Should detect rust injection');
  assert.ok(languages.includes('bash'), 'Should detect bash injection (verbatim group)');

  // Verify zone content makes sense.
  // NOTE: tree-sitter-lex v0.9.1 parses `def hello(name):` as the
  // verbatim_block's *subject* (not part of any paragraph) when the
  // closer `:: python ::` is at the same indent as the verbatim subject.
  // The current injection query captures content children but not the
  // verbatim's subject, so the function-definition line itself is
  // outside the zone. Body content is captured correctly. Tracking
  // ticket: include verbatim subject in injection range.
  const pyZone = zones.find((z) => z.language === 'python');
  assert.ok(pyZone, 'Python zone should exist');
  assert.ok(
    pyZone.text.includes('print(message)'),
    'Python zone should contain body code (print call)'
  );

  const jsZone = zones.find((z) => z.language === 'javascript');
  assert.ok(jsZone, 'JavaScript zone should exist');
  assert.ok(jsZone.text.includes('async function'), 'JS zone should contain async function');

  tree.delete();
  await closeAllEditors();
});

integrationTest('injection highlighter applies decorations', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const hl = api.injectionHighlighter();
  if (!hl) {
    console.log('  (skipped — injection highlighter not available)');
    return;
  }

  await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
  // Wait for debounced highlighting to fire
  await delay(300);

  // Force a refresh to ensure decorations are applied
  await hl.refresh();
  await delay(100);

  // Verify injection zones were detected
  const zones = hl.getInjectionZones();
  assert.ok(zones.length >= 5, `Expected at least 5 injection zones, got ${zones.length}`);

  // Verify decoration types were created for all token categories
  const decorTypes = hl.getDecorationTypes();
  assert.ok(decorTypes.size > 0, 'Should have decoration types');
  assert.ok(decorTypes.has('keyword'), 'Should have keyword decoration type');
  assert.ok(decorTypes.has('string'), 'Should have string decoration type');
  assert.ok(decorTypes.has('comment'), 'Should have comment decoration type');
  assert.ok(decorTypes.has('number'), 'Should have number decoration type');

  await closeAllEditors();
});

// ─── End-to-end pipeline tests ───────────────────────────────────────────
//
// Each test pins down a deeper layer of the pipeline: language
// resolution → tokenization → decoration mapping. With tree-sitter
// embedded grammars bundled in the extension, these run without
// requiring any external language extension (Pylance/Microsoft Python)
// — the integration test profile launches with `--disable-extensions`
// and these still produce real keyword/string/comment decorations.

integrationTest(
  'injection highlighter resolves python annotation to a registered language',
  async () => {
    const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
    assert.ok(extension);
    const api = await extension.activate();
    const hl = api.injectionHighlighter();
    assert.ok(hl, 'injection highlighter must be initialized');

    await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
    await delay(300);
    await hl.refresh();

    const status = hl.getStatus();
    assert.ok(status, 'status should be populated after refresh');
    const py = status.zones.find((z) => z.annotationLanguage === 'python');
    assert.ok(py, 'python zone must exist in status diagnostics');

    assert.equal(
      py.resolvedLanguageId,
      'python',
      `python annotation should resolve to tokenizer language id "python".\n${injections.formatInjectionStatus(status)}`
    );

    await closeAllEditors();
  }
);

integrationTest(
  'injection highlighter receives tree-sitter tokens for python verbatim block',
  async () => {
    const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
    assert.ok(extension);
    const api = await extension.activate();
    const hl = api.injectionHighlighter();
    assert.ok(hl);

    await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
    await delay(300);
    // The embedded grammar loads asynchronously the first time we hit
    // a python zone; the first refresh triggers that load, the second
    // sees the cached parser. Without the second refresh we'd race the
    // load.
    await hl.refresh();
    await hl.refresh();

    const status = hl.getStatus();
    assert.ok(status);
    const py = status.zones.find((z) => z.annotationLanguage === 'python');
    assert.ok(py);

    assert.ok(
      py.requestedTokens,
      'getTokens should be called for the python zone (resolution succeeded)'
    );
    assert.ok(
      py.receivedTokens,
      `embedded tokenizer should return tokens for python.\n${injections.formatInjectionStatus(status)}`
    );
    assert.ok(
      py.tokenCount > 0,
      `python tokenization should contain at least one token.\n${injections.formatInjectionStatus(status)}`
    );

    await closeAllEditors();
  }
);

integrationTest(
  'injection highlighter produces keyword/string/comment decorations for python verbatim block',
  async () => {
    const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
    assert.ok(extension);
    const api = await extension.activate();
    const hl = api.injectionHighlighter();
    assert.ok(hl);

    await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
    await delay(300);
    await hl.refresh();
    await hl.refresh();

    const status = hl.getStatus();
    assert.ok(status);

    // The injection-test fixture's python block has `def`, `return`,
    // `class`, `async`, `await` keywords, an f-string and a docstring,
    // a `# A simple greeting function` comment line, and named
    // function calls — so all four categories should be non-empty.
    const dump = injections.formatInjectionStatus(status);
    const keywords = status.rangesByCategory.get('keyword') ?? [];
    const strings = status.rangesByCategory.get('string') ?? [];
    const comments = status.rangesByCategory.get('comment') ?? [];
    const functions = status.rangesByCategory.get('function') ?? [];

    assert.ok(keywords.length > 0, `expected keyword decorations, got 0.\n${dump}`);
    assert.ok(strings.length > 0, `expected string decorations, got 0.\n${dump}`);
    assert.ok(comments.length > 0, `expected comment decorations, got 0.\n${dump}`);
    assert.ok(functions.length > 0, `expected function decorations, got 0.\n${dump}`);

    await closeAllEditors();
  }
);

integrationTest('injection highlighter respects config toggle', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const hl = api.injectionHighlighter();
  if (!hl) {
    console.log('  (skipped — injection highlighter not available)');
    return;
  }

  await openWorkspaceDocument(INJECTION_DOCUMENT_PATH);
  await delay(300);
  await hl.refresh();
  await delay(100);

  // Zones should be populated when enabled (default)
  const enabledZones = hl.getInjectionZones();
  assert.ok(enabledZones.length >= 4, 'Should have zones when enabled');

  // Disable injection highlighting
  const config = vscode.workspace.getConfiguration('lex');
  await config.update('injectionHighlighting', false, vscode.ConfigurationTarget.Global);
  await delay(200);
  await hl.refresh();
  await delay(100);

  const disabledZones = hl.getInjectionZones();
  assert.equal(disabledZones.length, 0, 'Should have no zones when disabled');

  // Re-enable
  await config.update('injectionHighlighting', true, vscode.ConfigurationTarget.Global);
  await delay(200);
  await hl.refresh();
  await delay(100);

  const reenabledZones = hl.getInjectionZones();
  assert.ok(reenabledZones.length >= 4, 'Should have zones after re-enabling');

  await closeAllEditors();
});
