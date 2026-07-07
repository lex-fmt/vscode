/**
 * Wire types + formatting helpers for `lex/trustRequest`.
 *
 * Pure module (no `vscode` import) so the formatters are unit-testable
 * outside the integration runner. The vscode-dependent registration
 * lives in `./trustPrompt.ts`.
 */

/**
 * Schema source shape. Single object type with the `kind` discriminant
 * plus optional fields per variant — TypeScript's discriminated-union
 * narrowing breaks down with the open `kind: string` catch-all we'd
 * otherwise need for forward-compat, so we model the variants as
 * optional fields and use runtime presence checks in `describeSource`.
 */
export interface TrustRequestSource {
  kind: string
  name?: string
  path?: string
  uri?: string
}

export interface TrustRequestParams {
  namespace: string
  command_string: string
  source: TrustRequestSource
  capability: string
  transport: string
}

export interface TrustResponse {
  /**
   * String-shaped enum: `"trusted"` or `"denied"` today; future values
   * (e.g. `"trusted_once"`) are non-breaking on the wire — the host
   * treats anything other than `"trusted"` as denied.
   */
  decision: string
  reason?: string
}

export function formatPromptMessage(params: TrustRequestParams): string {
  // `transport` is currently always "subprocess" per the wire spec
  // §γ but the field is string-shaped so future transports (WASM in
  // PR 12+) won't be a breaking change. Render the actual value so
  // the prompt stays accurate when the server sends something new.
  const transportLabel = describeTransport(params.transport)
  return `Lex extension namespace "${params.namespace}" wants to run a ${transportLabel} handler.`
}

function describeTransport(transport: string): string {
  switch (transport) {
    case 'subprocess':
      return 'subprocess'
    case 'native':
      return 'native (in-process)'
    case 'wasm':
      return 'WASM'
    default:
      return transport || 'unknown-transport'
  }
}

export function formatPromptDetail(params: TrustRequestParams): string {
  const sourceLabel = describeSource(params.source)
  const capabilityLabel = describeCapability(params.capability)
  // Two short paragraphs separated by blank line — vscode renders the
  // detail as plain text, so we lean on whitespace for structure.
  return [
    `Source: ${sourceLabel}`,
    `Command: ${params.command_string}`,
    `Capabilities: ${capabilityLabel}`,
    '',
    "Trusting will allow this binary to run on this workspace's documents until you revoke it. Denying registers the namespace schema-only — pre-validation still runs but no handler is invoked."
  ].join('\n')
}

function describeSource(source: TrustRequestSource): string {
  // Runtime presence checks (instead of type assertions) so a source
  // with the right `kind` but missing fields renders something useful
  // instead of "undefined". Forward-compat: unknown kinds fall through
  // to the raw kind string.
  if (source.kind === 'lex_toml' && typeof source.name === 'string') {
    return `lex.toml [labels] entry "${source.name}"`
  }
  if (source.kind === 'local_file' && typeof source.path === 'string') {
    return `local schema directory ${source.path}`
  }
  if (source.kind === 'cache_only' && typeof source.uri === 'string') {
    return `cached fetch from ${source.uri}`
  }
  return source.kind || 'unknown source'
}

function describeCapability(capability: string): string {
  switch (capability) {
    case 'pure':
      return 'pure (no fs / no net) — declared but not yet sandbox-enforced'
    case 'full':
      return 'full (fs and/or net access)'
    default:
      return capability || 'unknown'
  }
}
