import { describe, expect, it } from 'vitest';
import type { BattleState, EnemyState, NightConfig } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { intersectsBeam, isFullyBlocked, selectBeamTargets } from '../src/simulation/beam';

function enemy(id: number, distance: number, angle = 0, kind: EnemyState['kind'] = 'ghost'): EnemyState {
  const definition = NIGHT_CONFIG.enemies[kind];
  return { id, kind, waveIndex: 0, x: distance * Math.cos(angle), y: distance * Math.sin(angle),
    health: definition.health, armor: definition.armor, attackCooldown: 0 };
}

function testConfig(overrides: Partial<NightConfig> = {}): NightConfig {
  // Unit fixtures isolate hit resolution; catalog acceptance uses the real turn rate.
  return { ...NIGHT_CONFIG, waves: [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }], ...overrides,
    beam: { ...(overrides.beam ?? NIGHT_CONFIG.beam), turnSpeed: Math.PI / NIGHT_CONFIG.stepSeconds } };
}

function place(state: BattleState, enemies: EnemyState[]): void {
  state.enemies = enemies;
  state.waves[0]!.spawned = enemies.length;
  state.waves[0]!.defeated = 0;
}

describe('beam geometry and limits', () => {
  it('tests the actual circle against sector and finite range, including touching edges', () => {
    const range = NIGHT_CONFIG.beam.range;
    expect(intersectsBeam(enemy(1, range + 12), NIGHT_CONFIG, 0)).toBe(true);
    expect(intersectsBeam(enemy(1, range + 12.1), NIGHT_CONFIG, 0)).toBe(false);
    expect(intersectsBeam(enemy(1, 100, NIGHT_CONFIG.beam.halfAngle + 0.1), NIGHT_CONFIG, 0)).toBe(true);
    expect(intersectsBeam(enemy(1, 100, Math.PI), NIGHT_CONFIG, 0)).toBe(false);
    expect(intersectsBeam(enemy(1, 100, -Math.PI + 0.02), NIGHT_CONFIG, Math.PI)).toBe(true);
  });

  it('fully blocks aligned targets, keeps partially covered targets available', () => {
    const near = enemy(1, 100);
    const far = enemy(2, 200);
    expect(isFullyBlocked(far, [near, far], NIGHT_CONFIG)).toBe(true);
    near.y = 10;
    expect(isFullyBlocked(far, [near, far], NIGHT_CONFIG)).toBe(false);
    expect(selectBeamTargets([near, far], NIGHT_CONFIG, 0).lit).toEqual([2, 1]);
  });

  it('unions nearer silhouettes, including the angle wrap boundary', () => {
    const target = enemy(3, 180, Math.PI, 'turtle');
    const first = enemy(1, 140, Math.PI - 0.04);
    const second = enemy(2, 140, Math.PI + 0.04);
    expect(isFullyBlocked(target, [target, first], NIGHT_CONFIG)).toBe(false);
    expect(isFullyBlocked(target, [target, second], NIGHT_CONFIG)).toBe(false);
    expect(isFullyBlocked(target, [target, first, second], NIGHT_CONFIG)).toBe(true);
  });

  it('keeps unselected bodies opaque and selects by axis rather than distance', () => {
    const config = { ...NIGHT_CONFIG, beam: { ...NIGHT_CONFIG.beam, halfAngle: 0.5 } };
    const axis = enemy(1, 250, 0);
    const second = enemy(2, 240, -0.14);
    const screen = enemy(3, 100, 0.28);
    const hidden = enemy(4, 200, 0.28);
    expect(selectBeamTargets([hidden, screen, second, axis], config, 0)).toEqual({ lit: [1, 2], blocked: [4] });
  });
});

describe('fixed-step combat', () => {
  it('gives each of two selected targets full damage', () => {
    const config = testConfig({ waves: [{ id: 'pair', enemies: ['ghost', 'ghost'], spawnInterval: 1 }] });
    const state = createBattle(config, 1);
    place(state, [enemy(1, 200, -0.1), enemy(2, 200, 0.1)]);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state.litEnemyIds).toHaveLength(2);
    for (const target of state.enemies) expect(target.health).toBe(33);
  });

  it('preserves damaged armor after switching and transfers leftover damage to health', () => {
    const config = testConfig({ beam: { ...NIGHT_CONFIG.beam, damagePerSecond: 45 } });
    const state = createBattle(config, 1);
    const target = enemy(1, 200, 0, 'turtle');
    target.armor = 2;
    place(state, [target]);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(target.armor).toBe(0.5);
    stepBattle(state, config, [{ type: 'aim', angle: Math.PI }]);
    expect(target.armor).toBe(0.5);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(target.armor).toBe(0);
    expect(target.health).toBe(41);
  });

  it('kills before the attack, rewards once, and freezes completed state', () => {
    const config = testConfig();
    const state = createBattle(config, 1);
    const target = enemy(1, config.lighthouseRadius + 12);
    target.health = 1;
    place(state, [target]);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state.outcome).toBe('victory');
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth);
    expect(state.earnedResources).toBe(config.enemies.ghost.reward);
    const snapshot = structuredClone(state);
    stepBattle(state, config, [{ type: 'callWave' }]);
    expect(state).toEqual(snapshot);
  });

  it('leaves attackers at the lighthouse and applies attacks at their intervals', () => {
    const config = testConfig({ lighthouseHealth: 10 });
    const state = createBattle(config, 1);
    place(state, [enemy(1, config.lighthouseRadius + 12)]);
    stepBattle(state, config, [{ type: 'aim', angle: Math.PI }]);
    expect(state.lighthouseHealth).toBe(5);
    for (let index = 0; index < 53; index++) stepBattle(state, config, []);
    expect(state.lighthouseHealth).toBe(5);
    stepBattle(state, config, []);
    expect(state.outcome).toBe('defeat');
    expect(state.enemies).toHaveLength(1);
  });

  it('is deterministic for equal seed and commands, and supports injected randomness', () => {
    const first = createBattle(NIGHT_CONFIG, 42), second = createBattle(NIGHT_CONFIG, 42);
    for (let tick = 0; tick < 2000; tick++) {
      const commands = [{ type: 'aim' as const, angle: Math.sin(tick / 60) * Math.PI }];
      stepBattle(first, NIGHT_CONFIG, commands);
      stepBattle(second, NIGHT_CONFIG, commands);
    }
    expect(first).toEqual(second);
    expect(first.elapsed).toBe(first.tick * NIGHT_CONFIG.stepSeconds);
    expect(createBattle(NIGHT_CONFIG, 43).enemies).not.toEqual(createBattle(NIGHT_CONFIG, 42).enemies);
    const injected = createBattle(NIGHT_CONFIG, 5, { next: () => 0.25 });
    expect(injected.enemies[0]!.y).toBe(NIGHT_CONFIG.spawnRadius);
  });
});

describe('independent waves and earned bonuses', () => {
  const config = testConfig({ waveInterval: 2, waves: [
    { id: 'first', enemies: ['ghost'], spawnInterval: 1 },
    { id: 'second', enemies: ['ghost'], spawnInterval: 1 },
    { id: 'third', enemies: ['ghost'], spawnInterval: 1 },
  ] });

  it('starts a timed wave while the previous wave is still alive', () => {
    const state = createBattle(config, 1);
    for (let tick = 0; tick <= 60; tick++) stepBattle(state, config, []);
    expect(state.waves[1]!.started).toBe(true);
    expect(state.enemies.filter(target => target.waveIndex === 0)).toHaveLength(1);
    expect(state.enemies.filter(target => target.waveIndex === 1)).toHaveLength(1);
  });

  it('awards early bonus only on completion of that wave and retains it on defeat', () => {
    const state = createBattle(config, 1);
    stepBattle(state, config, [{ type: 'callWave' }]);
    expect(state.waves[1]!.earlyBonus).toBe(2);
    expect(state.earnedBonus).toBe(0);
    const called = state.enemies.find(target => target.waveIndex === 1)!;
    called.x = 200; called.y = 0; called.health = 1;
    const original = state.enemies.find(target => target.waveIndex === 0)!;
    original.x = -100; original.y = 0;
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state.earnedBonus).toBe(2);
    expect(state.waves[0]!.completed).toBe(false);
    original.x = -42; original.attackCooldown = 0;
    state.lighthouseHealth = 1;
    stepBattle(state, config, []);
    expect(state.outcome).toBe('defeat');
    expect(state.earnedBonus).toBe(2);
  });
});

describe('provisional night balance', () => {
  it('can be won in 60–100 seconds with simple nearest-threat aiming across several seeds', () => {
    for (const seed of [1, 7, 42, 731, 2026]) {
      const state = createBattle(NIGHT_CONFIG, seed);
      for (let tick = 0; tick < 3600 && state.outcome === 'playing'; tick++) {
        const target = [...state.enemies].filter(item => Math.hypot(item.x, item.y) < NIGHT_CONFIG.beam.range)
          .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
        stepBattle(state, NIGHT_CONFIG, target ? [{ type: 'aim', angle: Math.atan2(target.y, target.x) }] : []);
      }
      expect(state.outcome, `seed ${seed}`).toBe('victory');
      expect(state.elapsed).toBeGreaterThanOrEqual(60);
      expect(state.elapsed).toBeLessThanOrEqual(100);
      expect(state.kills).toBe(21);
    }
  });

  it('fails if the player ignores the threats', () => {
    const state = createBattle(NIGHT_CONFIG, 42);
    for (let tick = 0; tick < 6000 && state.outcome === 'playing'; tick++) stepBattle(state, NIGHT_CONFIG, []);
    expect(state.outcome).toBe('defeat');
  });
});
