import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, SaveStore } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { NIGHT_CONFIG } from '../../src/content/night';
import { emptySave, SaveRepository } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { calculateNightConfig, createUpgradeViews } from '../../src/progression/upgrades';
import { deviceDeployments, repairCost, unlockedDeviceKinds } from '../../src/progression/devices';
import { createBattle } from '../../src/simulation/battle';
import { updateRepairLamps } from '../../src/simulation/repair';
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
    encountered: ['ghost', 'turtle', 'minotaur', 'bat'], selectedLensId: 'resonant' });
  profile.purchasedUpgrades = UPGRADES.slice(0, 45).map(node => node.id);
  profile.unlockedLenses = LENSES.slice(0, 7).map(lens => lens.id);
  profile.lensUpgrades = LENS_UPGRADES.slice(0, 23).map(node => node.id);
  grantFixtureDevices(profile);
  profile.devices.find(device => device.kind === 'cannon')!.health = 40.4;
  profile.devices.find(device => device.kind === 'mortar')!.health = 11;
  profile.devices.find(device => device.kind === 'bell')!.health = 13.4;
  profile.devices.find(device => device.kind === 'light-trap')!.consumed = true;
  profile.devices[0]!.position = { x: -90, y: 0 };
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load(); return { save, store, repo };
}
function repairAttempt() {
  const context = previousProfile(), { repo } = context;
  repo.purchase('unlock-repair-lamp');
  const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, repo.current.profile.purchasedUpgrades);
  repo.savePlacements([{ id: 1, kind: 'cannon', x: -90, y: 0 }, { id: 8, kind: 'repair-lamp', x: -160, y: 0 }], config);
  repo.begin({ id: 'repair-night', seed: 42, placementCost: 0, lensId: 'resonant' });
  const state = createBattle(config, 42, undefined, deviceDeployments(repo.current.profile));
  state.devices[0]!.health = 35.1; updateRepairLamps(state, config);
  expect(state.devices[0]!.health).toBe(40.4); expect(state.devices[1]!.repairCharges).toBe(2);
  return { ...context, state, config };
}
function results(state: BattleState): DeviceDeployment[] {
  return state.devices.map(({ id, kind, x, y, health, consumed }) => ({ id, kind, x, y, health, consumed }));
}

describe('fourth expansion persistence and bounded combat repair', () => {
  it.each([false, true])('preserves all previous 74 purchases and bodies (legacy=%s)', legacy => {
    const { save, store, repo } = previousProfile(legacy); const raw = store.raw;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG);
    expect(repo.current).toEqual(save); expect(app.view.profile).toEqual(save.profile); expect(store.raw).toBe(raw);
    expect(unlockedDeviceKinds(app.view.profile)).not.toContain('repair-lamp');
    expect(app.view.profile.unlockedLenses).not.toContain('long-range');
  });

  it.each(['before', 'after'] as const)('grants one lamp despite a %s-write failure', failure => {
    const { repo, store } = previousProfile(); store.fail = failure;
    if (failure === 'before') expect(() => repo.purchase('unlock-repair-lamp')).toThrow(); else repo.purchase('unlock-repair-lamp');
    store.fail = null; repo.purchase('unlock-repair-lamp'); repo.purchase('unlock-repair-lamp'); repo.load();
    expect(repo.current.profile.resources).toBe(1890);
    expect(repo.current.profile.devices.filter(device => device.kind === 'repair-lamp')).toEqual([
      { id: 8, kind: 'repair-lamp', health: 60, consumed: false, position: null },
    ]);
    repo.purchaseDevice('repair-lamp', 9); repo.purchaseDevice('repair-lamp', 9); repo.load();
    expect(repo.current.profile.resources).toBe(1842);
    expect(repo.current.profile.devices.filter(device => device.kind === 'repair-lamp')).toHaveLength(2);
  });

  it.each(['victory', 'defeat'] as const)('persists repaired health on %s, but a fresh charge budget cannot fix old damage', outcome => {
    const { repo, state, config } = repairAttempt();
    const balance = repo.current.profile.resources;
    repo.settle('repair-night', outcome, 7, [], results(state)); repo.load();
    const settled = repo.current; repo.settle('repair-night', outcome, 7, [], results(state));
    expect(repo.current).toEqual(settled); expect(repo.current.profile.resources).toBe(balance + 7);
    expect(repo.current.profile.devices[0]!.health).toBe(40.4);
    expect(repairCost(repo.current.profile.devices[0]!)).toBe(3);
    repo.begin({ id: 'second-night', seed: 2, placementCost: 0, lensId: 'resonant' });
    const next = createBattle(config, 2, undefined, deviceDeployments(repo.current.profile));
    expect(next.devices[1]!.repairCharges).toBe(3);
    for (let i = 0; i < 600; i++) { next.tick++; updateRepairLamps(next, config); }
    expect(next.devices[0]!.health).toBe(40.4); expect(next.devices[1]!.repairCharges).toBe(3);
    const ownedLamp = repo.current.profile.devices.find(device => device.kind === 'repair-lamp')!;
    expect(ownedLamp).not.toHaveProperty('repairCharges');
    expect(ownedLamp).not.toHaveProperty('startHealth');
    expect(ownedLamp).not.toHaveProperty('emergencyRepairUsed');
  });

  it.each(['before', 'after'] as const)('commits repaired health and reward together through a %s-write failure', failure => {
    const { repo, store, state } = repairAttempt(); const balance = repo.current.profile.resources;
    state.devices[0]!.health -= .6; // A subsequent hit remains in the final condition.
    store.fail = failure;
    if (failure === 'before') expect(() => repo.settle('repair-night', 'defeat', 7, [], results(state))).toThrow();
    else repo.settle('repair-night', 'defeat', 7, [], results(state));
    store.fail = null; repo.settle('repair-night', 'defeat', 7, [], results(state)); repo.load();
    repo.settle('repair-night', 'defeat', 7, [], results(state));
    expect(repo.current.profile.resources).toBe(balance + 7);
    expect(repo.current.profile.devices[0]!.health).toBe(state.devices[0]!.health);
    expect(repo.current.activeAttempt).toBeNull();
  });

  it('discards combat repairs/damage on interruption and retains paid purchases', () => {
    const { repo, store, state } = repairAttempt(); const before = repo.current.profile;
    state.devices[0]!.health = 10; state.devices[1]!.health = 0;
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'new', seed: 2 }), undefined, NIGHT_CATALOG);
    expect(app.view.interrupted).toBe(true); expect(app.view.profile).toEqual(before);
    expect(JSON.parse(store.raw!).lastSettled).toMatchObject({ reward: 0, outcome: 'interrupted' });
  });

  it('does not heal an owned lamp when buying protection or charge capacity', () => {
    const { repo, state } = repairAttempt(); state.devices[1]!.health = 0;
    repo.settle('repair-night', 'defeat', 0, [], results(state));
    repo.purchase('repair-guard'); repo.purchase('repair-charges-1');
    const lamp = repo.current.profile.devices.find(device => device.kind === 'repair-lamp')!;
    expect(lamp.health).toBe(0); expect(repairCost(lamp)).toBe(12);
    const balance = repo.current.profile.resources;
    repo.repairDevice(lamp.id); repo.repairDevice(lamp.id); repo.load();
    expect(repo.current.profile.resources).toBe(balance - 12);
    expect(repo.current.profile.devices.find(device => device.id === lamp.id)!.health).toBe(60);
  });

  it('has 122 real purchases, scoped effects and the finite maximum repair budget', () => {
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(LENSES.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
    const config = calculateNightConfig(NIGHT_CONFIG, UPGRADES.map(node => node.id));
    expect(config.devices.definitions['repair-lamp']).toMatchObject({ damage: 0, range: 170, health: 60, cost: 48, attackInterval: 6 });
    expect(config.devices.repairLamp).toEqual({ healAmount: 20, charges: 5, incomingDamageMultiplier: .8, emergencyEnabled: true, emergencyMultiplier: 2, emergencyThreshold: .25 });
    expect(config.devices.repairLamp.healAmount * (config.devices.repairLamp.charges + 1)).toBe(120);
    const views = createUpgradeViews(emptySave().profile, NIGHT_CATALOG[0]!.config);
    expect(views.find(node => node.definition.id === 'repair-guard')).toMatchObject({ currentValue: 1, nextValue: .8 });
    expect(views.find(node => node.definition.id === 'repair-emergency')).toMatchObject({ currentValue: 0, nextValue: 1 });
  });
});
