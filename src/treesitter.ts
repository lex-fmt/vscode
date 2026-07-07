import path from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { Parser, Language, Query, type Tree, type Node } from 'web-tree-sitter'

export type { Tree, Node }

export interface CaptureResult {
  name: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  text: string
}

export interface InjectionZone {
  language: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  text: string
}

export interface LexTreeSitter {
  parse(text: string): Tree
  queryHighlights(tree: Tree): CaptureResult[]
  queryInjections(tree: Tree): InjectionZone[]
  dispose(): void
}

/**
 * Result of a tree-sitter init attempt. On failure, `stage` identifies which
 * step blew up so callers can produce useful diagnostics rather than a
 * generic "tree-sitter unavailable" message.
 */
export type TreeSitterInitResult =
  | { ok: true; ts: LexTreeSitter }
  | { ok: false; stage: string; error: string; resourcesDir: string }

/**
 * Optional logger; called with one line per stage so the activation channel
 * has a breadcrumb trail when initialization fails.
 */
export type InitLogger = (msg: string) => void

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message
  }
  return String(err)
}

function findAncestor(node: Node, type: string): Node | null {
  let n: Node | null = node
  while (n) {
    if (n.type === type) return n
    n = n.parent
  }
  return null
}

export async function initTreeSitter(
  extensionPath: string,
  log?: InitLogger
): Promise<TreeSitterInitResult> {
  const resourcesDir = path.join(extensionPath, 'resources')
  const runtimeWasm = path.join(resourcesDir, 'tree-sitter.wasm')
  const langWasm = path.join(resourcesDir, 'tree-sitter-lex.wasm')
  const highlightsPath = path.join(resourcesDir, 'queries', 'highlights.scm')
  const injectionsPath = path.join(resourcesDir, 'queries', 'injections.scm')

  log?.(`[lex] tree-sitter: resources dir = ${resourcesDir}`)

  // Each block names the stage so a failure is attributable. Pre-flight
  // checks for missing files run synchronously before the async init paths
  // so the user sees "missing X" instead of an opaque WASM load error.
  if (!existsSync(runtimeWasm)) {
    return failure('runtime-wasm-missing', `tree-sitter.wasm not found at ${runtimeWasm}`)
  }
  if (!existsSync(langWasm)) {
    return failure('lang-wasm-missing', `tree-sitter-lex.wasm not found at ${langWasm}`)
  }
  if (!existsSync(highlightsPath)) {
    return failure('highlights-missing', `highlights.scm not found at ${highlightsPath}`)
  }

  let parser: Parser
  let language: Language
  let highlightsQuery: Query
  let injectionsQuery: Query | null = null

  try {
    log?.(`[lex] tree-sitter: Parser.init (runtime=${runtimeWasm})`)
    await Parser.init({
      locateFile: () => runtimeWasm
    })
  } catch (err) {
    return failure('parser-init', describeError(err))
  }

  try {
    log?.(`[lex] tree-sitter: Language.load (${langWasm})`)
    language = await Language.load(langWasm)
  } catch (err) {
    return failure('language-load', describeError(err))
  }

  try {
    parser = new Parser()
    parser.setLanguage(language)
  } catch (err) {
    return failure('parser-set-language', describeError(err))
  }

  try {
    const highlightsSrc = readFileSync(highlightsPath, 'utf-8')
    highlightsQuery = new Query(language, highlightsSrc)
  } catch (err) {
    return failure('highlights-query', describeError(err))
  }

  if (existsSync(injectionsPath)) {
    try {
      const injectionsSrc = readFileSync(injectionsPath, 'utf-8')
      injectionsQuery = new Query(language, injectionsSrc)
    } catch (err) {
      return failure('injections-query', describeError(err))
    }
  } else {
    log?.(`[lex] tree-sitter: injections.scm not present at ${injectionsPath} — skipping`)
  }

  log?.('[lex] tree-sitter: ready')

  return {
    ok: true,
    ts: {
      parse(text: string): Tree {
        const tree = parser.parse(text)
        if (!tree) throw new Error('tree-sitter parse returned null')
        return tree
      },

      queryHighlights(tree: Tree): CaptureResult[] {
        const captures = highlightsQuery.captures(tree.rootNode)
        return captures.map((c) => ({
          name: c.name,
          startRow: c.node.startPosition.row,
          startCol: c.node.startPosition.column,
          endRow: c.node.endPosition.row,
          endCol: c.node.endPosition.column,
          text: c.node.text
        }))
      },

      queryInjections(tree: Tree): InjectionZone[] {
        if (!injectionsQuery) return []

        const captures = injectionsQuery.captures(tree.rootNode)

        // Group captures by their enclosing verbatim_block. The .scm
        // emits one or more `@injection.content` captures plus one
        // `@injection.language` per verbatim_block; downstream consumers
        // (Pylance, etc.) need one *contiguous* virtual document per
        // block so the embedded code parses as a single unit. Multiple
        // separate zones for the same block fragment the parse —
        // Pylance ends up with disconnected snippets and produces few
        // useful tokens.
        //
        // We walk up from each capture to the enclosing verbatim_block
        // (captures inside `verbatim_group_item` have a different
        // immediate parent), then take the union range of the content
        // nodes and slice the original source for the zone text.
        const byVerbatim = new Map<
          number,
          { verbatim: Node; lang: string | null; contentNodes: Node[] }
        >()

        for (const cap of captures) {
          const verbatim = findAncestor(cap.node, 'verbatim_block')
          if (!verbatim) continue

          let entry = byVerbatim.get(verbatim.id)
          if (!entry) {
            entry = { verbatim, lang: null, contentNodes: [] }
            byVerbatim.set(verbatim.id, entry)
          }

          if (cap.name === 'injection.language') {
            const raw = cap.node.text.trim()
            entry.lang = raw.split(/\s+/)[0].toLowerCase()
          } else if (cap.name === 'injection.content') {
            entry.contentNodes.push(cap.node)
          }
        }

        const zones: InjectionZone[] = []
        for (const { verbatim, lang, contentNodes } of byVerbatim.values()) {
          if (!lang || contentNodes.length === 0) continue

          contentNodes.sort((a, b) => a.startIndex - b.startIndex)
          const first = contentNodes[0]
          const last = contentNodes[contentNodes.length - 1]

          zones.push({
            language: lang,
            startRow: first.startPosition.row,
            startCol: first.startPosition.column,
            endRow: last.endPosition.row,
            endCol: last.endPosition.column,
            text: verbatim.text.substring(
              first.startIndex - verbatim.startIndex,
              last.endIndex - verbatim.startIndex
            )
          })
        }

        return zones
      },

      dispose() {
        parser.delete()
        highlightsQuery.delete()
        injectionsQuery?.delete()
      }
    }
  }

  function failure(stage: string, error: string): TreeSitterInitResult {
    log?.(`[lex] tree-sitter: ${stage} failed: ${error}`)
    return { ok: false, stage, error, resourcesDir }
  }
}
