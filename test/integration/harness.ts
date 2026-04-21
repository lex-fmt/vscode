import { install, reset, assertNoRuntimeErrors } from './runtime_errors.js';

export type IntegrationTest = () => Promise<void> | void;

interface TestEntry {
  name: string;
  fn: IntegrationTest;
}

const tests: TestEntry[] = [];

export function integrationTest(name: string, fn: IntegrationTest): void {
  tests.push({ name, fn });
}

export async function runRegisteredTests(): Promise<void> {
  // Install the runtime-error capture once for the whole suite. The
  // capture is already armed by the time `index.ts::run()` invokes
  // this function, so anything that fired during install / module
  // imports / activation has been recorded and is asserted on
  // *before* the first reset — otherwise we'd silently throw away
  // exactly the startup-time signals this harness exists to catch.
  install();

  // Surface any errors captured during startup (between `install()`
  // in index.ts and the first test running here) before clearing the
  // collector. These are attributed to the pre-test setup phase
  // explicitly so a future failure points at activation/imports
  // rather than at whichever test happened to run first.
  try {
    assertNoRuntimeErrors('before any test ran (install / imports / activation)');
  } catch (error) {
    console.error('✗ VSCode Integration :: pre-test setup');
    throw error;
  }
  reset();

  for (const test of tests) {
    const label = `VSCode Integration :: ${test.name}`;
    try {
      await test.fn();
    } catch (error) {
      console.error(`✗ ${label}`);
      throw error;
    }

    try {
      assertNoRuntimeErrors(`after test "${test.name}"`);
    } catch (error) {
      console.error(`✗ ${label}`);
      throw error;
    }
    console.log(`✓ ${label}`);
    // Reset *after* the assertion (not before the next test) so any
    // error fired in the gap between tests still attributes to the
    // test it followed rather than getting silently dropped.
    reset();
  }
}
