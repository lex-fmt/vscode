import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { defaultLspBinaryPath, resolveLspBinaryPath } from '../../src/config.js'

const fakeExtensionPath = path.join('/', 'tmp', 'lex-extension')
const linuxPlatform: NodeJS.Platform = 'linux'
const windowsPlatform: NodeJS.Platform = 'win32'

// Mock existsSync that always returns false (no files exist)
const noFilesExist = () => false

test('defaultLspBinaryPath resolves relative binary path inside workspace', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lexd-lsp')
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, linuxPlatform), expected)
})

test('defaultLspBinaryPath appends .exe on Windows', () => {
  const expected = path.resolve(fakeExtensionPath, './resources/lexd-lsp.exe')
  assert.equal(defaultLspBinaryPath(fakeExtensionPath, windowsPlatform), expected)
})

test('resolveLspBinaryPath falls back to default when unset', () => {
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    linuxPlatform,
    {},
    noFilesExist
  )
  assert.equal(resolved.path, defaultLspBinaryPath(fakeExtensionPath, linuxPlatform))
})

test('resolveLspBinaryPath leaves absolute paths untouched', () => {
  const absolute = '/usr/local/bin/lexd-lsp'
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    absolute,
    linuxPlatform,
    {},
    noFilesExist
  )
  assert.equal(resolved.path, absolute)
})

test('resolveLspBinaryPath resolves relative paths against extension root', () => {
  const relative = './bin/lexd-lsp'
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    linuxPlatform,
    {},
    noFilesExist
  )
  assert.equal(resolved.path, path.resolve(fakeExtensionPath, relative))
})

test('resolveLspBinaryPath appends .exe to configured Windows paths', () => {
  const relative = './resources/lexd-lsp'
  const expected = `${path.resolve(fakeExtensionPath, relative)}.exe`
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    windowsPlatform,
    {},
    noFilesExist
  )
  assert.equal(resolved.path, expected)
})

test('resolveLspBinaryPath avoids double .exe suffix', () => {
  const relative = './bin/lexd-lsp.exe'
  const expected = path.resolve(fakeExtensionPath, relative)
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    relative,
    windowsPlatform,
    {},
    noFilesExist
  )
  assert.equal(resolved.path, expected)
})

test('resolveLspBinaryPath prefers LEX_LSP_PATH env var over config', () => {
  const envPath = '/custom/path/lexd-lsp'
  const configPath = './resources/lexd-lsp'
  const env = { LEX_LSP_PATH: envPath }
  // When env path exists, no warning
  const existingEnvPath = (p: string) => p === envPath
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    configPath,
    linuxPlatform,
    env,
    existingEnvPath
  )
  assert.equal(resolved.path, envPath)
  assert.equal(resolved.warning, undefined)
})

test('resolveLspBinaryPath falls through when LEX_LSP_PATH does not exist', () => {
  const envPath = '/custom/path/lexd-lsp'
  const env = { LEX_LSP_PATH: envPath }
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    linuxPlatform,
    env,
    noFilesExist
  )
  // Should fall through to bundled binary, not use the missing env path
  assert.equal(resolved.path, `${fakeExtensionPath}/resources/lexd-lsp`)
})

test('resolveLspBinaryPath ignores empty LEX_LSP_PATH', () => {
  const configPath = './resources/lexd-lsp'
  const env = { LEX_LSP_PATH: '  ' }
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    configPath,
    linuxPlatform,
    env,
    noFilesExist
  )
  assert.equal(resolved.path, path.resolve(fakeExtensionPath, configPath))
})

test('resolveLspBinaryPath appends .exe to LEX_LSP_PATH on Windows', () => {
  const envPath = '/custom/path/lexd-lsp'
  const env = { LEX_LSP_PATH: envPath }
  const allFilesExist = () => true
  const resolved = resolveLspBinaryPath(
    fakeExtensionPath,
    undefined,
    windowsPlatform,
    env,
    allFilesExist
  )
  assert.equal(resolved.path, `${envPath}.exe`)
})
