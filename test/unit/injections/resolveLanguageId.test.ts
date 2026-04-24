import assert from 'node:assert/strict';
import test from 'node:test';
import { injections } from '@lex/shared';

const { resolveLanguageId } = injections;

test('resolveLanguageId: alias py → python when python is registered', () => {
  const registered = new Set(['python', 'javascript', 'rust']);
  assert.equal(resolveLanguageId('py', registered), 'python');
});

test('resolveLanguageId: alias py returns null when python is NOT registered', () => {
  const registered = new Set(['javascript', 'rust']);
  assert.equal(resolveLanguageId('py', registered), null);
});

test('resolveLanguageId: already-registered ID used directly', () => {
  const registered = new Set(['python']);
  assert.equal(resolveLanguageId('python', registered), 'python');
});

test('resolveLanguageId: unknown alias not in registered set returns null', () => {
  const registered = new Set(['python']);
  assert.equal(resolveLanguageId('cobol', registered), null);
});

test('resolveLanguageId: trims whitespace', () => {
  const registered = new Set(['rust']);
  assert.equal(resolveLanguageId('  rust  ', registered), 'rust');
});

test('resolveLanguageId: lowercases input', () => {
  const registered = new Set(['python']);
  assert.equal(resolveLanguageId('Python', registered), 'python');
  assert.equal(resolveLanguageId('PYTHON', registered), 'python');
  assert.equal(resolveLanguageId('PY', registered), 'python');
});

test('resolveLanguageId: empty string returns null', () => {
  const registered = new Set(['python']);
  assert.equal(resolveLanguageId('', registered), null);
  assert.equal(resolveLanguageId('   ', registered), null);
});

test('resolveLanguageId: bash/zsh/sh all alias to shellscript', () => {
  const registered = new Set(['shellscript']);
  assert.equal(resolveLanguageId('bash', registered), 'shellscript');
  assert.equal(resolveLanguageId('zsh', registered), 'shellscript');
  assert.equal(resolveLanguageId('sh', registered), 'shellscript');
  assert.equal(resolveLanguageId('shell', registered), 'shellscript');
});

test('resolveLanguageId: c++ aliases to cpp (special char handling)', () => {
  const registered = new Set(['cpp']);
  assert.equal(resolveLanguageId('c++', registered), 'cpp');
  assert.equal(resolveLanguageId('cxx', registered), 'cpp');
  assert.equal(resolveLanguageId('cc', registered), 'cpp');
});

test('resolveLanguageId: jsx/tsx aliases', () => {
  const registered = new Set(['javascriptreact', 'typescriptreact']);
  assert.equal(resolveLanguageId('jsx', registered), 'javascriptreact');
  assert.equal(resolveLanguageId('tsx', registered), 'typescriptreact');
});

test('resolveLanguageId: alias does not leak when target is not registered', () => {
  // `ts` aliases to `typescript` — if typescript is not registered but
  // `ts` is somehow in the set, the alias resolution takes precedence
  // and returns null (this is the intended behaviour).
  const registered = new Set(['ts']);
  assert.equal(resolveLanguageId('ts', registered), null);
});
