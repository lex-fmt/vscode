import { constants as fsConstants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

async function main() {
  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  // When running from out/test/, go up to project root
  const extensionDevelopmentPath = path.resolve(currentDir, '..', '..');
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
      launchArgs: [workspacePath],
    });
  } catch (error) {
    console.error('Failed to run VS Code extension tests');
    console.error(error);
    process.exit(1);
  }
}

async function ensureLexBinary(extensionDevelopmentPath: string): Promise<void> {
  const lexBinaryPath = path.resolve(extensionDevelopmentPath, 'resources/lex-lsp');
  const lexBinaryPathExe = path.resolve(extensionDevelopmentPath, 'resources/lex-lsp.exe');

  // Check if binary exists
  try {
    await access(lexBinaryPath, fsConstants.X_OK);
    return;
  } catch {
    // Try .exe on Windows
    if (existsSync(lexBinaryPathExe)) {
      return;
    }
  }

  // Try to download using the script
  const downloadScript = path.resolve(extensionDevelopmentPath, 'scripts/download-lex-lsp.sh');
  if (existsSync(downloadScript)) {
    console.log('Downloading lex-lsp binary...');
    try {
      execSync(`bash "${downloadScript}"`, { stdio: 'inherit', cwd: extensionDevelopmentPath });
      return;
    } catch {
      console.error('Failed to download lex-lsp binary');
    }
  }

  console.error(`lex-lsp binary not found at ${lexBinaryPath}`);
  console.error("Run 'bash scripts/download-lex-lsp.sh' to download the binary.");
  process.exit(1);
}

main();
