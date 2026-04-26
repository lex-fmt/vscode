/**
 * Host-neutral types for the injection highlighter.
 *
 * The shared injection module maps semantic-token output (from whatever host
 * syntax provider is available) onto the Lex document's verbatim zones. It
 * avoids any direct dependency on vscode, monaco, or web-tree-sitter so that
 * both `lex-vscode` and `lexed` can reuse the logic.
 */
export type DecorationCategory = 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'operator';
/**
 * Zero-based range in the real Lex document.
 */
export interface InjectionRange {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
}
/**
 * A verbatim zone in the Lex document that has an annotated language.
 *
 * This matches the shape produced by `LexTreeSitter.queryInjections` — the
 * type is lifted into `@lex/shared` so host adapters can pass zones in
 * without importing vscode-specific modules.
 */
export interface InjectionZone {
    language: string;
    text: string;
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}
/**
 * Minimal semantic-tokens payload: just the ordered `tokenTypes` legend and
 * the raw deltas array as produced by VS Code's
 * `vscode.provideDocumentSemanticTokens` command (or its equivalent).
 */
export interface SemanticTokens {
    legend: {
        tokenTypes: readonly string[];
    };
    data: Uint32Array;
}
/**
 * Contract implemented by each editor host. The shared module only needs two
 * operations:
 *
 * 1. `getRegisteredLanguages` — resolve which language IDs the host actually
 *    knows how to tokenize. Hosts are expected to cache this themselves (the
 *    vscode adapter caches for 30s; lexed will cache similarly).
 * 2. `getSemanticTokens` — for a given zone's content and resolved language
 *    id, ask the host for semantic tokens. Returning `null` signals that no
 *    provider responded — the zone is skipped silently.
 */
export interface InjectionHostAdapter {
    getRegisteredLanguages(): Promise<Set<string>>;
    getSemanticTokens(zoneIndex: number, content: string, langId: string): Promise<SemanticTokens | null>;
}
/**
 * Per-zone diagnostic record. Captured by the host adapter on every refresh
 * so external observers (debug commands, tests, telemetry) can answer
 * "why did this verbatim block fail to highlight?" without re-running the
 * pipeline.
 *
 * Each boolean flag corresponds to a specific stage in the pipeline:
 *   - resolvedLanguageId !== null  →  the annotation matched a host language
 *   - requestedTokens               →  `getSemanticTokens` was called
 *   - receivedTokens                →  the call returned a non-null payload
 *   - tokenCount > 0                →  the payload actually contained tokens
 *
 * If the pipeline silently produces no highlighting, the first flag that
 * flipped from "true" back to "false" identifies the failing stage.
 */
export interface ZoneDiagnostic {
    index: number;
    /** Language as detected by tree-sitter (already lowercased / first-word). */
    annotationLanguage: string;
    /** Host language ID after alias resolution, or null if no provider claims it. */
    resolvedLanguageId: string | null;
    /** Zero-based real-document range of the zone. */
    range: InjectionRange;
    /** Bytes of zone content sent to the provider. */
    contentLength: number;
    requestedTokens: boolean;
    receivedTokens: boolean;
    /** Decoded token count (= data.length / 5). */
    tokenCount: number;
    /**
     * Histogram of how many tokens of each LSP semantic-token type the
     * provider returned. Useful when `tokenCount > 0` but
     * `decorationCount` is small — most likely the provider is emitting
     * tokens in types we don't map (e.g. Pylance returns lots of
     * `variable`/`parameter` tokens, which our SEMANTIC_TOKEN_MAP drops).
     */
    tokenTypeHistogram?: Record<string, number>;
    /** Error message if `getSemanticTokens` threw. */
    error?: string;
}
/**
 * Snapshot of the most recent injection refresh, exposed by the highlighter
 * so external code (debug commands, tests) can inspect what happened without
 * re-running the pipeline.
 */
export interface InjectionStatus {
    enabled: boolean;
    documentUri: string | null;
    /** ms since epoch when the refresh completed. */
    timestamp: number;
    zoneCount: number;
    zones: ZoneDiagnostic[];
    /** Number of host-registered language IDs at the time of the refresh. */
    registeredLanguageCount: number;
    /** Decoration ranges per category from the most recent compute. */
    rangesByCategory: Map<DecorationCategory, InjectionRange[]>;
}
