import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeEmbedded, isLanguageSupported, type TokenSpan } from '../../src/tokenizers.js';

function findTokens(tokens: TokenSpan[], text: string, type: string): TokenSpan[] {
  return tokens.filter((t) => t.type === type);
}

function tokenText(text: string, token: TokenSpan): string {
  return text.slice(token.start, token.start + token.length);
}

describe('tokenizers', () => {
  describe('isLanguageSupported', () => {
    it('returns true for supported languages', () => {
      assert.ok(isLanguageSupported('python'));
      assert.ok(isLanguageSupported('javascript'));
      assert.ok(isLanguageSupported('json'));
      assert.ok(isLanguageSupported('rust'));
      assert.ok(isLanguageSupported('go'));
      assert.ok(isLanguageSupported('bash'));
      assert.ok(isLanguageSupported('c'));
      assert.ok(isLanguageSupported('cpp'));
    });

    it('returns true for language aliases', () => {
      assert.ok(isLanguageSupported('js'));
      assert.ok(isLanguageSupported('ts'));
      assert.ok(isLanguageSupported('py'));
      assert.ok(isLanguageSupported('rs'));
      assert.ok(isLanguageSupported('sh'));
      assert.ok(isLanguageSupported('yml'));
    });

    it('returns false for unsupported languages', () => {
      assert.ok(!isLanguageSupported('brainfuck'));
      assert.ok(!isLanguageSupported(''));
    });
  });

  describe('Python tokenizer', () => {
    it('tokenizes keywords', () => {
      const text = 'def hello(name):\n    return True';
      const tokens = tokenizeEmbedded(text, 'python');
      const keywords = findTokens(tokens, text, 'keyword');
      const kwTexts = keywords.map((t) => tokenText(text, t));
      assert.ok(kwTexts.includes('def'), 'should find def keyword');
      assert.ok(kwTexts.includes('return'), 'should find return keyword');
    });

    it('tokenizes strings', () => {
      const text = 'x = "hello world"';
      const tokens = tokenizeEmbedded(text, 'python');
      const strings = findTokens(tokens, text, 'string');
      assert.ok(strings.length > 0, 'should find string');
      assert.equal(tokenText(text, strings[0]), '"hello world"');
    });

    it('tokenizes comments', () => {
      const text = '# this is a comment\nx = 1';
      const tokens = tokenizeEmbedded(text, 'python');
      const comments = findTokens(tokens, text, 'comment');
      assert.ok(comments.length > 0, 'should find comment');
      assert.equal(tokenText(text, comments[0]), '# this is a comment');
    });

    it('tokenizes constants', () => {
      const text = 'x = True\ny = None';
      const tokens = tokenizeEmbedded(text, 'python');
      const constants = findTokens(tokens, text, 'constant');
      const texts = constants.map((t) => tokenText(text, t));
      assert.ok(texts.includes('True'));
      assert.ok(texts.includes('None'));
    });

    it('tokenizes function calls', () => {
      const text = 'print("hello")';
      const tokens = tokenizeEmbedded(text, 'python');
      const fns = findTokens(tokens, text, 'function');
      assert.ok(fns.length > 0, 'should find function call');
      assert.equal(tokenText(text, fns[0]), 'print');
    });

    it('tokenizes numbers', () => {
      const text = 'x = 42\ny = 3.14';
      const tokens = tokenizeEmbedded(text, 'python');
      const numbers = findTokens(tokens, text, 'number');
      assert.ok(numbers.length >= 2, 'should find at least 2 numbers');
    });

    it('tokenizes triple-quoted strings', () => {
      const text = 'x = """multi\nline"""';
      const tokens = tokenizeEmbedded(text, 'python');
      const strings = findTokens(tokens, text, 'string');
      assert.ok(strings.length > 0, 'should find triple-quoted string');
    });
  });

  describe('JavaScript tokenizer', () => {
    it('tokenizes keywords and template strings', () => {
      const text = 'const x = `hello ${name}`;\nif (x) { return true; }';
      const tokens = tokenizeEmbedded(text, 'javascript');
      const keywords = findTokens(tokens, text, 'keyword');
      const kwTexts = keywords.map((t) => tokenText(text, t));
      assert.ok(kwTexts.includes('const'));
      assert.ok(kwTexts.includes('if'));
      assert.ok(kwTexts.includes('return'));
    });

    it('tokenizes line and block comments', () => {
      const text = '// line comment\n/* block\ncomment */';
      const tokens = tokenizeEmbedded(text, 'javascript');
      const comments = findTokens(tokens, text, 'comment');
      assert.equal(comments.length, 2, 'should find both comments');
    });
  });

  describe('JSON tokenizer', () => {
    it('tokenizes JSON values', () => {
      const text = '{"key": "value", "num": 42, "bool": true, "nil": null}';
      const tokens = tokenizeEmbedded(text, 'json');
      const strings = findTokens(tokens, text, 'string');
      const numbers = findTokens(tokens, text, 'number');
      const constants = findTokens(tokens, text, 'constant');
      assert.ok(strings.length >= 2, 'should find strings');
      assert.ok(numbers.length >= 1, 'should find numbers');
      assert.ok(constants.length >= 2, 'should find constants (true, null)');
    });
  });

  describe('Rust tokenizer', () => {
    it('tokenizes Rust constructs', () => {
      const text = 'fn main() {\n    let x: i32 = 42;\n    println!("hello");\n}';
      const tokens = tokenizeEmbedded(text, 'rust');
      const keywords = findTokens(tokens, text, 'keyword');
      const kwTexts = keywords.map((t) => tokenText(text, t));
      assert.ok(kwTexts.includes('fn'));
      assert.ok(kwTexts.includes('let'));

      const types = findTokens(tokens, text, 'type');
      const typeTexts = types.map((t) => tokenText(text, t));
      assert.ok(typeTexts.includes('i32'));
    });
  });

  describe('unsupported language', () => {
    it('returns empty tokens for unknown language', () => {
      const tokens = tokenizeEmbedded('anything', 'unknown_lang');
      assert.equal(tokens.length, 0);
    });
  });
});
