import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { damageEnemy } from '../src/simulation/devices';

function config(): NightConfig {
  const rules = structuredClone(NIGHT_CONFIG);
  // Isolate damage/selection timing; production turn limits have separate tests.
  rules.beam.turnSpeed = Math.PI / rules.stepSeconds;
  rules.enemies.ghost.speed = 0;
  rules.enemies.turtle.speed = 0;
  rules.waves = [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }];
  return rules;
}

function enemy(id: number, x: number, y = 0, kind: EnemyKind = 'ghost'): EnemyState {
  const definition = NIGHT_CONFIG.enemies[kind];
  return { id, kind, x, y, waveIndex: 0, health: definition.health, armor: definition.armor, attackCooldown: 0 };
}

function fixture(rules: NightConfig, enemies: EnemyState[], placements: DevicePlacement[] = []) {
  const state = createBattle(rules, 42, undefined, placements);
  state.enemies = enemies;
  state.waves[0]!.spawned = rules.waves[0]!.enemies.length;
  return state;
}

describe('actual combat feedback', () => {
  it('reports actual armor and health loss, overkill, and one break/death transition', () => {
    const state = createBattle(config(), 42);
    const target = enemy(7, 180, 20, 'turtle');
    target.armor = 3;
    target.health = 4;
    damageEnemy(target, 2, state);
    damageEnemy(target, 3, state);
    damageEnemy(target, 100, state);
    damageEnemy(target, 100, state);
    expect(state.events.slice(1)).toEqual([
      { id: 2, tick: 0, type: 'enemy-hit', enemyId: 7, enemyKind: 'turtle', x: 180, y: 20, healthDamage: 0, armorDamage: 2 },
      { id: 3, tick: 0, type: 'enemy-hit', enemyId: 7, enemyKind: 'turtle', x: 180, y: 20, healthDamage: 2, armorDamage: 1 },
      { id: 4, tick: 0, type: 'armor-broken', enemyId: 7, enemyKind: 'turtle', x: 180, y: 20 },
      { id: 5, tick: 0, type: 'enemy-hit', enemyId: 7, enemyKind: 'turtle', x: 180, y: 20, healthDamage: 2, armorDamage: 0 },
      { id: 6, tick: 0, type: 'enemy-died', enemyId: 7, enemyKind: 'turtle', x: 180, y: 20 },
    ]);
  });

  it('emits no hits for fully blocked, unselected or out-of-sector enemies', () => {
    const rules = config();
    rules.beam.halfAngle = 0.5;
    const state = fixture(rules, [enemy(1, 250), enemy(2, 240 * Math.cos(-0.14), 240 * Math.sin(-0.14)),
      enemy(3, 100 * Math.cos(0.28), 100 * Math.sin(0.28)), enemy(4, 200 * Math.cos(0.28), 200 * Math.sin(0.28)),
      enemy(5, -200)]);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.litEnemyIds).toEqual([1, 2]);
    expect(state.blockedEnemyIds).toEqual([4]);
    expect(state.events.filter(event => event.type === 'enemy-hit').map(event => event.enemyId)).toEqual([1, 2]);
  });

  it('emits nothing for zero damage and preserves the two-argument damage API', () => {
    const state = createBattle(config(), 42);
    const target = enemy(1, 100);
    damageEnemy(target, 0, state);
    expect(state.events).toHaveLength(1);
    damageEnemy(target, 2);
    expect(target.health).toBe(32);
    expect(state.events).toHaveLength(1);
  });

  it('orders beam armor break before cannon death and never repeats death or rewards', () => {
    const rules = config();
    const target = enemy(1, 150, 0, 'turtle');
    target.armor = 1;
    target.health = 2;
    const state = fixture(rules, [target], [{ id: 1, kind: 'cannon', x: 100, y: 0 }, { id: 2, kind: 'cannon', x: 100, y: 50 }]);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.events.map(event => event.type)).toEqual([
      'wave-started', 'enemy-hit', 'armor-broken', 'enemy-hit', 'enemy-died', 'wave-completed',
    ]);
    expect(state.events.filter(event => event.type === 'enemy-hit')).toMatchObject([
      { armorDamage: 1, healthDamage: 0 }, { armorDamage: 0, healthDamage: 2 },
    ]);
    expect(state.devices[1]!.lastShot).toBeNull();
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(rules.enemies.turtle.reward);
    const snapshot = structuredClone(state);
    stepBattle(state, rules, []);
    expect(state).toEqual(snapshot);
  });

  it('prevents beam-killed enemies from being hit by cannons or attacking the lighthouse', () => {
    const rules = config();
    const target = enemy(1, 42);
    target.health = 1;
    const state = fixture(rules, [target], [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.events.filter(event => event.type === 'enemy-died')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'enemy-hit')).toHaveLength(1);
    expect(state.events.some(event => event.type === 'lighthouse-hit')).toBe(false);
    expect(state.devices[0]!.lastShot).toBeNull();
  });

  it('clamps device hits, emits destruction once and skips attacks on destroyed contacts', () => {
    const rules = config();
    rules.beam.damagePerSecond = 0;
    const targets = [enemy(1, 150, 0, 'turtle'), enemy(2, 150, 0, 'turtle')];
    const state = fixture(rules, targets, [{ id: 4, kind: 'barrier', x: 150, y: 0 }]);
    state.devices[0]!.health = 3;
    stepBattle(state, rules, []);
    expect(state.events.slice(1)).toEqual([
      { id: 2, tick: 0, type: 'device-hit', deviceId: 4, deviceKind: 'barrier', x: 150, y: 0, damage: 3 },
      { id: 3, tick: 0, type: 'device-destroyed', deviceId: 4, deviceKind: 'barrier', x: 150, y: 0, damage: 3 },
    ]);
    expect(targets[1]!.attackCooldown).toBe(0);
    for (let i = 0; i < 100; i++) stepBattle(state, rules, []);
    expect(state.events.filter(event => event.type === 'device-destroyed')).toHaveLength(1);
  });

  it('emits successive actual device damage without premature destruction', () => {
    const rules = config();
    rules.beam.damagePerSecond = 0;
    const target = enemy(1, 150, 0, 'turtle');
    const state = fixture(rules, [target], [{ id: 1, kind: 'barrier', x: 150, y: 0 }]);
    state.devices[0]!.health = 15;
    stepBattle(state, rules, []);
    expect(state.events.at(-1)).toMatchObject({ type: 'device-hit', damage: 12 });
    target.attackCooldown = 0;
    stepBattle(state, rules, []);
    expect(state.events.slice(-2)).toMatchObject([{ type: 'device-hit', damage: 3 }, { type: 'device-destroyed', damage: 3 }]);
  });

  it('reports only remaining lighthouse health when several attackers overkill it', () => {
    const rules = config();
    rules.beam.damagePerSecond = 0;
    const state = fixture(rules, [enemy(1, 42), enemy(2, 42)]);
    state.lighthouseHealth = 2;
    stepBattle(state, rules, []);
    expect(state.events.filter(event => event.type === 'lighthouse-hit')).toEqual([
      { id: 2, tick: 0, type: 'lighthouse-hit', x: 0, y: 0, damage: 2 },
    ]);
    expect(state.outcome).toBe('defeat');
  });
});

describe('wave feedback and event journal', () => {
  it('records timed and early starts and grants bonus only at actual completion', () => {
    const rules = config();
    rules.waveInterval = rules.stepSeconds;
    rules.waves = [0, 1, 2].map(index => ({ id: String(index), enemies: ['ghost'], spawnInterval: 1 }));
    const state = createBattle(rules, 42);
    expect(state.events[0]).toMatchObject({ type: 'wave-started', waveIndex: 0, bonus: 0, early: false, tick: 0 });
    stepBattle(state, rules, []);
    stepBattle(state, rules, []);
    expect(state.events.at(-1)).toMatchObject({ type: 'wave-started', waveIndex: 1, bonus: 0, early: false, tick: 1 });
    // Call at the deadline: it is still a manual early start, with zero bonus.
    stepBattle(state, rules, [{ type: 'callWave' }]);
    expect(state.events.at(-1)).toMatchObject({ type: 'wave-started', waveIndex: 2, bonus: 0, early: true });
    const target = state.enemies.find(item => item.waveIndex === 2)!;
    target.x = 100; target.y = 0; target.health = 1;
    state.enemies.filter(item => item !== target).forEach(item => { item.x = -300; item.y = 0; });
    // Evict the start; completion must not infer 'early' from the journal or bonus.
    const armored = enemy(99, -300, 0, 'turtle');
    armored.armor = 1000;
    for (let index = 0; index < 300; index++) damageEnemy(armored, 1, state);
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.events.at(-1)).toMatchObject({ type: 'wave-completed', waveIndex: 2, bonus: 0, early: true });
    expect(state.waves[0]!.completed).toBe(false);
    expect(state.events.filter(event => event.type === 'wave-completed')).toHaveLength(1);
  });

  it('reports earned positive early bonus once after destroying that wave', () => {
    const rules = config();
    rules.waves = [0, 1].map(index => ({ id: String(index), enemies: ['ghost'], spawnInterval: 1 }));
    const state = createBattle(rules, 42);
    stepBattle(state, rules, [{ type: 'callWave' }]);
    expect(state.events.at(-1)).toMatchObject({ type: 'wave-started', waveIndex: 1, bonus: 27, early: true });
    expect(state.earnedBonus).toBe(0);
    const target = state.enemies.find(item => item.waveIndex === 1)!;
    target.x = 100; target.y = 0; target.health = 1;
    state.enemies[0]!.x = -300; state.enemies[0]!.y = 0;
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.events.at(-1)).toMatchObject({ type: 'wave-completed', waveIndex: 1, bonus: 27, early: true });
    stepBattle(state, rules, []);
    expect(state.events.filter(event => event.type === 'wave-completed')).toHaveLength(1);
    expect(state.earnedBonus).toBe(27);
  });

  it('keeps 256 chronological facts with monotonic ids, simulation ticks and stable captured positions', () => {
    const rules = config();
    rules.beam.damagePerSecond = 30;
    const target = enemy(1, 200);
    target.health = 1000;
    const state = fixture(rules, [target]);
    for (let i = 0; i < 300; i++) stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.events).toHaveLength(256);
    expect(state.events[0]).toMatchObject({ id: 46, tick: 44, x: 200, y: 0 });
    expect(state.events.at(-1)).toMatchObject({ id: 301, tick: 299 });
    expect(state.nextEventId).toBe(302);
    expect(state.events.every((event, index) => event.id === 46 + index && event.tick === 44 + index)).toBe(true);
    target.x = 180;
    expect(state.events.at(-1)!.x).toBe(200);
  });

  it('reproduces events with equal seeds and commands without additional random draws', () => {
    let calls = 0;
    const first = createBattle(NIGHT_CONFIG, 42, { next: () => { calls++; return 0.25; } });
    const second = createBattle(NIGHT_CONFIG, 42, { next: () => 0.25 });
    for (let tick = 0; tick < 1200; tick++) {
      const commands = [{ type: 'aim' as const, angle: Math.PI / 2 }];
      stepBattle(first, NIGHT_CONFIG, commands);
      stepBattle(second, NIGHT_CONFIG, commands);
    }
    expect(first).toEqual(second);
    expect(first.events.length).toBeGreaterThan(1);
    expect(calls).toBe(first.waves.reduce((sum, wave) => sum + wave.spawned, 0));
  });
});
