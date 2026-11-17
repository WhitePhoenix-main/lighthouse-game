import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';

function setup(placements: DevicePlacement[] = [{ id: 1, kind: 'generator', x: 70, y: 0 }]) {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.beam.damagePerSecond = 0;
  rules.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  const state = createBattle(rules, 1, undefined, placements);
  state.enemies = []; state.waves[0]!.spawned = 100;
  return { rules, state };
}
function enemy(id: number, x: number, kind: EnemyKind = 'ghost'): EnemyState {
  return { id, kind, x, y: 0, health: 1000, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

describe('shared generator shield', () => {
  it('adds capacity but never multiplies regeneration with generator count', () => {
    for (const count of [1, 2]) {
      const { rules, state } = setup(Array.from({ length: count }, (_, id) => ({ id, kind: 'generator', x: 70, y: id * 50 })));
      expect(state.shield.maximum).toBe(90 * count);
      state.shield.current = 10;
      stepBattle(state, rules, []);
      expect(state.shield.current).toBe(10.5);
    }
  });

  it.each<EnemyKind>(['ghost', 'turtle'])('stops %s at the field through a fast step and blocks attacks on protected devices', kind => {
    const { rules, state } = setup([{ id: 1, kind: 'generator', x: 130, y: 0 }]);
    rules.enemies[kind].speed = 10000;
    const target = enemy(1, 350, kind); state.enemies = [target];
    stepBattle(state, rules, []);
    expect(target.x).toBeCloseTo(rules.shield.radius + rules.enemies[kind].radius);
    expect(state.shield.current).toBe(90 - rules.enemies[kind].attackDamage);
    expect(state.devices[0]!.health).toBe(60);
    expect(state.lighthouseHealth).toBe(120);
  });

  it('leaves outside devices vulnerable and immediately clamps capacity after generator loss', () => {
    const { rules, state } = setup([{ id: 1, kind: 'generator', x: 230, y: 0 }, { id: 2, kind: 'generator', x: 70, y: 0 }]);
    const generator = state.devices[0]!; generator.health = 1;
    state.enemies = [enemy(1, 260)];
    stepBattle(state, rules, []);
    expect(generator.health).toBe(0);
    expect(state.shield.maximum).toBe(90);
    expect(state.shield.current).toBe(90);
    state.devices[1]!.health = 0;
    stepBattle(state, rules, []);
    expect(state.shield.maximum).toBe(0);
    expect(state.shield.current).toBe(0);
  });

  it('breaks without overflowing damage, waits exactly the delay and pushes internal enemies out on recovery', () => {
    const { rules, state } = setup();
    rules.enemies.ghost.speed = 0;
    state.shield.current = 1;
    const target = enemy(1, 167); state.enemies = [target];
    stepBattle(state, rules, []);
    expect(state.shield.current).toBe(0);
    expect(state.devices[0]!.health).toBe(60);
    expect(state.events.filter(event => event.type === 'shield-broken')).toHaveLength(1);
    target.x = 100; target.y = 80; target.attackCooldown = 999;
    for (let i = 0; i < 119; i++) stepBattle(state, rules, []);
    expect(state.shield.current).toBe(0);
    stepBattle(state, rules, []);
    expect(state.shield.current).toBe(0.5);
    expect(Math.hypot(target.x, target.y)).toBeCloseTo(167);
    expect(state.events.filter(event => event.type === 'shield-restored')).toHaveLength(1);
  });

  it.each(['lighthouse', 'device'])('restarts recovery on hits to a protected %s while exhausted', target => {
    const { rules, state } = setup();
    rules.enemies.ghost.speed = 0;
    state.shield.current = 0; state.shield.recoveryRemaining = 1;
    state.enemies = [enemy(1, target === 'lighthouse' ? -42 : 100)];
    stepBattle(state, rules, []);
    expect(state.shield.recoveryRemaining).toBe(4);
    expect(target === 'lighthouse' ? state.lighthouseHealth : state.devices[0]!.health).toBe(target === 'lighthouse' ? 115 : 55);
  });

  it('does not reset recovery when an unprotected device is hit', () => {
    const { rules, state } = setup([{ id: 1, kind: 'generator', x: 70, y: 0 }, { id: 2, kind: 'barrier', x: 250, y: 0 }]);
    state.shield.current = 0; state.shield.recoveryRemaining = 1;
    state.enemies = [enemy(1, 295, 'turtle')];
    stepBattle(state, rules, []);
    expect(state.devices[1]!.health).toBe(128);
    expect(state.shield.recoveryRemaining).toBeCloseTo(1 - rules.stepSeconds);
  });

  it('protects a whole-body boundary contact but leaves a partially outside generator vulnerable', () => {
    for (const offset of [0, 0.01]) {
      const { rules, state } = setup();
      const generator = state.devices[0]!;
      generator.x = rules.shield.radius - rules.devices.definitions.generator.radius + offset;
      state.enemies = [enemy(1, generator.x + rules.devices.definitions.generator.radius + rules.enemies.ghost.radius)];
      stepBattle(state, rules, []);
      expect(generator.health).toBe(offset === 0 ? 60 : 55);
      expect(state.shield.current).toBe(offset === 0 ? 85 : 90);
    }
  });

  it('does not pass shield overflow to the lighthouse or consume the next attacker cooldown', () => {
    const { rules, state } = setup();
    rules.enemies.ghost.speed = 10000;
    state.shield.current = 1;
    const first = enemy(1, 350), second = enemy(2, 350);
    state.enemies = [first, second];
    stepBattle(state, rules, []);
    expect(state.shield.current).toBe(0); expect(state.lighthouseHealth).toBe(120);
    expect(first.attackCooldown).toBe(rules.enemies.ghost.attackInterval);
    expect(second.attackCooldown).toBe(0);
    expect(state.events.filter(e => e.type === 'shield-hit')).toHaveLength(1);
  });
});
