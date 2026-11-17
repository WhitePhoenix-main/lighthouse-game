import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, OwnedDevice, Profile, SaveStore, UpgradeId } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { actualDeviceHealth, battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, rechargeCost, remainingTrapCharges, repairCost, trapChargeCapacity } from '../../src/progression/devices';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { grantFixtureDevices } from '../helpers/devices';

class Store implements SaveStore {
  raw: string | null = null;
  fail: 'before' | 'after' | null = null;
  read() { return this.raw; }
  write(raw: string) {
    if (this.fail === 'before') throw new Error('quota');
    this.raw = raw;
    if (this.fail === 'after') throw new Error('lost reply');
  }
}
const newIds: readonly UpgradeId[] = ['harpoon-damage-2', 'harpoon-speed-2', 'harpoon-slow', 'harpoon-flying',
  'trap-damage-1', 'trap-damage-2', 'trap-radius-1', 'trap-radius-2', 'trap-health', 'trap-armor', 'trap-second-charge'];
const trap = (profile: Profile): OwnedDevice => profile.devices.find(device => device.kind === 'light-trap')!;
function priorSave() {
  const save = emptySave(), profile = save.profile;
  Object.assign(profile, { resources: 12000, completedNights: 6, bossLevel: 3, bossMaterials: 100,
    wonNightIds: NIGHT_CATALOG.map(night => night.id), encountered: ['ghost', 'turtle', 'minotaur', 'bat'],
    purchasedUpgrades: UPGRADES.filter(node => !newIds.includes(node.id)).map(node => node.id),
    unlockedLenses: LENSES.map(lens => lens.id), lensUpgrades: LENS_UPGRADES.slice(0, 27).map(node => node.id), selectedLensId: 'long-range' });
  grantFixtureDevices(profile);
  trap(profile).health = 15.25; trap(profile).position = { x: -90, y: 0 };
  return save;
}
function repository(save = priorSave()) {
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load();
  return { store, repo };
}
function upgrade(repo: SaveRepository) { for (const id of newIds) repo.purchase(id); }
function oldSchema(version: number) {
  const profile: Record<string, unknown> = { resources: 321, completedNights: 0, encountered: [] };
  if (version >= 2) profile.purchasedUpgrades = [];
  if (version >= 3) Object.assign(profile, { wonNightIds: [], legacyEquipment: true });
  if (version >= 4) Object.assign(profile, { bossMaterials: 0, bossLevel: 1, unlockedLenses: ['basic'], lensUpgrades: [], selectedLensId: 'basic' });
  return { version, profile, activeAttempt: { id: `old-${version}`, seed: 32, placementCost: 16,
    ...(version >= 3 ? { nightId: 'first-light' } : {}) }, lastSettled: null };
}
function asV5(save = priorSave()) {
  const value = structuredClone(save) as unknown as { version: number; profile: Profile; activeAttempt: { deviceSnapshot?: DeviceDeployment[] } | null };
  value.version = 5;
  for (const device of value.profile.devices) delete device.trapCharges;
  for (const device of value.activeAttempt?.deviceSnapshot ?? []) delete device.trapCharges;
  return value;
}

describe('sixth expansion charge persistence', () => {
  it.each([1, 2, 3, 4])('migrates v%s and refunds an old rental only once', version => {
    const store = new Store(); store.raw = JSON.stringify(oldSchema(version));
    const repo = new SaveRepository(store); repo.load();
    expect(repo.current.version).toBe(6);
    expect(trap(repo.current.profile)).toMatchObject({ trapCharges: 1, consumed: false });
    expect(repo.current.activeAttempt?.legacyRental).toBe(true);
    repo.settle(`old-${version}`, 'interrupted', 999, ['ghost']);
    repo.settle(`old-${version}`, 'interrupted', 999, ['ghost']); repo.load();
    expect(repo.current.profile.resources).toBe(337);
    expect(repo.current.profile.encountered).toEqual([]);
  });

  it('migrates every old 105 purchase without changing balances, normalized HP or positions', () => {
    const old = asV5(), before = structuredClone(old.profile);
    const next = decodeSave(JSON.stringify(old));
    expect(before.purchasedUpgrades.length + before.lensUpgrades.length + before.unlockedLenses.length - 1).toBe(105);
    expect(next.version).toBe(6);
    expect(next.profile).toEqual({ ...before, devices: before.devices.map(device => device.kind === 'light-trap' ? { ...device, trapCharges: 1 } : device) });
    const store = new Store(); store.raw = JSON.stringify(old);
    const repo = new SaveRepository(store); repo.load(); const raw = store.raw;
    repo.load(); expect(store.raw).toBe(raw); expect(JSON.parse(raw!).version).toBe(6);
  });

  it.each([false, true])('migrates a v5 active snapshot and consumed=%s as exactly one or zero charges', consumed => {
    const save = priorSave(); trap(save.profile).consumed = consumed; trap(save.profile).trapCharges = consumed ? 0 : 1;
    save.activeAttempt = { id: 'v5-active', seed: 2, placementCost: 0, nightId: 'first-light', deviceSnapshot: deviceDeployments(save.profile) };
    const old = asV5(save), next = decodeSave(JSON.stringify(old));
    expect(trap(next.profile).trapCharges).toBe(consumed ? 0 : 1);
    expect(next.activeAttempt?.deviceSnapshot?.[0]?.trapCharges).toBe(consumed ? 0 : 1);
    expect(next.activeAttempt?.deviceSnapshot).toEqual(deviceDeployments(next.profile));
  });

  it('preserves v5 single charges even if its purchase list already contains the capacity node', () => {
    const { repo } = repository(); upgrade(repo);
    expect(decodeSave(JSON.stringify(asV5(repo.current))).profile.devices.find(device => device.kind === 'light-trap')?.trapCharges).toBe(1);
  });

  it('upgrades capacity without refilling existing bodies and fully charges newly purchased bodies', () => {
    const { repo, store } = repository(), initial = repo.current.profile.devices;
    upgrade(repo);
    expect(repo.current.profile.devices).toEqual(initial);
    expect(trapChargeCapacity(repo.current.profile.purchasedUpgrades)).toBe(2);
    expect(rechargeCost(trap(repo.current.profile), repo.current.profile.purchasedUpgrades)).toBe(2);
    const id = repo.current.profile.nextDeviceId;
    repo.purchaseDevice('light-trap', id); repo.purchaseDevice('light-trap', id);
    expect(repo.current.profile.devices.find(device => device.id === id)?.trapCharges).toBe(2);
    const balance = repo.current.profile.resources;
    for (const id of newIds) repo.purchase(id);
    expect(repo.current.profile.resources).toBe(balance);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'quote', seed: 1 }));
    app.openPreparation(); expect(app.view.error).toBeNull();
    const view = app.view.preparation.inventory.find(device => device.kind === 'light-trap')!;
    expect(view.rechargeCost).toBe(2); expect(view.health).toBeCloseTo(15.25 / 30 * 45);
    expect(view.maxHealth).toBe(45); expect(app.view.preparation.canStart).toBe(true);
  });

  it('grants the first newly unlocked trap its full current capacity', () => {
    const save = priorSave(); save.profile.purchasedUpgrades = save.profile.purchasedUpgrades.filter(id => id !== 'unlock-trap');
    save.profile.devices = save.profile.devices.filter(device => device.kind !== 'light-trap');
    const { repo } = repository(save); repo.purchase('unlock-trap');
    expect(trap(repo.current.profile)).toMatchObject({ trapCharges: 1, consumed: false });
    repo.purchase('unlock-trap'); expect(repo.current.profile.devices.filter(device => device.kind === 'light-trap')).toHaveLength(1);
  });

  it.each(['before', 'after'] as const)('recharges a partial body atomically across a %s-write failure', failure => {
    const { repo, store } = repository(); upgrade(repo);
    const device = trap(repo.current.profile), balance = repo.current.profile.resources;
    store.fail = failure;
    if (failure === 'before') {
      expect(() => repo.rechargeDevice(device.id)).toThrow();
      expect(repo.current.profile.resources).toBe(balance); expect(trap(repo.current.profile).trapCharges).toBe(1);
    } else repo.rechargeDevice(device.id);
    store.fail = null; repo.rechargeDevice(device.id); repo.rechargeDevice(device.id); repo.load();
    expect(repo.current.profile.resources).toBe(balance - 2);
    expect(trap(repo.current.profile)).toMatchObject({ trapCharges: 2, consumed: false, health: 15.25 });
  });

  it('quotes 0/2/4 and keeps repairs separate from charges', () => {
    const { repo } = repository(); upgrade(repo);
    const purchases = repo.current.profile.purchasedUpgrades, device = trap(repo.current.profile);
    expect(rechargeCost({ ...device, trapCharges: 2 }, purchases)).toBe(0);
    expect(rechargeCost({ ...device, trapCharges: 1 }, purchases)).toBe(2);
    expect(rechargeCost({ ...device, trapCharges: 0, consumed: true }, purchases)).toBe(4);
    expect(remainingTrapCharges({ kind: 'light-trap', consumed: true })).toBe(0);
    expect(remainingTrapCharges({ kind: 'light-trap', consumed: false })).toBe(1);
    const balance = repo.current.profile.resources, bill = repairCost(device, purchases);
    repo.repairDevice(device.id); repo.repairDevice(device.id);
    expect(trap(repo.current.profile)).toMatchObject({ health: 30, trapCharges: 1 });
    expect(repo.current.profile.resources).toBe(balance - bill);
    repo.rechargeDevice(device.id); expect(trap(repo.current.profile)).toMatchObject({ health: 30, trapCharges: 2 });
  });

  it.each(['victory', 'defeat'] as const)('persists a partial-charge %s, normalizes HP and settles only once', outcome => {
    const { repo } = repository(); upgrade(repo); repo.rechargeDevice(trap(repo.current.profile).id);
    const profile = repo.current.profile, config = calculateNightConfig(NIGHT_CONFIG, profile.purchasedUpgrades, profile.legacyEquipment);
    const snapshot = deviceDeployments(profile), actual = battleDeviceDeployments(profile, config.devices.definitions);
    expect(actual[0]!.health).toBeCloseTo(15.25 / 30 * 45);
    const result = normalizedDeviceResults(actual.map(device => ({ ...device, health: 9, trapCharges: 1 })), snapshot, config.devices.definitions);
    repo.begin({ id: 'partial', seed: 3, placementCost: 0, deviceSnapshot: snapshot });
    repo.settle('partial', outcome, 12, ['ghost'], result); repo.settle('partial', outcome, 12, ['ghost'], result); repo.load();
    expect(trap(repo.current.profile)).toMatchObject({ health: 6, trapCharges: 1, consumed: false });
    expect(repo.current.profile.resources).toBe(profile.resources + 12);
    expect(actualDeviceHealth(trap(repo.current.profile), config.devices.definitions)).toBe(9);
  });

  it.each(['victory', 'defeat'] as const)('carries partial charges through real application %s and retry', outcome => {
    const { repo, store } = repository(); upgrade(repo); repo.rechargeDevice(trap(repo.current.profile).id);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: outcome, seed: 2 }));
    app.openPreparation(); app.start(); expect(app.view.error).toBeNull();
    const device = app.view.battle!.devices.find(item => item.kind === 'light-trap')!;
    expect(device.trapCharges).toBe(2); expect(device.startHealth).toBeCloseTo(15.25 / 30 * 45);
    device.trapCharges = 1; device.health = 9;
    (app.view.battle as BattleState).outcome = outcome;
    store.fail = 'before'; app.advance(0); expect(app.view.result?.saved).toBe(false);
    store.fail = null; app.retrySave(); app.retrySave();
    expect(app.view.result?.saved).toBe(true); expect(app.view.error).toBeNull();
    expect(trap(decodeSave(store.raw!).profile)).toMatchObject({ health: 6, trapCharges: 1, consumed: false });
    expect(app.view.preparation.inventory.find(item => item.kind === 'light-trap')?.rechargeCost).toBe(2);
  });

  it('does not refill an empty trap during repair and charges four to fill both slots', () => {
    const { repo } = repository(); upgrade(repo);
    repo.begin({ id: 'empty', seed: 1, placementCost: 0 });
    const results = deviceDeployments(repo.current.profile).map(device => ({ ...device, health: 0, trapCharges: 0, consumed: true }));
    repo.settle('empty', 'defeat', 0, [], results);
    repo.repairDevice(trap(repo.current.profile).id);
    expect(trap(repo.current.profile)).toMatchObject({ health: 30, trapCharges: 0, consumed: true });
    const balance = repo.current.profile.resources;
    repo.rechargeDevice(trap(repo.current.profile).id); repo.rechargeDevice(trap(repo.current.profile).id);
    expect(repo.current.profile.resources).toBe(balance - 4);
    expect(trap(repo.current.profile)).toMatchObject({ health: 30, trapCharges: 2, consumed: false });
  });

  it('restores exact partial charges and damage after interruption without refunding maintenance', () => {
    const { repo } = repository(); upgrade(repo);
    const before = repo.current;
    repo.begin({ id: 'interrupt', seed: 3, placementCost: 0, lensId: before.profile.selectedLensId }); repo.load();
    repo.settle('interrupt', 'interrupted', 99, ['ghost']); repo.settle('interrupt', 'interrupted', 99, ['ghost']);
    expect(repo.current.profile).toEqual(before.profile);
  });

  it.each([undefined, -1, .5, 3, null, '1', NaN])('rejects invalid v6 charge count %s', count => {
    const { repo } = repository(); upgrade(repo);
    const save = repo.current;
    Object.assign(trap(save.profile), { trapCharges: count });
    expect(() => decodeSave(JSON.stringify(save))).toThrow();
  });

  it('rejects inconsistent consumed flags, charge fields on nontraps and altered snapshots', () => {
    const { repo } = repository(); upgrade(repo);
    for (const [charges, consumed] of [[0, false], [1, true]] as const) {
      const save = repo.current; Object.assign(trap(save.profile), { trapCharges: charges, consumed });
      expect(() => decodeSave(JSON.stringify(save))).toThrow();
    }
    const save = repo.current; save.profile.devices.find(device => device.kind === 'cannon')!.trapCharges = 0;
    expect(() => decodeSave(JSON.stringify(save))).toThrow();
    const wrong = deviceDeployments(repo.current.profile); wrong[0]!.trapCharges = 2;
    expect(() => repo.begin({ id: 'wrong', seed: 1, placementCost: 0, deviceSnapshot: wrong })).toThrow();
    repo.begin({ id: 'right', seed: 1, placementCost: 0 });
    const active = repo.current; active.activeAttempt!.deviceSnapshot![0]!.trapCharges = 2;
    expect(() => decodeSave(JSON.stringify(active))).toThrow();
  });

  it('rejects missing, increasing or inconsistent result counts without modifying the active attempt', () => {
    const { repo } = repository(); upgrade(repo); const snapshot = deviceDeployments(repo.current.profile);
    repo.begin({ id: 'invalid-results', seed: 1, placementCost: 0 }); const before = repo.current;
    for (const patch of [{ trapCharges: undefined }, { trapCharges: 2 }, { trapCharges: 0, consumed: false }, { trapCharges: 1, consumed: true }]) {
      expect(() => repo.settle('invalid-results', 'victory', 4, [], snapshot.map(device => ({ ...device, ...patch })))).toThrow();
      expect(repo.current).toEqual(before);
    }
  });

  it.each(['empty', 'ruined'] as const)('starts with a placed %s trap without replenishing it', condition => {
    const save = priorSave();
    if (condition === 'empty') Object.assign(trap(save.profile), { consumed: true, trapCharges: 0 });
    else trap(save.profile).health = 0;
    const { store } = repository(save);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: condition, seed: 2 }));
    app.openPreparation(); expect(app.view.preparation.canStart).toBe(true); app.start();
    expect(app.view.error).toBeNull(); expect(app.view.screen).toBe('battle');
    const device = app.view.battle!.devices.find(item => item.kind === 'light-trap')!;
    expect(device.trapCharges).toBe(condition === 'empty' ? 0 : 1);
    expect(device.health).toBe(condition === 'ruined' ? 0 : 15.25);
  });

  it('validates actual battle counts before normalization can conceal malformed or refilled results', () => {
    const { repo } = repository(); upgrade(repo);
    const profile = repo.current.profile, definitions = calculateNightConfig(NIGHT_CONFIG, profile.purchasedUpgrades).devices.definitions;
    const snapshot = deviceDeployments(profile), actual = battleDeviceDeployments(profile, definitions);
    for (const patch of [{ trapCharges: undefined }, { trapCharges: 2 }, { trapCharges: -1 }, { trapCharges: 0, consumed: false }])
      expect(() => normalizedDeviceResults(actual.map(device => ({ ...device, ...patch })), snapshot, definitions)).toThrow();
  });

  it.each(['before', 'after'] as const)('makes charge-capacity upgrade and settlement idempotent after a %s-write failure', failure => {
    const { repo, store } = repository();
    for (const id of newIds.filter(id => id !== 'trap-second-charge')) repo.purchase(id);
    const balance = repo.current.profile.resources, cost = UPGRADES.find(node => node.id === 'trap-second-charge')!.cost;
    store.fail = failure;
    if (failure === 'before') expect(() => repo.purchase('trap-second-charge')).toThrow();
    else repo.purchase('trap-second-charge');
    store.fail = null; repo.purchase('trap-second-charge'); repo.purchase('trap-second-charge');
    expect(repo.current.profile.resources).toBe(balance - cost); expect(trap(repo.current.profile).trapCharges).toBe(1);
    repo.begin({ id: 'settlement-write', seed: 3, placementCost: 0 });
    const snapshot = deviceDeployments(repo.current.profile), afterPurchase = repo.current.profile.resources;
    const results = snapshot.map(device => ({ ...device, trapCharges: 0, consumed: true }));
    store.fail = failure;
    if (failure === 'before') expect(() => repo.settle('settlement-write', 'defeat', 7, [], results)).toThrow();
    else repo.settle('settlement-write', 'defeat', 7, [], results);
    store.fail = null; repo.settle('settlement-write', 'defeat', 7, [], results); repo.settle('settlement-write', 'defeat', 7, [], results); repo.load();
    expect(repo.current.profile.resources).toBe(afterPurchase + 7);
    expect(trap(repo.current.profile)).toMatchObject({ trapCharges: 0, consumed: true });
  });
});
