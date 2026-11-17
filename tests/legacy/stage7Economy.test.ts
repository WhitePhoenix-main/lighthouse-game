import { describe, expect, it } from 'vitest';
import type { EnemyKind, LensId, LensUpgradeId, NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { SaveRepository, emptySave } from '../../src/application/saves';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { getLensUpgradeAvailability } from '../../src/progression/lenses';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost } from '../../src/progression/devices';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { selectBeamTargets } from '../../src/simulation/beam';
import { measureBattle } from '../helpers/balancePolicy';

const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
const added = LENS_UPGRADES.slice(27);
const branches = ['expanded', 'slowing', 'armor-breaker'] as const;
const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 }, generator: { x: -80, y: 80 } };
function repository(raw: string | null = null) {
  const store: SaveStore & { raw: string | null } = { raw, read() { return this.raw; }, write(value) { this.raw = value; } };
  const repo = new SaveRepository(store); repo.load(); return { repo, store };
}

describe('stage 7 lens economy and specialization', () => {
  it('adds six purchases while preserving the previous aggregate prices', () => {
    expect(added).toHaveLength(6);
    expect(added.reduce((sum, node) => sum + node.cost, 0)).toBe(500);
    expect(added.reduce((sum, node) => sum + node.materialCost, 0)).toBe(9);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(LENSES.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.slice(0, 27).reduce((sum, node) => sum + node.cost, 0)).toBe(8445);
    for (const lensId of branches) expect(LENS_UPGRADES.filter(node => node.lensId === lensId)).toHaveLength(4);
  });

  it('buys each complete branch separately from the same genuinely earned baseline, including repair reserves and pearl gating', () => {
    const { repo, store } = repository();
    expect(repo.current).toEqual(emptySave());
    let reserve = 0, serial = 0;
    const rows: object[] = [];
    const play = (id: NightId) => {
      const profile = repo.current.profile;
      const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, false,
        { lensId: 'basic', upgrades: [], bossLevel: profile.bossLevel });
      repo.savePlacements(profile.devices.filter(device => device.kind in positions).slice(0, config.devices.typeSlots)
        .map(device => ({ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] })), config);
      const snapshot = deviceDeployments(repo.current.profile), attemptId = `stage7-income-${++serial}`;
      repo.begin({ id: attemptId, seed: 42, placementCost: 0, nightId: id, lensId: 'basic',
        ...(id === 'abyss-warden' ? { bossLevel: profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
      const result = measureBattle(config, 42, battleDeviceDeployments(repo.current.profile, config.devices.definitions));
      expect(result.outcome, `${id}/${serial}`).toBe('victory');
      repo.settle(attemptId, 'victory', result.reward, result.encountered,
        normalizedDeviceResults(result.devices, snapshot, config.devices.definitions));
      const paid = repo.current.profile;
      const repairs = paid.devices.reduce((sum, device) => sum + repairCost(device, paid.purchasedUpgrades), 0);
      const fullRepairReserve = snapshot.reduce((sum, device) => sum + repairCost({ ...device, health: 0, position: null }, paid.purchasedUpgrades), 0);
      for (const device of paid.devices) repo.repairDevice(device.id);
      reserve += result.reward - fullRepairReserve;
      expect(repo.current.profile.resources).toBe(paid.resources - repairs);
      expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserve);
      const saved = repo.current; repo.load(); expect(repo.current).toEqual(saved);
      repo.settle(attemptId, 'victory', result.reward, result.encountered);
      expect(repo.current).toEqual(saved);
      rows.push({ id, level: config.boss?.level, reward: result.reward, repairs, fullRepairReserve,
        reserve, balance: saved.profile.resources, pearls: saved.profile.bossMaterials, health: result.health, seconds: result.seconds });
    };
    const buy = (...ids: UpgradeId[]) => {
      for (const id of ids) {
        expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
        reserve -= UPGRADES.find(node => node.id === id)!.cost;
        expect(reserve, `repair reserve before ${id}`).toBeGreaterThanOrEqual(0);
        repo.purchase(id);
      }
    };
    play('first-light'); buy('beam-power-1', 'unlock-cannon');
    play('broken-shore'); buy('unlock-barrier', 'unlock-generator', 'cannon-damage-1');
    play('winged-tide'); buy('device-slots-3', 'barrier-health-1');
    play('abyss-warden'); buy('cannon-damage-2');
    play('abyss-warden');
    expect(repo.current.profile.bossMaterials).toBe(5);
    play('far-shore'); // Shards can be farmed without earning the pearls that gate the next lens node.
    // Five earned pearls already block these purchases despite sufficient farmable shards.
    for (const lensId of branches) {
      const probe = repository(store.raw).repo;
      probe.purchaseLens(lensId);
      const nodes = LENS_UPGRADES.filter(node => node.lensId === lensId);
      const blocked = nodes.find(node => {
        if (probe.current.profile.bossMaterials < node.materialCost) return true;
        probe.purchaseLensUpgrade(node.id); return false;
      })!;
      expect(probe.current.profile.resources).toBeGreaterThanOrEqual(blocked.cost);
      expect(getLensUpgradeAvailability(probe.current.profile, blocked.id).status).toBe('insufficient');
    }
    play('abyss-warden');
    expect(repo.current.profile.bossMaterials).toBe(9);
    const maximumBranchPrice = Math.max(...branches.map(id => LENS_UPGRADES.filter(node => node.lensId === id).reduce((sum, node) => sum + node.cost, 0)));
    while (reserve < maximumBranchPrice) { expect(serial).toBeLessThan(10); play('far-shore'); }
    const baseline = repo.current, baselineRaw = store.raw;
    const purchases = branches.map(lensId => {
      // These are alternatives cloned from an earned save, never cumulative purchases or a granted-resource fixture.
      const alternative = repository(baselineRaw).repo;
      const nodes = LENS_UPGRADES.filter(node => node.lensId === lensId);
      const cost = nodes.reduce((sum, node) => sum + node.cost, 0);
      const pearls = LENSES.find(lens => lens.id === lensId)!.materialCost + nodes.reduce((sum, node) => sum + node.materialCost, 0);
      alternative.purchaseLens(lensId);
      for (const node of nodes) {
        expect(getLensUpgradeAvailability(alternative.current.profile, node.id).status).toBe('available');
        alternative.purchaseLensUpgrade(node.id);
      }
      expect(alternative.current.profile.resources).toBe(baseline.profile.resources - cost);
      expect(alternative.current.profile.bossMaterials).toBe(9 - pearls);
      expect(reserve - cost).toBeGreaterThanOrEqual(0);
      const saved = alternative.current; alternative.load(); expect(alternative.current).toEqual(saved);
      return { lensId, victories: serial, cost, pearls, balance: saved.profile.resources, pearlsLeft: saved.profile.bossMaterials, conservativeReserve: reserve - cost };
    });
    console.table(rows); console.table(purchases);
  });

  it('measures old and full branches against basic and focused with identical general upgrades in real beam simulation', () => {
    const general: UpgradeId[] = ['beam-power-1'];
    const loadouts: { lensId: LensId; label: string; upgrades: LensUpgradeId[] }[] = branches.flatMap(lensId => {
      const nodes = LENS_UPGRADES.filter(node => node.lensId === lensId);
      return [{ lensId, label: `${lensId}/old`, upgrades: nodes.slice(0, 2).map(node => node.id) },
        { lensId, label: `${lensId}/full`, upgrades: nodes.map(node => node.id) }];
    });
    loadouts.push({ lensId: 'basic', label: 'basic/full', upgrades: LENS_UPGRADES.filter(node => node.lensId === 'basic').map(node => node.id) },
      { lensId: 'focused', label: 'focused/full', upgrades: LENS_UPGRADES.filter(node => node.lensId === 'focused').map(node => node.id) });
    const measure = (loadout: typeof loadouts[number], kind: EnemyKind, count: number) => {
      const config = calculateNightConfig(night('first-light').config, general, false, loadout);
      // Synthetic stationary targets isolate damage, armor, target limits and focus; this is not a human-play or affordability claim.
      config.waves = [{ id: 'stage7-isolated', enemies: Array<EnemyKind>(count).fill(kind), spawnInterval: 100 }];
      for (const definition of Object.values(config.enemies)) definition.speed = 0;
      const state = createBattle(config, 42);
      state.waves[0]!.spawned = count;
      state.beamAngle = 0; state.desiredBeamAngle = 0;
      state.enemies = Array.from({ length: count }, (_, index) => {
        const angle = count === 1 ? 0 : -.24 + index * .16;
        return { id: index + 1, kind, x: 180 * Math.cos(angle), y: 180 * Math.sin(angle),
          health: config.enemies[kind].health, armor: config.enemies[kind].armor, waveIndex: 0, attackCooldown: 0 };
      });
      for (let tick = 0; tick < 3600 && state.enemies.length; tick++) {
        const target = state.enemies[0]!;
        // Hold the group center while it selects targets, then retarget remaining victims.
        const angle = selectBeamTargets(state.enemies, config, 0).lit.length ? 0 : Math.atan2(target.y, target.x);
        stepBattle(state, config, [{ type: 'aim', angle }]);
      }
      expect(state.enemies).toHaveLength(0);
      const nodes = loadout.upgrades.map(id => LENS_UPGRADES.find(node => node.id === id)!);
      return { label: loadout.label, scenario: count === 1 ? kind : `${count} ${kind}`, seconds: state.elapsed,
        dps: config.beam.damagePerSecond, targets: config.beam.maxTargets,
        cost: nodes.reduce((sum, node) => sum + node.cost, 0),
        pearls: LENSES.find(lens => lens.id === loadout.lensId)!.materialCost + nodes.reduce((sum, node) => sum + node.materialCost, 0) };
    };
    const rows = loadouts.flatMap(loadout => [measure(loadout, 'turtle', 1), measure(loadout, 'ghost', 1), measure(loadout, 'ghost', 4)]);
    const time = (label: string, scenario: string) => rows.find(row => row.label === label && row.scenario === scenario)!.seconds;
    for (const lensId of branches) for (const scenario of ['turtle', 'ghost', '4 ghost'])
      expect(time(`${lensId}/full`, scenario)).toBeLessThanOrEqual(time(`${lensId}/old`, scenario));
    expect(time('armor-breaker/full', 'turtle')).toBeLessThan(time('basic/full', 'turtle'));
    expect(time('expanded/full', '4 ghost')).toBeLessThan(time('armor-breaker/full', '4 ghost'));
    expect(time('expanded/full', '4 ghost')).toBeLessThan(time('basic/full', '4 ghost'));
    expect(time('focused/full', 'ghost')).toBeLessThan(time('armor-breaker/full', 'ghost'));
    console.table(rows);
  });
});
