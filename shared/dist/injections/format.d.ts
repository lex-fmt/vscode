import type { InjectionStatus } from './types.js';
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
export declare function formatInjectionStatus(status: InjectionStatus): string;
