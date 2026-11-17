import { describe, expect, it } from 'vitest';
import type { EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';

function enemy(id: number, x: number, health = 100, armor = 0): EnemyState {
  return { id, kind: 'ghost', x, y: 100, health, armor, waveIndex: 0, attackCooldown: 0 };
}
function setup() {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.beam.damagePerSecond = 0; rules.enemies.ghost.speed = 0;
  rules.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  const state = createBattle(rules, 1, undefined, [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
  state.waves[0]!.spawned = 100;
  return { rules, state, cannon: state.devices[0]! };
}

describe('cannon commands', () => {
  it.each(['nearest', 'strongest', 'weakest'] as const)('selects %s deterministically using remaining health plus armor', priority => {
    const { rules, state } = setup();
    const nearest = enemy(8, 100), strongest = enemy(3, 170, 80, 50), weakest = enemy(2, 20, 50);
    state.enemies = [nearest, strongest, weakest];
    stepBattle(state, rules, [{ type: 'cannon-priority', deviceId: 1, priority }]);
    const target = priority === 'nearest' ? nearest : priority === 'strongest' ? strongest : weakest;
    expect(target.health + target.armor).toBe((priority === 'strongest' ? 130 : priority === 'weakest' ? 50 : 100) - 16);
    expect(state.beamAngle).toBe(-Math.PI / 2);
  });

  it('breaks equal-strength ties by id', () => {
    const { rules, state } = setup();
    state.enemies = [enemy(8, 100), enemy(2, 150)];
    stepBattle(state, rules, [{ type: 'cannon-priority', deviceId: 1, priority: 'strongest' }]);
    expect(state.enemies[1]!.health).toBe(84);
  });

  it('holds a manual target outside range, resumes on return, and restores auto after death or reset', () => {
    const { rules, state, cannon } = setup();
    const near = enemy(1, 100), manual = enemy(2, 300); state.enemies = [near, manual];
    stepBattle(state, rules, [{ type: 'cannon-target', deviceId: 1, enemyId: 2 }]);
    expect(cannon.targetId).toBe(2); expect(near.health).toBe(100); expect(cannon.attackCooldown).toBe(0);
    manual.x = 150;
    stepBattle(state, rules, []);
    expect(manual.health).toBe(84); expect(near.health).toBe(100);
    manual.health = 0; cannon.attackCooldown = 0;
    stepBattle(state, rules, []);
    expect(cannon.targetId).toBeNull(); expect(near.health).toBe(84);
    cannon.attackCooldown = 0;
    stepBattle(state, rules, [{ type: 'cannon-target', deviceId: 1, enemyId: 1 }, { type: 'cannon-target', deviceId: 1, enemyId: null }]);
    expect(cannon.targetId).toBeNull(); expect(near.health).toBe(68);
  });

  it('ignores invalid ids and commands for destroyed cannons', () => {
    const { rules, state, cannon } = setup();
    state.enemies = [enemy(1, 100)]; cannon.health = 0;
    stepBattle(state, rules, [{ type: 'cannon-priority', deviceId: 1, priority: 'weakest' }, { type: 'cannon-target', deviceId: 1, enemyId: 1 }]);
    expect(cannon.priority).toBe('nearest'); expect(cannon.targetId).toBeNull();
  });
});
