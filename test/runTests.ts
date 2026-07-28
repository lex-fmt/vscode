import { constants as fsConstants, existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'
import { shortUserDataDir } from './shortUserDataDir.js'

async function main() {
  // Cloud sandboxes (e.g. Claude Code on the web) block
  // update.code.visualstudio.com, so @vscode/test-electron can't fetch
  // a VS Code build. Skip integration tests gracefully there unless the
  // caller has opted in via LEX_FORCE_INTEGRATION_TESTS=1.
  if (
    process.env.CLAUDE_CODE_REMOTE === 'true' &&
    process.env.LEX_FORCE_INTEGRATION_TESTS !== '1'
  ) {
    console.log(
      'Skipping VS Code integration tests in cloud sandbox ' +
        '(CLAUDE_CODE_REMOTE=true). Set LEX_FORCE_INTEGRATION_TESTS=1 to override.'
    )
    return
  }

  const currentDir = fileURLToPath(new URL('.', import.meta.url))
  // When running from out/test/, go up to project root
  const extensionDevelopmentPath = path.resolve(currentDir, '..', '..')
  const extensionTestsPath = path.resolve(currentDir, 'integration/index.js')
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    'test/fixtures/sample-workspace.code-workspace'
  )
  await ensureLexBinary(extensionDevelopmentPath)
  ensureTreeSitter(extensionDevelopmentPath)
  ensureEmbeddedGrammars(extensionDevelopmentPath)

  const userData = shortUserDataDir()
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        userData.arg,
        '--disable-gpu',
        '--disable-extensions',
        '--disable-workspace-trust'
      ]
    })
  } catch (error) {
    console.error('Failed to run VS Code extension tests')
    console.error(error)
    process.exitCode = 1
  } finally {
    userData.cleanup()
  }
}

async function ensureLexBinary(extensionDevelopmentPath: string): Promise<void> {
  const lexBinaryPath = path.resolve(extensionDevelopmentPath, 'resources/lexd-lsp')
  const lexBinaryPathExe = path.resolve(extensionDevelopmentPath, 'resources/lexd-lsp.exe')

  // Check if binary exists
  try {
    await access(lexBinaryPath, fsConstants.X_OK)
    return
  } catch {
    // Try .exe on Windows
    if (existsSync(lexBinaryPathExe)) {
      return
    }
  }

  // Try to download using fetch-deps
  console.log('Downloading lexd-lsp binary via fetch-deps...')
  try {
    execSync('fetch-deps --if-missing lexd-lsp', {
      stdio: 'inherit',
      cwd: extensionDevelopmentPath,
      shell: process.platform === 'win32' ? 'bash' : undefined
    })
    return
  } catch {
    console.error('Failed to download lexd-lsp binary')
  }

  console.error(`lexd-lsp binary not found at ${lexBinaryPath}`)
  console.error("Run 'fetch-deps lexd-lsp' to download the binary.")
  process.exit(1)
}

function ensureTreeSitter(extensionDevelopmentPath: string): void {
  const wasmPath = path.resolve(extensionDevelopmentPath, 'resources/tree-sitter-lex.wasm')
  if (existsSync(wasmPath)) {
    return
  }

  console.log('Downloading tree-sitter artifacts via fetch-deps...')
  try {
    execSync('fetch-deps --if-missing tree-sitter', {
      stdio: 'inherit',
      cwd: extensionDevelopmentPath,
      shell: process.platform === 'win32' ? 'bash' : undefined
    })
    return
  } catch {
    console.error('Failed to download tree-sitter artifacts')
  }

  console.warn(`tree-sitter WASM not found at ${wasmPath} — tree-sitter tests will be skipped.`)
}

function ensureEmbeddedGrammars(extensionDevelopmentPath: string): void {
  // The embedded parsers and their `highlights.scm` files both come
  // from the official `tree-sitter-<lang>` npm dependencies, so there
  // is nothing to download — staging is a local copy into
  // resources/embedded-grammars/. It is idempotent and cheap, so we
  // just always run it. Unlike the network fetches above, a failure
  // here is a broken checkout, not a flaky network: fail loudly rather
  // than let the injection suite's `tokenCount > 0` asserts report it
  // as an unexplained tokenization failure.
  console.log('Staging embedded tree-sitter grammars...')
  try {
    execSync('npm run stage-grammars', {
      stdio: 'inherit',
      cwd: extensionDevelopmentPath,
      shell: process.platform === 'win32' ? 'bash' : undefined
    })
  } catch {
    console.error('Failed to stage embedded-language tree-sitter grammars')
    process.exit(1)
  }
}

main()
