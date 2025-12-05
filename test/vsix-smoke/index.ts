import { runRegisteredTests } from '../integration/harness.js';

export async function run(): Promise<void> {
  await import('./vsix_activation.test.js');
  await runRegisteredTests();
}
