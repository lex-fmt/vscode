import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument, delay } from './helpers.js';

const INJECTION_DOCUMENT_PATH = 'documents/injection-test.lex';

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

  // Verify zone content makes sense
  const pyZone = zones.find((z) => z.language === 'python');
  assert.ok(pyZone, 'Python zone should exist');
  assert.ok(pyZone.text.includes('def hello'), 'Python zone should contain the function');

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
