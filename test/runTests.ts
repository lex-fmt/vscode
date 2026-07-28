import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'
import { shortUserDataDir } from './shortUserDataDir.js'
import { lexdLspPath, prepareResources } from './prepareResources.js'

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
  prepareResources(extensionDevelopmentPath)
  // The LSP is used in place off the env prefix rather than copied into
  // `resources/` — see test/prepareResources.ts.
  const extensionTestsEnv = { LEX_LSP_PATH: lexdLspPath(extensionDevelopmentPath) }

  const userData = shortUserDataDir()
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv,
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

main()
