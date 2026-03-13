import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { Parser, Language, Query, type Tree, type Node } from 'web-tree-sitter';

export type { Tree, Node };

export interface CaptureResult {
  name: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  text: string;
}

export interface InjectionZone {
  language: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  text: string;
}

export interface LexTreeSitter {
  parse(text: string): Tree;
  queryHighlights(tree: Tree): CaptureResult[];
  queryInjections(tree: Tree): InjectionZone[];
  dispose(): void;
}

export async function initTreeSitter(extensionPath: string): Promise<LexTreeSitter | null> {
  const resourcesDir = path.join(extensionPath, 'resources');
  const runtimeWasm = path.join(resourcesDir, 'tree-sitter.wasm');
  const langWasm = path.join(resourcesDir, 'tree-sitter-lex.wasm');
  const highlightsPath = path.join(resourcesDir, 'queries', 'highlights.scm');
  const injectionsPath = path.join(resourcesDir, 'queries', 'injections.scm');

  try {
    await Parser.init({
      locateFile: () => runtimeWasm,
    });

    const language = await Language.load(langWasm);
    const parser = new Parser();
    parser.setLanguage(language);

    const highlightsSrc = readFileSync(highlightsPath, 'utf-8');
    const highlightsQuery = new Query(language, highlightsSrc);

    let injectionsQuery: Query | null = null;
    if (existsSync(injectionsPath)) {
      const injectionsSrc = readFileSync(injectionsPath, 'utf-8');
      injectionsQuery = new Query(language, injectionsSrc);
    }

    return {
      parse(text: string): Tree {
        const tree = parser.parse(text);
        if (!tree) throw new Error('tree-sitter parse returned null');
        return tree;
      },

      queryHighlights(tree: Tree): CaptureResult[] {
        const captures = highlightsQuery.captures(tree.rootNode);
        return captures.map((c) => ({
          name: c.name,
          startRow: c.node.startPosition.row,
          startCol: c.node.startPosition.column,
          endRow: c.node.endPosition.row,
          endCol: c.node.endPosition.column,
          text: c.node.text,
        }));
      },

      queryInjections(tree: Tree): InjectionZone[] {
        if (!injectionsQuery) return [];

        const captures = injectionsQuery.captures(tree.rootNode);

        // Group captures by parent verbatim_block node — each block has
        // one language (from annotation_header) and one or more content nodes
        const zones: InjectionZone[] = [];

        const contentCaptures: Array<{
          node: CaptureResult;
          parentId: number;
        }> = [];
        const langCaptures: Array<{
          lang: string;
          parentId: number;
        }> = [];

        for (const capture of captures) {
          // Use the parent verbatim_block node ID for grouping
          const parentNode = capture.node.parent;
          const parentId = parentNode?.id ?? 0;

          if (capture.name === 'injection.content') {
            contentCaptures.push({
              node: {
                name: capture.name,
                startRow: capture.node.startPosition.row,
                startCol: capture.node.startPosition.column,
                endRow: capture.node.endPosition.row,
                endCol: capture.node.endPosition.column,
                text: capture.node.text,
              },
              parentId,
            });
          } else if (capture.name === 'injection.language') {
            const raw = capture.node.text.trim();
            const lang = raw.split(/\s+/)[0].toLowerCase();
            langCaptures.push({ lang, parentId });
          }
        }

        // Match content to language by parent verbatim block
        const langByParent = new Map<number, string>();
        for (const lc of langCaptures) {
          langByParent.set(lc.parentId, lc.lang);
        }

        for (const cc of contentCaptures) {
          const lang = langByParent.get(cc.parentId);
          if (lang) {
            zones.push({
              language: lang,
              startRow: cc.node.startRow,
              startCol: cc.node.startCol,
              endRow: cc.node.endRow,
              endCol: cc.node.endCol,
              text: cc.node.text,
            });
          }
        }

        return zones;
      },

      dispose() {
        parser.delete();
        highlightsQuery.delete();
        injectionsQuery?.delete();
      },
    };
  } catch (err) {
    console.warn('[lex] Failed to initialize tree-sitter:', err);
    return null;
  }
}
