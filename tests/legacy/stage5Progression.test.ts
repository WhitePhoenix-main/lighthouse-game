import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, Profile, SaveStore, UpgradeId } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { DEVICE_RULES } from '../../src/content/devices';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { actualDeviceHealth, battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost } from '../../src/progression/devices';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { createBattle } from '../../src/simulation/battle';
import { updateRepairLamps } from '../../src/simulation/repair';
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
const healthIds: readonly UpgradeId[] = ['barrier-health-1', 'barrier-health-2', 'barrier-health-3', 'generator-health-1', 'generator-health-2', 'generator-health-3'];
function previousProfile(edit?: (profile: Profile) => void) {
  const save = emptySave(), profile = save.profile;
  Object.assign(profile, { resources: 10000, completedNights: 6, bossLevel: 3, bossMaterials: 100,
    wonNightIds: NIGHT_CATALOG.map(night => night.id), encountered: ['ghost', 'turtle', 'minotaur', 'bat'],
    purchasedUpgrades: UPGRADES.slice(0, 53).map(node => node.id), unlockedLenses: LENSES.map(lens => lens.id),
    lensUpgrades: LENS_UPGRADES.slice(0, 27).map(node => node.id), selectedLensId: 'long-range' });
  grantFixtureDevices(profile);
  const barrier = profile.devices.find(device => device.kind === 'barrier')!;
  const generator = profile.devices.find(device => device.kind === 'generator')!;
  barrier.health = 70.35; barrier.position = { x: -90, y: 0 };
  generator.health = 30.2; generator.position = { x: -160, y: 0 };
  profile.devices.find(device => device.kind === 'cannon')!.health = 40.4;
  profile.devices.find(device => device.kind === 'light-trap')!.consumed = true;
  edit?.(profile);
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load();
  return { save, store, repo };
}
function configFor(profile: Profile) { return calculateNightConfig(NIGHT_CONFIG, profile.purchasedUpgrades, profile.legacyEquipment); }
function purchaseHealth(repo: SaveRepository) { for (const id of healthIds) repo.purchase(id); }
function application(store: Store, id = 'upgraded-night') {
  return new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id, seed: 42 }), undefined, NIGHT_CATALOG);
}

describe('fifth expansion normalized device ownership', () => {
  it('loads all prior 87 purchases and fractional bodies without rewriting v5', () => {
    const { save, store, repo } = previousProfile(), raw = store.raw;
    expect(save.profile.purchasedUpgrades.length + save.profile.lensUpgrades.length + save.profile.unlockedLenses.length - 1).toBe(87);
    expect(repo.current).toEqual(save);
    const app = application(store);
    expect(app.view.error).toBeNull(); expect(app.view.profile).toEqual(save.profile); expect(store.raw).toBe(raw);
    const config = configFor(save.profile);
    expect(battleDeviceDeployments(save.profile, config.devices.definitions)).toEqual(deviceDeployments(save.profile));
  });

  it('preserves damage fractions and invoices through all three ranks, including reserve and ruined bodies', () => {
    const { repo } = previousProfile(profile => { profile.devices.find(device => device.kind === 'generator')!.health = 0; });
    repo.purchaseDevice('barrier', repo.current.profile.nextDeviceId);
    const before = repo.current.profile.devices;
    const bills = before.map(device => repairCost(device));
    for (let rank = 1; rank <= 3; rank++) {
      repo.purchase(`barrier-health-${rank}` as UpgradeId); repo.purchase(`generator-health-${rank}` as UpgradeId);
      const profile = repo.current.profile, config = configFor(profile), definitions = config.devices.definitions;
      expect(profile.devices).toEqual(before); expect(profile.devices.map(device => repairCost(device))).toEqual(bills);
      expect(definitions.barrier.health).toBe(140 + rank * 30); expect(definitions.generator.health).toBe(60 + rank * 15);
      const barrier = profile.devices.find(device => device.kind === 'barrier')!;
      expect(actualDeviceHealth(barrier, definitions) / definitions.barrier.health).toBeCloseTo(70.35 / 140, 14);
      expect(actualDeviceHealth(profile.devices.find(device => device.kind === 'generator')!, definitions)).toBe(0);
      expect(actualDeviceHealth(profile.devices.at(-1)!, definitions)).toBe(definitions.barrier.health);
      repo.load();
    }
  });

  it('shows actual HP in preparation while storing normalized HP and a stable repair quote', () => {
    const { repo, store } = previousProfile(); purchaseHealth(repo);
    const app = application(store); app.openPreparation();
    const barrier = app.view.preparation.inventory.find(device => device.kind === 'barrier')!;
    expect(barrier.maxHealth).toBe(230); expect(barrier.health).toBeCloseTo(70.35 / 140 * 230);
    expect(barrier.repairCost).toBe(repairCost(repo.current.profile.devices.find(device => device.id === barrier.id)!));
    expect(app.view.profile.devices.find(device => device.id === barrier.id)!.health).toBe(70.35);
  });

  it('applies the barrier discount once with a floored full-repair cap and leaves other tariffs intact', () => {
    const { repo, store } = previousProfile(profile => {
      profile.devices.find(device => device.kind === 'barrier')!.health = 0;
      profile.devices.find(device => device.kind === 'generator')!.health = 0;
    });
    purchaseHealth(repo); repo.purchase('barrier-repair');
    const profile = repo.current.profile, barrier = profile.devices.find(device => device.kind === 'barrier')!;
    expect(repairCost(barrier)).toBe(3); expect(repairCost(barrier, profile.purchasedUpgrades)).toBe(2);
    expect(repairCost({ ...barrier, health: 70 }, profile.purchasedUpgrades)).toBe(2);
    expect(repairCost({ ...barrier, health: 100 }, profile.purchasedUpgrades)).toBe(1);
    expect(repairCost({ ...barrier, health: 140 }, profile.purchasedUpgrades)).toBe(0);
    const generator = profile.devices.find(device => device.kind === 'generator')!;
    expect(repairCost(generator, profile.purchasedUpgrades)).toBe(7);
    const app = application(store); app.openPreparation();
    expect(app.view.preparation.inventory.find(device => device.id === barrier.id)!.repairCost).toBe(2);
    const balance = profile.resources;
    repo.repairDevice(barrier.id); repo.repairDevice(barrier.id); repo.load();
    expect(repo.current.profile.resources).toBe(balance - 2);
    expect(repo.current.profile.devices.find(device => device.id === barrier.id)!.health).toBe(140);
    expect(actualDeviceHealth(repo.current.profile.devices.find(device => device.id === barrier.id)!, configFor(profile).devices.definitions)).toBe(230);
  });

  it('keeps exact fractional starts and repair thresholds across repeated conversions, and rejects any actual overheal', () => {
    const { repo } = previousProfile(profile => { profile.devices.find(device => device.kind === 'barrier')!.health = 140 * (1 - 1 / 3); });
    purchaseHealth(repo); const profile = repo.current.profile, definitions = configFor(profile).devices.definitions;
    const snapshot = deviceDeployments(profile), actual = battleDeviceDeployments(profile, definitions);
    for (let index = 0; index < 100; index++) {
      expect(normalizedDeviceResults(actual, snapshot, definitions)).toEqual(snapshot);
      expect(repairCost({ ...profile.devices.find(device => device.kind === 'barrier')!, health: normalizedDeviceResults(actual, snapshot, definitions)[0]!.health })).toBe(repairCost(profile.devices.find(device => device.kind === 'barrier')!));
    }
    expect(() => normalizedDeviceResults(actual.map((device, index) => index === 0 ? { ...device, health: device.health + 1e-10 } : device), snapshot, definitions)).toThrow();
    expect(() => normalizedDeviceResults(actual.map(device => ({ ...device, health: NaN })), snapshot, definitions)).toThrow();
  });

  it.each(['victory', 'defeat'] as const)('normalizes the real application result after %s using the frozen attempt config', outcome => {
    const { repo, store } = previousProfile(); purchaseHealth(repo);
    const app = application(store); app.openPreparation(); app.start();
    expect(app.view.error).toBeNull();
    const snapshot = decodeSave(store.raw!).activeAttempt!.deviceSnapshot!;
    expect(snapshot).toEqual(deviceDeployments(repo.current.profile));
    const barrier = app.view.battle!.devices.find(device => device.kind === 'barrier')!;
    expect(barrier.startHealth).toBeCloseTo(70.35 / 140 * 230);
    barrier.health -= 23;
    // The public presentation config cannot redefine the fixed rules of this attempt.
    app.view.config = structuredClone(app.view.config); app.view.config.devices.definitions.barrier.health = 999;
    (app.view.battle as BattleState).outcome = outcome; app.advance(0);
    expect(app.view.error).toBeNull(); expect(app.view.result!.saved).toBe(true);
    expect(app.view.profile.devices.find(device => device.id === barrier.id)!.health).toBeCloseTo(70.35 - 14);
    expect(decodeSave(store.raw!).activeAttempt).toBeNull();
    const raw = store.raw; app.retrySave(); expect(store.raw).toBe(raw);
  });

  it('retains the upgraded attempt-start repair ceiling and never pays away old damage', () => {
    const { repo } = previousProfile(); purchaseHealth(repo);
    const profile = repo.current.profile, config = configFor(profile), snapshot = deviceDeployments(profile);
    const lamp = profile.devices.find(device => device.kind === 'repair-lamp')!;
    lamp.position = { x: -90, y: -70 };
    const state = createBattle(config, 42, undefined, battleDeviceDeployments(profile, config.devices.definitions));
    const barrier = state.devices.find(device => device.kind === 'barrier')!;
    const initial = barrier.startHealth!; barrier.health -= 5;
    updateRepairLamps(state, config);
    expect(barrier.health).toBe(initial); expect(barrier.health).toBeLessThan(config.devices.definitions.barrier.health);
    const result = normalizedDeviceResults(state.devices.filter(device => device.id !== lamp.id), snapshot, config.devices.definitions);
    expect(result).toEqual(snapshot);
  });

  it.each(['before', 'after'] as const)('retries upgraded attempt start, paid repair and result atomically after %s-write failure', failure => {
    const { repo, store } = previousProfile(); purchaseHealth(repo); repo.purchase('barrier-repair');
    const barrier = repo.current.profile.devices.find(device => device.kind === 'barrier')!, balance = repo.current.profile.resources;
    const bill = repairCost(barrier, repo.current.profile.purchasedUpgrades); store.fail = failure;
    if (failure === 'before') expect(() => repo.repairDevice(barrier.id)).toThrow(); else repo.repairDevice(barrier.id);
    store.fail = null; repo.repairDevice(barrier.id); repo.repairDevice(barrier.id); repo.load();
    expect(repo.current.profile.resources).toBe(balance - bill);
    const app = application(store); app.openPreparation(); store.fail = failure; app.start();
    if (failure === 'before') expect(app.view.error).not.toBeNull();
    store.fail = null; app.retrySave(); expect(app.view.screen).toBe('battle'); expect(app.view.error).toBeNull();
    const device = app.view.battle!.devices.find(item => item.id === barrier.id)!; device.health = 115;
    (app.view.battle as BattleState).outcome = 'defeat'; store.fail = failure; app.advance(0);
    store.fail = null; app.retrySave(); app.retrySave();
    expect(app.view.result!.saved).toBe(true); expect(app.view.profile.resources).toBe(balance - bill);
    expect(app.view.profile.devices.find(item => item.id === barrier.id)!.health).toBe(70);
    expect(decodeSave(store.raw!).activeAttempt).toBeNull();
  });

  it.each([false, true])('interrupts an old/new v5 active attempt without changing ownership or refunding purchases (upgraded=%s)', upgraded => {
    const { repo, store } = previousProfile(); if (upgraded) purchaseHealth(repo);
    const before = repo.current.profile;
    repo.begin({ id: 'interrupted-night', seed: 42, placementCost: 0, lensId: before.selectedLensId });
    const app = application(store);
    expect(app.view.error).toBeNull(); expect(app.view.interrupted).toBe(true); expect(app.view.profile).toEqual(before);
    expect(decodeSave(store.raw!).lastSettled).toEqual({ id: 'interrupted-night', outcome: 'interrupted', reward: 0 });
    const again = application(store); expect(again.view.profile).toEqual(before); expect(again.view.interrupted).toBe(false);
  });

  it('keeps snapshot/result validation strict in normalized units', () => {
    const { repo } = previousProfile(); purchaseHealth(repo); const profile = repo.current.profile;
    const actual = battleDeviceDeployments(profile, configFor(profile).devices.definitions);
    expect(() => repo.begin({ id: 'actual-snapshot', seed: 42, placementCost: 0, deviceSnapshot: actual })).toThrow();
    repo.begin({ id: 'normalized-snapshot', seed: 42, placementCost: 0 });
    const snapshot = deviceDeployments(profile);
    expect(() => repo.settle('normalized-snapshot', 'defeat', 0, [], actual)).toThrow();
    expect(() => repo.settle('normalized-snapshot', 'defeat', 0, [], snapshot.map(device => ({ ...device, x: device.x - 1 })))).toThrow();
    expect(() => repo.settle('normalized-snapshot', 'defeat', 0, [], snapshot.map(device => ({ ...device, health: DEVICE_RULES.definitions[device.kind].health + 1 })))).toThrow();
    repo.settle('normalized-snapshot', 'defeat', 0, [], snapshot as DeviceDeployment[]);
    expect(repo.current.profile.devices).toEqual(profile.devices);
  });
});
