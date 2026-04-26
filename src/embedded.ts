/**
 * Tree-sitter-backed embedded-language tokenizer.
 *
 * For each verbatim block we want to highlight (`:: python ::`,
 * `:: javascript ::`, …) we lazily load the corresponding tree-sitter
 * grammar from `resources/embedded-grammars/<lang>/parser.wasm` and
 * its `highlights.scm`, then run that grammar's highlights query over
 * the zone content. This produces the keyword/string/comment captures
 * the LSP semantic-tokens path can't deliver: VS Code's
 * `provideDocumentSemanticTokens` returns only the *semantic* layer
 * (variable-vs-function disambiguation), leaving syntactic tokens to
 * the TextMate grammar that we don't have for `.lex` files.
 *
 * `Parser.init()` is the responsibility of the main tree-sitter
 * bootstrap (initTreeSitter); once initialized the runtime is shared
 * across all loaded grammars, so we only call `Language.load(...)`
 * here.
 */

import path from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { Parser, Language, Query, type Node } from 'web-tree-sitter';
import type { injections } from '@lex/shared';

export type EmbeddedToken = injections.EmbeddedToken;

export interface EmbeddedTokenizer {
  /**
   * Returns the canonical language IDs this tokenizer can serve. Read
   * from disk at construction time and never changes — adding a new
   * bundled grammar requires a download + extension reload.
   */
  availableLanguages(): Set<string>;
  /**
   * Tokenize `content` as `langId`. Resolves to `null` when the
   * language is not bundled, the WASM grammar fails to load, or the
   * parse throws. Resolves to `[]` when the parse succeeded but the
   * highlights query produced no captures.
   */
  tokenize(content: string, langId: string): Promise<EmbeddedToken[] | null>;
  dispose(): void;
}

interface LoadedLanguage {
  parser: Parser;
  query: Query;
}

export type EmbeddedLogger = (msg: string) => void;

/**
 * Build a tokenizer rooted at `<extensionPath>/resources/embedded-grammars/`.
 * Each immediate subdirectory containing both `parser.wasm` and
 * `highlights.scm` becomes a tokenizable language. Language entries
 * are loaded lazily on first use; subsequent calls hit the cache.
 */
export function createEmbeddedTokenizer(
  extensionPath: string,
  log?: EmbeddedLogger
): EmbeddedTokenizer {
  const grammarsDir = path.join(extensionPath, 'resources', 'embedded-grammars');
  const loaded = new Map<string, LoadedLanguage>();
  const inflight = new Map<string, Promise<LoadedLanguage | null>>();
  const failed = new Map<string, string>();
  const available = discoverLanguages(grammarsDir);

  log?.(
    `[lex] embedded tokenizer: ${available.size} grammar(s) available: ${
      Array.from(available).sort().join(', ') || '(none)'
    }`
  );

  async function load(langId: string): Promise<LoadedLanguage | null> {
    const cached = loaded.get(langId);
    if (cached) return cached;
    if (failed.has(langId)) return null;

    const existing = inflight.get(langId);
    if (existing) return existing;

    const parserPath = path.join(grammarsDir, langId, 'parser.wasm');
    const queryPath = path.join(grammarsDir, langId, 'highlights.scm');
    if (!existsSync(parserPath) || !existsSync(queryPath)) {
      const msg = `missing parser.wasm or highlights.scm for ${langId}`;
      failed.set(langId, msg);
      log?.(`[lex] embedded tokenizer: ${msg}`);
      return null;
    }

    const promise = (async (): Promise<LoadedLanguage | null> => {
      try {
        const language = await Language.load(parserPath);
        const parser = new Parser();
        parser.setLanguage(language);
        const queryStr = readFileSync(queryPath, 'utf-8');
        const query = new Query(language, queryStr);
        const entry: LoadedLanguage = { parser, query };
        loaded.set(langId, entry);
        log?.(`[lex] embedded tokenizer: loaded ${langId}`);
        return entry;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.set(langId, msg);
        log?.(`[lex] embedded tokenizer: load failed for ${langId}: ${msg}`);
        return null;
      } finally {
        inflight.delete(langId);
      }
    })();
    inflight.set(langId, promise);
    return promise;
  }

  return {
    availableLanguages: () => new Set(available),
    async tokenize(content, langId) {
      if (!available.has(langId)) return null;
      const ctx = await load(langId);
      if (!ctx) return null;

      let tree;
      try {
        tree = ctx.parser.parse(content);
      } catch (err) {
        log?.(
          `[lex] embedded tokenizer: parse(${langId}) threw: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return null;
      }
      if (!tree) return null;

      const captures = ctx.query.captures(tree.rootNode);
      const tokens = captures.map(({ name, node }) => makeToken(name, node));
      tree.delete();
      return tokens;
    },
    dispose() {
      for (const entry of loaded.values()) {
        entry.parser.delete();
        entry.query.delete();
      }
      loaded.clear();
      inflight.clear();
      failed.clear();
    },
  };
}

function discoverLanguages(grammarsDir: string): Set<string> {
  if (!existsSync(grammarsDir)) return new Set();
  const set = new Set<string>();
  for (const entry of readdirSync(grammarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const lang = entry.name;
    if (
      existsSync(path.join(grammarsDir, lang, 'parser.wasm')) &&
      existsSync(path.join(grammarsDir, lang, 'highlights.scm'))
    ) {
      set.add(lang);
    }
  }
  return set;
}

function makeToken(name: string, node: Node): EmbeddedToken {
  return {
    name,
    startLine: node.startPosition.row,
    startCol: node.startPosition.column,
    endLine: node.endPosition.row,
    endCol: node.endPosition.column,
  };
}
