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
  for (const test of tests) {
    const label = `VSCode Integration :: ${test.name}`;
    try {
      await test.fn();
      console.log(`✓ ${label}`);
    } catch (error) {
      console.error(`✗ ${label}`);
      throw error;
    }
  }
}
