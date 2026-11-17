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
    encountered: ['ghost', 'turtle', 'minotaur', 'bat'], selectedLensId: 'focused' });
  profile.purchasedUpgrades = UPGRADES.slice(0, 29).map(node => node.id);
  profile.unlockedLenses = LENSES.slice(0, 5).map(lens => lens.id);
  profile.lensUpgrades = LENS_UPGRADES.slice(0, 15).map(node => node.id);
  grantFixtureDevices(profile);
  profile.devices.find(device => device.kind === 'harpoon')!.health = 13;
  profile.devices.find(device => device.kind === 'light-trap')!.consumed = true;
  profile.devices[0]!.position = { x: -100, y: 0 };
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load(); return { save, store, repo };
}

describe('second expansion preserves profiles and purchases', () => {
  it.each([false, true])('preserves a complete stage-one v5 profile including damaged harpoon (legacy=%s)', legacy => {
    const { save, store, repo } = previousProfile(legacy);
    expect(repo.current).toEqual(save);
    expect(unlockedDeviceKinds(repo.current.profile)).not.toContain('mortar');
    const before = store.raw;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG);
    expect(app.view.profile).toEqual(save.profile); expect(store.raw).toBe(before);
    expect(app.view.config.availableDevices).not.toContain('mortar');
    expect(app.view.profile.unlockedLenses).not.toContain('smoldering');
  });

  it('migrates a v4 profile owning a harpoon without granting a mortar or the new lens', () => {
    const { save, store } = previousProfile();
    const { devices: _devices, nextDeviceId: _next, ...profile } = save.profile;
    store.raw = JSON.stringify({ ...save, version: 4, profile });
    const repo = new SaveRepository(store); repo.load();
    expect(repo.current.profile.devices.map(device => device.kind)).toEqual(['cannon', 'barrier', 'generator', 'light-trap', 'harpoon']);
    expect(repo.current.profile.resources).toBe(2000);
    expect(repo.current.profile.lensUpgrades).toEqual(save.profile.lensUpgrades);
    const once = repo.current; repo.load(); expect(repo.current).toEqual(once);
  });

  it.each(['before', 'after'] as const)('grants one first mortar atomically despite a %s-write failure', failure => {
    const { repo, store } = previousProfile(); store.fail = failure;
    if (failure === 'before') expect(() => repo.purchase('unlock-mortar')).toThrow();
    else repo.purchase('unlock-mortar');
    store.fail = null; repo.purchase('unlock-mortar'); repo.purchase('unlock-mortar'); repo.load();
    expect(repo.current.profile.resources).toBe(1905);
    expect(repo.current.profile.devices.filter(device => device.kind === 'mortar')).toEqual([
      { id: 6, kind: 'mortar', health: 80, consumed: false, position: null },
    ]);
    repo.purchaseDevice('mortar', 7); repo.purchaseDevice('mortar', 7); repo.load();
    expect(repo.current.profile.resources).toBe(1857);
    expect(repo.current.profile.devices.filter(device => device.kind === 'mortar').map(device => device.id)).toEqual([6, 7]);
  });

  it.each(['before', 'after'] as const)('keeps a destroyed mortar and pays repair once across a %s-write failure', failure => {
    const { repo, store } = previousProfile(); repo.purchase('unlock-mortar');
    const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, repo.current.profile.purchasedUpgrades);
    repo.savePlacements([{ id: 6, kind: 'mortar', x: -100, y: 0 }], config);
    repo.begin({ id: 'mortar-loss', seed: 42, placementCost: 0 });
    repo.settle('mortar-loss', 'defeat', 7, [], deviceDeployments(repo.current.profile).map(device => ({ ...device, health: 0 })));
    repo.load(); repo.purchase('mortar-damage-1'); repo.purchase('mortar-radius-1');
    const mortar = repo.current.profile.devices.find(device => device.id === 6)!;
    expect(mortar).toMatchObject({ health: 0, position: { x: -100, y: 0 } });
    expect(repairCost(mortar)).toBe(12);
    const balance = repo.current.profile.resources; store.fail = failure;
    if (failure === 'before') expect(() => repo.repairDevice(6)).toThrow(); else repo.repairDevice(6);
    store.fail = null; repo.repairDevice(6); repo.repairDevice(6); repo.load();
    expect(repo.current.profile.resources).toBe(balance - 12);
    expect(repo.current.profile.devices.find(device => device.id === 6)!.health).toBe(80);
  });

  it.each(['before', 'after'] as const)('pays each lens currency once across a %s-write failure', failure => {
    const { repo, store } = previousProfile();
    repo.purchaseLens('smoldering'); repo.purchaseLens('smoldering');
    store.fail = failure;
    if (failure === 'before') expect(() => repo.purchaseLensUpgrade('smoldering-power')).toThrow();
    else repo.purchaseLensUpgrade('smoldering-power');
    store.fail = null; repo.purchaseLensUpgrade('smoldering-power'); repo.purchaseLensUpgrade('smoldering-power'); repo.load();
    expect(repo.current.profile.resources).toBe(1935); expect(repo.current.profile.bossMaterials).toBe(6);
    expect(repo.current.profile.lensUpgrades.filter(id => id === 'smoldering-power')).toHaveLength(1);
  });

  it('interrupts an old active attempt without changing paid progress or adding rewards', () => {
    const { repo, store } = previousProfile(); const profile = repo.current.profile;
    repo.begin({ id: 'old-active', seed: 42, placementCost: 0, lensId: 'focused' });
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'new', seed: 2 }), undefined, NIGHT_CATALOG);
    expect(app.view.interrupted).toBe(true); expect(app.view.profile).toEqual(profile);
    expect(JSON.parse(store.raw!).lastSettled).toMatchObject({ reward: 0, outcome: 'interrupted' });
  });

  it('applies all new effects only to their weapon or selected lens', () => {
    const purchased = UPGRADES.map(node => node.id), lensUpgrades = LENS_UPGRADES.map(node => node.id);
    const config = calculateNightConfig(NIGHT_CONFIG, purchased, false, { lensId: 'smoldering', upgrades: lensUpgrades });
    expect(config.devices.definitions.mortar).toMatchObject({ damage: 36, attackInterval: 2.6, health: 80, range: 230 });
    expect(config.devices.mortar).toEqual({ blastRadius: 75, projectileSpeed: 270, armorMultiplier: 1.5 });
    expect(config.lens?.burn).toEqual({ seconds: 3, damagePerSecond: 10 });
    expect(config.beam.damagePerSecond).toBeCloseTo(42 * .7 + 3);
    expect(config.beam.maxTargets).toBe(2);
    const focused = calculateNightConfig(NIGHT_CONFIG, purchased, false, { lensId: 'focused', upgrades: lensUpgrades });
    expect(focused.lens?.burn).toBeUndefined(); expect(focused.beam.damagePerSecond).toBe(67);
    expect(focused.devices.mortar).toEqual(config.devices.mortar);
    const views = createUpgradeViews(emptySave().profile, NIGHT_CATALOG[0]!.config);
    expect(views.find(node => node.definition.id === 'mortar-reload')).toMatchObject({ currentValue: 3, nextValue: 2.6 });
  });
});
