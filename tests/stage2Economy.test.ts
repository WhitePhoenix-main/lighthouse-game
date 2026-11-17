import { describe, expect, it } from 'vitest';
import type { LensId, NightId, SaveStore, UpgradeId } from '../src/contracts';
import { emptySave, SaveRepository } from '../src/application/saves';
import { NIGHT_CATALOG } from '../src/content/nights';
import { deviceDeployments, repairCost } from '../src/progression/devices';
import { calculateNightConfig, getUpgradeAvailability } from '../src/progression/upgrades';
import { measureBattle } from './helpers/balancePolicy';

const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 }, mortar: { x: -80, y: 80 } };
const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
function repository() {
  const store: SaveStore & { value: string | null } = { value: null,
    read() { return this.value; }, write(value) { this.value = value; } };
  const repo = new SaveRepository(store); repo.load();
  expect(repo.current).toEqual(emptySave());
  return { repo, store };
}
function buy(repo: SaveRepository, ids: readonly UpgradeId[]) {
  for (const id of ids) {
    expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
    repo.purchase(id);
  }
}
function prepare(repo: SaveRepository, id: NightId, lensId: LensId = 'basic') {
  const profile = repo.current.profile;
  const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, profile.legacyEquipment,
    { lensId, upgrades: profile.lensUpgrades, bossLevel: profile.bossLevel });
  repo.savePlacements(profile.devices.flatMap(device => device.kind in positions
    ? [{ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] }] : []), config);
  return config;
}
function play(repo: SaveRepository, id: NightId, serial: string, lensId: LensId, stress: boolean) {
  const config = prepare(repo, id, lensId), deployed = deviceDeployments(repo.current.profile);
  const balanceBefore = repo.current.profile.resources;
  repo.begin({ id: serial, nightId: id, seed: 42, placementCost: 0, lensId,
    ...(id === 'abyss-warden' ? { bossLevel: repo.current.profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
  const result = measureBattle(config, 42, deployed);
  expect(result.outcome, serial).toBe('victory');
  // A separate pessimistic accounting scenario charges full destruction after the
  // measured victory. It uses the actual earned reward and grants no currency.
  const conditions = stress ? result.devices.map(device => ({ ...device, health: 0 })) : result.devices;
  repo.settle(serial, 'victory', result.reward, result.encountered, conditions);
  const settled = repo.current;
  repo.load(); expect(repo.current).toEqual(settled);
  repo.settle(serial, 'victory', result.reward, result.encountered, conditions);
  expect(repo.current).toEqual(settled);
  const repair = repo.current.profile.devices.reduce((sum, device) => sum + repairCost(device), 0);
  for (const device of repo.current.profile.devices) repo.repairDevice(device.id);
  expect(repo.current.profile.resources).toBe(balanceBefore + result.reward - repair);
  const repaired = repo.current; repo.load(); expect(repo.current).toEqual(repaired);
  return { id, reward: result.reward, repair, balance: repo.current.profile.resources,
    materials: repo.current.profile.bossMaterials, health: result.health, seconds: result.seconds };
}
function route(stress: boolean) {
  const { repo, store } = repository(), rows = [];
  rows.push(play(repo, 'first-light', 'first', 'basic', false));
  buy(repo, ['beam-power-1', 'unlock-cannon']);
  expect(repo.current.profile.resources).toBe(40);
  rows.push(play(repo, 'broken-shore', 'broken', 'basic', stress));
  buy(repo, ['unlock-barrier', 'beam-turn-1', 'cannon-damage-1']);
  rows.push(play(repo, 'winged-tide', 'winged', 'basic', stress));
  buy(repo, ['unlock-mortar', 'device-slots-3']);
  rows.push(play(repo, 'abyss-warden', 'boss-1', 'basic', stress));
  buy(repo, ['mortar-radius-1']);
  rows.push(play(repo, 'abyss-warden', 'boss-2', 'basic', stress));
  expect(repo.current.profile.bossMaterials).toBe(5);
  repo.purchaseLens('smoldering'); repo.purchaseLensUpgrade('smoldering-power');
  expect(repo.current.profile.bossMaterials).toBe(1);
  rows.push(play(repo, 'far-shore', 'far', 'smoldering', stress));
  const beforeBurn = repo.current.profile.resources;
  repo.purchaseLensUpgrade('smoldering-burn-1');
  expect(repo.current.profile.resources).toBe(beforeBurn - 75);
  expect(repo.current.profile.bossMaterials).toBe(0);
  console.table(rows);
  console.log('Mortar + smoldering accounting', { stress, beforeBurn, afterBurn: repo.current.profile.resources });
  return { repo, store, rows, beforeBurn };
}

describe('second expansion economy and affordable combat characterization', () => {
  it('finances mortar and smoldering from an empty profile with actual victories and paid repairs', () => {
    const { repo, rows, beforeBurn } = route(false);
    expect(repo.current.profile.devices.map(device => device.kind)).toEqual(['cannon', 'barrier', 'mortar']);
    expect(repo.current.profile.lensUpgrades).toEqual(['smoldering-power', 'smoldering-burn-1']);
    expect(beforeBurn).toBe(275 - rows.reduce((sum, row) => sum + row.repair, 0));
    expect(repo.current.profile.resources).toBeGreaterThanOrEqual(0);
  });

  it('also affords the route after charging every deployed device a full destruction repair bill', () => {
    const { repo, rows, beforeBurn } = route(true);
    expect(rows.map(row => row.repair)).toEqual([0, 5, 8, 20, 20, 20]);
    expect(rows.reduce((sum, row) => sum + row.repair, 0)).toBe(73);
    expect(beforeBurn).toBe(202);
    expect(repo.current.profile.resources).toBe(127);
  });

  it('compares affordable basic and smoldering equipment across seeds and normal/early waves', () => {
    const { repo } = route(false);
    const before = repo.current;
    const rows = (['winged-tide', 'far-shore'] as const).flatMap(id => [3, 42, 81].flatMap(seed =>
      [false, true].flatMap(earlyCalls => (['basic', 'smoldering'] as const).map(lensId => {
        const config = prepare(repo, id, lensId);
        const result = measureBattle(config, seed, deviceDeployments(repo.current.profile), { earlyCalls });
        expect(result.outcome, `${id}/${seed}/${lensId}/${earlyCalls}`).not.toBe('playing');
        const repair = result.devices.reduce((sum, device) => sum + repairCost({ ...device, position: null }), 0);
        return { id, seed, lensId, earlyCalls, outcome: result.outcome, health: result.health,
          seconds: result.seconds, reward: result.reward, repair, net: result.reward - repair };
      }))));
    console.table(rows);
    expect(rows).toHaveLength(24);
    expect(rows.filter(row => !row.earlyCalls).every(row => row.outcome === 'victory')).toBe(true);
    // Characterize early calls rather than demanding universal lens superiority.
    expect(repo.current.profile.resources).toBe(before.profile.resources);
    expect(repo.current.profile.bossMaterials).toBe(before.profile.bossMaterials);
    expect(repo.current.profile.devices).toEqual(before.profile.devices);
  });

  it('loads an existing v5 profile without retroactive grants or duplicate settlement rewards', () => {
    const { repo, store } = repository();
    play(repo, 'first-light', 'existing-first', 'basic', false);
    buy(repo, ['beam-power-1', 'unlock-cannon']);
    const prior = JSON.parse(store.value!);
    repo.load(); expect(repo.current).toEqual(prior);
    repo.settle('existing-first', 'victory', 120, []);
    expect(repo.current).toEqual(prior);
    expect(repo.current.profile.resources).toBe(40);
    expect(repo.current.profile.purchasedUpgrades).toEqual(['beam-power-1', 'unlock-cannon']);
    expect(repo.current.profile.devices.map(device => device.kind)).toEqual(['cannon']);
    expect(repo.current.profile.unlockedLenses).toEqual(['basic']);
    expect(repo.current.profile.lensUpgrades).toEqual([]);
  });
});
