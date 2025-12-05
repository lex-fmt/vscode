import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {
  defaultLspBinaryPath,
  resolveLspBinaryPath
} from '../../src/config.js';

const fakeExtensionPath = path.join('/', 'tmp', 'lex-extension');
const linuxPlatform: NodeJS.Platform = 'linux';
const windowsPlatform: NodeJS.Platform = 'win32';

test('defaultLspBinaryPath resolves relative binary path inside workspace', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lex-lsp');
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, linuxPlatform), expected);
});

test('defaultLspBinaryPath appends .exe on Windows', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lex-lsp.exe');
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, windowsPlatform), expected);
});

test('resolveLspBinaryPath falls back to default when unset', () => {
  const resolved = resolveLspBinaryPath(fakeExtensionPath, undefined, linuxPlatform);
  assert.equal(resolved, defaultLspBinaryPath(fakeExtensionPath, linuxPlatform));
});

test('resolveLspBinaryPath leaves absolute paths untouched', () => {
  const absolute = '/usr/local/bin/lex-lsp';
  const resolved = resolveLspBinaryPath(fakeExtensionPath, absolute, linuxPlatform);
  assert.equal(resolved, absolute);
});

test('resolveLspBinaryPath resolves relative paths against extension root', () => {
  const relative = './bin/lex-lsp';
  const resolved = resolveLspBinaryPath(fakeExtensionPath, relative, linuxPlatform);
  assert.equal(resolved, path.resolve(fakeExtensionPath, relative));
});

test('resolveLspBinaryPath appends .exe to configured Windows paths', () => {
  const relative = './resources/lex-lsp';
  const expected = `${path.resolve(fakeExtensionPath, relative)}.exe`;
  const resolved = resolveLspBinaryPath(fakeExtensionPath, relative, windowsPlatform);
  assert.equal(resolved, expected);
});

test('resolveLspBinaryPath avoids double .exe suffix', () => {
  const relative = './bin/lex-lsp.exe';
  const expected = path.resolve(fakeExtensionPath, relative);
  const resolved = resolveLspBinaryPath(fakeExtensionPath, relative, windowsPlatform);
  assert.equal(resolved, expected);
});
