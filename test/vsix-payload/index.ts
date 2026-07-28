/**
 * Packaging check: does a built `.vsix` actually carry its tree-sitter
 * payload?
 *
 * The suites that would notice a missing grammar — the `tokenCount > 0`
 * asserts in `test/integration/treesitter_injection.test.ts` — launch a
 * downloaded VS Code and are deliberately outside the PR check lane. So
 * nothing on a PR looked at the shipping artifact, and an extension
 * could package with no parser payload at all while CI stayed green.
 * This is that missing gate, and it runs in the lane (`test-full` in
 * `pixi.toml`, via `npm run test:vsix-payload`).
 *
 * It asserts against the ARTIFACT, not the working tree: `vsce package`
 * decides what ships, through `vscode:prepublish` (which runs
 * `npm run bundle` -> `copy-wasm` + `stage-grammars`) and
 * `.vscodeignore`'s re-include rules. A green tree with a broken
 * `.vscodeignore` still ships a dead extension, and only the packaged
 * `.vsix` shows it.
 *
 *   node ./out/test/vsix-payload/index.js            # package, then check
 *   node ./out/test/vsix-payload/index.js some.vsix  # check an existing one
 *
 * The second form is how the check itself is proven: point it at a
 * `.vsix` with the payload deliberately stripped and it must go red.
 *
 * Scope: the `npm run package` / `vsce package --no-dependencies`
 * artifact — the repo's own packaging mode, the one the release
 * workflow ships. The shipit-cut `.vsix` stages only `lexd-lsp` today
 * (`.shipit.toml`: the tree-sitter data-artifact shape is "a separate,
 * later concern"), so it is knowingly NOT this check's subject.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { findPayloadProblems, listVsixEntries, REQUIRED_PAYLOAD } from './payload.js'

const extensionRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')

async function main() {
  const [vsixArg] = process.argv.slice(2)

  if (vsixArg) {
    const vsixPath = path.resolve(vsixArg)
    console.log(`Checking tree-sitter payload of ${vsixPath}`)
    await check(vsixPath)
    return
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'lex-vsix-payload-'))
  const vsixPath = path.join(tempDir, 'lex-vscode-payload-check.vsix')
  try {
    console.log('Packaging VSIX for the payload check...')
    await run('npx', ['vsce', 'package', '--no-dependencies', '--out', vsixPath])
    await check(vsixPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

/** Report on one `.vsix`, throwing when its payload is incomplete. */
async function check(vsixPath: string) {
  const entries = listVsixEntries(await readFile(vsixPath))
  const problems = findPayloadProblems(entries)

  if (problems.length > 0) {
    throw new Error(
      `${path.basename(vsixPath)} is missing its tree-sitter payload ` +
        `(${problems.length} of ${REQUIRED_PAYLOAD.length} required files):\n  ` +
        problems.join('\n  ')
    )
  }

  console.log(
    `tree-sitter payload complete: ${REQUIRED_PAYLOAD.length} required files ` +
      `present and non-empty in ${path.basename(vsixPath)} (${entries.length} entries)`
  )
}

/** Run a command in the extension root, rejecting on a non-zero exit. */
async function run(command: string, args: string[]) {
  // On Windows `npx` is a `.cmd` shim that `spawn` will not resolve —
  // the same fix-up `test/runVsixSmoke.ts` applies.
  const resolved = process.platform === 'win32' ? `${command}.cmd` : command
  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolved, args, { stdio: 'inherit', cwd: extensionRoot })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${String(code)}`))
      }
    })
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
