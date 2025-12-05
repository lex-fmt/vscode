import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRegisteredTests } from './harness.js';

export async function run(): Promise<void> {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const entries = await readdir(currentDir);
  const testFiles = entries.filter(entry => entry.endsWith('.test.js'));

  if (testFiles.length === 0) {
    console.warn('No VS Code integration tests were discovered.');
    return;
  }

  for (const fileName of testFiles) {
    const fullPath = path.join(currentDir, fileName);
    await import(pathToFileURL(fullPath).href);
  }

  await runRegisteredTests();
}
