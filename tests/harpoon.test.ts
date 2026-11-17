import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { getBossRules } from '../src/content/boss';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';

const harpoon: DevicePlacement = { id: 1, kind: 'harpoon', x: 100, y: 0 };

function enemy(id: number, x: number, y = 0, kind: EnemyKind = 'bat'): EnemyState {
  return { id, kind, x, y, health: 100, armor: 0, attackCooldown: 0, waveIndex: 0 };
}

function setup(enemies: EnemyState[], placements: DevicePlacement[] = [harpoon]) {
  const rules: NightConfig = structuredClone(NIGHT_CONFIG);
  rules.beam.damagePerSecond = 0;
  for (const definition of Object.values(rules.enemies)) definition.speed = 0;
  rules.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  const state = createBattle(rules, 42, undefined, placements);
  state.enemies = enemies;
  state.waves[0]!.spawned = 100;
  return { state, rules };
}

describe('harpoon turret', () => {
  it.each<EnemyKind>(['bat', 'ghost', 'turtle'])('automatically shoots %s', kind => {
    const target = enemy(1, 150, 50, kind);
    const { state, rules } = setup([target]);
    stepBattle(state, rules, []);
    expect(target.health).toBe(86);
    expect(state.devices[0]!.lastShot).toEqual({ tick: 0, x: 150, y: 50 });
  });

  it('accepts a manual flying target while ordinary cannons still exclude bats', () => {
    const bat = enemy(1, 180, 80), ghost = enemy(2, 140, 80, 'ghost');
    const { state, rules } = setup([bat, ghost], [harpoon, { ...harpoon, id: 2, kind: 'cannon' }]);
    stepBattle(state, rules, [
      { type: 'cannon-target', deviceId: 1, enemyId: bat.id },
      { type: 'cannon-target', deviceId: 2, enemyId: bat.id },
    ]);
    expect(state.devices.map(device => device.targetId)).toEqual([bat.id, null]);
    expect(bat.health).toBe(86);
    expect(ghost.health).toBe(84);
  });

  it('uses priorities and waits for an assigned target outside the center range', () => {
    const weak = enemy(1, 110, 100), strong = enemy(2, 100, 200);
    strong.health = 200;
    const { state, rules } = setup([weak, strong]);
    stepBattle(state, rules, [{ type: 'cannon-priority', deviceId: 1, priority: 'strongest' }]);
    expect(strong.health).toBe(186);
    expect(weak.health).toBe(100);
    strong.y = 200.01;
    state.devices[0]!.attackCooldown = 0;
    stepBattle(state, rules, [{ type: 'cannon-target', deviceId: 1, enemyId: strong.id }]);
    expect(strong.health).toBe(186);
    expect(weak.health).toBe(100);
    expect(state.devices[0]!.attackCooldown).toBe(0);
    strong.y = 200;
    stepBattle(state, rules, []);
    expect(strong.health).toBe(172);
  });

  it('uses configured damage and cooldown at fixed steps and preserves armor damage', () => {
    const target = enemy(1, 150, 80, 'turtle'); target.armor = 20;
    const { state, rules } = setup([target]);
    rules.devices.definitions.harpoon.damage = 17;
    rules.devices.definitions.harpoon.attackInterval = rules.stepSeconds * 3;
    stepBattle(state, rules, []);
    expect([target.armor, target.health]).toEqual([3, 100]);
    stepBattle(state, rules, []); stepBattle(state, rules, []);
    expect([target.armor, target.health]).toEqual([3, 100]);
    stepBattle(state, rules, []);
    expect([target.armor, target.health]).toEqual([0, 86]);
    expect(state.devices[0]!.lastShot!.tick).toBe(3);
  });

  it('waits exactly 42 fixed steps between base shots and resumes automatic targeting after death', () => {
    const assigned = enemy(1, 180, 80), nearest = enemy(2, 120, 80);
    assigned.health = 28;
    const { state, rules } = setup([assigned, nearest]);
    // Exercise the combat lock independently of command routing.
    state.devices[0]!.targetId = assigned.id;
    stepBattle(state, rules, []);
    expect(assigned.health).toBe(14);
    for (let tick = 0; tick < 41; tick++) stepBattle(state, rules, []);
    expect(assigned.health).toBe(14);
    stepBattle(state, rules, []);
    expect(assigned.health).toBe(0);
    expect(state.devices[0]!.lastShot!.tick).toBe(42);
    for (let tick = 0; tick < 42; tick++) stepBattle(state, rules, []);
    expect(state.devices[0]!.targetId).toBe(null);
    expect(nearest.health).toBe(86);
    expect(state.kills).toBe(1);
  });

  it('uses upgraded range and skips destroyed or consumed turrets', () => {
    const target = enemy(1, 100, 220);
    const { state, rules } = setup([target], [harpoon, { ...harpoon, id: 2 }, { ...harpoon, id: 3 }]);
    rules.devices.definitions.harpoon.range = 220;
    state.devices[0]!.health = 0; state.devices[1]!.consumed = true;
    stepBattle(state, rules, []);
    expect(target.health).toBe(86);
    expect(state.devices.map(device => device.lastShot?.tick)).toEqual([undefined, undefined, 0]);
  });

  it('fires mixed turrets in stable id order, skips kills and awards each death once', () => {
    const dead = enemy(1, 150, 80, 'ghost'); dead.health = 1;
    const survivor = enemy(2, 190, 80, 'ghost');
    const { state, rules } = setup([dead, survivor], [harpoon, { ...harpoon, kind: 'cannon', id: 0 }]);
    stepBattle(state, rules, []);
    expect(state.devices.find(device => device.id === 0)!.lastShot!.x).toBe(dead.x);
    expect(survivor.health).toBe(86);
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(rules.enemies.ghost.reward);
    stepBattle(state, rules, []);
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(rules.enemies.ghost.reward);
  });

  it('damages shared boss health once per turret shot through separate zones', () => {
    const { state, rules } = setup([], [harpoon, { ...harpoon, id: 2 }]);
    rules.boss = { ...getBossRules(1), speed: 0 };
    state.boss = { id: rules.boss.id, health: 100, stunnedUntilTick: 0, tentacles: [
      { id: -1001, x: 140, y: 80, attackCooldown: 0 },
      { id: -1002, x: 160, y: 80, attackCooldown: 0 },
    ] };
    stepBattle(state, rules, [
      { type: 'cannon-target', deviceId: 1, enemyId: -1001 },
      { type: 'cannon-target', deviceId: 2, enemyId: -1002 },
    ]);
    expect(state.boss.health).toBe(72);
    expect(state.events.filter(event => event.type === 'boss-hit')).toHaveLength(2);
    expect(state.earnedResources).toBe(0);
  });

  it('replays the same seeded night and targeting commands identically', () => {
    const placements = [harpoon, { ...harpoon, id: 2, x: -180 }];
    const first = createBattle(NIGHT_CONFIG, 81, undefined, placements);
    const second = createBattle(NIGHT_CONFIG, 81, undefined, placements);
    for (let tick = 0; tick < 1500; tick++) {
      const commands = [{ type: 'cannon-priority' as const, deviceId: 1, priority: 'weakest' as const }];
      stepBattle(first, NIGHT_CONFIG, commands); stepBattle(second, NIGHT_CONFIG, commands);
    }
    expect(first).toEqual(second);
  });
});
