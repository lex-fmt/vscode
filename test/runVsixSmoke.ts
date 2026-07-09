import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import type { SpawnOptionsWithoutStdio } from 'node:child_process'
import { downloadAndUnzipVSCode } from '@vscode/test-electron'
import { resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron'
import { defaultCachePath } from '@vscode/test-electron/out/download.js'
import { shortUserDataDir } from './shortUserDataDir.js'

async function main() {
  // Cloud sandboxes (e.g. Claude Code on the web) block
  // update.code.visualstudio.com, so @vscode/test-electron can't fetch
  // a VS Code build. Skip the VSIX smoke test gracefully there unless
  // the caller has opted in via LEX_FORCE_INTEGRATION_TESTS=1.
  if (
    process.env.CLAUDE_CODE_REMOTE === 'true' &&
    process.env.LEX_FORCE_INTEGRATION_TESTS !== '1'
  ) {
    console.log(
      'Skipping VSIX smoke test in cloud sandbox ' +
        '(CLAUDE_CODE_REMOTE=true). Set LEX_FORCE_INTEGRATION_TESTS=1 to override.'
    )
    return
  }

  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = path.dirname(currentFile)
  const extensionRoot = path.resolve(currentDir, '..', '..')
  const workspacePath = path.resolve(
    extensionRoot,
    'test/fixtures/sample-workspace-vsix.code-workspace'
  )
  const harnessExtensionPath = path.resolve(extensionRoot, 'test/vsix-smoke-extension')
  const testRunnerPath = path.resolve(extensionRoot, 'out/test/vsix-smoke/index.js')

  const keepProfile = process.env.LEX_VSIX_KEEP_PROFILE === '1'

  console.log('Packaging VSIX for smoke test...')
  const { vsixPath, cleanup } = await packageVsix(extensionRoot)
  const userData = shortUserDataDir()

  try {
    await resetTestProfile()
    const vscodeExecutablePath = await downloadAndUnzipVSCode({
      cachePath: defaultCachePath
    })

    console.log('Installing VSIX into VS Code test profile...')
    await installVsix(vscodeExecutablePath, vsixPath)

    console.log('Running VSIX smoke tests...')
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: harnessExtensionPath,
      extensionTestsPath: testRunnerPath,
      launchArgs: [workspacePath, userData.arg],
      reuseMachineInstall: false
    })
  } finally {
    userData.cleanup()
    await cleanup()
    if (!keepProfile) {
      await resetTestProfile()
    } else {
      console.warn('Preserving VS Code test profile for inspection:', defaultCachePath)
    }
  }
}

async function packageVsix(extensionRoot: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'lex-vsix-smoke-'))
  const vsixPath = path.join(tempDir, 'lex-vscode-smoke.vsix')
  await runCommand('npx', ['vsce', 'package', '--no-dependencies', '--out', vsixPath], {
    cwd: extensionRoot
  })

  return {
    vsixPath,
    cleanup: () => rm(tempDir, { recursive: true, force: true })
  }
}

async function installVsix(vscodeExecutablePath: string, vsixPath: string) {
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
  await runCommand(cli, [...cliArgs, '--install-extension', vsixPath, '--force'])
}

async function resetTestProfile() {
  const targets = ['extensions', 'user-data']
  await Promise.all(
    targets.map((target) =>
      rm(path.join(defaultCachePath, target), { recursive: true, force: true })
    )
  )
}

async function runCommand(command: string, args: string[], options: SpawnOptionsWithoutStdio = {}) {
  const resolvedCommand = resolveCommand(command)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      stdio: 'inherit',
      ...options
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

function resolveCommand(command: string): string {
  if (process.platform !== 'win32') {
    return command
  }

  const hasPathSeparator = /[\\/]/.test(command)
  const hasExtension = Boolean(path.extname(command))
  if (hasPathSeparator || hasExtension) {
    return command
  }

  return `${command}.cmd`
}

main().catch((error) => {
  console.error('VSIX smoke tests failed')
  console.error(error)
  process.exitCode = 1
})
