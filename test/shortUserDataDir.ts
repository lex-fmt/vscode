import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Create a short-lived VS Code `--user-data-dir` under the OS temp dir.
 *
 * Left to its own devices, @vscode/test-electron nests user-data inside
 * `.vscode-test/` within the checkout. VS Code binds an AF_UNIX control
 * socket there (`user-data/<version>-main.sock`), and macOS caps socket
 * paths at ~103 chars — so a deep checkout path makes the launch fail with
 * `Error: listen EINVAL ... .sock`. Rooting user-data in `os.tmpdir()`
 * keeps the socket path short regardless of how deep the checkout lives.
 *
 * Returns the `--user-data-dir=<dir>` launch arg to splice into `launchArgs`
 * plus a best-effort `cleanup` that removes the directory after the run.
 */
export function shortUserDataDir(): { arg: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'vsc-'))
  return {
    arg: `--user-data-dir=${dir}`,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort: the OS reclaims tmpdir entries eventually
      }
    }
  }
}
