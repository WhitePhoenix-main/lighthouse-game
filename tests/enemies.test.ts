import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind } from '../src/contracts';
import { ENEMIES } from '../src/content/enemies';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';

function setup(kind: EnemyKind, placements: DevicePlacement[] = []) {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.enemies = structuredClone(ENEMIES); rules.beam.damagePerSecond = 0;
  rules.waves = [{ id: 'test', enemies: [kind], spawnInterval: 1 }];
  const state = createBattle(rules, 7, undefined, placements);
  const enemy = state.enemies[0]!; enemy.x = 280; enemy.y = 0;
  return { rules, state, enemy };
}

describe('minotaur one lifetime charge', () => {
  it('waits the full configured windup before the first charging movement', () => {
    const { rules, state, enemy } = setup('minotaur');
    for (let i = 0; i < Math.round(rules.enemies.minotaur.charge!.windup / rules.stepSeconds); i++) {
      stepBattle(state, rules, []); expect(enemy.x).toBe(280);
    }
    stepBattle(state, rules, []); expect(enemy.x).toBeLessThan(280); expect(enemy.chargePhase).toBe('charging');
  });
  it('telegraphs motion, freezes windup during stun, and applies only one boosted swept barrier impact', () => {
    const { rules, state, enemy } = setup('minotaur', [{ id: 1, kind: 'barrier', x: 130, y: 0 }]);
    stepBattle(state, rules, []);
    expect(enemy.chargePhase).toBe('windup'); expect(enemy.x).toBe(280);
    const remaining = enemy.chargeRemaining;
    enemy.stunnedUntilTick = state.tick + 10;
    for (let i = 0; i < 10; i++) stepBattle(state, rules, []);
    expect(enemy.chargeRemaining).toBe(remaining); expect(enemy.x).toBe(280);
    rules.enemies.minotaur.charge!.speed = 100000;
    for (let i = 0; i < Math.ceil(rules.enemies.minotaur.charge!.windup / rules.stepSeconds) + 2 && enemy.chargePhase !== 'spent'; i++) stepBattle(state, rules, []);
    expect(enemy.x).toBeCloseTo(130 + rules.devices.definitions.barrier.radius + rules.enemies.minotaur.radius);
    expect(state.devices[0]!.health).toBe(rules.devices.definitions.barrier.health - 36);
    expect(enemy.chargePhase).toBe('spent');
    enemy.attackCooldown = 0; stepBattle(state, rules, []);
    expect(state.devices[0]!.health).toBe(rules.devices.definitions.barrier.health - 48);
    expect(state.events.filter(e => e.type === 'charge-started')).toHaveLength(1);
    expect(state.events.filter(e => e.type === 'charge-impact')).toHaveLength(1);
  });

  it('uses ordinary contact against a forward barrier outside the charge trigger', () => {
    const { rules, state, enemy } = setup('minotaur', [{ id: 1, kind: 'barrier', x: 274, y: 0 }]);
    enemy.x = rules.spawnRadius;
    for (let i = 0; i < 100 && state.devices[0]!.health === rules.devices.definitions.barrier.health; i++) stepBattle(state, rules, []);
    expect(enemy.chargePhase).toBe('ready');
    expect(state.devices[0]!.health).toBe(rules.devices.definitions.barrier.health - rules.enemies.minotaur.attackDamage);
    expect(state.events.filter(e => e.type === 'charge-started' || e.type === 'charge-impact')).toHaveLength(0);
  });

  it('hits the shield first without overflow, then proceeds using normal damage', () => {
    const { rules, state, enemy } = setup('minotaur', [{ id: 1, kind: 'generator', x: 70, y: 0 }]);
    enemy.chargePhase = 'charging'; rules.enemies.minotaur.charge!.speed = 100000;
    state.shield.current = 1;
    stepBattle(state, rules, []);
    expect(enemy.x).toBeCloseTo(rules.shield.radius + rules.enemies.minotaur.radius);
    expect(state.shield.current).toBe(0); expect(state.devices[0]!.health).toBe(60);
    expect(enemy.chargePhase).toBe('spent'); expect(state.lighthouseHealth).toBe(120);
    enemy.attackCooldown = 0; rules.enemies.minotaur.speed = 100000;
    stepBattle(state, rules, []);
    expect(state.devices[0]!.health).toBe(48);
  });

  it('cannot impact while stunned and never gains a second charge after obstacle destruction', () => {
    const { rules, state, enemy } = setup('minotaur', [{ id: 1, kind: 'barrier', x: 130, y: 0 }]);
    enemy.chargePhase = 'charging'; enemy.stunnedUntilTick = 2;
    rules.enemies.minotaur.charge!.speed = 100000; state.devices[0]!.health = 1;
    stepBattle(state, rules, []); stepBattle(state, rules, []);
    expect(enemy.x).toBe(280); expect(state.devices[0]!.health).toBe(1);
    stepBattle(state, rules, []); expect(state.devices[0]!.health).toBe(0);
    for (let i = 0; i < 100; i++) stepBattle(state, rules, []);
    expect(enemy.chargePhase).toBe('spent');
    expect(state.events.filter(e => e.type === 'charge-impact')).toHaveLength(1);
  });
});

describe('flying threat', () => {
  it('flies out toward an external target after shield recovery pushes it to the boundary', () => {
    const { rules, state, enemy } = setup('bat', [
      { id: 1, kind: 'generator', x: -70, y: 0 }, { id: 2, kind: 'cannon', x: -220, y: 0 },
    ]);
    enemy.x = -150; enemy.attackCooldown = 1;
    state.shield.current = 0; state.shield.recoveryRemaining = 0;
    stepBattle(state, rules, []);
    expect(enemy.targetDeviceId).toBe(2);
    expect(enemy.x).toBeLessThan(-rules.shield.radius - rules.enemies.bat.radius);
    expect(state.shield.current).toBeCloseTo(rules.shield.regenerationPerSecond * rules.stepSeconds);
    expect(state.events.some(event => event.type === 'shield-hit')).toBe(false);
  });

  it('seeks nearest eligible device, ignores barriers and consumed traps, then retargets and falls back to lighthouse', () => {
    const { rules, state, enemy } = setup('bat', [
      { id: 1, kind: 'barrier', x: 250, y: 0 }, { id: 2, kind: 'cannon', x: 160, y: 0 },
      { id: 3, kind: 'light-trap', x: 240, y: 0 }, { id: 4, kind: 'cannon', x: 100, y: 50 },
    ]);
    rules.devices.definitions.cannon.damage = 0; rules.enemies.bat.speed = 10000;
    state.devices[2]!.consumed = true;
    stepBattle(state, rules, []);
    expect(enemy.targetDeviceId).toBe(2); expect(state.devices[0]!.health).toBe(140);
    expect(state.devices[1]!.health).toBe(rules.devices.definitions.cannon.health - 9);
    state.devices[1]!.health = 0; stepBattle(state, rules, []);
    expect(enemy.targetDeviceId).toBe(4);
    state.devices[3]!.health = 0; stepBattle(state, rules, []);
    expect(enemy.targetDeviceId).toBeNull(); expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(40);
  });

  it('rejects bat manual targeting and also excludes bats from automatic cannon targeting', () => {
    const { rules, state, enemy } = setup('bat', [{ id: 1, kind: 'cannon', x: 120, y: 0 }]);
    enemy.x = 200; rules.enemies.bat.speed = 0;
    stepBattle(state, rules, [{ type: 'cannon-target', deviceId: 1, enemyId: enemy.id }]);
    expect(state.devices[0]!.targetId).toBeNull(); expect(enemy.health).toBe(25);
    state.devices[0]!.targetId = enemy.id; stepBattle(state, rules, []);
    expect(state.devices[0]!.lastShot).toBeNull(); expect(state.devices[0]!.targetId).toBeNull();
    rules.beam.damagePerSecond = 30;
    state.beamAngle = state.desiredBeamAngle = 0;
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]); expect(enemy.health).toBe(24);
    rules.flash.enabled = true;
    stepBattle(state, rules, [{ type: 'flash' }]); expect(enemy.health).toBe(1);
    expect(enemy.stunnedUntilTick).toBeGreaterThan(state.tick);
  });

  it('is stopped by shield and damaged by an automatic trap', () => {
    const { rules, state, enemy } = setup('bat', [{ id: 1, kind: 'generator', x: 70, y: 0 }]);
    rules.enemies.bat.speed = 100000;
    stepBattle(state, rules, []);
    expect(enemy.x).toBeCloseTo(165); expect(state.shield.current).toBe(81);
    const trap = { id: 2, kind: 'light-trap' as const, x: enemy.x, y: 0, health: 1, consumed: false, attackCooldown: 0,
      lastShot: null, priority: 'nearest' as const, targetId: null };
    state.devices.push(trap); stepBattle(state, rules, []);
    expect(trap.consumed).toBe(true); expect(enemy.health).toBe(0);
  });
});

describe('seeded shore spawning', () => {
  it('keeps full ground bodies on land, permits both sides for ghost/bat, and replays the new enemies', () => {
    const { rules } = setup('ghost'); rules.terrain = { shoreX: 0, landOnlyPlacement: true };
    rules.waves = [{ id: 'all', enemies: ['minotaur', 'turtle', 'ghost', 'bat'], spawnInterval: 0 }];
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 40; seed++) {
      const state = createBattle(rules, seed);
      for (const e of state.enemies) {
        if (e.kind === 'minotaur' || e.kind === 'turtle') expect(e.x + rules.enemies[e.kind].radius).toBeLessThanOrEqual(1e-9);
        else seen.add(e.x > 0);
      }
      const replay = createBattle(rules, seed);
      for (let tick = 0; tick < 200; tick++) { stepBattle(state, rules, []); stepBattle(replay, rules, []); }
      expect(state).toEqual(replay);
    }
    expect(seen.size).toBe(2);
  });

  it('keeps legacy unrestricted spawning when no terrain is configured', () => {
    const { rules } = setup('minotaur'); delete rules.terrain;
    const state = createBattle(rules, 1, { next: () => 0 });
    expect(state.enemies[0]!.x).toBe(rules.spawnRadius);
  });
});
