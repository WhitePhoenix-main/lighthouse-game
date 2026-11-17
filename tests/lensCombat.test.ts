import { describe, expect, it } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import type { EnemyState } from '../src/contracts';
import { createBattle, stepBattle } from '../src/simulation/battle';

function setup() {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.beam = { turnSpeed: Math.PI / rules.stepSeconds, range: 400, damagePerSecond: 300, maxTargets: 1, halfAngle: 0.5 };
  rules.lens = { id: 'armor-breaker', armorMultiplier: 2, slowMultiplier: 1 };
  rules.waves = [{ id: 'support', enemies: ['ghost', 'ghost'], spawnInterval: 1 }];
  const state = createBattle(rules, 1); state.waves[0]!.spawned = 2; state.enemies = []; state.beamAngle = state.desiredBeamAngle = 0;
  return { state, rules };
}
function enemy(id: number, x: number, y = 0): EnemyState {
  return { id, kind: 'ghost', x, y, health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 };
}
describe('beam lens combat modifiers', () => {
  it('converts the remaining base damage after accelerated armor removal without boosting health damage', () => {
    const { state, rules } = setup(); rules.enemies.ghost.speed = 0;
    const target = enemy(1, 100); target.armor = 12; state.enemies = [target];
    stepBattle(state, rules, []);
    expect(target.armor).toBe(0); expect(target.health).toBe(96);
    stepBattle(state, rules, []); expect(target.health).toBe(86);
  });
  it('retains armor damage and does not apply armor multiplier to flash', () => {
    const { state, rules } = setup(); rules.beam.damagePerSecond = 0;
    const target = enemy(1, 100); target.armor = 100; state.enemies = [target];
    stepBattle(state, rules, [{ type: 'flash' }]);
    expect(target.armor).toBe(100 - rules.flash.damage);
    expect(target.health).toBe(100);
  });
  it('does not apply the lens armor multiplier to cannon shots', () => {
    const { rules } = setup(); rules.beam.damagePerSecond = 0;
    const state = createBattle(rules, 1, undefined, [{ id: 1, kind: 'cannon', x: 100, y: 100 }]);
    state.waves[0]!.spawned = 2;
    const target = enemy(1, 100); target.armor = 100; state.enemies = [target];
    stepBattle(state, rules, []);
    expect(target.armor).toBe(100 - rules.devices.definitions.cannon.damage);
    expect(target.health).toBe(100);
  });
  it('slows only targets chosen before movement, leaving blocked and over-limit bodies at normal speed', () => {
    const { state, rules } = setup(); rules.beam.damagePerSecond = 0;
    rules.lens = { id: 'slowing', armorMultiplier: 1, slowMultiplier: 0.5 };
    const selected = enemy(1, 100), blocked = enemy(2, 200), overLimit = enemy(3, 100, 40);
    state.enemies = [selected, blocked, overLimit];
    stepBattle(state, rules, []);
    expect(selected.x).toBeCloseTo(100 - rules.enemies.ghost.speed * rules.stepSeconds * 0.5);
    expect(blocked.x).toBeCloseTo(200 - rules.enemies.ghost.speed * rules.stepSeconds);
    expect(Math.hypot(overLimit.x, overLimit.y)).toBeCloseTo(Math.hypot(100, 40) - rules.enemies.ghost.speed * rules.stepSeconds);
    expect(state.blockedEnemyIds).toContain(2); expect(state.litEnemyIds).toEqual([1]);
  });
});
