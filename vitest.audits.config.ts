import { defineConfig } from 'vitest/config';

// Slow balance simulations generate evidence in test-results/balance only.
export default defineConfig({
  test: {
    include: ['tests/audits/**/*.test.ts'],
    testTimeout: 120_000,
    maxWorkers: 2
  }
});
