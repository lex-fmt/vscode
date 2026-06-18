import { CATEGORY_COLORS } from './constants.js';
import type { DecorationCategory, InjectionStatus, ZoneDiagnostic } from './types.js';

/**
 * Render an `InjectionStatus` as a human-readable text block for output
 * channels, log files, and test failure messages. The format is stable
 * enough that a test can grep for the per-zone lines, but it's primarily
 * meant to be eyeballed.
 *
 * Example output:
 *
 *   Lex injection status — file=foo.lex enabled=true zones=2 registered=84
 *   Decorations:  keyword=12 string=4 comment=3 number=0 type=0 function=2 operator=1
 *   Zones:
 *     #0 [10:4 → 18:0] python (→ python) bytes=243 requested=true received=true tokens=22
 *     #1 [25:4 → 30:0] cobol  (→ —)      bytes=87  requested=false
 *
 * The "→ —" form means the annotation language did not resolve to any
 * host-registered language ID. That's the most common failure mode.
 */
export function formatInjectionStatus(status: InjectionStatus): string {
  const lines: string[] = [];
  const file = status.documentUri ?? '(no document)';
  lines.push(
    `Lex injection status — file=${file} enabled=${status.enabled} ` +
      `zones=${status.zoneCount} registered=${status.registeredLanguageCount}`
  );

  // Decoration totals per category.
  const totals: string[] = [];
  for (const cat of Object.keys(CATEGORY_COLORS) as DecorationCategory[]) {
    const ranges = status.rangesByCategory.get(cat) ?? [];
    totals.push(`${cat}=${ranges.length}`);
  }
  lines.push(`Decorations:  ${totals.join(' ')}`);

  if (status.zones.length === 0) {
    lines.push('Zones: (none)');
    return lines.join('\n');
  }

  lines.push('Zones:');
  for (const zone of status.zones) {
    lines.push(`  ${formatZoneLine(zone)}`);
  }
  return lines.join('\n');
}

function formatZoneLine(z: ZoneDiagnostic): string {
  const range = `[${z.range.startLine}:${z.range.startCol} → ${z.range.endLine}:${z.range.endCol}]`;
  const resolved = z.resolvedLanguageId ?? '—';
  const head = `#${z.index} ${range} ${z.annotationLanguage} (→ ${resolved}) bytes=${z.contentLength}`;
  if (!z.requestedTokens) {
    return `${head} requested=false`;
  }
  const tail = `requested=true received=${z.receivedTokens} tokens=${z.tokenCount}`;
  let line = `${head} ${tail}`;
  if (z.error) {
    line += ` error="${z.error}"`;
  }
  if (z.tokenTypeHistogram && Object.keys(z.tokenTypeHistogram).length > 0) {
    // Sort by count descending so the dominant token types stand out.
    const entries = Object.entries(z.tokenTypeHistogram).sort((a, b) => b[1] - a[1]);
    const tally = entries.map(([t, n]) => `${t}=${n}`).join(' ');
    line += `\n      types: ${tally}`;
  }
  return line;
}
