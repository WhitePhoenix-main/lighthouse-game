import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { calculateNightConfig } from '../src/progression/upgrades';
import { createBattle, stepBattle } from '../src/simulation/battle';

function setup() {
  const config = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'focused', upgrades: [] });
  config.waves = [{ id: 'focus', enemies: ['ghost', 'ghost'], spawnInterval: 1000 }];
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 10000;
  const state = createBattle(config, 42);
  state.enemies = [{ id: 1, kind: 'ghost', x: 200, y: 0, health: 10000, armor: 0, attackCooldown: 0, waveIndex: 0 }];
  state.beamAngle = state.desiredBeamAngle = 0;
  return { config, state, target: state.enemies[0]! };
}

describe('continuous focused lens', () => {
  it('uses full base damage for 45 steps, then the configured hold bonus', () => {
    const { config, state, target } = setup();
    expect(config.beam.damagePerSecond).toBe(45); expect(config.beam.maxTargets).toBe(1);
    for (let i = 0; i < 45; i++) stepBattle(state, config, []);
    expect(state.focus).toEqual({ targetId: 1, ticks: 45 });
    expect(target.health).toBeCloseTo(10000 - 45 * 1.5);
    stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(10000 - 45 * 1.5 - 1.65);
  });

  it('counts actual light, loses continuity outside range and restarts on a new victim', () => {
    const { config, state, target } = setup();
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state.focus.ticks).toBe(0);
    state.beamAngle = state.desiredBeamAngle = 0;
    for (let i = 0; i < 46; i++) stepBattle(state, config, []);
    target.x = 400; stepBattle(state, config, []);
    expect(state.focus).toEqual({ targetId: null, ticks: 0 });
    target.x = 200; stepBattle(state, config, []);
    expect(state.focus.ticks).toBe(1);
    const replacement: EnemyState = { ...target, id: 2, x: 100 };
    state.enemies = [replacement]; stepBattle(state, config, []);
    expect(state.focus).toEqual({ targetId: 2, ticks: 1 });
  });

  it('resets when another body fully occludes the held enemy', () => {
    const { config, state, target } = setup();
    for (let i = 0; i < 46; i++) stepBattle(state, config, []);
    state.enemies.push({ ...target, id: 2, x: 100 });
    const before = target.health; stepBattle(state, config, []);
    expect(target.health).toBe(before);
    expect(state.blockedEnemyIds).toContain(1);
    expect(state.focus).toEqual({ targetId: 2, ticks: 1 });
  });

  it('never charges on the ship or grants a hostile pair bonus to its single target', () => {
    const { config, state } = setup();
    config.pairedDamageBonus = 1;
    config.ship = { x: 150, y: 0, radius: 18, rescueSeconds: 6, deadline: 24, reward: 12 };
    state.ship = { ...config.ship, progress: 0, remaining: 24, status: 'waiting', lit: false };
    for (let i = 0; i < 50; i++) stepBattle(state, config, []);
    expect(state.ship.lit).toBe(true);
    expect(state.focus.ticks).toBe(0);
    state.ship.status = 'rescued'; stepBattle(state, config, []);
    expect(state.focus.ticks).toBe(1);
    expect(state.enemies[0]!.health).toBeCloseTo(10000 - 1.5);
  });

  it('tracks boss zones separately without carrying the hold between tentacles', () => {
    const { config, state } = setup();
    config.boss = { ...getBossRules(1), speed: 0 };
    state.boss = { id: 'abyss-warden', health: 1000, stunnedUntilTick: 0,
      tentacles: [{ id: -1001, x: 150, y: 0, attackCooldown: 0 }, { id: -1002, x: 0, y: 150, attackCooldown: 0 }] };
    state.enemies = [];
    for (let i = 0; i < 46; i++) stepBattle(state, config, []);
    expect(state.boss.health).toBeCloseTo(1000 - 45 * 1.5 - 1.65);
    expect(state.focus.targetId).toBe(-1001);
    state.beamAngle = state.desiredBeamAngle = Math.PI / 2;
    const before = state.boss.health; stepBattle(state, config, []);
    expect(state.focus).toEqual({ targetId: -1002, ticks: 1 });
    expect(state.boss.health).toBeCloseTo(before - 1.5);
  });

  it('keeps cooldown and damage unrelated to the number of aiming commands', () => {
    const first = setup(), second = setup();
    for (let i = 0; i < 90; i++) {
      stepBattle(first.state, first.config, []);
      stepBattle(second.state, second.config, Array.from({ length: 5 }, () => ({ type: 'aim' as const, angle: 0 })));
    }
    expect(first.state).toEqual(second.state);
    first.state.outcome = 'defeat';
    const frozen = structuredClone(first.state); stepBattle(first.state, first.config, []);
    expect(first.state).toEqual(frozen);
  });
});
