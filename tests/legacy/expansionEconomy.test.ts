import { describe, expect, it } from 'vitest';
import type { LensId, NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { SaveRepository } from '../../src/application/saves';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { deviceDeployments, repairCost } from '../../src/progression/devices';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { measureBattle } from '../helpers/balancePolicy';

const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
function repository() {
  const store: SaveStore & { value: string | null } = { value: null,
    read() { return this.value; }, write(value) { this.value = value; } };
  const repo = new SaveRepository(store); repo.load(); return { repo, store };
}
function buy(repo: SaveRepository, ids: readonly UpgradeId[]) {
  for (const id of ids) {
    expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
    repo.purchase(id);
  }
}
const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 }, harpoon: { x: -80, y: 80 } };
function prepare(repo: SaveRepository, id: NightId, lensId: LensId = 'basic') {
  const profile = repo.current.profile;
  const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, profile.legacyEquipment,
    { lensId, upgrades: profile.lensUpgrades, bossLevel: profile.bossLevel });
  repo.savePlacements(profile.devices.flatMap(device => device.kind in positions
    ? [{ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] }] : []), config);
  return config;
}
function repairAll(repo: SaveRepository) {
  const before = repo.current.profile.resources;
  const expected = repo.current.profile.devices.reduce((sum, device) => sum + repairCost(device), 0);
  for (const device of repo.current.profile.devices) repo.repairDevice(device.id);
  expect(before - repo.current.profile.resources).toBe(expected);
  repo.load();
  return expected;
}
function play(repo: SaveRepository, id: NightId, seed: number, serial: string, lensId: LensId = 'basic', stress = false) {
  const config = prepare(repo, id, lensId), profile = repo.current.profile;
  const deployed = deviceDeployments(profile);
  repo.begin({ id: serial, nightId: id, seed, placementCost: 0, lensId,
    ...(id === 'abyss-warden' ? { bossLevel: profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
  const result = measureBattle(config, seed, deployed);
  // Stress route measures affordability after a full destruction bill, separately
  // from the smoke-policy battle measurements below. No resources are granted.
  const reward = stress ? config.victoryReward + config.waves.reduce((sum, wave) =>
    sum + wave.enemies.reduce((total, kind) => total + config.enemies[kind].reward, 0), 0) : result.reward;
  repo.settle(serial, stress ? 'victory' : result.outcome === 'victory' ? 'victory' : 'defeat', reward,
    result.encountered, stress ? deployed.map(device => ({ ...device, health: 0 })) : result.devices);
  const saved = repo.current;
  repo.load(); expect(repo.current).toEqual(saved);
  repo.settle(serial, 'victory', reward, result.encountered, result.devices);
  expect(repo.current).toEqual(saved);
  const repair = repairAll(repo);
  return { night: id, seed, outcome: result.outcome, reward, repair, balance: repo.current.profile.resources,
    materials: repo.current.profile.bossMaterials, health: result.health, seconds: result.seconds };
}

function route(stress: boolean) {
  const { repo } = repository(); const rows = [];
  rows.push(play(repo, 'first-light', 42, 'first'));
  expect(rows[0]!.outcome).toBe('victory');
  buy(repo, ['beam-power-1', 'unlock-cannon']);
  expect(repo.current.profile.resources).toBe(40);
  rows.push(play(repo, 'broken-shore', 42, 'broken', 'basic', stress));
  buy(repo, ['unlock-barrier', 'beam-turn-1', 'cannon-damage-1']);
  rows.push(play(repo, 'winged-tide', 42, 'winged', 'basic', stress));
  buy(repo, ['unlock-harpoon', 'device-slots-3']);
  rows.push(play(repo, 'abyss-warden', 42, 'boss-1', 'basic', stress));
  buy(repo, ['harpoon-damage-1']);
  rows.push(play(repo, 'abyss-warden', 42, 'boss-2', 'basic', stress));
  expect(repo.current.profile.bossMaterials).toBe(5);
  repo.purchaseLens('focused'); repo.purchaseLensUpgrade('focused-power');
  expect(repo.current.profile.bossMaterials).toBe(1);
  rows.push(play(repo, 'far-shore', 42, 'far', 'focused', stress));
  console.table(rows);
  return { repo, rows };
}

describe('first expansion economy and combat characterization', () => {
  it('counts all 87 paid nodes and their total resource/material prices', () => {
    const paidLenses = LENSES.filter(lens => lens.materialCost > 0);
    expect(UPGRADES.length + LENS_UPGRADES.length + paidLenses.length).toBe(122);
    const resources = UPGRADES.reduce((sum, node) => sum + node.cost, 0)
      + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0);
    const materials = paidLenses.reduce((sum, lens) => sum + lens.materialCost, 0)
      + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0);
    console.log('All 122 nodes:', { resources, materials });
    expect(resources).toBe(8945); expect(materials).toBe(59);
    expect(NIGHT_CATALOG.map(definition => definition.config.victoryReward + definition.config.waves.reduce((sum, wave) =>
      sum + wave.enemies.reduce((total, kind) => total + definition.config.enemies[kind].reward, 0), 0)))
      .toEqual([120, 140, 158, 105, 98, 176]);
  });

  it('finances harpoon then focused lens using real purchases and full-destruction repair bills', () => {
    const { repo, rows } = route(true);
    expect(rows.map(row => row.repair)).toEqual([0, 5, 8, 17, 17, 17]);
    expect(rows.map(row => row.balance)).toEqual([120, 175, 190, 131, 147, 246]);
    expect(repo.current.profile.resources).toBe(246);
    expect(repo.current.profile.devices.map(device => device.kind)).toEqual(['cannon', 'barrier', 'harpoon']);
  });

  it('characterizes the same route with actual battles, persisted damage and paid repair', () => {
    const { rows } = route(false);
    expect(rows.every(row => row.outcome === 'victory')).toBe(true);
    expect(rows.map(row => row.balance)).toEqual([120, 180, 203, 161, 194, 310]);
  });

  it('wins winged and far shores with focused+harpoon and compares the identical basic+harpoon control', () => {
    const { repo } = route(false);
    const profile = repo.current.profile;
    const rows = (['winged-tide', 'far-shore'] as const).flatMap(id => [3, 42, 81].flatMap(seed =>
      (['basic', 'focused'] as const).map(lensId => {
        // Both variants use the same legitimately purchased turret improvements,
        // placements and full condition. Only the selected lens changes.
        const config = prepare(repo, id, lensId);
        const result = measureBattle(config, seed, deviceDeployments(repo.current.profile));
        expect(result.outcome, `${id}/${seed}/${lensId}`).toBe('victory');
        const repair = result.devices.reduce((sum, device) => sum + repairCost({ ...device, position: null }), 0);
        return { id, seed, lensId, health: result.health, seconds: result.seconds,
          reward: result.reward, repair, net: result.reward - repair };
      })));
    console.table(rows);
    expect(rows).toHaveLength(12);
    expect(repo.current.profile.resources).toBe(profile.resources);
  });

  it('keeps unchanged v5 profiles free of retroactive money, upgrades and devices', () => {
    const { repo, store } = repository();
    play(repo, 'first-light', 42, 'existing-first');
    buy(repo, ['beam-power-1', 'unlock-cannon']);
    const previous = JSON.parse(store.value!) as Record<string, unknown>;
    expect(previous.version).toBe(6);
    repo.load();
    expect(repo.current).toEqual(previous);
    expect(repo.current.profile.resources).toBe(40);
    expect(repo.current.profile.purchasedUpgrades).toEqual(['beam-power-1', 'unlock-cannon']);
    expect(repo.current.profile.devices.map(device => device.kind)).toEqual(['cannon']);
    expect(repo.current.profile.unlockedLenses).toEqual(['basic']);
  });
});
