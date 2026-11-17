import { describe, expect, it } from 'vitest';
import type { EnemyState, SaveStore, UpgradeId } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { calculateNightConfig } from '../src/progression/upgrades';
import { validateLensDefinitions } from '../src/progression/lenses';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { intersectsBeam, selectBeamTargets } from '../src/simulation/beam';
import { decodeSave, emptySave, SaveRepository } from '../src/application/saves';

const nodes = LENS_UPGRADES.filter(node => node.lensId === 'long-range');
const ids = nodes.map(node => node.id);
function config(global: readonly UpgradeId[] = [], upgraded = false) {
  return calculateNightConfig(NIGHT_CONFIG, global, false, { lensId: 'long-range', upgrades: upgraded ? ids : [] });
}
function enemy(id: number, x: number, y = 0): EnemyState {
  return { id, kind: 'ghost', x, y, health: 100, armor: 0, attackCooldown: 0, waveIndex: 0 };
}
function setup() {
  const rules = config();
  rules.enemies.ghost.speed = 0;
  rules.waves = [{ id: 'range-test', enemies: ['ghost'], spawnInterval: 1000 }];
  const state = createBattle(rules, 42);
  state.waves[0]!.spawned = 1;
  state.beamAngle = state.desiredBeamAngle = 0;
  return { rules, state };
}
function repository(resources = 310, materials = 8) {
  const save = emptySave();
  save.profile.resources = resources;
  save.profile.bossMaterials = materials;
  const store: SaveStore & { value: string; fail: boolean } = {
    value: JSON.stringify(save), fail: false,
    read() { return this.value; },
    write(value) { if (this.fail) throw new Error('Disk unavailable'); this.value = value; },
  };
  const repo = new SaveRepository(store); repo.load();
  return { repo, store };
}

describe('long-range lens composition', () => {
  it('starts at 345 range, 24 damage/s and 19.2 degrees without secondary effects', () => {
    const rules = config();
    expect(LENSES.find(lens => lens.id === 'long-range')?.materialCost).toBe(3);
    expect(rules.beam.range).toBeCloseTo(345);
    expect(rules.beam.damagePerSecond).toBeCloseTo(24);
    expect(rules.beam.halfAngle * 360 / Math.PI).toBeCloseTo(19.2);
    expect(rules.beam.maxTargets).toBe(2);
    expect(rules.lens).toEqual({ id: 'long-range', slowMultiplier: 1, armorMultiplier: 1 });
    expect(() => validateLensDefinitions()).not.toThrow();
  });

  it('multiplies global upgrades before its own power/width nodes and adds no redundant range node', () => {
    expect(config(['beam-range-1']).beam.range).toBeCloseTo(373.75);
    const global: UpgradeId[] = ['beam-power-1', 'beam-power-2', 'beam-width-1', 'beam-width-2', 'beam-range-1', 'beam-range-2'];
    const rules = config(global, true);
    expect(rules.beam.damagePerSecond).toBeCloseTo(41.6);
    expect(rules.beam.range).toBeCloseTo(402.5);
    expect(rules.beam.halfAngle * 360 / Math.PI).toBeCloseTo(36);
    expect(rules.beam.maxTargets).toBe(2);
    expect(nodes.map(node => node.effect.stat)).toEqual(['damagePerSecond', 'damagePerSecond', 'halfAngle', 'halfAngle']);
    for (const lens of LENSES.filter(lens => lens.id !== 'long-range')) {
      const before = calculateNightConfig(NIGHT_CONFIG, global, false, { lensId: lens.id, upgrades: [] });
      const after = calculateNightConfig(NIGHT_CONFIG, global, false, { lensId: lens.id, upgrades: ids });
      expect(after).toEqual(before);
    }
  });
});

describe('long-range beam keeps normal geometry and damage', () => {
  it('actually damages targets outside basic range and stops damage when aim leaves them', () => {
    const { rules, state } = setup();
    const target = enemy(1, 330);
    const offBeam = enemy(2, 0, 330);
    state.enemies = [target, offBeam];
    expect(selectBeamTargets(state.enemies, NIGHT_CONFIG, 0).lit).toEqual([]);
    stepBattle(state, rules, []);
    expect(state.litEnemyIds).toEqual([1]);
    expect(target.health).toBeCloseTo(99.2);
    expect(offBeam.health).toBe(100);
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    for (let tick = 0; tick < 90; tick++) stepBattle(state, rules, []);
    expect(target.health).toBeCloseTo(99.2);
    expect(offBeam.health).toBe(100);
  });

  it('uses body edges at both range and sector boundaries', () => {
    const rules = config();
    const radius = rules.enemies.ghost.radius;
    expect(intersectsBeam(enemy(1, rules.beam.range + radius), rules, 0)).toBe(true);
    expect(intersectsBeam(enemy(1, rules.beam.range + radius + .01), rules, 0)).toBe(false);
    const distance = 330;
    const angle = rules.beam.halfAngle + Math.asin(radius / distance);
    expect(intersectsBeam(enemy(1, distance * Math.cos(angle), distance * Math.sin(angle)), rules, 0)).toBe(true);
    expect(intersectsBeam(enemy(1, distance * Math.cos(angle + .001), distance * Math.sin(angle + .001)), rules, 0)).toBe(false);
  });

  it('retains full occlusion, axis priority and the two-target limit with full damage per target', () => {
    const { rules, state } = setup();
    state.enemies = [enemy(1, 150), enemy(2, 330), enemy(3, 330, 35), enemy(4, 330, -35), enemy(5, 330, 55)];
    stepBattle(state, rules, []);
    expect(state.blockedEnemyIds).toContain(2);
    expect(state.litEnemyIds).toEqual([1, 3]);
    for (const target of state.enemies) expect(target.health).toBeCloseTo(state.litEnemyIds.includes(target.id) ? 99.2 : 100);
  });

  it('shares the limit with ships, rescues at ordinary speed and never applies combat bonuses to rescue', () => {
    const { rules, state } = setup();
    rules.ship = { x: 330, y: 0, radius: 12, rescueSeconds: 10, deadline: 100, reward: 1 };
    state.ship = { ...rules.ship, progress: 0, remaining: 100, status: 'waiting', lit: false };
    state.enemies = [enemy(1, 330, 28), enemy(2, 330, -28)];
    stepBattle(state, rules, []);
    expect(state.ship.lit).toBe(true);
    expect(state.ship.progress).toBeCloseTo(rules.stepSeconds);
    expect(state.litEnemyIds).toHaveLength(1);
    expect(state.enemies.find(target => state.litEnemyIds.includes(target.id))?.health).toBeCloseTo(99.2);
    expect(state.enemies.find(target => !state.litEnemyIds.includes(target.id))?.health).toBe(100);
  });
});

describe('long-range purchases', () => {
  it('requires unlock and both final prerequisites, spends 310 shards / 8 pearls once and survives reload', () => {
    const { repo, store } = repository();
    expect(() => repo.purchaseLensUpgrade('long-range-power-1')).toThrow();
    repo.purchaseLens('long-range'); repo.purchaseLens('long-range');
    expect(() => repo.purchaseLensUpgrade('long-range-width-1')).toThrow();
    repo.purchaseLensUpgrade('long-range-power-1');
    repo.purchaseLensUpgrade('long-range-width-1');
    expect(() => repo.purchaseLensUpgrade('long-range-width-2')).toThrow();
    repo.purchaseLensUpgrade('long-range-power-2');
    repo.purchaseLensUpgrade('long-range-width-2');
    repo.purchaseLensUpgrade('long-range-width-2');
    expect(repo.current.profile).toMatchObject({ resources: 0, bossMaterials: 0, lensUpgrades: ['long-range-power-1', 'long-range-width-1', 'long-range-power-2', 'long-range-width-2'] });
    expect(decodeSave(store.value).profile).toEqual(repo.current.profile);
    const reload = new SaveRepository(store); reload.load();
    expect(reload.current.profile).toEqual(repo.current.profile);
  });

  it('preserves profile and saved data on insufficient resources or a failed upgrade write', () => {
    const { repo, store } = repository(65, 4);
    repo.purchaseLens('long-range');
    const before = structuredClone(repo.current);
    const raw = store.value;
    store.fail = true;
    expect(() => repo.purchaseLensUpgrade('long-range-power-1')).toThrow();
    expect(repo.current).toEqual(before);
    expect(store.value).toBe(raw);
    store.fail = false;
    repo.purchaseLensUpgrade('long-range-power-1');
    const purchased = structuredClone(repo.current);
    expect(() => repo.purchaseLensUpgrade('long-range-power-2')).toThrow();
    expect(repo.current).toEqual(purchased);
    expect(decodeSave(store.value)).toEqual(purchased);
  });
});
