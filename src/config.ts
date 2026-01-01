import path from 'node:path';
import fs from 'node:fs';

export const LEX_CONFIGURATION_SECTION = 'lex';
export const LSP_BINARY_SETTING = 'lspBinaryPath';
// Default path to bundled LSP binary (matches package.json default)
const DEFAULT_LSP_BINARY = './resources/lex-lsp';
const WINDOWS_EXECUTABLE_SUFFIX = '.exe';

function normalizeWindowsExecutable(
  binaryPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform !== 'win32') {
    return binaryPath;
  }

  if (binaryPath.toLowerCase().endsWith(WINDOWS_EXECUTABLE_SUFFIX)) {
    return binaryPath;
  }

  return `${binaryPath}${WINDOWS_EXECUTABLE_SUFFIX}`;
}

/**
 * Detect the lex workspace root by looking for the characteristic structure:
 * a directory containing core/, editors/, tools/ subdirectories.
 * Returns null if not in a lex workspace.
 */
function detectLexWorkspace(
  startDir: string,
  existsSync: (p: string) => boolean = fs.existsSync
): string | null {
  let current = startDir;
  const { root } = path.parse(current);

  while (current !== root) {
    const parent = path.dirname(current);
    if (
      existsSync(path.join(parent, 'core')) &&
      existsSync(path.join(parent, 'editors')) &&
      existsSync(path.join(parent, 'tools'))
    ) {
      return parent;
    }
    current = parent;
  }

  return null;
}

export interface LexExtensionConfig {
  lspBinaryPath: string;
  warning?: string;
}

export function defaultLspBinaryPath(
  extensionPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const resolved = path.resolve(extensionPath, DEFAULT_LSP_BINARY);
  return normalizeWindowsExecutable(resolved, platform);
}

/**
 * Binary resolution priority:
 * 1. LEX_LSP_PATH env var (explicit override)
 * 2. Workspace binary at {workspace}/target/local/lex-lsp (dev convenience)
 * 3. User config setting
 * 4. Bundled: resources/lex-lsp
 */
export function resolveLspBinaryPath(
  extensionPath: string,
  configuredPath?: string | null,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  existsSync: (p: string) => boolean = fs.existsSync
): { path: string; warning?: string } {
  const binaryName = platform === 'win32' ? 'lex-lsp.exe' : 'lex-lsp';

  // 1. Environment variable takes precedence (for CI and explicit override)
  const envPath = env.LEX_LSP_PATH;
  if (envPath && envPath.trim() !== '') {
    const resolved = normalizeWindowsExecutable(envPath, platform);
    if (!existsSync(resolved)) {
      return { path: resolved, warning: `LEX_LSP_PATH set but binary not found: ${resolved}` };
    }
    return { path: resolved };
  }

  // 2. Check for workspace binary (dev mode)
  const workspaceOverride = env.LEX_WORKSPACE_ROOT;
  const workspace =
    workspaceOverride && existsSync(workspaceOverride)
      ? workspaceOverride
      : detectLexWorkspace(extensionPath, existsSync);

  if (workspace) {
    const workspaceBinary = path.join(workspace, 'target', 'local', binaryName);
    if (existsSync(workspaceBinary)) {
      return { path: workspaceBinary };
    }
    // Workspace detected but no binary - warn but continue to fallback
    const warning = `Lex workspace detected at ${workspace} but no dev binary found. Run ./scripts/build-local.sh to build it.`;

    // Fall through to bundled with warning
    const bundled = defaultLspBinaryPath(extensionPath, platform);
    if (existsSync(bundled)) {
      return { path: bundled, warning };
    }
    return { path: bundled, warning };
  }

  // 3. User config setting
  if (configuredPath && configuredPath.trim() !== '') {
    if (path.isAbsolute(configuredPath)) {
      return { path: normalizeWindowsExecutable(configuredPath, platform) };
    }
    const resolved = path.resolve(extensionPath, configuredPath);
    return { path: normalizeWindowsExecutable(resolved, platform) };
  }

  // 4. Bundled binary
  return { path: defaultLspBinaryPath(extensionPath, platform) };
}

export function buildLexExtensionConfig(
  extensionPath: string,
  configuredLspPath?: string | null
): LexExtensionConfig {
  const resolved = resolveLspBinaryPath(extensionPath, configuredLspPath);
  return {
    lspBinaryPath: resolved.path,
    warning: resolved.warning,
  };
}
