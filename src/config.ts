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
 * 1. LEX_LSP_PATH env var (explicit override, e.g. for local dev builds)
 * 2. User config setting (lex.lspBinaryPath)
 * 3. Bundled: resources/lex-lsp
 */
export function resolveLspBinaryPath(
  extensionPath: string,
  configuredPath?: string | null,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  existsSync: (p: string) => boolean = fs.existsSync
): { path: string; warning?: string } {
  // 1. Environment variable takes precedence (for CI and explicit override)
  const envPath = env.LEX_LSP_PATH;
  if (envPath && envPath.trim() !== '') {
    const resolved = normalizeWindowsExecutable(envPath, platform);
    if (!existsSync(resolved)) {
      return { path: resolved, warning: `LEX_LSP_PATH set but binary not found: ${resolved}` };
    }
    return { path: resolved };
  }

  // 2. User config setting
  if (configuredPath && configuredPath.trim() !== '') {
    if (path.isAbsolute(configuredPath)) {
      return { path: normalizeWindowsExecutable(configuredPath, platform) };
    }
    const resolved = path.resolve(extensionPath, configuredPath);
    return { path: normalizeWindowsExecutable(resolved, platform) };
  }

  // 3. Bundled binary
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
