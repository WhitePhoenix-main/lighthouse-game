import { describe, expect, it } from 'vitest';
import type { SaveStore } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { NIGHT_CONFIG } from '../../src/content/night';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { calculateNightConfig, createUpgradeViews, getUpgradeAvailability } from '../../src/progression/upgrades';
import { deviceDeployments, repairCost, unlockedDeviceKinds } from '../../src/progression/devices';
import { grantFixtureDevices } from '../helpers/devices';

class Store implements SaveStore {
  raw: string | null = null;
  fail: 'before' | 'after' | null = null;
  read() { return this.raw; }
  write(raw: string) { if (this.fail === 'before') throw new Error('quota'); this.raw = raw; if (this.fail === 'after') throw new Error('lost reply'); }
}
function oldProfile(legacy = false) {
  const save = emptySave(); save.profile.resources = 500;
  save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide'];
  save.profile.completedNights = 3; save.profile.legacyEquipment = legacy;
  save.profile.purchasedUpgrades = legacy ? ['beam-power-1'] : UPGRADES.slice(0, 14).map(node => node.id);
  save.profile.encountered = ['ghost', 'turtle', 'minotaur', 'bat'];
  save.profile.unlockedLenses = ['basic', 'expanded', 'slowing', 'armor-breaker'];
  save.profile.lensUpgrades = LENS_UPGRADES.slice(0, 6).map(node => node.id);
  save.profile.selectedLensId = 'slowing';
  grantFixtureDevices(save.profile);
  save.profile.devices[0]!.health = 23; save.profile.devices[0]!.position = { x: -100, y: 0 };
  save.profile.devices[3]!.consumed = true;
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load();
  return { save, store, repo };
}

describe('first expansion preserves progression', () => {
  it('has exactly 122 real purchases and preserves the original 14 node costs and beam effects', () => {
    expect(UPGRADES).toHaveLength(82); expect(LENS_UPGRADES).toHaveLength(33);
    expect(LENSES.filter(lens => lens.id !== 'basic')).toHaveLength(7);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    expect(UPGRADES.slice(0, 14).map(node => node.cost)).toEqual([45, 80, 45, 80, 45, 80, 35, 30, 65, 55, 60, 70, 90, 75]);
    const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, UPGRADES.slice(0, 14).map(node => node.id));
    expect(config.beam).toMatchObject({ damagePerSecond: 42, range: 350, maxTargets: 2, turnSpeed: Math.PI / 2 });
    expect(config.beam.halfAngle * 360 / Math.PI).toBeCloseTo(40);
    expect(config.lighthouseHealth).toBe(120); expect(config.flash.cooldown).toBe(18);
    expect(config.availableDevices).not.toContain('harpoon');
  });

  it.each([false, true])('loads old v5 without changing resources, ownership, damage or lens progress (legacy=%s)', legacy => {
    const { save, store, repo } = oldProfile(legacy);
    expect(repo.current).toEqual(save);
    expect(repo.current.profile.devices).toHaveLength(4);
    expect(unlockedDeviceKinds(repo.current.profile)).not.toContain('harpoon');
    expect(getUpgradeAvailability(repo.current.profile, 'unlock-harpoon').status).toBe('available');
    const raw = store.raw;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG);
    expect(app.view.profile).toEqual(save.profile); expect(store.raw).toBe(raw);
    expect(app.view.config.availableDevices).not.toContain('harpoon');
    expect(app.view.profile.unlockedLenses).not.toContain('focused');
  });

  it.each(['before', 'after'] as const)('grants exactly one first harpoon across %s write failure, repeat and reload', failure => {
    const { repo, store } = oldProfile();
    store.fail = failure;
    if (failure === 'before') expect(() => repo.purchase('unlock-harpoon')).toThrow();
    else repo.purchase('unlock-harpoon');
    store.fail = null;
    repo.purchase('unlock-harpoon'); repo.purchase('unlock-harpoon'); repo.load();
    expect(repo.current.profile.resources).toBe(430);
    expect(repo.current.profile.devices.filter(device => device.kind === 'harpoon')).toEqual([
      { id: 5, kind: 'harpoon', health: 60, consumed: false, position: null },
    ]);
    expect(repo.current.profile.nextDeviceId).toBe(6);
    repo.purchaseDevice('harpoon', 6);
    expect(repo.current.profile.resources).toBe(394);
    expect(repo.current.profile.devices.filter(device => device.kind === 'harpoon').map(device => device.id)).toEqual([5, 6]);
  });

  it('retains damaged owned bodies and repair prices when buying a damage upgrade', () => {
    const { repo } = oldProfile(); const before = repo.current.profile.devices;
    const bill = repairCost(before[0]!);
    repo.purchase('cannon-damage-1');
    expect(repo.current.profile.devices).toEqual(before);
    expect(repairCost(repo.current.profile.devices[0]!)).toBe(bill);
    const config = calculateNightConfig(NIGHT_CONFIG, repo.current.profile.purchasedUpgrades);
    expect(config.devices.definitions.cannon.damage).toBe(20);
    expect(config.devices.definitions.cannon.health).toBe(70);
  });

  it('keeps harpoon damage and deployment after loss, charges at most 25% to repair and never refills health for free', () => {
    const { repo } = oldProfile(); repo.purchase('unlock-harpoon');
    const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, repo.current.profile.purchasedUpgrades);
    repo.savePlacements([{ id: 5, kind: 'harpoon', x: -100, y: 0 }], config);
    repo.begin({ id: 'harpoon-loss', seed: 42, placementCost: 0 });
    repo.settle('harpoon-loss', 'defeat', 7, [], deviceDeployments(repo.current.profile).map(device => ({ ...device, health: 0 })));
    repo.load(); const broken = repo.current.profile.devices.find(device => device.id === 5)!;
    expect(broken).toMatchObject({ health: 0, position: { x: -100, y: 0 } });
    expect(repairCost(broken)).toBe(9);
    repo.purchase('harpoon-damage-1'); expect(repo.current.profile.devices.find(device => device.id === 5)!.health).toBe(0);
    const balance = repo.current.profile.resources;
    repo.repairDevice(5); repo.repairDevice(5);
    expect(repo.current.profile.resources).toBe(balance - 9);
    expect(repo.current.profile.devices.find(device => device.id === 5)!.health).toBe(60);
  });

  it('recovers an existing v5 active attempt without adding new devices or retroactive rewards', () => {
    const { repo, store } = oldProfile(); const before = repo.current.profile;
    repo.begin({ id: 'old-active', seed: 42, placementCost: 0, lensId: 'slowing' });
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 2 }), undefined, NIGHT_CATALOG);
    expect(app.view.interrupted).toBe(true);
    expect(app.view.profile).toEqual(before);
    expect(decodeSave(store.raw!).lastSettled).toMatchObject({ reward: 0, outcome: 'interrupted' });
  });

  it('applies additive mechanics without changing the shared shield regeneration per generator', () => {
    const config = calculateNightConfig(NIGHT_CONFIG, UPGRADES.map(node => node.id));
    expect(config.beam.turnSpeed * 180 / Math.PI).toBeCloseTo(100);
    expect(config.lighthouseHealth).toBe(160);
    expect(config.shield).toMatchObject({ capacityPerGenerator: 110, regenerationPerSecond: 18 });
    expect(config.flash).toMatchObject({ damage: 28, cooldown: 16 });
    expect(config.devices.definitions.cannon).toMatchObject({ damage: 24, range: 185 });
    expect(config.devices.definitions.cannon.attackInterval).toBeCloseTo(.6);
    expect(config.devices.definitions.harpoon).toMatchObject({ damage: 22, range: 225 });
    expect(config.devices.definitions.harpoon.attackInterval).toBeCloseTo(1.05);
    const views = createUpgradeViews(emptySave().profile, NIGHT_CONFIG);
    expect(views.find(node => node.definition.id === 'flash-cooldown-1')).toMatchObject({ currentValue: 18, nextValue: 16 });
    expect(views.find(node => node.definition.id === 'harpoon-speed-1')!.nextValue).toBeCloseTo(1.2);
  });
});
