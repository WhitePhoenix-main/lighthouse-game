import { describe, expect, it } from 'vitest';
import type { NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { SaveRepository, emptySave } from '../../src/application/saves';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost } from '../../src/progression/devices';
import { measureBattle } from '../helpers/balancePolicy';

const added = UPGRADES.slice(53, 71);
const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 }, generator: { x: -80, y: 80 } };

describe('core-device expansion economy', () => {
  it('adds eighteen real nodes without changing the previous eighty-seven prices', () => {
    expect(added).toHaveLength(18);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    expect(added.reduce((sum, node) => sum + node.cost, 0)).toBe(1610);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(LENSES.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
    expect(UPGRADES.slice(0, 53).reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.slice(0, 27).reduce((sum, node) => sum + node.cost, 0)).toBe(5840);
  });

  it('funds the new hulls, cannon upgrades and barrier guard from victories with a deployed-body repair reserve', () => {
    const store: SaveStore & { raw: string | null } = { raw: null, read() { return this.raw; }, write(raw) { this.raw = raw; } };
    const repo = new SaveRepository(store); repo.load(); expect(repo.current).toEqual(emptySave());
    let reserveBalance = 0;
    const rows: object[] = [];
    const buy = (...ids: UpgradeId[]) => {
      for (const id of ids) {
        expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
        reserveBalance -= UPGRADES.find(node => node.id === id)!.cost;
        expect(reserveBalance, `reserve before ${id}`).toBeGreaterThanOrEqual(0);
        repo.purchase(id);
      }
    };
    const play = (id: NightId, serial: number) => {
      const profile = repo.current.profile;
      const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, false,
        { lensId: 'basic', upgrades: [], bossLevel: profile.bossLevel });
      const selected = profile.devices.filter(device => device.kind in positions).slice(0, config.devices.typeSlots);
      repo.savePlacements(selected.map(device => ({ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] })), config);
      const snapshot = deviceDeployments(repo.current.profile);
      repo.begin({ id: `core-route-${serial}`, seed: 42, placementCost: 0, nightId: id, lensId: 'basic',
        ...(id === 'abyss-warden' ? { bossLevel: profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
      const result = measureBattle(config, 42, battleDeviceDeployments(repo.current.profile, config.devices.definitions));
      expect(result.outcome, `${id}/${serial}`).toBe('victory');
      repo.settle(`core-route-${serial}`, 'victory', result.reward, result.encountered,
        normalizedDeviceResults(result.devices, snapshot, config.devices.definitions));
      const repairs = repo.current.profile.devices.reduce((sum, device) => sum + repairCost(device, profile.purchasedUpgrades), 0);
      for (const device of repo.current.profile.devices) repo.repairDevice(device.id);
      const fullRepair = snapshot.reduce((sum, device) => sum + repairCost({ ...device, health: 0, position: null }, profile.purchasedUpgrades), 0);
      reserveBalance += result.reward - fullRepair;
      const saved = repo.current; repo.load(); expect(repo.current).toEqual(saved);
      rows.push({ id, reward: result.reward, health: result.health, seconds: result.seconds, repairs, fullRepair, reserveBalance });
    };
    play('first-light', 1); buy('beam-power-1', 'unlock-cannon');
    play('broken-shore', 2); buy('unlock-barrier', 'unlock-generator', 'cannon-damage-1');
    play('winged-tide', 3); buy('device-slots-3', 'barrier-health-1');
    play('abyss-warden', 4); buy('cannon-damage-2');
    play('abyss-warden', 5); buy('generator-health-1', 'barrier-guard');
    play('far-shore', 6); buy('cannon-range-1', 'cannon-first-shot');
    play('far-shore', 7); buy('cannon-armor');
    expect(reserveBalance).toBe(48);
    expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserveBalance);
    console.table(rows);
    console.log('Stage 5 earned route', { balance: repo.current.profile.resources, reserveBalance });
  });

  it('keeps full hull restoration capped by the old body price, with an explicit barrier discount only', () => {
    const all = UPGRADES.map(node => node.id);
    const config = calculateNightConfig(night('far-shore').config, all);
    expect(config.devices.definitions.barrier.health).toBe(230);
    expect(config.devices.definitions.generator.health).toBe(105);
    expect(config.devices.definitions.cannon.damage / config.devices.definitions.cannon.attackInterval).toBeCloseTo(40);
    expect(config.devices.cannon).toEqual({ manualDamageBonus: .25, armorMultiplier: 1.5 });
    for (const [kind, cap] of [['barrier', 2], ['generator', 7], ['cannon', 5]] as const) {
      expect(repairCost({ id: 1, kind, health: 0, consumed: false, position: null }, all)).toBe(cap);
      expect(cap).toBeLessThanOrEqual(config.devices.definitions[kind].cost * .25);
    }
    const hullNodes = all.filter(id => id !== 'barrier-repair');
    expect(repairCost({ id: 1, kind: 'barrier', health: 70, consumed: false, position: null }, hullNodes)).toBe(2);
    expect(repairCost({ id: 1, kind: 'generator', health: 30, consumed: false, position: null }, all)).toBe(4);
  });

  it('characterizes the full new branches on exposed positions separately from the earned route', () => {
    const old: UpgradeId[] = ['beam-power-1', 'unlock-cannon', 'unlock-barrier', 'unlock-generator',
      'device-slots-3', 'cannon-damage-1', 'cannon-speed-1', 'cannon-range-1'];
    const rows = [3, 42, 81].flatMap(seed => [false, true].flatMap(earlyCalls => [false, true].map(full => {
      // Deliberately synthetic full-branch comparison; affordability is tested above.
      const profile = emptySave().profile;
      profile.purchasedUpgrades = [...old, ...(full ? added.map(node => node.id) : [])];
      profile.devices = [
        { id: 1, kind: 'barrier', health: 140, consumed: false, position: { x: -265, y: 0 } },
        { id: 2, kind: 'cannon', health: 70, consumed: false, position: { x: -220, y: 40 } },
        { id: 3, kind: 'generator', health: 60, consumed: false, position: { x: -120, y: 70 } },
      ];
      const config = calculateNightConfig(night('far-shore').config, profile.purchasedUpgrades);
      const result = measureBattle(config, seed, battleDeviceDeployments(profile, config.devices.definitions), { earlyCalls });
      expect(result.outcome).not.toBe('playing');
      const normalized = normalizedDeviceResults(result.devices, deviceDeployments(profile), config.devices.definitions);
      const repair = normalized.reduce((sum, device) => sum + repairCost({ ...device, position: null }, profile.purchasedUpgrades), 0);
      expect(repair).toBeLessThanOrEqual(full ? 14 : 15);
      if (result.outcome === 'victory') expect(result.reward).toBe(earlyCalls ? 197 : 176);
      return { seed, earlyCalls, full, outcome: result.outcome, health: result.health, seconds: result.seconds,
        repair, devicesAlive: result.devices.filter(device => device.health > 0).length };
    })));
    console.table(rows);
    expect(rows.filter(row => row.full && row.outcome === 'victory').length)
      .toBeGreaterThanOrEqual(rows.filter(row => !row.full && row.outcome === 'victory').length);
    expect(rows.some(row => row.repair > 0)).toBe(true);
  });
});
