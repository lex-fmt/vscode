import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runRegisteredTests } from '../integration/harness.js'

// Mini-runner for the CSpell-integration test. Sibling of
// `test/integration/index.ts` so the spellcheck test doesn't get picked up
// by the main integration suite (which launches with `--disable-extensions`
// and would observe no CSpell diagnostics).

export async function run(): Promise<void> {
  const currentDir = fileURLToPath(new URL('.', import.meta.url))
  const testFile = path.join(currentDir, 'spellcheck.test.js')
  await import(pathToFileURL(testFile).href)
  await runRegisteredTests()
}
