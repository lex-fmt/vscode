/**
 * Regex-based tokenizers for embedded language highlighting.
 *
 * Provides "good enough" syntax highlighting for code blocks embedded in
 * Lex verbatim blocks. These tokenizers are intentionally simple — they
 * handle keywords, strings, comments, and numbers for common languages.
 * They don't need to be perfect; they just need to make embedded code
 * visually distinct from Lex prose.
 */

export type TokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'constant'
  | 'operator'
  | 'punctuation'
  | 'function';

export interface TokenSpan {
  type: TokenType;
  start: number; // offset in text
  length: number;
}

interface LanguageSpec {
  lineComment?: string;
  blockComment?: [string, string];
  strings: string[];
  tripleStrings?: string[];
  templateStrings?: boolean;
  keywords: string[];
  types?: string[];
  constants?: string[];
  hashComment?: boolean;
}

function wordBoundary(word: string, pos: number, text: string): boolean {
  const before = pos > 0 ? text[pos - 1] : ' ';
  const after = pos + word.length < text.length ? text[pos + word.length] : ' ';
  return !/\w/.test(before) && !/\w/.test(after);
}

function tokenize(text: string, spec: LanguageSpec): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }

    // Block comments
    if (spec.blockComment) {
      const [open, close] = spec.blockComment;
      if (text.startsWith(open, i)) {
        const end = text.indexOf(close, i + open.length);
        const len = end === -1 ? text.length - i : end - i + close.length;
        tokens.push({ type: 'comment', start: i, length: len });
        i += len;
        continue;
      }
    }

    // Line comments
    if (spec.lineComment && text.startsWith(spec.lineComment, i)) {
      const end = text.indexOf('\n', i);
      const len = end === -1 ? text.length - i : end - i;
      tokens.push({ type: 'comment', start: i, length: len });
      i += len;
      continue;
    }

    // Hash comments (Python, Ruby, Bash, etc.)
    if (spec.hashComment && text[i] === '#') {
      const end = text.indexOf('\n', i);
      const len = end === -1 ? text.length - i : end - i;
      tokens.push({ type: 'comment', start: i, length: len });
      i += len;
      continue;
    }

    // Triple-quoted strings (Python)
    if (spec.tripleStrings) {
      let matched = false;
      for (const q of spec.tripleStrings) {
        const triple = q + q + q;
        if (text.startsWith(triple, i)) {
          const end = text.indexOf(triple, i + 3);
          const len = end === -1 ? text.length - i : end - i + 3;
          tokens.push({ type: 'string', start: i, length: len });
          i += len;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // Template strings (backtick)
    if (spec.templateStrings && text[i] === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== '`') {
        if (text[j] === '\\') j++;
        j++;
      }
      const len = (j < text.length ? j + 1 : j) - i;
      tokens.push({ type: 'string', start: i, length: len });
      i += len;
      continue;
    }

    // Strings
    if (spec.strings.includes(text[i])) {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== quote && text[j] !== '\n') {
        if (text[j] === '\\') j++;
        j++;
      }
      const len = (j < text.length && text[j] === quote ? j + 1 : j) - i;
      tokens.push({ type: 'string', start: i, length: len });
      i += len;
      continue;
    }

    // Numbers
    if (/\d/.test(text[i]) || (text[i] === '.' && i + 1 < text.length && /\d/.test(text[i + 1]))) {
      const match = text
        .slice(i)
        .match(/^0[xX][\da-fA-F_]+|^0[oO][0-7_]+|^0[bB][01_]+|^\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?/);
      if (match) {
        tokens.push({ type: 'number', start: i, length: match[0].length });
        i += match[0].length;
        continue;
      }
    }

    // Identifiers → check against keywords, types, constants
    if (/[a-zA-Z_$]/.test(text[i])) {
      const match = text.slice(i).match(/^[a-zA-Z_$]\w*/);
      if (match) {
        const word = match[0];
        if (spec.keywords.includes(word) && wordBoundary(word, i, text)) {
          tokens.push({ type: 'keyword', start: i, length: word.length });
        } else if (spec.types?.includes(word) && wordBoundary(word, i, text)) {
          tokens.push({ type: 'type', start: i, length: word.length });
        } else if (spec.constants?.includes(word) && wordBoundary(word, i, text)) {
          tokens.push({ type: 'constant', start: i, length: word.length });
        } else if (
          i + word.length < text.length &&
          text[i + word.length] === '(' &&
          wordBoundary(word, i, text)
        ) {
          tokens.push({ type: 'function', start: i, length: word.length });
        }
        i += word.length;
        continue;
      }
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(text[i])) {
      // Multi-char operators
      const remaining = text.slice(i);
      const opMatch = remaining.match(
        /^(?:===|!==|==|!=|<=|>=|=>|->|&&|\|\||<<|>>|\*\*|\.\.\.?|[+\-*/%=<>!&|^~?:])/
      );
      if (opMatch) {
        tokens.push({ type: 'operator', start: i, length: opMatch[0].length });
        i += opMatch[0].length;
        continue;
      }
    }

    // Punctuation
    if (/[{}()[\];,.]/.test(text[i])) {
      tokens.push({ type: 'punctuation', start: i, length: 1 });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

// === Language Specs ===

const JAVASCRIPT: LanguageSpec = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  strings: ['"', "'"],
  templateStrings: true,
  keywords: [
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
  ],
  constants: ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
  types: [
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'Promise',
    'Map',
    'Set',
    'RegExp',
    'Error',
  ],
};

const TYPESCRIPT: LanguageSpec = {
  ...JAVASCRIPT,
  keywords: [
    ...JAVASCRIPT.keywords,
    'abstract',
    'as',
    'declare',
    'enum',
    'implements',
    'interface',
    'keyof',
    'namespace',
    'private',
    'protected',
    'public',
    'readonly',
    'type',
    'override',
    'satisfies',
  ],
  types: [
    ...(JAVASCRIPT.types ?? []),
    'any',
    'bigint',
    'boolean',
    'never',
    'number',
    'object',
    'string',
    'symbol',
    'unknown',
    'void',
  ],
};

const PYTHON: LanguageSpec = {
  hashComment: true,
  strings: ['"', "'"],
  tripleStrings: ['"', "'"],
  keywords: [
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield',
    'match',
    'case',
  ],
  constants: ['True', 'False', 'None'],
  types: ['int', 'float', 'str', 'bool', 'list', 'dict', 'tuple', 'set', 'bytes', 'type', 'object'],
};

const JSON_SPEC: LanguageSpec = {
  strings: ['"'],
  keywords: [],
  constants: ['true', 'false', 'null'],
};

const RUST: LanguageSpec = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  strings: ['"'],
  keywords: [
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'static',
    'struct',
    'super',
    'trait',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'yield',
  ],
  constants: ['true', 'false'],
  types: [
    'i8',
    'i16',
    'i32',
    'i64',
    'i128',
    'isize',
    'u8',
    'u16',
    'u32',
    'u64',
    'u128',
    'usize',
    'f32',
    'f64',
    'bool',
    'char',
    'str',
    'String',
    'Vec',
    'Option',
    'Result',
    'Box',
    'Rc',
    'Arc',
    'HashMap',
    'HashSet',
    'BTreeMap',
    'BTreeSet',
    'Self',
  ],
};

const GO: LanguageSpec = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  strings: ['"', "'"],
  templateStrings: true, // backtick raw strings
  keywords: [
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
  ],
  constants: ['true', 'false', 'nil', 'iota'],
  types: [
    'bool',
    'byte',
    'complex64',
    'complex128',
    'error',
    'float32',
    'float64',
    'int',
    'int8',
    'int16',
    'int32',
    'int64',
    'rune',
    'string',
    'uint',
    'uint8',
    'uint16',
    'uint32',
    'uint64',
    'uintptr',
  ],
};

const BASH: LanguageSpec = {
  hashComment: true,
  strings: ['"', "'"],
  keywords: [
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'do',
    'done',
    'case',
    'esac',
    'in',
    'function',
    'return',
    'local',
    'export',
    'readonly',
    'declare',
    'typeset',
    'unset',
    'shift',
    'exit',
    'break',
    'continue',
    'source',
    'select',
    'until',
  ],
  constants: ['true', 'false'],
};

const C_SPEC: LanguageSpec = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  strings: ['"', "'"],
  keywords: [
    'auto',
    'break',
    'case',
    'const',
    'continue',
    'default',
    'do',
    'else',
    'enum',
    'extern',
    'for',
    'goto',
    'if',
    'inline',
    'register',
    'restrict',
    'return',
    'sizeof',
    'static',
    'struct',
    'switch',
    'typedef',
    'union',
    'volatile',
    'while',
  ],
  constants: ['NULL', 'true', 'false', 'TRUE', 'FALSE'],
  types: [
    'void',
    'char',
    'short',
    'int',
    'long',
    'float',
    'double',
    'signed',
    'unsigned',
    'bool',
    'size_t',
    'ssize_t',
    'int8_t',
    'int16_t',
    'int32_t',
    'int64_t',
    'uint8_t',
    'uint16_t',
    'uint32_t',
    'uint64_t',
  ],
};

const CPP: LanguageSpec = {
  ...C_SPEC,
  keywords: [
    ...C_SPEC.keywords,
    'alignas',
    'alignof',
    'catch',
    'class',
    'concept',
    'consteval',
    'constexpr',
    'constinit',
    'co_await',
    'co_return',
    'co_yield',
    'decltype',
    'delete',
    'explicit',
    'export',
    'final',
    'friend',
    'module',
    'mutable',
    'namespace',
    'new',
    'noexcept',
    'operator',
    'override',
    'private',
    'protected',
    'public',
    'requires',
    'static_assert',
    'template',
    'this',
    'throw',
    'try',
    'typeid',
    'typename',
    'using',
    'virtual',
  ],
  constants: [...(C_SPEC.constants ?? []), 'nullptr', 'this'],
  types: [
    ...(C_SPEC.types ?? []),
    'auto',
    'string',
    'wstring',
    'string_view',
    'vector',
    'map',
    'set',
    'unordered_map',
    'unordered_set',
    'shared_ptr',
    'unique_ptr',
    'weak_ptr',
    'optional',
    'variant',
    'any',
  ],
};

const HTML_SPEC: LanguageSpec = {
  blockComment: ['<!--', '-->'],
  strings: ['"', "'"],
  keywords: [
    'html',
    'head',
    'body',
    'div',
    'span',
    'p',
    'a',
    'img',
    'ul',
    'ol',
    'li',
    'table',
    'tr',
    'td',
    'th',
    'form',
    'input',
    'button',
    'select',
    'option',
    'script',
    'style',
    'link',
    'meta',
    'title',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'article',
    'nav',
    'header',
    'footer',
    'main',
    'aside',
    'pre',
    'code',
    'blockquote',
    'em',
    'strong',
    'br',
    'hr',
  ],
};

const CSS_SPEC: LanguageSpec = {
  blockComment: ['/*', '*/'],
  strings: ['"', "'"],
  keywords: [
    'important',
    'inherit',
    'initial',
    'unset',
    'revert',
    'none',
    'auto',
    'block',
    'inline',
    'flex',
    'grid',
    'absolute',
    'relative',
    'fixed',
    'sticky',
    'static',
  ],
  constants: ['transparent', 'currentColor'],
};

const SQL_SPEC: LanguageSpec = {
  lineComment: '--',
  blockComment: ['/*', '*/'],
  strings: ["'"],
  keywords: [
    'SELECT',
    'FROM',
    'WHERE',
    'AND',
    'OR',
    'NOT',
    'IN',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'CREATE',
    'TABLE',
    'DROP',
    'ALTER',
    'ADD',
    'INDEX',
    'PRIMARY',
    'KEY',
    'FOREIGN',
    'REFERENCES',
    'JOIN',
    'INNER',
    'LEFT',
    'RIGHT',
    'OUTER',
    'ON',
    'AS',
    'ORDER',
    'BY',
    'GROUP',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION',
    'ALL',
    'DISTINCT',
    'EXISTS',
    'BETWEEN',
    'LIKE',
    'IS',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'TRANSACTION',
    'WITH',
    'RECURSIVE',
    // lowercase variants
    'select',
    'from',
    'where',
    'and',
    'or',
    'not',
    'in',
    'insert',
    'into',
    'values',
    'update',
    'set',
    'delete',
    'create',
    'table',
    'drop',
    'alter',
    'add',
    'index',
    'primary',
    'key',
    'foreign',
    'references',
    'join',
    'inner',
    'left',
    'right',
    'outer',
    'on',
    'as',
    'order',
    'by',
    'group',
    'having',
    'limit',
    'offset',
    'union',
    'all',
    'distinct',
    'exists',
    'between',
    'like',
    'is',
    'case',
    'when',
    'then',
    'else',
    'end',
    'begin',
    'commit',
    'rollback',
    'transaction',
    'with',
    'recursive',
  ],
  constants: ['NULL', 'null', 'TRUE', 'FALSE', 'true', 'false'],
  types: [
    'INT',
    'INTEGER',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'FLOAT',
    'DOUBLE',
    'DECIMAL',
    'NUMERIC',
    'CHAR',
    'VARCHAR',
    'TEXT',
    'BLOB',
    'DATE',
    'DATETIME',
    'TIMESTAMP',
    'BOOLEAN',
    'SERIAL',
    'int',
    'integer',
    'bigint',
    'smallint',
    'tinyint',
    'float',
    'double',
    'decimal',
    'numeric',
    'char',
    'varchar',
    'text',
    'blob',
    'date',
    'datetime',
    'timestamp',
    'boolean',
    'serial',
  ],
};

const RUBY: LanguageSpec = {
  hashComment: true,
  strings: ['"', "'"],
  keywords: [
    'alias',
    'and',
    'begin',
    'break',
    'case',
    'class',
    'def',
    'defined?',
    'do',
    'else',
    'elsif',
    'end',
    'ensure',
    'for',
    'if',
    'in',
    'module',
    'next',
    'not',
    'or',
    'redo',
    'rescue',
    'retry',
    'return',
    'self',
    'super',
    'then',
    'unless',
    'until',
    'when',
    'while',
    'yield',
    'require',
    'include',
    'extend',
    'attr_reader',
    'attr_writer',
    'attr_accessor',
    'raise',
    'puts',
    'print',
  ],
  constants: ['true', 'false', 'nil'],
};

const JAVA: LanguageSpec = {
  lineComment: '//',
  blockComment: ['/*', '*/'],
  strings: ['"', "'"],
  keywords: [
    'abstract',
    'assert',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'do',
    'else',
    'enum',
    'extends',
    'final',
    'finally',
    'for',
    'if',
    'implements',
    'import',
    'instanceof',
    'interface',
    'native',
    'new',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'static',
    'strictfp',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'try',
    'volatile',
    'while',
    'yield',
    'var',
    'record',
    'sealed',
    'permits',
  ],
  constants: ['true', 'false', 'null'],
  types: [
    'boolean',
    'byte',
    'char',
    'double',
    'float',
    'int',
    'long',
    'short',
    'void',
    'String',
    'Integer',
    'Long',
    'Double',
    'Float',
    'Boolean',
    'Character',
    'Object',
    'List',
    'Map',
    'Set',
    'ArrayList',
    'HashMap',
    'HashSet',
    'Optional',
    'Stream',
  ],
};

const TOML_SPEC: LanguageSpec = {
  hashComment: true,
  strings: ['"', "'"],
  tripleStrings: ['"', "'"],
  keywords: [],
  constants: ['true', 'false'],
};

const YAML_SPEC: LanguageSpec = {
  hashComment: true,
  strings: ['"', "'"],
  keywords: [],
  constants: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
};

// === Language Registry ===

const LANGUAGES: Record<string, LanguageSpec> = {
  javascript: JAVASCRIPT,
  js: JAVASCRIPT,
  jsx: JAVASCRIPT,
  typescript: TYPESCRIPT,
  ts: TYPESCRIPT,
  tsx: TYPESCRIPT,
  python: PYTHON,
  py: PYTHON,
  json: JSON_SPEC,
  jsonc: JSON_SPEC,
  rust: RUST,
  rs: RUST,
  go: GO,
  golang: GO,
  bash: BASH,
  sh: BASH,
  shell: BASH,
  zsh: BASH,
  c: C_SPEC,
  cpp: CPP,
  'c++': CPP,
  cxx: CPP,
  cc: CPP,
  html: HTML_SPEC,
  htm: HTML_SPEC,
  xml: HTML_SPEC,
  css: CSS_SPEC,
  scss: CSS_SPEC,
  less: CSS_SPEC,
  sql: SQL_SPEC,
  ruby: RUBY,
  rb: RUBY,
  java: JAVA,
  toml: TOML_SPEC,
  yaml: YAML_SPEC,
  yml: YAML_SPEC,
};

export function tokenizeEmbedded(text: string, language: string): TokenSpan[] {
  const spec = LANGUAGES[language];
  if (!spec) return [];
  return tokenize(text, spec);
}

export function isLanguageSupported(language: string): boolean {
  return language in LANGUAGES;
}
