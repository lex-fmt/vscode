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
  // Install the runtime-error capture once for the whole suite; the
  // per-test `reset()` below clears the captured list and any
  // expected-error marks so each test starts from a clean slate.
  install();

  for (const test of tests) {
    const label = `VSCode Integration :: ${test.name}`;
    reset();
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
  }
}
