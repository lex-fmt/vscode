import type { DecorationCategory, InjectionHostAdapter, InjectionRange, InjectionZone } from './types.js';
/**
 * Orchestrator: given a parsed set of injection zones and a host adapter,
 * returns the aggregated `InjectionRange`s per `DecorationCategory`.
 *
 * Behaviour contract:
 *   - The registered-languages set is fetched once per call via the adapter.
 *     Hosts are expected to cache this themselves across calls (the vscode
 *     adapter caches for 30s so newly installed extensions are picked up).
 *   - Zones whose language does not resolve to a registered ID are skipped.
 *   - Zones whose `getSemanticTokens` call returns `null` are skipped.
 *   - Zones whose `getSemanticTokens` throws are skipped — errors never
 *     bubble out of this function.
 *
 * The returned map always contains an entry for every `DecorationCategory`
 * (empty array when no tokens matched) so callers can iterate and apply the
 * correct clear-plus-set sequence against their native decoration API.
 */
export declare function computeInjectionDecorations(zones: InjectionZone[], host: InjectionHostAdapter): Promise<Map<DecorationCategory, InjectionRange[]>>;
