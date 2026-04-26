import type { DecorationCategory, InjectionHostAdapter, InjectionRange, InjectionZone } from './types.js';
/**
 * Orchestrator: given a set of injection zones and a host adapter,
 * returns the aggregated `InjectionRange`s per `DecorationCategory`.
 *
 * Behaviour contract:
 *   - The registered-language set is fetched once per call via the
 *     adapter. Hosts cache it themselves across calls.
 *   - Zones whose language doesn't resolve to a registered ID are
 *     skipped silently.
 *   - Zones whose `getTokens` returns `null` are skipped silently.
 *   - Zones whose `getTokens` throws are skipped — errors do not bubble
 *     out of this function.
 *
 * The returned map always contains an entry for every
 * `DecorationCategory` (empty array when no tokens matched) so callers
 * can iterate and apply the standard clear-then-set sequence against
 * their native decoration API.
 */
export declare function computeInjectionDecorations(zones: InjectionZone[], host: InjectionHostAdapter): Promise<Map<DecorationCategory, InjectionRange[]>>;
