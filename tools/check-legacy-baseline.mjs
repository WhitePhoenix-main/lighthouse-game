import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultErrorReport } from './legacy-errors-reporter.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const key = (file, name) => `${file} :: ${name}`;

// Match test identities, not assertion messages or platform-specific stack traces.
export function compareLegacyReport(report, baseline, identities) {
  const expectedFiles = baseline.files.filter(file => !file.restoredTo);
  const expected = new Set(expectedFiles.flatMap(file => file.failed.map(test => key(file.file, test.name))));
  const actual = new Set();
  const issues = [];
  const files = new Map(report.testResults.map(file => [file.name.split(/[\\/]/).at(-1), file]));
  if (files.size !== report.testResults.length) issues.push('Duplicate legacy file names');
  if (files.size !== expectedFiles.length) issues.push(`Expected ${expectedFiles.length} legacy files, got ${files.size}`);
  for (const file of expectedFiles) {
    const result = files.get(file.file);
    if (!result || result.assertionResults.length !== file.tests) issues.push(`Missing or changed test count: ${file.file}`);
  }
  for (const [file, result] of files) {
    if (result.message) issues.push(`Suite error: ${file}: ${result.message}`);
    const expectedNames = identities.files.find(item => item.file === file)?.tests;
    const actualNames = result.assertionResults.map(test => test.fullName).sort();
    if (!expectedNames || JSON.stringify([...expectedNames].sort()) !== JSON.stringify(actualNames)) issues.push(`Test identities changed: ${file}`);
    for (const test of result.assertionResults) {
      if (test.status === 'failed') actual.add(key(file, test.fullName));
      else if (test.status !== 'passed') issues.push(`Test did not run: ${key(file, test.fullName)} (${test.status})`);
    }
  }
  for (const test of actual) if (!expected.has(test)) issues.push(`New failure: ${test}`);
  for (const test of expected) if (!actual.has(test)) issues.push(`Resolved or missing failure; update baseline and restore coverage: ${test}`);
  const expectedTests = expectedFiles.reduce((sum, file) => sum + file.tests, 0);
  if (report.numTotalTests !== expectedTests || report.numPassedTests + report.numFailedTests !== expectedTests) {
    issues.push('Legacy test totals do not match the baseline');
  }
  if (report.numFailedTests !== actual.size) issues.push('Failure totals do not match individual test results');
  return issues;
}

export function checkErrorReport(report) {
  if (!report || report.version !== 1 || report.completed !== true || !Array.isArray(report.errors)
    || !['passed', 'failed'].includes(report.reason)) throw new Error('Missing, invalid or interrupted legacy error report');
  if (report.errors.length) throw new Error(`Legacy runner or hook errors: ${JSON.stringify(report.errors)}`);
}

function main() {
  const baseline = readJson(path.join(root, 'tests/legacy/BASELINE.json'));
  const identities = readJson(path.join(root, 'tests/legacy/TEST_IDENTITIES.json'));
  for (const file of baseline.files.filter(file => file.restoredTo)) {
    if (!existsSync(path.join(root, file.restoredTo))) throw new Error(`Restored core suite is missing: ${file.restoredTo}`);
  }
  const output = path.join(root, 'test-results/legacy-baseline/report.json');
  mkdirSync(path.dirname(output), { recursive: true });
  rmSync(output, { force: true });
  rmSync(defaultErrorReport, { force: true });
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  const result = spawnSync(process.execPath, [cli, 'run', '--config', 'vitest.legacy.config.ts',
    '--silent', '--reporter=json', '--reporter=./tools/legacy-errors-reporter.mjs', `--outputFile=${output}`],
    { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, LIGHTHOUSE_LEGACY_ERRORS_REPORT: defaultErrorReport } });
  if (result.error) throw result.error;
  if (result.signal || ![0, 1].includes(result.status)) throw new Error(`Legacy runner failed: ${result.signal ?? result.status}`);
  const report = readJson(output);
  checkErrorReport(readJson(defaultErrorReport));
  const issues = compareLegacyReport(report, baseline, identities);
  if (issues.length) throw new Error(issues.join('\n'));
  console.log(`Legacy baseline matches: ${report.numFailedTests} known failures, ${report.numPassedTests} passed. Known failures remain unresolved.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
