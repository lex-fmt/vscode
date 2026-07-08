import type { DecorationCategory, EmbeddedToken, InjectionRange, InjectionZone } from './types.js'

/**
 * Map a tokenizer capture name onto a `DecorationCategory` via prefix
 * matching: `function.method` falls back to `function` if the more
 * specific name isn't in the map. Returns `null` if no prefix matches —
 * the caller skips that token.
 *
 * Tree-sitter highlight names are conventionally hierarchical
 * (`variable.parameter`, `keyword.function`), and host maps usually only
 * spell out the broad categories. Walking the prefix tree lets a host
 * supply `{ keyword: 'keyword', function: 'function', ... }` and have it
 * cover every `keyword.X` / `function.Y` variant.
 */
export function resolveCategory(
  name: string,
  map: Readonly<Record<string, DecorationCategory>>
): DecorationCategory | null {
  let cursor = name
  while (cursor.length > 0) {
    const cat = map[cursor]
    if (cat) return cat
    const dot = cursor.lastIndexOf('.')
    if (dot < 0) return null
    cursor = cursor.slice(0, dot)
  }
  return null
}

/**
 * Translate per-zone tokenizer output into real-document
 * `InjectionRange`s, appending into `rangesByCategory`. Token coordinates
 * are zone-relative (the tokenizer parsed `zone.text`); on virtual line 0
 * we shift columns by `zone.startCol`, on later lines we use the raw
 * column. Endpoints land on the same row as the start because every
 * token type in our map is a single-line construct (keyword, string,
 * comment, etc.).
 */
export function mapTokensToDecorations(
  tokens: readonly EmbeddedToken[],
  zone: InjectionZone,
  map: Readonly<Record<string, DecorationCategory>>,
  rangesByCategory: Map<DecorationCategory, InjectionRange[]>
): void {
  for (const tok of tokens) {
    const category = resolveCategory(tok.name, map)
    if (!category) continue

    const ranges = rangesByCategory.get(category)
    if (!ranges) continue

    const startReal = toRealPosition(tok.startLine, tok.startCol, zone)
    const endReal = toRealPosition(tok.endLine, tok.endCol, zone)

    ranges.push({
      startLine: startReal.line,
      startCol: startReal.col,
      endLine: endReal.line,
      endCol: endReal.col
    })
  }
}

function toRealPosition(
  line: number,
  col: number,
  zone: InjectionZone
): { line: number; col: number } {
  return {
    line: zone.startRow + line,
    col: line === 0 ? zone.startCol + col : col
  }
}
