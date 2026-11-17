import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectBeamTargets } from '../src/simulation/beam';

function config(): NightConfig {
  const result = structuredClone(NIGHT_CONFIG);
  // Isolate damage/selection timing; production turn limits have separate tests.
  result.beam.turnSpeed = Math.PI / result.stepSeconds;
  result.beam.damagePerSecond = 0;
  result.enemies.ghost.speed = 0;
  result.enemies.turtle.speed = 0;
  result.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  return result;
}

function enemy(id: number, x: number, y = 0, kind: EnemyKind = 'ghost'): EnemyState {
  const definition = NIGHT_CONFIG.enemies[kind];
  return { id, kind, x, y, waveIndex: 0, health: definition.health, armor: definition.armor, attackCooldown: 0 };
}

function fixture(rules: NightConfig, placements: DevicePlacement[], enemies: EnemyState[]) {
  const state = createBattle(rules, 42, undefined, placements);
  state.enemies = enemies;
  state.waves[0]!.spawned = 100;
  return state;
}

const cannon: DevicePlacement = { id: 1, kind: 'cannon', x: 100, y: 0 };
const barrier: DevicePlacement = { id: 2, kind: 'barrier', x: 150, y: 0 };

describe('cannon targeting and shots', () => {
  it('copies placements into independent battle state and supports an empty placement', () => {
    const rules = config();
    const placement = { ...cannon };
    const first = createBattle(rules, 1, undefined, [placement]);
    const second = createBattle(rules, 1, undefined, [placement]);
    placement.x = 500;
    first.devices[0]!.health = 1;
    expect(first.devices[0]!.x).toBe(100);
    expect(second.devices[0]!.health).toBe(rules.devices.definitions.cannon.health);
    expect(createBattle(rules, 1).devices).toEqual([]);
  });

  it('uses center distance, includes the range boundary and excludes a body just outside', () => {
    const rules = config();
    const range = rules.devices.definitions.cannon.range;
    const inside = enemy(1, 100, range);
    const outside = enemy(2, 100, -range - 0.01);
    const state = fixture(rules, [cannon], [outside, inside]);
    stepBattle(state, rules, []);
    expect(inside.health).toBe(18);
    expect(outside.health).toBe(34);
    expect(state.devices[0]!.lastShot).toEqual({ tick: 0, x: inside.x, y: inside.y });
    inside.health = 0;
    state.devices[0]!.attackCooldown = 0;
    stepBattle(state, rules, []);
    expect(outside.health).toBe(34);
    expect(state.devices[0]!.lastShot!.tick).toBe(0);
  });

  it('selects nearest to cannon, breaking equal distances by enemy id regardless of array order', () => {
    const rules = config();
    const far = enemy(1, 40, 0);
    const highId = enemy(8, 100, 50);
    const lowId = enemy(3, 100, -50);
    const state = fixture(rules, [cannon], [far, highId, lowId]);
    stepBattle(state, rules, []);
    expect(lowId.health).toBe(18);
    expect(highId.health).toBe(34);
    expect(far.health).toBe(34);
  });

  it('shoots immediately, waits exactly 24 fixed steps, and does not consume cooldown without a target', () => {
    const rules = config();
    const target = enemy(1, 100, 100);
    target.health = 1000;
    const state = fixture(rules, [cannon], [target]);
    stepBattle(state, rules, []);
    expect(target.health).toBe(984);
    for (let i = 0; i < 23; i++) stepBattle(state, rules, []);
    expect(target.health).toBe(984);
    stepBattle(state, rules, []);
    expect(target.health).toBe(968);
    expect(state.devices[0]!.lastShot!.tick).toBe(24);
    target.y = 300;
    for (let i = 0; i < 30; i++) stepBattle(state, rules, []);
    expect(state.devices[0]!.attackCooldown).toBe(0);
    target.y = 100;
    stepBattle(state, rules, []);
    expect(target.health).toBe(952);
  });

  it('damages turtle armor first, preserves damage and transfers the remainder into health', () => {
    const rules = config();
    const target = enemy(1, 200, 0, 'turtle');
    target.armor = 20;
    const state = fixture(rules, [cannon], [target]);
    stepBattle(state, rules, []);
    expect([target.armor, target.health]).toEqual([4, 42]);
    for (let i = 0; i < 24; i++) stepBattle(state, rules, []);
    expect([target.armor, target.health]).toEqual([0, 30]);
  });

  it('ignores line of sight and fires independently of beam selection', () => {
    const rules = config();
    const front = enemy(1, 80);
    const behind = enemy(2, 180);
    const state = fixture(rules, [{ ...cannon, x: 230 }], [front, behind]);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.blockedEnemyIds).toContain(behind.id);
    expect(behind.health).toBe(18);
    expect(front.health).toBe(34);
  });

  it('fires cannons in id order and skips already killed targets, awarding each death once', () => {
    const rules = config();
    const target = enemy(1, 150, 80);
    target.health = 1;
    const survivor = enemy(2, 200, 80);
    const state = fixture(rules, [{ ...cannon, id: 9 }, { ...cannon, id: 2 }], [target, survivor]);
    stepBattle(state, rules, []);
    expect(state.devices.find(device => device.id === 2)!.lastShot!.x).toBe(target.x);
    expect(state.devices.find(device => device.id === 9)!.lastShot!.x).toBe(survivor.x);
    expect(survivor.health).toBe(18);
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(rules.enemies.ghost.reward);
    stepBattle(state, rules, []);
    expect(state.kills).toBe(1);
  });
});

describe('encountered devices and enemy attacks', () => {
  it('stops a turtle at a barrier, attacks on interval, preserves damage and resumes after destruction', () => {
    const rules = config();
    rules.enemies.turtle.speed = 300;
    const target = enemy(1, 200, 0, 'turtle');
    const state = fixture(rules, [barrier], [target]);
    const device = state.devices[0]!;
    stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(196);
    expect(device.health).toBe(128);
    for (let i = 0; i < 65; i++) stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(196);
    expect(device.health).toBe(128);
    stepBattle(state, rules, []);
    expect(device.health).toBe(116);
    device.health = 1;
    target.attackCooldown = 0;
    stepBattle(state, rules, []);
    expect(device.health).toBe(0);
    const stoppedAt = target.x;
    stepBattle(state, rules, []);
    expect(target.x).toBeLessThan(stoppedAt);
    expect(state.devices).toHaveLength(1);
    expect(state.lighthouseHealth).toBe(rules.lighthouseHealth);
  });

  it('lets ghosts pass barriers but stops them at the first encountered cannon', () => {
    const rules = config();
    rules.enemies.ghost.speed = 600;
    rules.devices.definitions.cannon.damage = 0;
    const target = enemy(1, 210);
    const state = fixture(rules, [{ ...barrier, x: 170 }, cannon], [target]);
    for (let i = 0; i < 5; i++) stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(128);
    expect(state.devices[0]!.health).toBe(140);
    expect(state.devices[1]!.health).toBe(65);
  });

  it('prevents tunneling through an off-axis barrier in a single fast step', () => {
    const rules = config();
    rules.enemies.turtle.speed = 10000;
    const target = enemy(1, 350, 0, 'turtle');
    const state = fixture(rules, [{ ...barrier, y: 30 }], [target]);
    stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(150 + Math.sqrt(46 ** 2 - 30 ** 2));
    expect(target.y).toBe(0);
    expect(state.devices[0]!.health).toBe(128);
  });

  it('chooses the earliest intersection rather than center proximity or array order', () => {
    const rules = config();
    rules.enemies.turtle.speed = 10000;
    const state = fixture(rules, [{ ...barrier, id: 1, x: 150 }, { ...barrier, id: 9, x: 250 }], [enemy(1, 350, 0, 'turtle')]);
    stepBattle(state, rules, []);
    expect(state.enemies[0]!.x).toBeCloseTo(296);
    expect(state.devices.map(device => device.health)).toEqual([140, 128]);
  });

  it('breaks simultaneous contacts by device id and continues into the next surviving object', () => {
    const rules = config();
    rules.enemies.turtle.speed = 10000;
    const target = enemy(1, 350, 0, 'turtle');
    const state = fixture(rules, [{ ...barrier, id: 9, y: 20 }, { ...barrier, id: 2, y: -20 }], [target]);
    state.devices[1]!.health = 1;
    stepBattle(state, rules, []);
    expect(state.devices.map(device => device.health)).toEqual([140, 0]);
    target.attackCooldown = 0;
    stepBattle(state, rules, []);
    expect(state.devices.map(device => device.health)).toEqual([128, 0]);
  });

  it('does not seek or detour toward a device outside the path', () => {
    const rules = config();
    rules.enemies.turtle.speed = 300;
    const state = fixture(rules, [{ ...barrier, y: 60 }], [enemy(1, 200, 0, 'turtle')]);
    stepBattle(state, rules, []);
    expect(state.enemies[0]!.x).toBeCloseTo(190);
    expect(state.enemies[0]!.y).toBe(0);
    expect(state.devices[0]!.health).toBe(140);
  });

  it('fires before enemy attacks, retains a destroyed cannon and its last shot, then lets attackers pass', () => {
    const rules = config();
    rules.enemies.ghost.speed = 300;
    const target = enemy(1, 135);
    const state = fixture(rules, [cannon], [target]);
    const device = state.devices[0]!;
    device.health = 1;
    stepBattle(state, rules, []);
    expect(target.health).toBe(18);
    expect(device.health).toBe(0);
    expect(device.lastShot).toEqual({ tick: 0, x: 128, y: 0 });
    for (let i = 0; i < 25; i++) stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(42);
    expect(target.health).toBe(18);
    expect(device.lastShot!.tick).toBe(0);
  });

  it('does not let an enemy killed by a cannon attack a device in that step', () => {
    const rules = config();
    rules.enemies.turtle.speed = 300;
    const target = enemy(1, 200, 0, 'turtle');
    target.health = 1; target.armor = 0;
    const state = fixture(rules, [barrier, cannon], [target]);
    stepBattle(state, rules, []);
    expect(state.enemies).toEqual([]);
    expect(state.devices[0]!.health).toBe(140);
  });

  it('applies beam damage before cannons and skips its dead target', () => {
    const rules = config();
    rules.beam.damagePerSecond = 300;
    const dead = enemy(1, 150, 0);
    dead.health = 1;
    const survivor = enemy(2, 100, 100);
    const state = fixture(rules, [cannon], [dead, survivor]);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(survivor.health).toBe(18);
    expect(state.devices[0]!.lastShot!.y).toBe(100);
    expect(state.kills).toBe(1);
  });
});

describe('device determinism and beam independence', () => {
  it('replays the same placements, seed and commands identically', () => {
    const placements = [cannon, barrier, { ...cannon, id: 3, x: -200 }];
    const first = createBattle(NIGHT_CONFIG, 81, undefined, placements);
    const second = createBattle(NIGHT_CONFIG, 81, undefined, placements);
    for (let tick = 0; tick < 2500; tick++) {
      const commands = [{ type: 'aim' as const, angle: Math.sin(tick / 50) * Math.PI }];
      stepBattle(first, NIGHT_CONFIG, commands);
      stepBattle(second, NIGHT_CONFIG, commands);
    }
    expect(first).toEqual(second);
  });

  it('leaves beam occlusion, limit and full damage unchanged in the presence of devices', () => {
    const rules = config();
    rules.beam.damagePerSecond = 30;
    const enemies = [enemy(1, 100), enemy(2, 200), enemy(3, 190, 28), enemy(4, 190, -28)];
    const without = fixture(rules, [], structuredClone(enemies));
    const withDevices = fixture(rules, [barrier, { ...cannon, x: -250 }], structuredClone(enemies));
    const selection = selectBeamTargets(enemies, rules, 0);
    stepBattle(without, rules, [{ type: 'aim', angle: 0 }]);
    stepBattle(withDevices, rules, [{ type: 'aim', angle: 0 }]);
    expect(withDevices.litEnemyIds).toEqual(selection.lit);
    expect(withDevices.blockedEnemyIds).toEqual(selection.blocked);
    expect(withDevices.enemies).toEqual(without.enemies);
    expect(withDevices.litEnemyIds).toHaveLength(2);
    for (const id of selection.lit) expect(withDevices.enemies.find(target => target.id === id)!.health).toBe(33);
  });
});
