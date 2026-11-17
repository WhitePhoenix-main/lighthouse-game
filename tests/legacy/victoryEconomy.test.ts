import { describe, expect, it } from 'vitest';
import type { DeviceDeployment, NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { SaveRepository } from '../../src/application/saves';
import { NIGHT_CATALOG, validateNightDefinitions } from '../../src/content/nights';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { deviceDeployments, repairCost } from '../../src/progression/devices';
import { measureBattle } from '../helpers/balancePolicy';
import { checkDraft } from '../../src/application/placement';

const budgets = [
  ['first-light', 48, 72, 120], ['broken-shore', 56, 84, 140],
  ['winged-tide', 62, 96, 158], ['rescue-trial', 41, 64, 105],
  ['abyss-warden', 32, 66, 98], ['far-shore', 68, 108, 176],
] as const;
const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
const killBudget = (id: NightId) => night(id).config.waves.reduce((sum, wave) =>
  sum + wave.enemies.reduce((value, kind) => value + night(id).config.enemies[kind].reward, 0), 0);
function repository() {
  const store: SaveStore & { value: string | null } = { value: null,
    read() { return this.value; }, write(value) { this.value = value; } };
  const repo = new SaveRepository(store); repo.load(); return repo;
}
function purchase(repo: SaveRepository, ids: readonly UpgradeId[]) {
  for (const id of ids) {
    expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
    repo.purchase(id);
    expect(repo.current.profile.resources).toBeGreaterThanOrEqual(0);
  }
}
function begin(repo: SaveRepository, id: string, nightId: NightId) {
  repo.begin({ id, nightId, seed: 42, placementCost: 0,
    ...(nightId === 'abyss-warden' ? { bossLevel: 1, bossReward: 2 } : {}) });
}
function firstVictory(repo: SaveRepository) {
  const result = measureBattle(night('first-light').config, 42);
  expect(result.outcome).toBe('victory');
  begin(repo, 'first', 'first-light'); repo.settle('first', 'victory', result.reward, result.encountered);
}
function placeOwned(repo: SaveRepository, id: NightId) {
  const config = calculateNightConfig(night(id).config, repo.current.profile.purchasedUpgrades);
  const positions = [{ x: -90, y: -60 }, { x: -220, y: 0 }, { x: -40, y: 80 }, { x: -180, y: 100 }];
  repo.savePlacements(repo.current.profile.devices.slice(0, Math.min(4, config.devices.typeSlots)).map((device, index) => ({
    id: device.id, kind: device.kind, ...positions[index]!,
  })), config);
  return config;
}
function repairAll(repo: SaveRepository): number {
  const before = repo.current.profile.resources;
  for (const device of repo.current.profile.devices) repo.repairDevice(device.id);
  return before - repo.current.profile.resources;
}

describe('provisional six-night economy', () => {
  it.each(budgets)('%s separates kill and larger repeatable victory budgets', (id, kills, victory, total) => {
    expect(killBudget(id)).toBe(kills);
    expect(night(id).config.victoryReward).toBe(victory);
    expect(victory).toBeGreaterThan(kills);
    expect(kills + victory).toBe(total);
    // Existing timer formula, no new cap: even the upper bound of immediate calls fits 15%.
    const config = night(id).config;
    const maxEarly = (config.waves.length - 1) * Math.floor(config.waveInterval * config.earlyBonusPerSecond);
    expect(maxEarly).toBeLessThanOrEqual(total * .15);
  });

  it.each([
    { build: ['beam-power-1', 'beam-width-1'] as UpgradeId[], remaining: 30, objects: 0 },
    { build: ['beam-power-1', 'unlock-cannon', 'unlock-barrier'] as UpgradeId[], remaining: 10, objects: 2 },
  ])('funds the $build opening directly from the first victory', ({ build, remaining, objects }) => {
    const repo = repository(); firstVictory(repo);
    expect(repo.current.profile.resources).toBe(120);
    purchase(repo, build);
    expect(repo.current.profile.resources).toBe(remaining);
    expect(repo.current.profile.devices).toHaveLength(objects);
    if (objects) {
      const bill = repo.current.profile.devices.reduce((sum, device) => sum + repairCost({ ...device, health: 0 }), 0);
      expect(bill).toBe(8);
      expect(remaining).toBeGreaterThanOrEqual(bill);
    }
  });

  it('pays for a sequential route and charged repair operations without retroactive grants', () => {
    const repo = repository(); firstVictory(repo);
    purchase(repo, ['beam-power-1', 'unlock-cannon', 'unlock-barrier']);
    const route: { id: NightId; next: UpgradeId[]; repair: number }[] = [
      { id: 'broken-shore', next: ['beam-width-1', 'unlock-generator'], repair: 8 },
      { id: 'winged-tide', next: ['device-slots-3', 'unlock-trap'], repair: 8 },
      { id: 'abyss-warden', next: ['device-slots-4'], repair: 15 },
      { id: 'far-shore', next: ['beam-power-2', 'beam-width-2'], repair: 16 },
    ];
    for (const [index, row] of route.entries()) {
      // Before the fourth type slot is bought, keep the trap in reserve.
      const config = placeOwned(repo, row.id);
      if (row.id === 'abyss-warden') repo.savePlacements(deviceDeployments(repo.current.profile).slice(0, 3), config);
      const start = deviceDeployments(repo.current.profile);
      begin(repo, `route-${index}`, row.id);
      // Economic stress case: deployed bodies destroyed, or 75% damaged for all four types.
      // This models repair affordability, not performance of the combat smoke policy.
      repo.settle(`route-${index}`, 'victory', killBudget(row.id) + config.victoryReward, [],
        start.map(device => ({ ...device, health: row.id === 'far-shore' ? device.health * .25 : 0,
          consumed: row.id === 'far-shore' && device.kind === 'light-trap' })));
      expect(repairAll(repo)).toBe(row.repair);
      if (row.id === 'far-shore') {
        const trap = repo.current.profile.devices.find(device => device.kind === 'light-trap')!;
        expect(trap.consumed).toBe(true);
        const before = repo.current.profile.resources;
        repo.rechargeDevice(trap.id);
        expect(before - repo.current.profile.resources).toBe(2);
        expect(repo.current.profile.devices.find(device => device.id === trap.id)!.consumed).toBe(false);
      }
      purchase(repo, row.next);
      expect(repo.current.profile.resources).toBeGreaterThanOrEqual(8);
      repo.load();
    }
    expect(repo.current.profile.wonNightIds).toEqual(['first-light', 'broken-shore', 'winged-tide', 'abyss-warden', 'far-shore']);
    expect(repo.current.profile.resources).toBe(48);
  });

  it('retains partial kill income after five defeats and allows a free restart at zero without mandatory repairs', () => {
    const repo = repository(); firstVictory(repo);
    purchase(repo, ['beam-power-1', 'unlock-cannon', 'unlock-barrier']);
    placeOwned(repo, 'broken-shore');
    const partialKills = ['ghost', 'ghost', 'ghost', 'ghost', 'turtle'] as const;
    const partialReward = partialKills.reduce((sum, kind) => sum + night('broken-shore').config.enemies[kind].reward, 0);
    expect(partialReward).toBe(6);
    for (let index = 0; index < 5; index++) {
      begin(repo, `defeat-${index}`, 'broken-shore');
      const broken: DeviceDeployment[] = deviceDeployments(repo.current.profile).map(device => ({ ...device, health: 0 }));
      const before = repo.current.profile.resources;
      repo.settle(`defeat-${index}`, 'defeat', partialReward, partialKills, broken);
      expect(repo.current.profile.resources).toBe(before + partialReward);
      expect(repairAll(repo)).toBe(8);
      expect(repo.current.profile.resources).toBe(8 - index * 2);
    }
    expect(repo.current.profile.resources).toBe(0);
    begin(repo, 'zero-loss', 'broken-shore');
    repo.settle('zero-loss', 'defeat', 0, [], deviceDeployments(repo.current.profile).map(device => ({ ...device, health: 0 })));
    expect(() => repo.repairDevice(1)).toThrow(/ресурсов/);
    expect(repo.current.profile.resources).toBe(0);
    repo.savePlacements([], calculateNightConfig(night('broken-shore').config, repo.current.profile.purchasedUpgrades));
    begin(repo, 'free-zero', 'broken-shore');
    expect(repo.current.profile.resources).toBe(0);
    expect(repo.current.profile.devices.every(device => device.health === 0)).toBe(true);
    repo.settle('free-zero', 'defeat', 0, [], []);
    expect(repo.current.profile.resources).toBe(0);
    expect(repo.current.profile.wonNightIds).toEqual(['first-light']);
  });

  it('keeps the latest shore ahead of early repeats and the short boss after repair reserves', () => {
    for (const seed of [3, 42, 81]) {
      const rows = NIGHT_CATALOG.map(definition => {
        const upgrades: UpgradeId[] = definition.id === 'first-light' ? [] : ['beam-power-1', 'beam-width-1'];
        const result = measureBattle(calculateNightConfig(definition.config, upgrades), seed);
        expect(result.outcome).toBe('victory');
        return { id: definition.id, ...result,
          // A reserve is a budget allowance, distinct from observed damage in this smoke run.
          netPerMinute: (result.reward - (definition.id === 'first-light' ? 0 : 8)) / result.seconds * 60 };
      });
      const latest = rows.find(row => row.id === 'far-shore')!;
      for (const row of rows.filter(row => row.id !== 'far-shore')) expect(latest.netPerMinute).toBeGreaterThan(row.netPerMinute);
      expect(rows.find(row => row.id === 'abyss-warden')!.netPerMinute).toBeLessThan(rows.find(row => row.id === 'winged-tide')!.netPerMinute);
      expect(latest.netPerMinute).toBeGreaterThan(60);
      expect(latest.netPerMinute).toBeLessThan(80);
      const netWithLargerReserve = (row: typeof latest) => (row.reward - 16) / row.seconds * 60;
      for (const row of rows.filter(row => row.id !== 'far-shore')) {
        expect(netWithLargerReserve(latest)).toBeGreaterThan(row.id === 'first-light' ? row.rewardPerMinute : netWithLargerReserve(row));
      }
    }
  });

  it.each([-1, .5, Infinity, NaN])('rejects invalid configured victory reward %s', value => {
    const catalog = structuredClone(NIGHT_CATALOG); catalog[0]!.config.victoryReward = value;
    expect(() => validateNightDefinitions(catalog)).toThrow();
  });

  it('keeps later farming ahead with identical complete beam builds and immediate wave calls', () => {
    const beam: UpgradeId[] = ['beam-power-1', 'beam-power-2', 'beam-width-1', 'beam-width-2', 'beam-range-1', 'beam-range-2', 'paired-light'];
    const rows = [false, true].flatMap(equipment => [false, true].flatMap(earlyCalls => [3, 42, 81].flatMap(seed =>
      (['first-light', 'winged-tide', 'far-shore'] as const).map(id => {
        const upgrades: UpgradeId[] = equipment ? [...beam, 'unlock-cannon', 'unlock-barrier', 'unlock-generator'] : beam;
        const config = calculateNightConfig(night(id).config, upgrades);
        const placements: DeviceDeployment[] = equipment ? [
          { id: 1, kind: 'cannon', x: -70, y: -60, health: config.devices.definitions.cannon.health, consumed: false },
          { id: 2, kind: 'cannon', x: -70, y: 60, health: config.devices.definitions.cannon.health, consumed: false },
          { id: 3, kind: 'generator', x: -20, y: -130, health: config.devices.definitions.generator.health, consumed: false },
          { id: 4, kind: 'generator', x: -20, y: 130, health: config.devices.definitions.generator.health, consumed: false },
        ] : [];
        expect(checkDraft(config, placements).valid).toBe(true);
        const result = measureBattle(config, seed, placements, { earlyCalls });
        expect(result.outcome).toBe('victory');
        expect(result.victoryReward).toBe(result.outcome === 'victory' ? config.victoryReward : 0);
        expect(result.bonus).toBeLessThanOrEqual((config.waves.length - 1) * Math.floor(config.waveInterval * config.earlyBonusPerSecond));
        return { build: equipment ? 'beam+2cannon+2generator' : 'beam', earlyCalls, seed, id,
          outcome: result.outcome, seconds: result.seconds, reward: result.reward, bonus: result.bonus,
          netPerMinute: (result.reward - 16) / result.seconds * 60 };
      }))));
    // Characterization report: no assumption that this deterministic policy represents optimal human play.
    console.table(rows);
    expect(rows).toHaveLength(36);
    for (let index = 0; index < rows.length; index += 3) {
      const [first, winged, far] = rows.slice(index, index + 3);
      expect(far!.netPerMinute).toBeGreaterThan(winged!.netPerMinute);
      expect(winged!.netPerMinute).toBeGreaterThan(first!.netPerMinute);
    }
  });
});
