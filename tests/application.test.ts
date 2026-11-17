import { describe, expect, it } from 'vitest';
import type { NightConfig, SaveStore } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { LighthouseApplication } from '../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../src/application/saves';

class MemoryStore implements SaveStore {
  value: string | null = null;
  failRead = false;
  failWrite = false;
  failAfterWrite = false;
  read(): string | null { if (this.failRead) throw new Error('read unavailable'); return this.value; }
  write(value: string): void {
    if (this.failWrite) throw new Error('quota exceeded');
    this.value = value;
    if (this.failAfterWrite) throw new Error('adapter failed after commit');
  }
}
let sequence = 0;
const identity = () => ({ id: `test-${++sequence}`, seed: 42 });
function easyNight(): NightConfig {
  return { ...NIGHT_CONFIG, spawnRadius: 100, beam: { ...NIGHT_CONFIG.beam, halfAngle: Math.PI, damagePerSecond: 10000 },
    waves: [{ id: 'test', enemies: ['ghost'], spawnInterval: 0.1 }] };
}
function finish(app: LighthouseApplication): void {
  for (let i = 0; i < 200 && app.view.screen === 'battle'; i++) app.advance(1000 / 30);
  expect(app.view.screen).toBe('result');
}

describe('atomic local save transitions', () => {
  it('records a free attempt and interrupts it once without changing the prior profile', () => {
    const store = new MemoryStore();
    const initial = emptySave(); initial.profile.resources = 40; initial.profile.encountered = ['ghost'];
    store.value = JSON.stringify(initial);
    const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'a', seed: 1, placementCost: 0 });
    expect(repo.current.profile.resources).toBe(40);
    const restart = new SaveRepository(store); restart.load();
    restart.settle('a', 'interrupted', 999, ['turtle']);
    restart.settle('a', 'interrupted', 999, ['turtle']);
    expect(restart.current.profile).toEqual(initial.profile);
    expect(restart.current.activeAttempt).toBeNull();
  });

  it.each(['victory', 'defeat'] as const)('commits ordinary %s rewards and encounters exactly once', outcome => {
    const store = new MemoryStore(); const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'a', seed: 4, placementCost: 0 });
    repo.settle('a', outcome, 17, ['ghost', 'turtle']);
    repo.settle('a', outcome, 17, ['ghost', 'turtle']);
    const loaded = new SaveRepository(store); loaded.load();
    expect(loaded.current.profile.resources).toBe(17);
    expect(loaded.current.profile.completedNights).toBe(outcome === 'victory' ? 1 : 0);
    expect(loaded.current.profile.encountered).toEqual(['ghost', 'turtle']);
    expect(loaded.current.activeAttempt).toBeNull();
    expect(() => loaded.settle('unknown', outcome, 999, [])).toThrow();
  });

  it('retries failed settlement without duplicating rewards; verifies ambiguous adapter write', () => {
    const store = new MemoryStore(); const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'a', seed: 1, placementCost: 0 });
    store.failWrite = true;
    expect(() => repo.settle('a', 'victory', 5, [])).toThrow('quota');
    expect(repo.current.profile.resources).toBe(0);
    expect(decodeSave(store.value!).activeAttempt?.id).toBe('a');
    store.failWrite = false; store.failAfterWrite = true;
    repo.settle('a', 'victory', 5, []);
    repo.settle('a', 'victory', 5, []);
    expect(repo.current.profile.resources).toBe(5);
  });

  it('rejects malformed/newer saves and external replacement without resetting either', () => {
    for (const raw of ['{', '{"version":4}', JSON.stringify({ ...emptySave(), profile: { resources: -1 } })]) {
      const store = new MemoryStore(); store.value = raw;
      const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
      app.start(); expect(app.view.error).toBeTruthy(); expect(store.value).toBe(raw);
    }
    const store = new MemoryStore(); const repo = new SaveRepository(store); repo.load();
    store.value = JSON.stringify(emptySave());
    expect(() => repo.begin({ id: 'a', seed: 1, placementCost: 0 })).toThrow('другой вкладке');
  });
});

describe('application lifecycle', () => {
  it('does not start simulation when attempt write fails; retry allows a clean start', () => {
    const store = new MemoryStore(); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openPreparation();
    store.failWrite = true; app.start();
    expect(app.view.screen).toBe('preparation'); expect(app.view.battle).toBeNull();
    expect(app.view.error).toBeTruthy();
    store.failWrite = false; app.retrySave(); app.start();
    expect(app.view.screen).toBe('battle');
  });

  it('fixed-step frames, pause and long gaps never fast-forward the fight', () => {
    const app = new LighthouseApplication(new MemoryStore(), NIGHT_CONFIG, identity); app.openPreparation(); app.start();
    app.advance(10); expect(app.view.battle!.tick).toBe(0);
    app.advance(24); expect(app.view.battle!.tick).toBe(1);
    app.command({ type: 'aim', angle: 1 }); app.pause(); app.advance(50000);
    expect(app.view.battle!.tick).toBe(1);
    app.resume(); app.advance(50000); expect(app.view.battle!.tick).toBe(1);
    const previousAngle = app.view.battle!.beamAngle;
    app.advance(1000 / 30); expect(app.view.battle!.tick).toBe(2);
    expect(app.view.battle!.beamAngle).toBe(previousAngle); // pending input was cleared by pause
  });

  it('keeps unsaved result visible for retry; restart after completion preserves reward and repeat resets health', () => {
    const store = new MemoryStore(); const app = new LighthouseApplication(store, easyNight(), identity); app.openPreparation(); app.start();
    store.failWrite = true; finish(app);
    expect(app.view.result!.saved).toBe(false); expect(app.view.error).toBeTruthy();
    app.start(); expect(app.view.screen).toBe('result');
    store.failWrite = false; app.retrySave();
    expect(app.view.result!.saved).toBe(true);
    const earned = app.view.profile.resources; expect(earned).toBeGreaterThan(0);
    app.retrySave(); expect(app.view.profile.resources).toBe(earned);
    const restart = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(restart.view.profile.resources).toBe(earned); expect(restart.view.interrupted).toBe(false);
    app.start(); expect(app.view.screen).toBe('preparation'); app.start();
    expect(app.view.battle!.lighthouseHealth).toBe(easyNight().lighthouseHealth);
    expect(app.view.battle!.earnedResources).toBe(0);
  });

  it('restart during battle discards temporary resources and encounters, recovers only once', () => {
    const store = new MemoryStore(); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity); app.openPreparation(); app.start();
    const restart = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(restart.view.interrupted).toBe(true);
    expect(restart.view.profile.resources).toBe(0); expect(restart.view.profile.encountered).toEqual([]);
    const again = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(again.view.interrupted).toBe(false); expect(again.view.profile.resources).toBe(0);
  });

  it('read or interruption recovery errors remain recoverable and never silently reset', () => {
    const store = new MemoryStore(); const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'a', seed: 2, placementCost: 0 });
    store.failWrite = true;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(app.view.error).toBeTruthy(); expect(decodeSave(store.value!).activeAttempt).not.toBeNull();
    store.failWrite = false; app.retrySave(); expect(app.view.error).toBeNull();
    expect(app.view.interrupted).toBe(true); expect(decodeSave(store.value!).activeAttempt).toBeNull();
    store.failRead = true; const blocked = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(blocked.view.error).toBeTruthy(); store.failRead = false; blocked.retrySave();
    expect(blocked.view.error).toBeNull();
  });
});
