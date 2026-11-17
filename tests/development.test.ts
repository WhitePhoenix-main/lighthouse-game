import { describe, expect, it } from 'vitest';
import type { NightConfig, SaveStore, UpgradeId } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { UPGRADES } from '../src/content/upgrades';
import { LighthouseApplication } from '../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../src/application/saves';
import { SAVE_KEY } from '../src/platform/browser';

class Store implements SaveStore {
  value: string | null = null;
  writes = 0;
  failAt = Infinity;
  ambiguous = false;
  failRead = false;
  read(): string | null {
    if (this.failRead) throw new Error('read unavailable');
    return this.value;
  }
  write(value: string): void {
    if (++this.writes === this.failAt) throw new Error('quota exceeded');
    this.value = value;
    if (this.ambiguous) { this.failRead = true; throw new Error('reply lost after commit'); }
  }
}
let sequence = 0;
const identity = () => ({ id: `development-${++sequence}`, seed: 42 });
function funded(amount = 1000): Store {
  const store = new Store();
  const save = emptySave(); save.profile.resources = amount;
  store.value = JSON.stringify(save);
  return store;
}
function tinyNight(victory = true): NightConfig {
  return { ...NIGHT_CONFIG, spawnRadius: victory ? 100 : 42, lighthouseHealth: victory ? 120 : 1,
    beam: { ...NIGHT_CONFIG.beam, halfAngle: victory ? Math.PI : .001 },
    waves: [{ id: 'single', enemies: ['ghost'], spawnInterval: 1 }] };
}
function finish(app: LighthouseApplication): void {
  for (let i = 0; i < 300 && app.view.screen === 'battle'; i++) app.advance(1000 / 30);
  expect(app.view.screen).toBe('result');
  expect(app.view.result?.saved).toBe(true);
}
const legacy = () => ({ version: 1,
  profile: { resources: 71, completedNights: 4, encountered: ['ghost', 'turtle'] },
  activeAttempt: null as null | { id: string; seed: number; placementCost: number },
  lastSettled: { id: 'previous', outcome: 'victory', reward: 87 },
});

describe('permanent purchases and attempt configuration', () => {
  it('earns a first-branch choice from the production night and applies a purchase on repeat', () => {
    const firstNight = NIGHT_CATALOG[0]!.config;
    const store = funded(0); const app = new LighthouseApplication(store, firstNight, identity); app.openPreparation(); app.start();
    for (let tick = 0; tick < 7200 && app.view.screen === 'battle'; tick++) {
      const target = [...app.view.battle!.enemies]
        .filter(enemy => Math.hypot(enemy.x, enemy.y) < app.view.config.beam.range)
        .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
      if (target) app.command({ type: 'aim', angle: Math.atan2(target.y, target.x) });
      app.advance(1000 / 30);
    }
    expect(app.view.result?.outcome).toBe('victory');
    expect(app.view.result).toMatchObject({ resources: 48, victoryReward: 72, totalResources: 120 });
    expect(app.view.profile.resources).toBe(120);
    app.start();
    expect(app.view.upgrades.filter(node => node.status === 'available' && node.definition.id.startsWith('beam-')).map(node => node.definition.id))
      .toEqual(['beam-power-1', 'beam-width-1', 'beam-range-1', 'beam-turn-1']);
    app.openDevelopment(); app.purchaseUpgrade('beam-power-1'); app.back(); app.start();
    expect(app.view.profile.resources).toBe(75);
    expect(app.view.config.beam).toEqual({ ...NIGHT_CONFIG.beam, damagePerSecond: 36 });
    expect(app.view.config.waves).toEqual(firstNight.waves);
  });
  it('buys all six nodes once with one consistent write per node and restores them', () => {
    const store = funded(); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openDevelopment();
    for (const node of UPGRADES.slice(0, 6)) {
      const writes = store.writes;
      app.purchaseUpgrade(node.id); app.purchaseUpgrade(node.id);
      expect(store.writes).toBe(writes + 1);
      const saved = decodeSave(store.value!);
      expect(saved.profile.purchasedUpgrades.filter(id => id === node.id)).toHaveLength(1);
      expect(saved.profile).toEqual(app.view.profile);
    }
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(reload.view.profile.resources).toBe(625);
    expect(reload.view.profile.purchasedUpgrades).toHaveLength(6);
    reload.openPreparation(); reload.start();
    expect(reload.view.config.beam).toMatchObject({ damagePerSecond: 42, range: 350, maxTargets: 2 });
    expect(reload.view.config.beam.halfAngle * 360 / Math.PI).toBeCloseTo(40);
  });

  it('rejects missing prerequisites and insufficient bank balance without writing', () => {
    const store = funded(44); const repo = new SaveRepository(store); repo.load();
    expect(() => repo.purchase('beam-power-2')).toThrow('Требуется');
    expect(() => repo.purchase('beam-power-1')).toThrow('Не хватает');
    expect(store.writes).toBe(0);
    expect(repo.current.profile.resources).toBe(44);
    expect(repo.current.profile.purchasedUpgrades).toEqual([]);
  });

  it('spends only in development, freezes the attempt, isolates caller config and base content', () => {
    const config = tinyNight(); const snapshot = structuredClone(NIGHT_CONFIG);
    const store = funded(); const app = new LighthouseApplication(store, config, identity);
    app.openPreparation(); app.openDevelopment(); app.purchaseUpgrade('beam-power-1'); app.back();
    expect(app.view.config.beam.damagePerSecond).toBe(36);
    app.start(); const attemptConfig = app.view.config;
    config.beam.damagePerSecond = 999;
    app.purchaseUpgrade('beam-width-1');
    expect(app.view.profile.purchasedUpgrades).toEqual(['beam-power-1']);
    const repo = new SaveRepository(store); repo.load();
    expect(() => repo.purchase('beam-width-1')).toThrow('между попытками');
    expect(app.view.config).toBe(attemptConfig);
    finish(app);
    app.purchaseUpgrade('beam-width-1'); // result requires explicitly opening development
    expect(app.view.profile.purchasedUpgrades).toEqual(['beam-power-1']);
    app.start(); app.openDevelopment(); app.purchaseUpgrade('beam-width-1'); app.back(); app.start();
    expect(app.view.config).not.toBe(attemptConfig);
    expect(app.view.config.beam.damagePerSecond).toBe(36);
    expect(app.view.config.beam.halfAngle).toBeGreaterThan(attemptConfig.beam.halfAngle);
    expect(NIGHT_CONFIG).toEqual(snapshot);
  });

  it.each([true, false])('keeps purchases and settles rewards once after victory=%s', victory => {
    const store = funded(); const app = new LighthouseApplication(store, tinyNight(victory), identity);
    app.openPreparation(); app.openDevelopment(); app.purchaseUpgrade('beam-range-1'); app.back(); app.start(); finish(app);
    expect(app.view.result?.outcome).toBe(victory ? 'victory' : 'defeat');
    const balance = app.view.profile.resources;
    app.retrySave(); app.retrySave();
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(reload.view.profile.resources).toBe(balance);
    expect(reload.view.profile.purchasedUpgrades).toEqual(['beam-range-1']);
    expect(reload.view.interrupted).toBe(false);
  });

  it('keeps purchases through interruption, discards earned resources and refunds once', () => {
    const store = funded(); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openDevelopment(); app.purchaseUpgrade('beam-power-1');
    const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'interrupted', seed: 7, placementCost: 0 });
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(reload.view.interrupted).toBe(true);
    expect(reload.view.profile.resources).toBe(955);
    expect(reload.view.profile.purchasedUpgrades).toEqual(['beam-power-1']);
    expect(new LighthouseApplication(store, NIGHT_CONFIG, identity).view.profile).toEqual(reload.view.profile);
  });

  it('does not allow unbanked night earnings to pay for an upgrade', () => {
    const store = funded(0);
    const config = { ...tinyNight(), waves: [
      { id: 'first', enemies: ['ghost'] as const, spawnInterval: 1 },
      { id: 'later', enemies: ['turtle'] as const, spawnInterval: 1 },
    ] };
    const app = new LighthouseApplication(store, config, identity); app.openPreparation(); app.start();
    for (let i = 0; i < 50; i++) app.advance(1000 / 30);
    expect(app.view.battle!.earnedResources).toBe(config.enemies.ghost.reward);
    expect(app.view.profile.resources).toBe(0);
    app.purchaseUpgrade('beam-power-1');
    expect(app.view.profile.purchasedUpgrades).toEqual([]);
  });
});

describe('purchase storage failures', () => {
  it('retries an uncertain attempt start with its original identity and frozen config', () => {
    const store = funded(100); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openPreparation(); app.openDevelopment(); app.purchaseUpgrade('beam-power-1'); app.back();
    const writes = store.writes;
    store.ambiguous = true; app.start();
    expect(app.view.error).toBeTruthy(); expect(app.view.battle).toBeNull();
    const attempt = decodeSave(store.value!).activeAttempt!;
    store.ambiguous = false; store.failRead = false; app.retrySave();
    expect(app.view.error).toBeNull(); expect(app.view.screen).toBe('battle');
    expect(app.view.battle!.seed).toBe(attempt.seed);
    expect(app.view.config.beam.damagePerSecond).toBe(36);
    expect(decodeSave(store.value!).activeAttempt!.id).toBe(attempt.id);
    expect(store.writes).toBe(writes + 1);
    app.retrySave(); app.start();
    expect(store.writes).toBe(writes + 1);
  });
  it('keeps failed purchase and balance unchanged, retries the intended purchase once', () => {
    const store = funded(45); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openDevelopment();
    const before = store.value; store.failAt = 1;
    app.purchaseUpgrade('beam-power-1');
    expect(app.view.error).toContain('quota');
    expect(store.value).toBe(before);
    expect(app.view.profile.resources).toBe(45);
    expect(app.view.profile.purchasedUpgrades).toEqual([]);
    app.start(); expect(app.view.screen).toBe('development');
    store.failAt = Infinity; app.retrySave(); app.retrySave(); app.purchaseUpgrade('beam-power-1');
    expect(app.view.error).toBeNull();
    expect(app.view.profile.resources).toBe(0);
    expect(app.view.profile.purchasedUpgrades).toEqual(['beam-power-1']);
    expect(decodeSave(store.value!).profile).toEqual(app.view.profile);
  });

  it('reconciles an uncertain committed purchase after even verification reads fail', () => {
    const store = funded(45); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    app.openDevelopment(); store.ambiguous = true; app.purchaseUpgrade('beam-power-1');
    expect(app.view.error).toBeTruthy();
    expect(app.view.profile.purchasedUpgrades).toEqual([]);
    expect(decodeSave(store.value!).profile.resources).toBe(0);
    store.ambiguous = false; store.failRead = false;
    app.retrySave(); app.retrySave();
    expect(app.view.profile.purchasedUpgrades).toEqual(['beam-power-1']);
    expect(app.view.profile.resources).toBe(0);
    expect(store.writes).toBe(1);
  });

  it('refuses external replacement without overwriting another profile', () => {
    const store = funded(90); const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    const replacement = emptySave(); replacement.profile.resources = 200;
    store.value = JSON.stringify(replacement); const external = store.value;
    app.openDevelopment(); app.purchaseUpgrade('beam-range-1'); app.retrySave();
    expect(app.view.error).toContain('другой вкладке');
    expect(app.view.profile.resources).toBe(90);
    expect(store.value).toBe(external);
  });
});

describe('explicit save migration', () => {
  it('keeps the existing storage key, progress and previous attempt outcome', () => {
    expect(SAVE_KEY).toBe('lighthouse.save.v1');
    const store = new Store(); const old = legacy(); store.value = JSON.stringify(old);
    const repo = new SaveRepository(store); repo.load();
    expect(repo.current).toMatchObject({ ...old, version: 6,
      profile: { ...old.profile, purchasedUpgrades: [], wonNightIds: ['first-light'], legacyEquipment: true } });
    expect(repo.current.profile.devices).toHaveLength(4);
    expect(repo.current.profile.nextDeviceId).toBe(5);
    expect(JSON.parse(store.value!).version).toBe(6);
    const writes = store.writes; repo.load(); expect(store.writes).toBe(writes);
  });

  it('migrates an active attempt and recovers its cost exactly once, including a crash between writes', () => {
    const store = new Store(); const old = legacy();
    old.activeAttempt = { id: 'legacy-active', seed: 123, placementCost: 19 };
    store.value = JSON.stringify(old); store.failAt = 2;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(app.view.error).toBeTruthy();
    expect(decodeSave(store.value!).activeAttempt).toEqual({ ...old.activeAttempt, nightId: 'first-light', lensId: 'basic', legacyRental: true });
    expect(JSON.parse(store.value!).version).toBe(6);
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(reload.view.interrupted).toBe(true);
    expect(reload.view.profile).toMatchObject({ ...old.profile, resources: 90, purchasedUpgrades: [], wonNightIds: ['first-light'], legacyEquipment: true });
    expect(reload.view.profile.devices).toHaveLength(4);
    const again = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(again.view.profile.resources).toBe(90); expect(again.view.interrupted).toBe(false);
    expect(decodeSave(store.value!).lastSettled).toEqual({ id: 'legacy-active', outcome: 'interrupted', reward: 19 });
  });

  it('does not discard old data when migration write fails and allows retry', () => {
    const store = new Store(); const raw = JSON.stringify(legacy()); store.value = raw; store.failAt = 1;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, identity);
    expect(app.view.error).toBeTruthy(); app.openPreparation(); app.start(); expect(app.view.screen).toBe('menu');
    expect(store.value).toBe(raw);
    app.retrySave(); expect(app.view.error).toBeNull();
    expect(app.view.profile.resources).toBe(71);
    expect(decodeSave(store.value!).version).toBe(6);
  });

  it('rejects unknown versions and corrupt upgrade lists without overwriting them', () => {
    for (const purchasedUpgrades of [['unknown'], ['beam-power-2'], ['beam-power-1', 'beam-power-1']]) {
      const store = funded(); const save = emptySave();
      save.profile.purchasedUpgrades = purchasedUpgrades as UpgradeId[];
      store.value = JSON.stringify(save); const raw = store.value;
      const app = new LighthouseApplication(store, NIGHT_CONFIG, identity); app.retrySave(); app.start();
      expect(app.view.error).toBeTruthy(); expect(store.value).toBe(raw);
    }
    expect(() => decodeSave('{"version":99}')).toThrow('версия');
    for (const version of [1, 2]) {
      const invalid = { ...legacy(), version, lastSettled: { id: 'bad', reward: 0, outcome: ['victory'] } };
      expect(() => decodeSave(JSON.stringify(invalid))).toThrow('итог');
    }
    expect(() => decodeSave(JSON.stringify({ ...legacy(), profile: { ...legacy().profile, resources: -1 } }))).toThrow('профиль');
  });
});
