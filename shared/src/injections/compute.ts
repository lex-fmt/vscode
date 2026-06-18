import { CATEGORY_COLORS } from './constants.js';
import { mapTokensToDecorations } from './mapTokens.js';
import { resolveLanguageId } from './resolve.js';
import type {
  DecorationCategory,
  InjectionHostAdapter,
  InjectionRange,
  InjectionZone,
} from './types.js';

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
export async function computeInjectionDecorations(
  zones: InjectionZone[],
  host: InjectionHostAdapter
): Promise<Map<DecorationCategory, InjectionRange[]>> {
  const rangesByCategory = new Map<DecorationCategory, InjectionRange[]>();
  for (const category of Object.keys(CATEGORY_COLORS) as DecorationCategory[]) {
    rangesByCategory.set(category, []);
  }

  if (zones.length === 0) return rangesByCategory;

  const registered = await host.getRegisteredLanguages();

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const langId = resolveLanguageId(zone.language, registered);
    if (!langId) continue;

    let tokens;
    try {
      tokens = await host.getTokens(i, zone.text, langId);
    } catch {
      continue;
    }
    if (!tokens) continue;

    mapTokensToDecorations(tokens, zone, host.tokenNameToCategory, rangesByCategory);
  }

  return rangesByCategory;
}
