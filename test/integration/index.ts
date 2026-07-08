import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runRegisteredTests } from './harness.js'
import { install as installRuntimeErrorCapture } from './runtime_errors.js'

export async function run(): Promise<void> {
  // Install the runtime-error capture *before* we import any test
  // modules — activation fires when VS Code resolves the extension
  // contribution during bootstrap, which can happen before the first
  // test runs. Installing at the top of `run()` makes sure shims are
  // in place in time to catch activation-time errors.
  installRuntimeErrorCapture()

  const currentDir = fileURLToPath(new URL('.', import.meta.url))
  const entries = await readdir(currentDir)
  // Sort so test order is deterministic across platforms.
  // `aa_lsp_trust_prompt.test.ts` relies on running before any
  // other integration test that triggers lexd-lsp's lazy
  // extension-state boot — without a sort, fs.readdir's order
  // is platform-dependent (typically alphabetical on most
  // filesystems but not guaranteed).
  const testFiles = entries
    .filter((entry) => entry.endsWith('.test.js'))
    .sort((a, b) => a.localeCompare(b))

  if (testFiles.length === 0) {
    console.warn('No VS Code integration tests were discovered.')
    return
  }

  for (const fileName of testFiles) {
    const fullPath = path.join(currentDir, fileName)
    await import(pathToFileURL(fullPath).href)
  }

  await runRegisteredTests()
}
