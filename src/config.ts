import path from 'node:path';

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
}

export function defaultLspBinaryPath(
  extensionPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const resolved = path.resolve(extensionPath, DEFAULT_LSP_BINARY);
  return normalizeWindowsExecutable(resolved, platform);
}

export function resolveLspBinaryPath(
  extensionPath: string,
  configuredPath?: string | null,
  platform: NodeJS.Platform = process.platform
): string {
  if (!configuredPath || configuredPath.trim() === '') {
    return defaultLspBinaryPath(extensionPath, platform);
  }

  if (path.isAbsolute(configuredPath)) {
    return normalizeWindowsExecutable(configuredPath, platform);
  }

  const resolved = path.resolve(extensionPath, configuredPath);
  return normalizeWindowsExecutable(resolved, platform);
}

export function buildLexExtensionConfig(
  extensionPath: string,
  configuredLspPath?: string | null
): LexExtensionConfig {
  return {
    lspBinaryPath: resolveLspBinaryPath(extensionPath, configuredLspPath)
  };
}
