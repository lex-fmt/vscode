/**
 * Host-neutral types for the injection highlighter.
 *
 * The shared injection module maps tokenized output (produced by an
 * embedded-language tokenizer — currently tree-sitter) onto the Lex
 * document's verbatim zones. It avoids any direct dependency on vscode,
 * monaco, or web-tree-sitter so that both `lex-vscode` and `lexed` can
 * reuse the logic.
 */

export type DecorationCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function'
  | 'operator'

/**
 * Zero-based range in the real Lex document.
 */
export interface InjectionRange {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

/**
 * A verbatim zone in the Lex document that has an annotated language.
 *
 * This matches the shape produced by `LexTreeSitter.queryInjections` — the
 * type is lifted into `@lex/shared` so host adapters can pass zones in
 * without importing vscode-specific modules.
 */
export interface InjectionZone {
  language: string
  text: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/**
 * One token produced by the embedded-language tokenizer for a zone.
 *
 * Coordinates are zero-based and *relative to the zone content* — the
 * shared module translates them back into real-document coordinates
 * using the zone's start position. `name` is the tokenizer's capture
 * name (e.g. tree-sitter's `keyword`, `function.method`, `string`,
 * `comment.line`); the shared module maps it onto a `DecorationCategory`
 * via the host-supplied `tokenNameToCategory` lookup.
 */
export interface EmbeddedToken {
  name: string
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

/**
 * Contract implemented by each editor host. The shared module only needs
 * two operations:
 *
 * 1. `getRegisteredLanguages` — which embedded language IDs are bundled
 *    and ready to tokenize. Hosts are expected to cache this set
 *    themselves; we read it once per `compute()` call.
 * 2. `getTokens` — tokenize a zone's content with the named language and
 *    return the captures. Returning `null` signals "this zone can't be
 *    tokenized right now" and we silently skip it.
 */
export interface InjectionHostAdapter {
  getRegisteredLanguages(): Promise<Set<string>>
  getTokens(zoneIndex: number, content: string, langId: string): Promise<EmbeddedToken[] | null>
  /**
   * Map from a tokenizer capture name (possibly hierarchical, e.g.
   * `function.method`) onto a `DecorationCategory`. The shared module
   * walks specificity from longest prefix down — `function.method`
   * before `function` — and skips tokens whose name does not resolve.
   */
  tokenNameToCategory: Readonly<Record<string, DecorationCategory>>
}

/**
 * Per-zone diagnostic record. Captured by the host adapter on every
 * refresh so external observers (debug commands, tests, telemetry) can
 * answer "why did this verbatim block fail to highlight?" without
 * re-running the pipeline.
 *
 * Each boolean flag corresponds to a specific stage in the pipeline:
 *   - resolvedLanguageId !== null  →  the annotation matched a tokenizer
 *   - requestedTokens               →  `getTokens` was called
 *   - receivedTokens                →  the call returned a non-null payload
 *   - tokenCount > 0                →  the payload actually contained tokens
 *
 * If the pipeline silently produces no highlighting, the first flag that
 * flipped from "true" back to "false" identifies the failing stage.
 */
export interface ZoneDiagnostic {
  index: number
  /** Language as detected by tree-sitter (already lowercased / first-word). */
  annotationLanguage: string
  /** Host language ID after alias resolution, or null if no tokenizer claims it. */
  resolvedLanguageId: string | null
  /** Zero-based real-document range of the zone. */
  range: InjectionRange
  /** Bytes of zone content sent to the tokenizer. */
  contentLength: number
  requestedTokens: boolean
  receivedTokens: boolean
  /** Decoded token count. */
  tokenCount: number
  /**
   * Histogram of how many tokens of each capture name came back. Useful
   * when `tokenCount > 0` but decorations are sparse — usually means the
   * tokenizer emitted captures whose names don't resolve via
   * `tokenNameToCategory` (e.g. `variable`, `punctuation.bracket`).
   */
  tokenTypeHistogram?: Record<string, number>
  /** Error message if `getTokens` threw. */
  error?: string
}

/**
 * Snapshot of the most recent injection refresh, exposed by the
 * highlighter so external code (debug commands, tests) can inspect what
 * happened without re-running the pipeline.
 */
export interface InjectionStatus {
  enabled: boolean
  documentUri: string | null
  /** ms since epoch when the refresh completed. */
  timestamp: number
  zoneCount: number
  zones: ZoneDiagnostic[]
  /** Number of host-registered language IDs at the time of the refresh. */
  registeredLanguageCount: number
  /** Decoration ranges per category from the most recent compute. */
  rangesByCategory: Map<DecorationCategory, InjectionRange[]>
}
