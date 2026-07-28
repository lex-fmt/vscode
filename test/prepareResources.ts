/**
 * Make a checkout's `resources/` ready for an integration run, and say
 * where the language server is.
 *
 * The integration and cspell suites launch a real VS Code against this
 * checkout (`extensionDevelopmentPath`), so the extension loads its
 * payload from the working tree rather than from a packaged `.vsix`.
 * Both suites need the same three things in place, which is why this
 * module exists once instead of twice.
 *
 * Everything here reads an ALREADY-RESOLVED pixi environment; nothing
 * downloads. Both cross-repo artifacts are ordinary conda packages
 * pinned in `pixi.toml` (conda-direct): `pixi install` resolves and
 * extracts them, and a missing one is a setup mistake with one remedy —
 * never a flaky network to retry around. That is the whole reason the
 * old `fetch-deps` bootstrap could be deleted rather than replaced.
 *
 * The two artifacts are consumed differently, on purpose:
 *
 *   - the GRAMMAR is COPIED, because the extension resolves it relative
 *     to its own install dir (`src/treesitter.ts` reads
 *     `<extension>/resources/…`) — so `./bin/shipit stage` puts it
 *     there, exactly as it does for a packaged build;
 *   - the LANGUAGE SERVER is used IN PLACE off the env prefix and named
 *     through `LEX_LSP_PATH`, the override `src/config.ts` checks first.
 *     Copying it would collide with the release-time
 *     `[artifacts.lex-vscode].bundle.stage` staging, which writes the
 *     same `resources/lexd-lsp` path and refuses a pre-existing file.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Both commands below are shell scripts (`./bin/shipit`) or shims over
 * one, so on Windows they run under Git-for-Windows' bash — the same
 * fix-up the `fetch-deps` calls this module replaced already applied.
 */
const SHELL = process.platform === 'win32' ? 'bash' : undefined

/**
 * The pixi DEFAULT environment's prefix — where the conda-direct
 * dependencies land. The same layout `shipit stage` resolves, so the
 * two agree by construction rather than by comment.
 */
function envPrefix(root: string): string {
  return path.resolve(root, '.pixi/envs/default')
}

/**
 * Absolute path to the `lexd-lsp` binary in the resolved environment,
 * for `LEX_LSP_PATH`.
 *
 * Throws when it is not materialized. A soft return would let the
 * extension fall through to the (absent) bundled binary and surface as
 * a suite full of language-feature timeouts, which is the failure this
 * check exists to pre-empt.
 */
export function lexdLspPath(root: string): string {
  const binary = path.join(
    envPrefix(root),
    'bin',
    process.platform === 'win32' ? 'lexd-lsp.exe' : 'lexd-lsp'
  )
  if (!existsSync(binary)) {
    throw new Error(
      `lexd-lsp is not materialized at ${binary} — run \`pixi install\` so the ` +
        'pinned conda package is resolved and extracted first'
    )
  }
  return binary
}

/**
 * Put the Lex grammar and the embedded grammars in `resources/`.
 *
 * Both steps are idempotent re-runnable copies, so they always run
 * rather than being gated on a presence check: a stale or truncated
 * file left by an interrupted run is repaired, not preserved. Both fail
 * loudly — a broken checkout, not a transient.
 */
export function prepareResources(root: string): void {
  console.log('Staging the Lex grammar from the resolved conda env...')
  execSync('./bin/shipit stage', { stdio: 'inherit', cwd: root, shell: SHELL })

  // The embedded parsers and their `highlights.scm` files come from the
  // official `tree-sitter-<lang>` npm dependencies — a local copy into
  // resources/embedded-grammars/, not a fetch.
  console.log('Staging embedded tree-sitter grammars...')
  execSync('npm run stage-grammars', { stdio: 'inherit', cwd: root, shell: SHELL })
}
