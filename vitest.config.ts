import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/.worktrees/**', 'tests/legacy/**', 'tests/audits/**'],
    maxWorkers: 4
  }
});
