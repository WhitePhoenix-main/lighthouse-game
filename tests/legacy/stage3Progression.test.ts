import { describe, expect, it } from 'vitest';
import type { SaveStore } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { NIGHT_CONFIG } from '../../src/content/night';
import { emptySave, SaveRepository } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { calculateNightConfig, createUpgradeViews } from '../../src/progression/upgrades';
import { deviceDeployments, repairCost, unlockedDeviceKinds } from '../../src/progression/devices';
import { grantFixtureDevices } from '../helpers/devices';

class Store implements SaveStore {
  raw: string | null = null;
  fail: 'before' | 'after' | null = null;
  read() { return this.raw; }
  write(raw: string) { if (this.fail === 'before') throw new Error('quota'); this.raw = raw; if (this.fail === 'after') throw new Error('lost reply'); }
}
function previousProfile(legacyEquipment = false) {
  const save = emptySave(), profile = save.profile;
  Object.assign(profile, { resources: 2000, bossMaterials: 10, bossLevel: 2, completedNights: 4, legacyEquipment,
    wonNightIds: ['first-light', 'broken-shore', 'winged-tide', 'abyss-warden'],
    encountered: ['ghost', 'turtle', 'minotaur', 'bat'], selectedLensId: 'smoldering' });
  profile.purchasedUpgrades = UPGRADES.slice(0, 37).map(node => node.id);
  profile.unlockedLenses = LENSES.slice(0, 6).map(lens => lens.id);
  profile.lensUpgrades = LENS_UPGRADES.slice(0, 19).map(node => node.id);
  grantFixtureDevices(profile);
  profile.devices.find(device => device.kind === 'harpoon')!.health = 13;
  profile.devices.find(device => device.kind === 'mortar')!.health = 11;
  profile.devices.find(device => device.kind === 'light-trap')!.consumed = true;
  profile.devices[0]!.position = { x: -100, y: 0 };
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load(); return { save, store, repo };
}

describe('third expansion preserves profiles and buys protection without healing', () => {
  it.each([false, true])('loads all previous 61 purchases and damaged bodies unchanged (legacy=%s)', legacy => {
    const { save, store, repo } = previousProfile(legacy);
    expect(repo.current).toEqual(save);
    expect(unlockedDeviceKinds(repo.current.profile)).not.toContain('bell');
    const before = store.raw;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG);
    expect(app.view.profile).toEqual(save.profile); expect(store.raw).toBe(before);
    expect(app.view.config.availableDevices).not.toContain('bell');
    expect(app.view.profile.unlockedLenses).not.toContain('resonant');
  });

  it.each(['before', 'after'] as const)('grants one first bell despite a %s-write failure', failure => {
    const { repo, store } = previousProfile(); store.fail = failure;
    if (failure === 'before') expect(() => repo.purchase('unlock-bell')).toThrow(); else repo.purchase('unlock-bell');
    store.fail = null; repo.purchase('unlock-bell'); repo.purchase('unlock-bell'); repo.load();
    expect(repo.current.profile.resources).toBe(1915);
    expect(repo.current.profile.devices.filter(device => device.kind === 'bell')).toEqual([
      { id: 7, kind: 'bell', health: 70, consumed: false, position: null },
    ]);
    repo.purchaseDevice('bell', 8); repo.purchaseDevice('bell', 8); repo.load();
    expect(repo.current.profile.resources).toBe(1875);
    expect(repo.current.profile.devices.filter(device => device.kind === 'bell').map(device => device.id)).toEqual([7, 8]);
  });

  it.each([0, 13.4])('preserves %s health and its repair quote when buying the guard node', health => {
    const { repo, store } = previousProfile(); repo.purchase('unlock-bell');
    const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, repo.current.profile.purchasedUpgrades);
    repo.savePlacements([{ id: 7, kind: 'bell', x: -100, y: 0 }], config);
    repo.begin({ id: 'bell-loss', seed: 42, placementCost: 0 });
    repo.settle('bell-loss', 'defeat', 7, [], deviceDeployments(repo.current.profile).map(device => ({ ...device, health })));
    repo.load(); const before = repo.current.profile.devices;
    const quoted = repairCost(before.find(device => device.id === 7)!);
    repo.purchase('bell-guard');
    expect(repo.current.profile.devices).toEqual(before);
    expect(repairCost(repo.current.profile.devices.find(device => device.id === 7)!)).toBe(quoted);
    const upgraded = calculateNightConfig(NIGHT_CONFIG, repo.current.profile.purchasedUpgrades);
    expect(upgraded.devices.definitions.bell.health).toBe(70);
    expect(upgraded.devices.bell.incomingDamageMultiplier).toBe(.8);
    const balance = repo.current.profile.resources; store.fail = 'after';
    repo.repairDevice(7); store.fail = null; repo.repairDevice(7); repo.load();
    expect(repo.current.profile.resources).toBe(balance - quoted);
    expect(quoted).toBeLessThanOrEqual(10);
    expect(repo.current.profile.devices.find(device => device.id === 7)).toMatchObject({ health: 70, position: { x: -100, y: 0 } });
  });

  it.each(['before', 'after'] as const)('pays each resonance currency once across a %s-write failure', failure => {
    const { repo, store } = previousProfile();
    repo.purchaseLens('resonant'); repo.purchaseLens('resonant'); store.fail = failure;
    if (failure === 'before') expect(() => repo.purchaseLensUpgrade('resonant-power')).toThrow();
    else repo.purchaseLensUpgrade('resonant-power');
    store.fail = null; repo.purchaseLensUpgrade('resonant-power'); repo.purchaseLensUpgrade('resonant-power'); repo.load();
    expect(repo.current.profile.resources).toBe(1935); expect(repo.current.profile.bossMaterials).toBe(6);
    expect(repo.current.profile.lensUpgrades.filter(id => id === 'resonant-power')).toHaveLength(1);
  });

  it('interrupts an old active attempt without retroactive items or rewards', () => {
    const { repo, store } = previousProfile(); const profile = repo.current.profile;
    repo.begin({ id: 'old-active', seed: 42, placementCost: 0, lensId: 'smoldering' });
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'new', seed: 2 }), undefined, NIGHT_CATALOG);
    expect(app.view.interrupted).toBe(true); expect(app.view.profile).toEqual(profile);
    expect(JSON.parse(store.raw!).lastSettled).toMatchObject({ reward: 0, outcome: 'interrupted' });
  });

  it('keeps new effects scoped and displays actual multipliers and intervals', () => {
    const purchased = UPGRADES.map(node => node.id), upgrades = LENS_UPGRADES.map(node => node.id);
    const config = calculateNightConfig(NIGHT_CONFIG, purchased, false, { lensId: 'resonant', upgrades });
    expect(config.devices.definitions.bell).toMatchObject({ damage: 0, range: 170, health: 70, attackInterval: 5.5 });
    expect(config.devices.bell).toEqual({ duration: 2, slowMultiplier: .65, firstPulseSlowMultiplier: .5, incomingDamageMultiplier: .8 });
    expect(config.lens?.resonance?.damageBonus).toBeCloseTo(.45); expect(config.lens?.resonance?.seconds).toBe(2);
    expect(config.beam.damagePerSecond).toBeCloseTo(41.8); expect(config.beam.maxTargets).toBe(2);
    expect(config.pairedDamageBonus).toBe(.2); // The basic lens's additional pair upgrade is inactive.
    const oldLens = calculateNightConfig(NIGHT_CONFIG, purchased, false, { lensId: 'smoldering', upgrades });
    expect(oldLens.lens?.resonance).toBeUndefined(); expect(oldLens.lens?.burn).toEqual({ seconds: 3, damagePerSecond: 10 });
    const views = createUpgradeViews(emptySave().profile, NIGHT_CATALOG[0]!.config);
    expect(views.find(node => node.definition.id === 'bell-reload')).toMatchObject({ currentValue: 6, nextValue: 5.5 });
    expect(views.find(node => node.definition.id === 'bell-guard')).toMatchObject({ currentValue: 1, nextValue: .8 });
    expect(views.find(node => node.definition.id === 'bell-first-pulse')).toMatchObject({ currentValue: .65, nextValue: .5 });
  });
});
