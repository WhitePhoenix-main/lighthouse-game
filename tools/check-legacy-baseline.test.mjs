import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareLegacyReport, checkErrorReport } from './check-legacy-baseline.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseline = { files: [{ file: 'old.test.ts', tests: 2, failed: [{ name: 'known failure' }] }] };
const identities = { files: [{ file: 'old.test.ts', tests: ['known failure', 'working case'] }] };
const report = () => ({
  numTotalTests: 2, numPassedTests: 1, numFailedTests: 1,
  testResults: [{ name: '/checkout/tests/legacy/old.test.ts', assertionResults: [
    { fullName: 'known failure', status: 'failed' }, { fullName: 'working case', status: 'passed' }
  ] }]
});

test('accepts the recorded failures on Windows and POSIX paths', () => {
  assert.deepEqual(compareLegacyReport(report(), baseline, identities), []);
  const windows = report(); windows.testResults[0].name = 'E:\\checkout\\tests\\legacy\\old.test.ts';
  assert.deepEqual(compareLegacyReport(windows, baseline, identities), []);
});
test('rejects a regression even if another failure was fixed and totals match', () => {
  const changed = report();
  changed.testResults[0].assertionResults[0].status = 'passed';
  changed.testResults[0].assertionResults[1].status = 'failed';
  assert(compareLegacyReport(changed, baseline, identities).some(issue => issue.startsWith('New failure:')));
});
test('rejects skipped tests and missing or crashed suites', () => {
  const skipped = report(); skipped.testResults[0].assertionResults[1].status = 'pending';
  assert(compareLegacyReport(skipped, baseline, identities).some(issue => issue.startsWith('Test did not run:')));
  const missing = report(); missing.testResults = [];
  assert(compareLegacyReport(missing, baseline, identities).some(issue => issue.startsWith('Missing or changed test count:')));
});
test('requires an explicit baseline update after fixing a known failure', () => {
  const fixed = report(); fixed.testResults[0].assertionResults[0].status = 'passed';
  fixed.numPassedTests = 2; fixed.numFailedTests = 0;
  assert(compareLegacyReport(fixed, baseline, identities).some(issue => issue.startsWith('Resolved or missing failure;')));
});
test('excludes suites explicitly restored to the core test gate', () => {
  const restored = { files: [...baseline.files, { file: 'restored.test.ts', tests: 7, failed: [{ name: 'fixed' }], restoredTo: 'tests/restored.test.ts' }] };
  assert.deepEqual(compareLegacyReport(report(), restored, identities), []);
});

test('rejects suite errors even when every assertion matches', () => {
  const changed = report(); changed.testResults[0].message = 'afterAll failed';
  assert(compareLegacyReport(changed, baseline, identities).some(issue => issue.startsWith('Suite error:')));
});

test('rejects a removed passing test replaced by another passing test', () => {
  const changed = report(); changed.testResults[0].assertionResults[1].fullName = 'unrelated replacement';
  assert(compareLegacyReport(changed, baseline, identities).some(issue => issue.startsWith('Test identities changed:')));
});

test('rejects duplicate basenames instead of overwriting one suite', () => {
  const changed = report(); changed.testResults.push({ ...changed.testResults[0], name: '/nested/old.test.ts' });
  assert(compareLegacyReport(changed, baseline, identities).includes('Duplicate legacy file names'));
});

test('requires a completed error sidecar and rejects interruptions and unhandled errors', () => {
  for (const invalid of [undefined, {}, { version: 1, completed: true, reason: 'interrupted', errors: [] },
    { version: 1, completed: true, reason: 'failed', errors: [{ message: 'unhandled rejection' }] }]) {
    assert.throws(() => checkErrorReport(invalid));
  }
  assert.doesNotThrow(() => checkErrorReport({ version: 1, completed: true, reason: 'failed', errors: [] }));
});

test('real Vitest reporter captures hook and unhandled errors separately from known assertions', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const parent = path.join(root, 'test-results'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'legacy-gate-'));
  try {
    const errorsPath = path.join(directory, 'errors.json');
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    writeFileSync(path.join(directory, 'vitest.config.mjs'), 'export default { test: { include: ["*.test.mjs"], maxWorkers: 1 } };');
    writeFileSync(path.join(directory, 'errors.test.mjs'), `
      import { test, expect, afterAll, beforeEach, describe } from 'vitest';
      test('known failure', () => expect(1).toBe(2));
      describe('suite hook', () => {
        test('passes', () => {});
        afterAll(() => { throw new Error('afterAll probe'); });
      });
      describe('per-test hook', () => {
        beforeEach(() => { throw new Error('beforeEach probe'); });
        test('would have failed', () => expect(1).toBe(2));
      });
      test('async error', async () => {
        Promise.reject(new Error('unhandled probe'));
        await new Promise(resolve => setTimeout(resolve, 30));
      });
    `);
    const run = () => spawnSync(process.execPath, [cli, 'run', '--root', directory,
      '--config', path.join(directory, 'vitest.config.mjs'), '--reporter=json',
      '--reporter', path.join(root, 'tools/legacy-errors-reporter.mjs'), '--outputFile', path.join(directory, 'report.json')],
      { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...process.env, LIGHTHOUSE_LEGACY_ERRORS_REPORT: errorsPath } });
    const result = run();
    assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stderr);
    const errors = JSON.parse(readFileSync(errorsPath, 'utf8'));
    assert(errors.errors.some(error => error.source === 'unhandled' && error.message.includes('unhandled probe')));
    assert(errors.errors.some(error => error.message.includes('afterAll probe')));
    assert(errors.errors.some(error => error.message.includes('beforeEach did not finish')));
    assert.throws(() => checkErrorReport(errors));
    writeFileSync(path.join(directory, 'errors.test.mjs'), `
      import { test, expect, beforeEach, afterEach, afterAll } from 'vitest';
      beforeEach(() => {}); afterEach(() => {}); afterAll(() => {});
      test('known failure', () => expect(1).toBe(2));
    `);
    rmSync(errorsPath);
    const knownFailureOnly = run();
    assert.equal(knownFailureOnly.status, 1, knownFailureOnly.stderr);
    assert.doesNotThrow(() => checkErrorReport(JSON.parse(readFileSync(errorsPath, 'utf8'))));
  } finally {
    const relative = path.relative(parent, path.resolve(directory));
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Refusing to clean a directory outside test-results: ${directory}`);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
