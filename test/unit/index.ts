import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function run() {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const entries = await readdir(currentDir);
  const testFiles = entries.filter(entry => entry.endsWith('.test.js'));

  if (testFiles.length === 0) {
    console.warn('No unit tests found.');
    return;
  }

  for (const fileName of testFiles) {
    const filePath = path.join(currentDir, fileName);
    await import(pathToFileURL(filePath).href);
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
