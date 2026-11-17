import { describe, expect, it } from 'vitest';
import type { LensId, NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { emptySave, SaveRepository } from '../../src/application/saves';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { deviceDeployments, repairCost } from '../../src/progression/devices';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { updateRepairLamps } from '../../src/simulation/repair';
import { measureBattle } from '../helpers/balancePolicy';

const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 }, generator: { x: -80, y: 80 }, 'repair-lamp': { x: -130, y: 0 } };
function repository() {
  const store: SaveStore & { value: string | null } = { value: null, read() { return this.value; }, write(value) { this.value = value; } };
  const repo = new SaveRepository(store); repo.load();
  expect(repo.current).toEqual(emptySave());
  return repo;
}
function prepare(repo: SaveRepository, id: NightId, lensId: LensId = 'basic') {
  const profile = repo.current.profile;
  const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, false,
    { lensId, upgrades: profile.lensUpgrades, bossLevel: profile.bossLevel });
  const hasLamp = profile.devices.some(device => device.kind === 'repair-lamp');
  const selected = profile.devices.filter(device => device.kind in positions && !(hasLamp && device.kind === 'barrier')).slice(0, config.devices.typeSlots);
  repo.savePlacements(selected.map(device => ({ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] })), config);
  return config;
}
function route() {
  const repo = repository();
  const rows: { id: NightId; reward: number; repair: number; fullRepair: number; balance: number; materials: number; health: number; seconds: number; conservativeBalance: number }[] = [];
  let conservativeBalance = 0;
  const buy = (ids: readonly UpgradeId[]) => {
    for (const id of ids) {
      expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
      const price = UPGRADES.find(node => node.id === id)!.cost;
      conservativeBalance -= price;
      expect(conservativeBalance, `full-repair reserve for ${id}`).toBeGreaterThanOrEqual(0);
      repo.purchase(id);
    }
  };
  const play = (id: NightId, serial: string, lensId: LensId = 'basic') => {
    const config = prepare(repo, id, lensId);
    const deployed = deviceDeployments(repo.current.profile);
    const before = repo.current.profile.resources;
    repo.begin({ id: serial, nightId: id, seed: 42, placementCost: 0, lensId,
      ...(id === 'abyss-warden' ? { bossLevel: repo.current.profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
    const result = measureBattle(config, 42, deployed);
    expect(result.outcome, serial).toBe('victory');
    repo.settle(serial, 'victory', result.reward, result.encountered, result.devices);
    const repair = repo.current.profile.devices.reduce((sum, device) => sum + repairCost(device), 0);
    for (const device of repo.current.profile.devices) repo.repairDevice(device.id);
    expect(repo.current.profile.resources).toBe(before + result.reward - repair);
    // Accounting counterfactual only: retain the measured victory and actual income,
    // reserve the maximum tariff for deployed bodies. Do not synthesize combat results.
    const fullRepair = deployed.reduce((sum, device) => sum + repairCost({ ...device, position: null, health: 0 }), 0);
    conservativeBalance += result.reward - fullRepair;
    expect(conservativeBalance).toBeGreaterThanOrEqual(0);
    const saved = repo.current; repo.load(); expect(repo.current).toEqual(saved);
    rows.push({ id, reward: result.reward, repair, fullRepair, balance: repo.current.profile.resources,
      materials: repo.current.profile.bossMaterials, health: result.health, seconds: result.seconds, conservativeBalance });
  };
  play('first-light', 'first');
  buy(['beam-power-1', 'unlock-cannon']);
  play('broken-shore', 'broken');
  buy(['unlock-barrier', 'unlock-generator', 'cannon-damage-1']);
  play('winged-tide', 'winged');
  buy(['device-slots-3']);
  play('abyss-warden', 'boss-1');
  buy(['unlock-repair-lamp', 'repair-amount-1']);
  play('abyss-warden', 'boss-2');
  expect(repo.current.profile.bossMaterials).toBe(5);
  repo.purchaseLens('long-range');
  repo.purchaseLensUpgrade('long-range-power-1'); conservativeBalance -= 65;
  play('far-shore', 'far', 'long-range');
  repo.purchaseLensUpgrade('long-range-width-1'); conservativeBalance -= 60;
  expect(conservativeBalance).toBeGreaterThanOrEqual(0);
  expect(repo.current.profile.bossMaterials).toBe(0);
  console.table(rows);
  console.log('Repair lamp + long-range route', { finalBalance: repo.current.profile.resources, conservativeBalance });
  return { repo, rows, conservativeBalance };
}

describe('fourth expansion economy from earned resources', () => {
  it('funds repair lamp and long-range through actual sequential victories, including the level-two boss', () => {
    const { repo, rows, conservativeBalance } = route();
    expect(rows.map(row => row.reward)).toEqual([120, 140, 158, 98, 98, 176]);
    expect(rows.map(row => row.fullRepair)).toEqual([0, 5, 8, 15, 24, 24]);
    expect(repo.current.profile.lensUpgrades).toEqual(['long-range-power-1', 'long-range-width-1']);
    expect(repo.current.profile.resources).toBe(790 - 605 - rows.reduce((sum, row) => sum + row.repair, 0));
    expect(conservativeBalance).toBe(109);
  });

  it('characterizes affordable basic versus long-range with identical gear over normal and early calls', () => {
    const { repo } = route();
    const balance = repo.current.profile.resources;
    const rows = (['winged-tide', 'far-shore'] as const).flatMap(id => [3, 42, 81].flatMap(seed =>
      [false, true].flatMap(earlyCalls => (['basic', 'long-range'] as const).map(lensId => {
        const config = prepare(repo, id, lensId);
        const result = measureBattle(config, seed, deviceDeployments(repo.current.profile), { earlyCalls });
        expect(result.outcome).not.toBe('playing');
        const repair = result.devices.reduce((sum, device) => sum + repairCost({ ...device, position: null }), 0);
        return { id, seed, earlyCalls, lensId, outcome: result.outcome, health: result.health,
          seconds: result.seconds, reward: result.reward, repair, net: result.reward - repair };
      }))));
    console.table(rows);
    expect(rows).toHaveLength(24);
    expect(rows.filter(row => !row.earlyCalls).every(row => row.outcome === 'victory')).toBe(true);
    expect(repo.current.profile.resources).toBe(balance);
  });

  it('prices the complete catalogue at 122 nodes, 8945 shards and 59 pearls', () => {
    const unlocks = LENSES.filter(lens => lens.id !== 'basic');
    expect(UPGRADES.length + LENS_UPGRADES.length + unlocks.length).toBe(122);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(unlocks.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
  });
});

describe('synthetic finite repair budgets, separate from the earned-resource route', () => {
  const baseBranch: UpgradeId[] = ['unlock-barrier', 'unlock-generator', 'unlock-repair-lamp'];
  const fullBranch: UpgradeId[] = [...baseBranch, 'repair-amount-1', 'repair-amount-2', 'repair-range', 'repair-charges-1', 'repair-charges-2', 'repair-guard', 'repair-emergency'];

  it('restores only this night damage: a cannon starting at 40 can recover from 10 only to 40 across repeated attempts', () => {
    const config = calculateNightConfig(night('far-shore').config, baseBranch);
    config.waves = [{ id: 'synthetic-repair-damage', enemies: ['bat'], spawnInterval: 1000 }];
    config.enemies.bat.attackDamage = 30;
    config.enemies.bat.speed = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = createBattle(config, 42, undefined, [
        { id: 1, kind: 'cannon', x: -90, y: -60, health: 40, consumed: false },
        { id: 2, kind: 'repair-lamp', x: -130, y: 0 },
      ]);
      const cannon = state.devices[0]!;
      updateRepairLamps(state, config);
      expect(cannon.health).toBe(40);
      expect(state.devices[1]!.repairCharges).toBe(3);
      // Exercise the real enemy contact/attack path while postponing the lamp.
      state.devices[1]!.attackCooldown = 999;
      state.enemies = [{ id: 1, kind: 'bat', x: -116, y: -60, health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 }];
      stepBattle(state, config, []);
      expect(cannon.health).toBe(10);
      expect(state.events.some(event => event.type === 'device-hit' && event.deviceId === cannon.id && event.damage === 30)).toBe(true);
      state.enemies = [];
      state.devices[1]!.attackCooldown = 0;
      for (let tick = 0; tick < 600; tick++) { state.tick = tick; updateRepairLamps(state, config); }
      expect(cannon.health).toBe(40);
      expect(state.devices[1]!.repairCharges).toBe(0);
    }
  });

  it.each([{ full: false, budget: 30 }, { full: true, budget: 120 }])('caps one lamp at $budget repair with full=$full', ({ full, budget }) => {
    const config = calculateNightConfig(night('far-shore').config, full ? fullBranch : baseBranch);
    const state = createBattle(config, 42, undefined, [
      { id: 1, kind: 'cannon', x: -90, y: -60 }, { id: 2, kind: 'repair-lamp', x: -130, y: 0 },
    ]);
    for (let tick = 0; tick < 1800; tick++) {
      // Repeated synthetic incoming hits keep a repair candidate available.
      state.devices[0]!.health = 1; state.tick = tick; updateRepairLamps(state, config);
    }
    const events = state.events.filter(event => event.type === 'device-repaired');
    expect(events.reduce((sum, event) => sum + (event.type === 'device-repaired' ? event.amount : 0), 0)).toBe(budget);
    expect(state.devices[1]!.repairCharges).toBe(0);
    expect(events).toHaveLength(full ? 5 : 3);
  });

  it('never lets two lamps repair each other or consume charges to form a chain', () => {
    const config = calculateNightConfig(night('far-shore').config, fullBranch);
    expect(config.devices.perType['repair-lamp']).toBe(2);
    const state = createBattle(config, 42, undefined, [
      { id: 1, kind: 'repair-lamp', x: -130, y: 0 }, { id: 2, kind: 'repair-lamp', x: -80, y: 80 },
    ]);
    for (const lamp of state.devices) lamp.health = 1;
    for (let tick = 0; tick < 1800; tick++) { state.tick = tick; updateRepairLamps(state, config); }
    expect(state.devices.map(lamp => lamp.health)).toEqual([1, 1]);
    expect(state.devices.map(lamp => lamp.repairCharges)).toEqual([5, 5]);
    expect(state.events.filter(event => event.type === 'device-repaired')).toEqual([]);
  });
});
