import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { defaultLspBinaryPath, resolveLspBinaryPath } from '../../src/config.js';

const fakeExtensionPath = path.join('/', 'tmp', 'lex-extension');
const linuxPlatform: NodeJS.Platform = 'linux';
const windowsPlatform: NodeJS.Platform = 'win32';

// Mock existsSync that always returns false (no files exist)
const noFilesExist = () => false;

test('defaultLspBinaryPath resolves relative binary path inside workspace', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lex-lsp');
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, linuxPlatform), expected);
});

test('defaultLspBinaryPath appends .exe on Windows', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lex-lsp.exe');
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, windowsPlatform), expected);
});

test('resolveLspBinaryPath falls back to default when unset', () => {
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    linuxPlatform,
    {},
    noFilesExist
  );
  assert.equal(resolved.path, defaultLspBinaryPath(fakeExtensionPath, linuxPlatform));
});

test('resolveLspBinaryPath leaves absolute paths untouched', () => {
  const absolute = '/usr/local/bin/lex-lsp';
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    absolute,
    linuxPlatform,
    {},
    noFilesExist
  );
  assert.equal(resolved.path, absolute);
});

test('resolveLspBinaryPath resolves relative paths against extension root', () => {
  const relative = './bin/lex-lsp';
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    linuxPlatform,
    {},
    noFilesExist
  );
  assert.equal(resolved.path, path.resolve(fakeExtensionPath, relative));
});

test('resolveLspBinaryPath appends .exe to configured Windows paths', () => {
  const relative = './resources/lex-lsp';
  const expected = `${path.resolve(fakeExtensionPath, relative)}.exe`;
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    windowsPlatform,
    {},
    noFilesExist
  );
  assert.equal(resolved.path, expected);
});

test('resolveLspBinaryPath avoids double .exe suffix', () => {
  const relative = './bin/lex-lsp.exe';
  const expected = path.resolve(fakeExtensionPath, relative);
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    windowsPlatform,
    {},
    noFilesExist
  );
  assert.equal(resolved.path, expected);
});

test('resolveLspBinaryPath prefers LEX_LSP_PATH env var over config', () => {
  const envPath = '/custom/path/lex-lsp';
  const configPath = './resources/lex-lsp';
  const env = { LEX_LSP_PATH: envPath };
  // When env path exists, no warning
  const existingEnvPath = (p: string) => p === envPath;
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    configPath,
    linuxPlatform,
    env,
    existingEnvPath
  );
  assert.equal(resolved.path, envPath);
  assert.equal(resolved.warning, undefined);
});

test('resolveLspBinaryPath warns when LEX_LSP_PATH does not exist', () => {
  const envPath = '/custom/path/lex-lsp';
  const env = { LEX_LSP_PATH: envPath };
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    linuxPlatform,
    env,
    noFilesExist
  );
  assert.equal(resolved.path, envPath);
  assert.ok(resolved.warning?.includes('not found'));
});

test('resolveLspBinaryPath ignores empty LEX_LSP_PATH', () => {
  const configPath = './resources/lex-lsp';
  const env = { LEX_LSP_PATH: '  ' };
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    configPath,
    linuxPlatform,
    env,
    noFilesExist
  );
  assert.equal(resolved.path, path.resolve(fakeExtensionPath, configPath));
});

test('resolveLspBinaryPath appends .exe to LEX_LSP_PATH on Windows', () => {
  const envPath = '/custom/path/lex-lsp';
  const env = { LEX_LSP_PATH: envPath };
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    windowsPlatform,
    env,
    noFilesExist
  );
  assert.equal(resolved.path, `${envPath}.exe`);
});

test('resolveLspBinaryPath detects workspace and warns when binary missing', () => {
  // Simulate being in a workspace: parent has core/, editors/, tools/
  const workspaceRoot = '/home/user/lex';
  const extPath = `${workspaceRoot}/vscode`;
  const mockExists = (p: string) => {
    // Workspace directories exist
    if (p === `${workspaceRoot}/core`) return true;
    if (p === `${workspaceRoot}/editors`) return true;
    if (p === `${workspaceRoot}/tools`) return true;
    // But workspace binary does not exist
    return false;
  };
  const resolved = resolveLspBinaryPath(extPath, undefined, linuxPlatform, {}, mockExists);
  assert.ok(resolved.warning?.includes('workspace detected'));
  assert.ok(resolved.warning?.includes('build-local.sh'));
});

test('resolveLspBinaryPath uses workspace binary when it exists', () => {
  const workspaceRoot = '/home/user/lex';
  const extPath = `${workspaceRoot}/vscode`;
  const workspaceBinary = `${workspaceRoot}/target/local/lex-lsp`;
  const mockExists = (p: string) => {
    if (p === `${workspaceRoot}/core`) return true;
    if (p === `${workspaceRoot}/editors`) return true;
    if (p === `${workspaceRoot}/tools`) return true;
    if (p === workspaceBinary) return true;
    return false;
  };
  const resolved = resolveLspBinaryPath(extPath, undefined, linuxPlatform, {}, mockExists);
  assert.equal(resolved.path, workspaceBinary);
  assert.equal(resolved.warning, undefined);
});
