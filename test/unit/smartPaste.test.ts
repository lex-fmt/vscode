import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PREPARE_PASTE_METHOD,
  PREPARE_PASTE_CAPABILITY,
  serverSupportsPreparePaste,
  isUsableServerResult,
  type ServerCapabilityProbe
} from '../../src/smartPasteCore.js'

/**
 * Unit coverage for the pure helpers behind the smart-paste provider in
 * `src/smartPaste.ts`. The provider itself imports `vscode` at module top
 * and is therefore exercised by the integration suite; here we pin the
 * decision logic those helpers encode so a regression in the
 * capability guard or the result-shape filter is caught cheaply,
 * without spinning up vscode-test-electron.
 */

test('PREPARE_PASTE_METHOD and CAPABILITY match the wire spec (lex-fmt/lex#708)', () => {
  // Renaming either constant is a wire-breaking change — pin the names
  // here so a typo (e.g. dropping the `lex/` prefix) fails the unit
  // suite instead of silently breaking compatibility with lexd-lsp.
  assert.equal(PREPARE_PASTE_METHOD, 'lex/preparePaste')
  assert.equal(PREPARE_PASTE_CAPABILITY, 'lexPreparePaste')
})

function probe(experimental: unknown): ServerCapabilityProbe {
  return { initializeResult: { capabilities: { experimental } } }
}

test('serverSupportsPreparePaste: returns false when client is undefined', () => {
  assert.equal(serverSupportsPreparePaste(undefined), false)
})

test('serverSupportsPreparePaste: returns false when initializeResult is missing', () => {
  // A client that hasn't completed its initialize handshake yet — must
  // not trigger smart paste, the server might not even be the expected
  // version.
  assert.equal(serverSupportsPreparePaste({}), false)
})

test('serverSupportsPreparePaste: returns false when capabilities are missing', () => {
  assert.equal(serverSupportsPreparePaste({ initializeResult: {} }), false)
})

test('serverSupportsPreparePaste: returns false when experimental is missing', () => {
  assert.equal(serverSupportsPreparePaste({ initializeResult: { capabilities: {} } }), false)
})

test('serverSupportsPreparePaste: returns false when experimental is null', () => {
  // Servers that explicitly null out the field — treat as "no capability".
  assert.equal(serverSupportsPreparePaste(probe(null)), false)
})

test('serverSupportsPreparePaste: returns true when the flag is strictly true', () => {
  assert.equal(serverSupportsPreparePaste(probe({ lexPreparePaste: true })), true)
})

test('serverSupportsPreparePaste: requires strict true (truthy non-boolean is rejected)', () => {
  // The wire spec is explicit-opt-in: the server sends boolean `true` or
  // the flag is absent. Anything else (string "true", number 1, object)
  // is treated as "not supported" — defensive so an over-eager server
  // doesn't accidentally enable an editor feature it can't actually
  // serve.
  for (const value of ['true', 1, {}, [], 'yes'] as const) {
    assert.equal(
      serverSupportsPreparePaste(probe({ lexPreparePaste: value })),
      false,
      `expected non-strict-true value ${JSON.stringify(value)} to be rejected`
    )
  }
})

test('serverSupportsPreparePaste: returns false when the flag is false', () => {
  assert.equal(serverSupportsPreparePaste(probe({ lexPreparePaste: false })), false)
})

test('serverSupportsPreparePaste: ignores unrelated experimental keys', () => {
  // Forward-compat: a server advertising other experimental capabilities
  // must not accidentally enable smart paste.
  assert.equal(
    serverSupportsPreparePaste(probe({ someOtherFeature: true, lexPreparePaste: false })),
    false
  )
  assert.equal(serverSupportsPreparePaste(probe({ someOtherFeature: true })), false)
})

test('isUsableServerResult: rejects null and undefined results', () => {
  // The transport layer may resolve to null on a soft failure (request
  // cancelled mid-flight by the server). Treat as native fallback.
  assert.equal(isUsableServerResult(null, 'hello'), false)
  assert.equal(isUsableServerResult(undefined, 'hello'), false)
})

test('isUsableServerResult: rejects results where text is not a string', () => {
  // Defensive: a buggy or partially-decoded payload could land here.
  // We never wrap a non-string in DocumentPasteEdit — that would throw
  // inside vscode's edit application and break the paste entirely.
  for (const bad of [{}, { text: 42 }, { text: null }, { text: undefined }] as const) {
    assert.equal(
      isUsableServerResult(bad, 'hello'),
      false,
      `expected non-string-text payload ${JSON.stringify(bad)} to be rejected`
    )
  }
})

test('isUsableServerResult: rejects the identity transform', () => {
  // When the server's re-anchor returns the same text the user pasted,
  // there is no value in adding a DocumentPasteEdit — it would just
  // clutter the paste-as picker. Native paste already does the right
  // thing here.
  assert.equal(isUsableServerResult({ text: 'unchanged' }, 'unchanged'), false)
})

test('isUsableServerResult: accepts a well-formed non-identity transform', () => {
  // Cast through the optional-text shape to model what arrives over the
  // wire — the runtime may include `mode` (and future fields) even
  // though the helper's parameter type only reads `text`.
  const payload = { text: '  re-anchored', mode: 'reanchor' } as unknown as { text?: unknown }
  assert.equal(isUsableServerResult(payload, 'original'), true)
})

test('isUsableServerResult: empty-string result IS usable when the input was non-empty', () => {
  // Edge case but well-defined: the server may want to suppress the
  // paste entirely (e.g. dropping a structural fragment that doesn't
  // fit). An empty string differs from the input, so it's a legal
  // re-anchor and must be applied; only the identity case is filtered.
  assert.equal(isUsableServerResult({ text: '' }, 'something'), true)
})

test('isUsableServerResult: empty-string result and empty input is the identity case', () => {
  // Boundary: empty in, empty out is identity — must be filtered.
  assert.equal(isUsableServerResult({ text: '' }, ''), false)
})

test('isUsableServerResult: extra fields on the payload are ignored, not rejected', () => {
  // Forward-compat: the wire spec may grow new response fields. As long
  // as `text` is present and differs, the result is usable.
  const extras = { text: 'changed', mode: 'reanchor', future: 'whatever' } as unknown as {
    text?: unknown
  }
  assert.equal(isUsableServerResult(extras, 'original'), true)
})
