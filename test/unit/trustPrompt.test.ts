import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPromptDetail,
  formatPromptMessage,
  type TrustRequestParams,
} from '../../src/trustPromptFormat.js';

function lexTomlParams(): TrustRequestParams {
  return {
    namespace: 'acme',
    command_string: '/usr/local/bin/acme-handler --serve',
    source: { kind: 'lex_toml', name: 'acme' },
    capability: 'full',
    transport: 'subprocess',
  };
}

test('formatPromptMessage names the namespace', () => {
  const msg = formatPromptMessage(lexTomlParams());
  assert.match(msg, /"acme"/);
  assert.match(msg, /subprocess handler/);
});

test('formatPromptDetail mentions source, command, and capability', () => {
  const detail = formatPromptDetail(lexTomlParams());
  assert.match(detail, /lex\.toml.*"acme"/);
  assert.match(detail, /\/usr\/local\/bin\/acme-handler --serve/);
  assert.match(detail, /full \(fs and\/or net access\)/);
});

test('formatPromptDetail labels the local_file source variant', () => {
  const params = lexTomlParams();
  params.source = { kind: 'local_file', path: '/tmp/schemas/acme' };
  const detail = formatPromptDetail(params);
  assert.match(detail, /local schema directory \/tmp\/schemas\/acme/);
});

test('formatPromptDetail labels the cache_only source variant', () => {
  const params = lexTomlParams();
  params.source = { kind: 'cache_only', uri: 'github:acme/lex-acme@v1' };
  const detail = formatPromptDetail(params);
  assert.match(detail, /cached fetch from github:acme\/lex-acme@v1/);
});

test('formatPromptDetail labels pure capability with sandbox note', () => {
  const params = lexTomlParams();
  params.capability = 'pure';
  const detail = formatPromptDetail(params);
  assert.match(detail, /pure \(no fs \/ no net\)/);
  assert.match(detail, /not yet sandbox-enforced/);
});

test('formatPromptDetail handles unknown source kind gracefully', () => {
  // Forward-compat: editor must render unknown source kinds without
  // crashing. The wire spec says new source variants are non-breaking.
  const params = lexTomlParams();
  params.source = { kind: 'future_kind' };
  const detail = formatPromptDetail(params);
  assert.match(detail, /future_kind/);
});

test('formatPromptDetail handles a source with right kind but missing field', () => {
  // Defensive: if the wire payload has `kind: "lex_toml"` but no
  // `name` field (handler bug), we should render the kind label
  // rather than "undefined" or crash.
  const params = lexTomlParams();
  params.source = { kind: 'lex_toml' };
  const detail = formatPromptDetail(params);
  assert.match(detail, /lex_toml/);
  assert.doesNotMatch(detail, /undefined/);
});

test('formatPromptMessage names the transport', () => {
  // `transport` is currently always "subprocess" but the field is
  // string-shaped on the wire — rendering whatever the server sent
  // keeps the prompt accurate when WASM (or future) transports ship.
  const subprocessMsg = formatPromptMessage(lexTomlParams());
  assert.match(subprocessMsg, /subprocess handler/);

  const wasmParams = lexTomlParams();
  wasmParams.transport = 'wasm';
  const wasmMsg = formatPromptMessage(wasmParams);
  assert.match(wasmMsg, /WASM handler/);
});

test('formatPromptDetail handles unknown capability gracefully', () => {
  // Same forward-compat guarantee for capability values.
  const params = lexTomlParams();
  params.capability = 'fs_read';
  const detail = formatPromptDetail(params);
  assert.match(detail, /fs_read/);
});
