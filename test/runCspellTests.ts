import { constants as fsConstants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';

// Drives a separate VS Code instance with Code Spell Checker installed and
// runs the spellcheck integration test inside it. Kept separate from the
// main `runTests.ts` so the rest of the suite continues to launch with
// `--disable-extensions` for predictable behavior, while this run honors
// installed extensions so CSpell can publish diagnostics on our fixture.

async function main() {
  if (
    process.env.CLAUDE_CODE_REMOTE === 'true' &&
    process.env.LEX_FORCE_INTEGRATION_TESTS !== '1'
  ) {
    console.log(
      'Skipping VS Code CSpell integration tests in cloud sandbox ' +
        '(CLAUDE_CODE_REMOTE=true). Set LEX_FORCE_INTEGRATION_TESTS=1 to override.'
    );
    return;
  }

  const currentDir = fileURLToPath(new URL('.', import.meta.url));
  const extensionDevelopmentPath = path.resolve(currentDir, '..', '..');
  const extensionTestsPath = path.resolve(currentDir, 'integration-cspell/index.js');
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    'test/fixtures/sample-workspace.code-workspace'
  );

  await ensureLexBinary(extensionDevelopmentPath);
  ensureTreeSitter(extensionDevelopmentPath);
  ensureEmbeddedGrammars(extensionDevelopmentPath);

  // Download VS Code, then install CSpell into its extension store using
  // the bundled CLI. resolveCliArgsFromVSCodeExecutablePath returns the
  // user-data + extensions flags that match the VS Code instance below.
  const vscodeExecutablePath = await downloadAndUnzipVSCode();
  const [cli, ...installArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = spawnSync(
    cli,
    [...installArgs, '--install-extension', 'streetsidesoftware.code-spell-checker'],
    { encoding: 'utf-8', stdio: 'inherit' }
  );
  if (install.status !== 0) {
    console.error('Failed to install Code Spell Checker into the test VS Code');
    process.exit(install.status ?? 1);
  }

  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, '--disable-gpu', '--disable-workspace-trust'],
    });
  } catch (error) {
    console.error('Failed to run VS Code CSpell extension tests');
    console.error(error);
    process.exit(1);
  }
}

async function ensureLexBinary(extensionDevelopmentPath: string): Promise<void> {
  const lexBinaryPath = path.resolve(extensionDevelopmentPath, 'resources/lexd-lsp');
  const lexBinaryPathExe = path.resolve(extensionDevelopmentPath, 'resources/lexd-lsp.exe');

  try {
    await access(lexBinaryPath, fsConstants.X_OK);
    return;
  } catch {
    if (existsSync(lexBinaryPathExe)) return;
  }

  const downloadScript = path.resolve(extensionDevelopmentPath, 'scripts/download-lexd-lsp.sh');
  if (existsSync(downloadScript)) {
    console.log('Downloading lexd-lsp binary...');
    execSync(`bash "${downloadScript}"`, { stdio: 'inherit', cwd: extensionDevelopmentPath });
    return;
  }
  console.error(`lexd-lsp binary not found at ${lexBinaryPath}`);
  process.exit(1);
}

function ensureTreeSitter(extensionDevelopmentPath: string): void {
  const wasmPath = path.resolve(extensionDevelopmentPath, 'resources/tree-sitter-lex.wasm');
  if (existsSync(wasmPath)) return;
  const downloadScript = path.resolve(extensionDevelopmentPath, 'scripts/download-tree-sitter.sh');
  if (existsSync(downloadScript)) {
    execSync(`bash "${downloadScript}"`, { stdio: 'inherit', cwd: extensionDevelopmentPath });
  }
}

function ensureEmbeddedGrammars(extensionDevelopmentPath: string): void {
  const downloadScript = path.resolve(
    extensionDevelopmentPath,
    'scripts/download-embedded-grammars.sh'
  );
  if (!existsSync(downloadScript)) return;
  try {
    execSync(`bash "${downloadScript}"`, { stdio: 'inherit', cwd: extensionDevelopmentPath });
  } catch {
    console.error('Failed to download embedded-language tree-sitter grammars');
  }
}

main();
