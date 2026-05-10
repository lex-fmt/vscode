/**
 * Wire types + formatting helpers for `lex/trustRequest`.
 *
 * Pure module (no `vscode` import) so the formatters are unit-testable
 * outside the integration runner. The vscode-dependent registration
 * lives in `./trustPrompt.ts`.
 */

export interface TrustRequestParams {
  namespace: string;
  command_string: string;
  source:
    | { kind: 'lex_toml'; name: string }
    | { kind: 'local_file'; path: string }
    | { kind: 'cache_only'; uri: string }
    | { kind: string; [key: string]: unknown };
  capability: string;
  transport: string;
}

export interface TrustResponse {
  /**
   * String-shaped enum: `"trusted"` or `"denied"` today; future values
   * (e.g. `"trusted_once"`) are non-breaking on the wire — the host
   * treats anything other than `"trusted"` as denied.
   */
  decision: string;
  reason?: string;
}

export function formatPromptMessage(params: TrustRequestParams): string {
  return `Lex extension namespace "${params.namespace}" wants to run a subprocess handler.`;
}

export function formatPromptDetail(params: TrustRequestParams): string {
  const sourceLabel = describeSource(params.source);
  const capabilityLabel = describeCapability(params.capability);
  // Two short paragraphs separated by blank line — vscode renders the
  // detail as plain text, so we lean on whitespace for structure.
  return [
    `Source: ${sourceLabel}`,
    `Command: ${params.command_string}`,
    `Capabilities: ${capabilityLabel}`,
    '',
    "Trusting will allow this binary to run on this workspace's documents until you revoke it. Denying registers the namespace schema-only — pre-validation still runs but no handler is invoked.",
  ].join('\n');
}

function describeSource(source: TrustRequestParams['source']): string {
  switch (source.kind) {
    case 'lex_toml':
      return `lex.toml [labels] entry "${(source as { name: string }).name}"`;
    case 'local_file':
      return `local schema directory ${(source as { path: string }).path}`;
    case 'cache_only':
      return `cached fetch from ${(source as { uri: string }).uri}`;
    default:
      return source.kind || 'unknown source';
  }
}

function describeCapability(capability: string): string {
  switch (capability) {
    case 'pure':
      return 'pure (no fs / no net) — declared but not yet sandbox-enforced';
    case 'full':
      return 'full (fs and/or net access)';
    default:
      return capability || 'unknown';
  }
}
