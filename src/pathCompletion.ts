// Path completion is now handled by the LSP server via textDocument/completion
// with @ as a trigger character. This module only exports diagnostics for testing
// that the LSP-based completion is working.

export interface PathCompletionDiagnostics {
  // Indicates the LSP is handling path completions
  lspHandlesPathCompletion: true;
}

export function registerPathCompletion(): void {
  // No-op: path completion is handled by the LSP server
  // The LSP server registers @ as a trigger character
}

export function getPathCompletionDiagnostics(): PathCompletionDiagnostics {
  return {
    lspHandlesPathCompletion: true
  };
}
