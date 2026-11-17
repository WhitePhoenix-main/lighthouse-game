import { describe, expect, it } from 'vitest';
import type { EnemyState, Profile, UpgradeDefinition, UpgradeId } from '../../src/contracts';
import { NIGHT_CONFIG } from '../../src/content/night';
import { UPGRADES } from '../../src/content/upgrades';
import { calculateNightConfig, createUpgradeViews, getUpgradeAvailability, validatePurchasedUpgrades, validateUpgradeDefinitions } from '../../src/progression/upgrades';
import { selectBeamTargets } from '../../src/simulation/beam';

function profile(resources = 0, purchasedUpgrades: UpgradeId[] = []): Profile {
  return { devices: [], nextDeviceId: 1, resources, purchasedUpgrades, completedNights: 0, encountered: [], wonNightIds: [], legacyEquipment: false, bossMaterials:0,bossLevel:1,unlockedLenses:['basic'],lensUpgrades:[],selectedLensId:'basic' };
}

describe('upgrade tree and availability', () => {
  it('has three independent two-node branches with preliminary prices', () => {
    expect(UPGRADES.slice(0, 6)).toHaveLength(6);
    expect(UPGRADES).toHaveLength(82);
    expect(() => validateUpgradeDefinitions(UPGRADES)).not.toThrow();
    for (const branch of ['power', 'width', 'range']) {
      const nodes = UPGRADES.slice(0, 6).filter((node) => node.branch === branch);
      expect(nodes.map((node) => [node.tier, node.cost])).toEqual([[1, 45], [2, 80]]);
      expect(nodes[0]!.requires).toEqual([]);
      expect(nodes[1]!.requires).toEqual([nodes[0]!.id]);
    }
  });

  it('checks prerequisites before funds and allows purchase at the exact price', () => {
    expect(getUpgradeAvailability(profile(1000), 'beam-power-2').status).toBe('requires');
    expect(getUpgradeAvailability(profile(0), 'beam-power-2').reason).toContain('Мощность I');
    expect(getUpgradeAvailability(profile(44), 'beam-power-1')).toEqual({ status: 'insufficient', reason: 'Не хватает ресурсов: 1' });
    expect(getUpgradeAvailability(profile(45), 'beam-power-1').status).toBe('available');
    expect(getUpgradeAvailability(profile(79, ['beam-power-1']), 'beam-power-2').status).toBe('insufficient');
    expect(getUpgradeAvailability(profile(80, ['beam-power-1']), 'beam-power-2').status).toBe('available');
    expect(getUpgradeAvailability(profile(0, ['beam-power-1']), 'beam-power-1').status).toBe('purchased');
    expect(getUpgradeAvailability(profile(45, ['beam-power-1', 'beam-power-2']), 'beam-width-1').status).toBe('available');
    expect(getUpgradeAvailability(profile(45, ['beam-power-1', 'beam-power-2']), 'beam-range-1').status).toBe('available');
  });

  it('rejects duplicate definitions, missing dependencies and cycles', () => {
    expect(() => validateUpgradeDefinitions([UPGRADES[0]!, UPGRADES[0]!])).toThrow(/Повторный/);
    expect(() => validateUpgradeDefinitions([UPGRADES[1]!])).toThrow(/Неизвестная зависимость/);
    const cycle: UpgradeDefinition[] = [
      { ...UPGRADES[0]!, requires: ['beam-power-2'] }, UPGRADES[1]!,
    ];
    expect(() => validateUpgradeDefinitions(cycle)).toThrow(/Цикл/);
    expect(() => validateUpgradeDefinitions([{ ...UPGRADES[0]!, requires: ['beam-power-1'] }])).toThrow(/Цикл/);
    expect(() => validateUpgradeDefinitions([{ ...UPGRADES[0]!, cost: -1 }])).toThrow(/цена/);
    expect(() => validateUpgradeDefinitions([{ ...UPGRADES[0]!, effect: { stat: 'range', amount: NaN } }])).toThrow(/эффект/);
  });

  it('rejects invalid saved purchases instead of granting them', () => {
    expect(() => validatePurchasedUpgrades(['beam-power-1', 'beam-power-1'])).toThrow(/Повторная/);
    expect(() => validatePurchasedUpgrades(['future-upgrade'])).toThrow(/Неизвестное/);
    expect(() => validatePurchasedUpgrades(['beam-power-2'])).toThrow(/требуется/);
    expect(() => validatePurchasedUpgrades(['beam-power-2', 'beam-power-1'])).not.toThrow();
    expect(() => calculateNightConfig(NIGHT_CONFIG, ['beam-width-2'])).toThrow(/требуется/);
  });
});

describe('derived night configuration', () => {
  it('adds only purchased stats; all branches remain combinable and order-independent', () => {
    const baseline = structuredClone(NIGHT_CONFIG);
    expect(calculateNightConfig(NIGHT_CONFIG, []).beam).toEqual(NIGHT_CONFIG.beam);
    expect(calculateNightConfig(NIGHT_CONFIG, ['beam-power-1']).beam).toEqual({ ...NIGHT_CONFIG.beam, damagePerSecond: 36 });
    const combined = calculateNightConfig(NIGHT_CONFIG, ['beam-power-1', 'beam-range-1']);
    expect(combined.beam).toEqual({ ...NIGHT_CONFIG.beam, damagePerSecond: 36, range: 325 });
    const allIds = UPGRADES.map((node) => node.id);
    const all = calculateNightConfig(NIGHT_CONFIG, allIds);
    expect(all.beam.damagePerSecond).toBe(42);
    expect(all.beam.range).toBe(350);
    expect(all.beam.halfAngle * 2 * 180 / Math.PI).toBeCloseTo(40);
    expect(all.beam.maxTargets).toBe(2);
    expect(calculateNightConfig(NIGHT_CONFIG, allIds.reverse())).toEqual(all);
    expect(NIGHT_CONFIG).toEqual(baseline);
  });

  it('returns an independent deep copy even with no purchases', () => {
    const base = structuredClone(NIGHT_CONFIG);
    const snapshot = structuredClone(base);
    const result = calculateNightConfig(base, []);
    result.beam.range = 1;
    result.enemies.ghost.health = 1;
    result.enemies.turtle.armor = 1;
    result.waves[0]!.id = 'changed';
    // readonly collections are a compile-time API, but no mutable object may be shared.
    expect(result.waves[0]!.enemies).not.toBe(base.waves[0]!.enemies);
    expect(base).toEqual(snapshot);
    expect(calculateNightConfig(base, [])).toEqual(snapshot);
  });

  it('provides current and next values without exposing mutable catalog objects', () => {
    const views = createUpgradeViews(profile(45, ['beam-width-1']), NIGHT_CONFIG);
    expect(views).toHaveLength(82);
    const first = views.find((node) => node.definition.id === 'beam-width-1')!;
    const second = views.find((node) => node.definition.id === 'beam-width-2')!;
    expect(first.status).toBe('purchased');
    expect(first.currentValue).toBeCloseTo(Math.PI / 15 + Math.PI / 45);
    expect(first.nextValue).toBe(first.currentValue);
    expect(second.status).toBe('insufficient');
    expect(second.nextValue).toBeCloseTo(Math.PI / 9);
    first.definition.effect.amount = 100;
    expect(UPGRADES.find((node) => node.id === 'beam-width-1')!.effect.amount).toBe(Math.PI / 45);
  });

  it('keeps two targets and full occlusion after widening the beam', () => {
    const config = calculateNightConfig(NIGHT_CONFIG, ['beam-width-1', 'beam-width-2']);
    function enemy(id: number, distance: number, angle: number): EnemyState {
      return { id, kind: 'ghost', waveIndex: 0, x: distance * Math.cos(angle), y: distance * Math.sin(angle),
        health: 34, armor: 0, attackCooldown: 0 };
    }
    const targets = [enemy(1, 250, 0), enemy(2, 240, -0.14), enemy(3, 100, 0.28), enemy(4, 200, 0.28)];
    expect(selectBeamTargets(targets, config, 0)).toEqual({ lit: [1, 2], blocked: [4] });
    expect(selectBeamTargets([targets[2]!], NIGHT_CONFIG, 0).lit).toEqual([3]);
    // A target near the new outer edge becomes visible, without changing the target limit.
    expect(selectBeamTargets([enemy(5, 260, 0.3)], NIGHT_CONFIG, 0).lit).toEqual([]);
    expect(selectBeamTargets([enemy(5, 260, 0.3)], config, 0).lit).toEqual([5]);
  });
});
