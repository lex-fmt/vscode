/**
 * Pure (no `vscode` import) helpers for the smart-paste provider.
 *
 * Splitting these out of `./smartPaste.ts` — which imports `vscode` at the
 * module top — lets the unit suite cover the capability + result-shape
 * logic without a vscode-test-electron host. Follows the same
 * trustPrompt.ts / trustPromptFormat.ts split.
 */

/** Custom request method implemented by lexd-lsp (>= v0.17.0). */
export const PREPARE_PASTE_METHOD = 'lex/preparePaste'

/**
 * Capability flag advertised under `ServerCapabilities.experimental` when the
 * server implements `lex/preparePaste`. Mirrors the key set by lex-lsp.
 */
export const PREPARE_PASTE_CAPABILITY = 'lexPreparePaste'

/**
 * Shape of the JSON-RPC reply for `lex/preparePaste` (mirrors
 * `lex_lsp_core::prepare_paste`'s response). `text` is the only field the
 * editor side consumes; `mode` is included for parity / future diagnostics.
 */
export interface PreparePasteResult {
  text: string
  mode: string
}

/**
 * Minimal LanguageClient slice the capability check actually reads. Typed
 * structurally so this module stays free of the `vscode-languageclient`
 * (and transitively `vscode`) import — that import would re-couple the
 * unit suite to the integration host.
 */
export interface ServerCapabilityProbe {
  initializeResult?: {
    capabilities?: {
      experimental?: unknown
    }
  }
}

/**
 * Whether the running server advertised `experimental.lexPreparePaste`.
 * Read from the initialize response the client holds; returns false when the
 * client is absent, not yet started, or the flag is missing / not strictly
 * `true` (anything else is treated as "not supported" — wire spec is
 * explicit-opt-in).
 */
export function serverSupportsPreparePaste(client: ServerCapabilityProbe | undefined): boolean {
  const experimental = client?.initializeResult?.capabilities?.experimental as
    | Record<string, unknown>
    | undefined
  return experimental?.[PREPARE_PASTE_CAPABILITY] === true
}

/**
 * Whether a `lex/preparePaste` response should actually become a paste edit.
 *
 * Returns `false` when:
 *   - `result` is null/undefined (server returned nothing usable);
 *   - `result.text` is not a string (malformed payload — the server might
 *     have crashed mid-response and returned a partial JSON object);
 *   - `result.text` is identical to the original `pastedText` (the
 *     re-anchor was a no-op — letting native paste handle it avoids adding
 *     a redundant edit to the picker).
 *
 * Returns `true` only when the result is a well-formed, non-identity
 * transform — those are the only payloads worth wrapping in a
 * `DocumentPasteEdit`.
 */
export function isUsableServerResult(
  result: { text?: unknown } | null | undefined,
  pastedText: string
): result is { text: string } {
  // Narrowing is intentionally minimal: assert only what we verify. The
  // predicate doesn't check `mode` (or any future field on
  // `PreparePasteResult`), so narrowing to the full wire type would be
  // dishonest — a `{ text: "x" }` payload (no `mode`) would pass and the
  // caller would read `mode` as a `string` that is actually `undefined`
  // at runtime. The only caller in `smartPaste.ts` reads `result.text`,
  // which this narrower shape satisfies; further fields stay accessed
  // through the original (broader) type if ever needed.
  if (!result) return false
  if (typeof result.text !== 'string') return false
  if (result.text === pastedText) return false
  return true
}
