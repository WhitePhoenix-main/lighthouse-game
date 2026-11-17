import { defineConfig } from 'vitest/config';

// Preserved expectations with known failures before the structural refactor.
// This diagnostic suite is explicit and is not a release gate.
export default defineConfig({
  test: {
    include: ['tests/legacy/**/*.test.ts'],
    testTimeout: 120_000,
    maxWorkers: 2
  }
});
