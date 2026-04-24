import type { DecorationCategory, InjectionRange, InjectionZone, SemanticTokens } from './types.js';
/**
 * Walks a semantic-tokens payload produced against a zone's virtual
 * document and appends the host-neutral `InjectionRange`s per category into
 * `rangesByCategory`.
 *
 * The LSP semantic-tokens wire format encodes each token as five u32 deltas:
 *   [deltaLine, deltaStart, length, typeIndex, modifierBitset]
 *
 * We decode the running (line, startChar) position and translate it from the
 * virtual document (which contains only the zone text) back into coordinates
 * of the real document. The first line of the zone is offset by
 * `zone.startCol`; subsequent lines use raw `startChar`.
 *
 * Tokens whose type is unknown (`legend.tokenTypes[typeIndex]` missing) or
 * not in `SEMANTIC_TOKEN_MAP` are silently skipped, matching the original
 * vscode implementation.
 */
export declare function mapTokensToDecorations(tokens: SemanticTokens, zone: InjectionZone, rangesByCategory: Map<DecorationCategory, InjectionRange[]>): void;
