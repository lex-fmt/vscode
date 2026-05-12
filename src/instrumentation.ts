// Extension-side instrumentation that mirrors vscode notifications + the
// Lex output channel to `console.error`, gated on `LEX_LOG_TO_STDERR=1`.
//
// **Why this exists in extension-under-test code, not in the test harness:**
// vscode-test-electron runs the extension-under-test and the test extension
// in different module contexts. Stubbing `vscode.window.showErrorMessage`
// from the test side doesn't intercept calls made by the extension itself
// (`test/integration/runtime_errors.ts` documents this gotcha). Running the
// patch inside the extension's own `activate()` puts it in the right
// context so notifications + output-channel writes both reach stderr,
// which `npm run test:integration` already forwards verbatim.
//
// **Why a single env var:** dev launches that already set `LEX_LSP_PATH`
// (to point at a locally-built lexd-lsp) can flip `LEX_LOG_TO_STDERR=1` in
// the same shell, no other config required. Production extension installs
// never set the var, so this is a no-op there.
//
// Idempotent: a second call after one install is a noop. The patched
// functions retain the original behavior — notifications still pop up,
// channel writes still appear in the Output panel; this only adds a
// stderr mirror.

import * as vscode from 'vscode';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

let installed = false;
let logFilePath: string | undefined;

function write(prefix: string, line: string): void {
  // Always try stderr — harmless if it isn't being captured.
  try {
    process.stderr.write(`${prefix} ${line}\n`);
  } catch {
    // ignore
  }
  // Also append to the file so a test process that doesn't capture
  // extension-host stdio can still read activation-time errors.
  if (logFilePath) {
    try {
      appendFileSync(logFilePath, `${prefix} ${line}\n`);
    } catch {
      // ignore
    }
  }
}

export function installLogMirror(): void {
  if (installed) return;
  // PROBE: also drop a probe file unconditionally so we know whether
  // installLogMirror is being called at all. Remove once verified.
  try {
    writeFileSync(
      '/tmp/lex-vscode-probe.log',
      `installLogMirror called at ${new Date().toISOString()}\nLEX_LOG_TO_STDERR=${process.env.LEX_LOG_TO_STDERR ?? '(unset)'}\n`
    );
  } catch {
    // ignore
  }
  if (process.env.LEX_LOG_TO_STDERR !== '1') return;
  installed = true;

  // Open / truncate the log file once per activation. Path is configurable
  // via LEX_LOG_FILE; otherwise defaults to /tmp/lex-vscode-test.log so
  // test runs can `tail -f` or read it post-mortem without env config.
  logFilePath = process.env.LEX_LOG_FILE ?? '/tmp/lex-vscode-test.log';
  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
    writeFileSync(logFilePath, '');
  } catch {
    // ignore — best-effort
  }

  patchShowMessages();
  patchOutputChannelFactory();

  write('[lex/instrument]', `stderr+file mirror installed (file=${logFilePath})`);
}

function patchShowMessages(): void {
  const win = vscode.window;
  const originalError = win.showErrorMessage;
  const originalWarn = win.showWarningMessage;
  const originalInfo = win.showInformationMessage;

  win.showErrorMessage = (...args: unknown[]) => {
    write('[lex/notify ERROR]', firstStringArg(args));
    return originalError.apply(win, args as Parameters<typeof originalError>);
  };

  win.showWarningMessage = (...args: unknown[]) => {
    write('[lex/notify WARN ]', firstStringArg(args));
    return originalWarn.apply(win, args as Parameters<typeof originalWarn>);
  };

  win.showInformationMessage = (...args: unknown[]) => {
    write('[lex/notify INFO ]', firstStringArg(args));
    return originalInfo.apply(win, args as Parameters<typeof originalInfo>);
  };
}

function firstStringArg(args: unknown[]): string {
  const first = args[0];
  return typeof first === 'string' ? first : JSON.stringify(first);
}

function patchOutputChannelFactory(): void {
  const win = vscode.window;
  const originalCreate = win.createOutputChannel;
  win.createOutputChannel = ((name: string, ...rest: unknown[]) => {
    // Cast through unknown to bypass the overloaded signature — the
    // upstream API has both a string-options and a LogOutputChannel
    // overload; we just forward whatever the caller passed.
    const channel = (originalCreate as unknown as (...a: unknown[]) => vscode.OutputChannel).apply(
      win,
      [name, ...rest]
    );
    // Mirror appendLine + append on the Lex channel. Other extensions'
    // channels are left alone so cross-extension noise doesn't drown
    // the lex signal.
    if (name === 'Lex') {
      const originalAppendLine = channel.appendLine.bind(channel);
      const originalAppend = channel.append.bind(channel);
      channel.appendLine = (line: string) => {
        write('[lex/log]', line);
        originalAppendLine(line);
      };
      channel.append = (value: string) => {
        write('[lex/log/append]', value);
        originalAppend(value);
      };
    }
    return channel;
  }) as typeof win.createOutputChannel;
}
