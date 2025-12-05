import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

async function main() {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const extensionDevelopmentPath = path.resolve(currentDir, '..', '..', '..');
  const extensionTestsPath = path.resolve(currentDir, 'integration/index.js');
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    'test/fixtures/sample-workspace.code-workspace'
  );
  await ensureLexBinary(extensionDevelopmentPath);

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath]
    });
  } catch (error) {
    console.error('Failed to run VS Code extension tests');
    console.error(error);
    process.exit(1);
  }
}

async function ensureLexBinary(extensionDevelopmentPath: string): Promise<void> {
  const lexBinaryPath = path.resolve(
    extensionDevelopmentPath,
    '../../target/debug/lex-lsp'
  );

  try {
    await access(lexBinaryPath, fsConstants.X_OK);
  } catch {
    console.error(`lex-lsp binary not found at ${lexBinaryPath}`);
    console.error("Run 'cargo build --bin lex-lsp' from the repository root before npm test.");
    process.exit(1);
  }
}

main();
