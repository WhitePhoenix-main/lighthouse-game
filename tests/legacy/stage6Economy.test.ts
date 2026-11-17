import { describe, expect, it } from 'vitest';
import type { NightId, SaveStore, UpgradeId } from '../../src/contracts';
import { SaveRepository, emptySave } from '../../src/application/saves';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, rechargeCost, repairCost } from '../../src/progression/devices';
import { measureBattle } from '../helpers/balancePolicy';

const added = UPGRADES.slice(71);
const night = (id: NightId) => NIGHT_CATALOG.find(item => item.id === id)!;
const positions = { cannon: { x: -90, y: -60 }, barrier: { x: -220, y: 0 },
  generator: { x: -85, y: 80 }, harpoon: { x: -110, y: -55 }, 'light-trap': { x: -235, y: 0 } };

describe('harpoon and trap expansion economy', () => {
  it('adds eleven nodes and preserves the previous catalogue prices', () => {
    expect(added).toHaveLength(11);
    expect(added.reduce((sum, node) => sum + node.cost, 0)).toBe(995);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(UPGRADES.slice(0, 71).reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.slice(0, 27).reduce((sum, node) => sum + node.cost, 0)).toBe(7450);
    expect(LENSES.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
  });

  it('funds every new node through real victories and repeats, reserving repairs and both ammunition charges', () => {
    const store: SaveStore & { raw: string | null } = { raw: null, read() { return this.raw; }, write(raw) { this.raw = raw; } };
    const repo = new SaveRepository(store); repo.load(); expect(repo.current).toEqual(emptySave());
    let reserve = 0, serial = 0;
    const rows: { id: NightId; reward: number; repair: number; recharge: number; reserveCost: number; balance: number; reserve: number; health: number; seconds: number }[] = [];
    const play = (id: NightId) => {
      const profile = repo.current.profile;
      const config = calculateNightConfig(night(id).config, profile.purchasedUpgrades, false,
        { lensId: 'basic', upgrades: [], bossLevel: profile.bossLevel });
      const hasTrap = profile.devices.some(device => device.kind === 'light-trap');
      const hasHarpoon = profile.devices.some(device => device.kind === 'harpoon');
      const selected = profile.devices.filter(device => device.kind in positions
        && !(hasTrap && device.kind === 'barrier') && !(hasHarpoon && device.kind === 'cannon')).slice(0, config.devices.typeSlots);
      repo.savePlacements(selected.map(device => ({ id: device.id, kind: device.kind, ...positions[device.kind as keyof typeof positions] })), config);
      const snapshot = deviceDeployments(repo.current.profile), attemptId = `stage6-income-${++serial}`;
      expect(serial).toBeLessThan(20);
      repo.begin({ id: attemptId, seed: 42, placementCost: 0, nightId: id, lensId: 'basic',
        ...(id === 'abyss-warden' ? { bossLevel: profile.bossLevel, bossReward: config.boss!.materialReward } : {}) });
      const result = measureBattle(config, 42, battleDeviceDeployments(repo.current.profile, config.devices.definitions));
      expect(result.outcome, `${id}/${serial}`).toBe('victory');
      repo.settle(attemptId, 'victory', result.reward, result.encountered,
        normalizedDeviceResults(result.devices, snapshot, config.devices.definitions));
      const paid = repo.current.profile, deployedIds = new Set(snapshot.map(device => device.id));
      const bodies = paid.devices.filter(device => deployedIds.has(device.id));
      const repair = bodies.reduce((sum, device) => sum + repairCost(device, paid.purchasedUpgrades), 0);
      const recharge = bodies.reduce((sum, device) => sum + rechargeCost(device, paid.purchasedUpgrades), 0);
      const reserveCost = bodies.reduce((sum, device) => sum + repairCost({ ...device, health: 0 }, paid.purchasedUpgrades)
        + (device.kind === 'light-trap' ? rechargeCost({ ...device, consumed: true, trapCharges: 0 }, paid.purchasedUpgrades) : 0), 0);
      for (const device of bodies) { repo.repairDevice(device.id); if (device.kind === 'light-trap') repo.rechargeDevice(device.id); }
      reserve += result.reward - reserveCost;
      expect(repo.current.profile.resources).toBe(paid.resources - repair - recharge);
      expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserve);
      const saved = repo.current; repo.load(); expect(repo.current).toEqual(saved);
      rows.push({ id, reward: result.reward, repair, recharge, reserveCost, balance: repo.current.profile.resources, reserve, health: result.health, seconds: result.seconds });
    };
    const buy = (...ids: UpgradeId[]) => {
      for (const id of ids) {
        const price = UPGRADES.find(node => node.id === id)!.cost;
        while (reserve < price) {
          expect(repo.current.profile.wonNightIds).toContain('abyss-warden');
          play('far-shore');
        }
        expect(getUpgradeAvailability(repo.current.profile, id).status, id).toBe('available');
        repo.purchase(id); reserve -= price;
        if (id === 'trap-second-charge') {
          const trap = repo.current.profile.devices.find(device => device.kind === 'light-trap')!;
          expect(trap.trapCharges).toBe(1);
          expect(rechargeCost(trap, repo.current.profile.purchasedUpgrades)).toBe(2);
          repo.rechargeDevice(trap.id); reserve -= 2;
          expect(reserve).toBeGreaterThanOrEqual(0);
        }
      }
    };
    play('first-light'); buy('beam-power-1', 'unlock-cannon');
    play('broken-shore'); buy('unlock-barrier', 'unlock-generator', 'cannon-damage-1');
    play('winged-tide'); buy('device-slots-3', 'unlock-trap');
    play('abyss-warden'); buy('unlock-harpoon', 'harpoon-damage-1', 'harpoon-speed-1', 'harpoon-range-1');
    buy(...added.map(node => node.id));
    play('far-shore');
    expect(added.every(node => repo.current.profile.purchasedUpgrades.includes(node.id))).toBe(true);
    expect(rows.some(row => row.recharge > 0)).toBe(true);
    expect(repo.current.profile.devices.find(device => device.kind === 'light-trap')!.trapCharges).toBe(2);
    console.table(rows);
    console.log('Stage 6 full earned branches', { victories: rows.length, income: rows.reduce((sum, row) => sum + row.reward, 0),
      repair: rows.reduce((sum, row) => sum + row.repair, 0), recharge: rows.reduce((sum, row) => sum + row.recharge, 0) + 2,
      balance: repo.current.profile.resources, reserve });
  });

  it('keeps repairs independent of persistent ammunition and prices missing charges explicitly', () => {
    const purchased = UPGRADES.map(node => node.id), config = calculateNightConfig(night('far-shore').config, purchased);
    expect(config.devices.definitions.harpoon.damage).toBe(22);
    expect(config.devices.definitions.harpoon.attackInterval).toBeCloseTo(1.05);
    expect(config.devices.harpoon).toEqual({ slowMultiplier: .8, slowSeconds: .6, flyingDamageMultiplier: 1.35 });
    expect(config.devices.trap).toMatchObject({ damage: 90, blastRadius: 105, triggerRadius: 48, armorMultiplier: 1.5, charges: 2, rearmSeconds: 2.5 });
    for (const charges of [0, 1, 2]) {
      const trap = { id: 1, kind: 'light-trap' as const, health: 0, consumed: charges === 0, trapCharges: charges, position: null };
      expect(repairCost(trap, purchased)).toBe(4);
      expect(rechargeCost(trap, purchased)).toBe((2 - charges) * 2);
    }
    expect(repairCost({ id: 2, kind: 'harpoon', health: 0, consumed: false, position: null }, purchased)).toBe(9);
  });

  it('characterizes fully upgraded harpoons and two paid charges under overlapping waves', () => {
    const old: UpgradeId[] = ['beam-power-1', 'unlock-cannon', 'unlock-barrier', 'unlock-generator', 'unlock-trap',
      'device-slots-3', 'unlock-harpoon', 'harpoon-damage-1', 'harpoon-speed-1', 'harpoon-range-1'];
    const rows = [3, 42, 81].flatMap(seed => [false, true].map(full => {
      // Synthetic full-branch comparison, not an earned-purchase route.
      const profile = emptySave().profile;
      profile.purchasedUpgrades = [...old, ...(full ? added.map(node => node.id) : [])];
      profile.devices = [
        { id: 1, kind: 'harpoon', health: 60, consumed: false, position: { x: -180, y: -45 } },
        { id: 2, kind: 'light-trap', health: 30, consumed: false, trapCharges: full ? 2 : 1, position: { x: -235, y: 0 } },
        { id: 3, kind: 'generator', health: 60, consumed: false, position: { x: -85, y: 80 } },
      ];
      const config = calculateNightConfig(night('far-shore').config, profile.purchasedUpgrades);
      const result = measureBattle(config, seed, battleDeviceDeployments(profile, config.devices.definitions), { earlyCalls: true });
      expect(result.outcome).not.toBe('playing');
      const devices = normalizedDeviceResults(result.devices, deviceDeployments(profile), config.devices.definitions);
      const repair = devices.reduce((sum, device) => sum + repairCost({ ...device, position: null }, profile.purchasedUpgrades), 0);
      const recharge = devices.reduce((sum, device) => sum + rechargeCost({ ...device, position: null }, profile.purchasedUpgrades), 0);
      expect(repair).toBeLessThanOrEqual(20);
      expect(recharge).toBeLessThanOrEqual(full ? 4 : 2);
      if (result.outcome === 'victory') expect(result.reward).toBe(197);
      return { seed, full, outcome: result.outcome, health: result.health, seconds: result.seconds,
        repair, recharge, net: result.reward - repair - recharge };
    }));
    console.table(rows);
    expect(rows.filter(row => row.full && row.outcome === 'victory').length)
      .toBeGreaterThanOrEqual(rows.filter(row => !row.full && row.outcome === 'victory').length);
    expect(rows.some(row => row.full && row.recharge === 4)).toBe(true);
  });
});
