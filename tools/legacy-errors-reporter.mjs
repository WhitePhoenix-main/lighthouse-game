import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const defaultErrorReport = fileURLToPath(new URL('../test-results/legacy-baseline/errors.json', import.meta.url));

/** Vitest 3 public reporter API. JSON's onFinished ignores unhandled errors. */
export default class LegacyErrorsReporter {
  pendingHooks = new Map();

  onHookStart({ name, entity }) {
    const key = `${entity.id}:${name}`;
    const previous = this.pendingHooks.get(key);
    this.pendingHooks.set(key, { name, entity: entity.fullName ?? entity.moduleId, count: (previous?.count ?? 0) + 1 });
  }

  onHookEnd({ name, entity }) {
    const key = `${entity.id}:${name}`, pending = this.pendingHooks.get(key);
    if (!pending) throw new Error(`Hook ended without starting: ${key}`);
    if (--pending.count === 0) this.pendingHooks.delete(key);
  }

  onTestRunEnd(modules, unhandledErrors, reason) {
    const errors = unhandledErrors.map(error => ({ source: 'unhandled', message: String(error?.message ?? error) }));
    for (const module of modules) {
      for (const suite of [module, ...module.children.allSuites()]) {
        for (const error of suite.errors()) errors.push({ source: suite.fullName ?? module.moduleId, message: String(error?.message ?? error) });
      }
    }
    for (const hook of this.pendingHooks.values()) errors.push({ source: hook.entity, message: `${hook.name} did not finish successfully (${hook.count})` });
    writeFileSync(process.env.LIGHTHOUSE_LEGACY_ERRORS_REPORT ?? defaultErrorReport,
      JSON.stringify({ version: 1, completed: true, reason, errors }, null, 2));
  }
}
