import { configDefaults, defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// These literal paths already belong to other local prototypes, not to this
// branch's checkout. Match Git's existing boundary for both red and green suites.
const root = fileURLToPath(new URL('.', import.meta.url));
const ignoredTests = readFileSync(fileURLToPath(new URL('.gitignore', import.meta.url)), 'utf8')
  .split(/\r?\n/).map(line => line.trim())
  .filter(line => /^\/tests\/[^*?!\[\]]+\.test\.ts$/.test(line))
  .map(line => line.slice(1));
let trackedTests: string[] = [];
try {
  trackedTests = execFileSync('git', ['ls-files', '-z', '--', 'tests'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0');
} catch { /* Exported source archives do not require Git to run their tests. */ }
const hiddenTracked = ignoredTests.filter(path => trackedTests.includes(path));
if (hiddenTracked.length) throw new Error(`Remove tracked tests from .gitignore before running: ${hiddenTracked.join(', ')}`);

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Linked checkouts have their own versions of these tests and source files.
    exclude: [...configDefaults.exclude, '**/.worktrees/**', ...ignoredTests]
  }
});
