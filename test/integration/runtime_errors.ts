/**
 * Process-level runtime-error capture for VSCode integration tests.
 *
 * VS Code's test-electron harness runs the extension-under-test and
 * the test extension in *different* module contexts — assigning to
 * `vscode.window.showErrorMessage` from the test extension doesn't
 * affect calls made from the extension-under-test, so per-API shims
 * don't cross the boundary. What *does* cross is the process: both
 * contexts run inside the same Extension Host process, so
 * `process.on('unhandledRejection' | 'uncaughtException')` captures
 * failures from either side.
 *
 * That's narrow — it won't notice a `showErrorMessage` popup — but it
 * catches the class of bug this harness exists for: asynchronous
 * failures in activation, LSP wiring, or command handlers that fall
 * out of an async chain without a `.catch`. The motivating nvim
 * `vim.lsp.semantic_tokens.enable` bug has exact analogues there.
 */

export interface CapturedRuntimeError {
  source: 'unhandledRejection' | 'uncaughtException';
  message: string;
}

let captured: CapturedRuntimeError[] = [];
let expectedPatterns: string[] = [];
let installed = false;

export function getCapturedErrors(): readonly CapturedRuntimeError[] {
  return captured;
}

export function reset(): void {
  captured = [];
  expectedPatterns = [];
}

/**
 * Suppress the next captured error whose message includes `substring`.
 * Tests that deliberately trigger an unhandled rejection (e.g. while
 * testing error paths) should call this before the action.
 */
export function markExpectedError(substring: string): void {
  expectedPatterns.push(substring);
}

function isExpected(message: string): boolean {
  const idx = expectedPatterns.findIndex((p) => message.includes(p));
  if (idx === -1) {
    return false;
  }
  expectedPatterns.splice(idx, 1);
  return true;
}

function formatReason(raw: unknown): string {
  if (raw instanceof Error) {
    return raw.stack ?? raw.message;
  }
  if (typeof raw === 'string') {
    return raw;
  }
  // `JSON.stringify` is typed as `string | undefined` and *does*
  // return `undefined` for things like `undefined`, functions, and
  // symbols. Always return a string so downstream `.includes(...)`
  // calls in `isExpected()` are safe.
  try {
    const json = JSON.stringify(raw);
    if (json !== undefined) {
      return json;
    }
  } catch {
    // fall through
  }
  return String(raw);
}

function record(source: CapturedRuntimeError['source'], raw: unknown): void {
  const message = formatReason(raw);
  if (isExpected(message)) {
    return;
  }
  captured.push({ source, message });
}

export function install(): void {
  if (installed) {
    return;
  }
  installed = true;

  // Note: `process.on(…)` adds listeners; Node will still call any
  // pre-existing listeners VS Code itself installed. That's intentional
  // — VS Code's own handler typically just logs and swallows, which is
  // what we want (we record the error, the rest of the host stays
  // stable).
  process.on('unhandledRejection', (reason) => {
    record('unhandledRejection', reason);
  });
  process.on('uncaughtException', (err) => {
    record('uncaughtException', err);
  });
}

export function assertNoRuntimeErrors(context?: string): void {
  if (captured.length === 0) {
    return;
  }
  const lines = captured.map((c, i) => `  [${i + 1}] (${c.source}) ${c.message}`);
  throw new Error(
    `${context ? context + ': ' : ''}runtime errors captured (${captured.length}):\n${lines.join('\n')}`
  );
}
