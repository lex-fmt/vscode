import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function collectTests(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await collectTests(full)))
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(full)
    }
  }
  return results
}

async function run() {
  const currentDir = fileURLToPath(new URL('.', import.meta.url))
  const testFiles = await collectTests(currentDir)

  if (testFiles.length === 0) {
    console.warn('No unit tests found.')
    return
  }

  for (const filePath of testFiles) {
    await import(pathToFileURL(filePath).href)
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
