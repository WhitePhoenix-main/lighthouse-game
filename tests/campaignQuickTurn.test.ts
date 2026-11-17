import { describe, expect, it } from 'vitest';
import type { NightConfig } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { QUICK_TURN_DRAFT_RANKS } from '../src/content/campaignGeneralDraft';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { angleDifference } from '../src/simulation/beam';
import { LighthouseApplication } from '../src/application/gameApplication';

function control(rank: 0 | 1 | 2 = 0) {
  const config: NightConfig = structuredClone(NIGHT_CONFIG);
  if (rank) config.beam.quickTurn = structuredClone(QUICK_TURN_DRAFT_RANKS[rank - 1]!);
  config.waves = [{ id: 'opposite-approaches', enemies: ['ghost'], spawnInterval: 1 }];
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 10000;
  const state = createBattle(config, 42);
  state.enemies[0]!.x = 0; state.enemies[0]!.y = 220;
  return { config, state };
}

function halfTurn(rank: 0 | 1 | 2) {
  const { config, state } = control(rank);
  stepBattle(state, config, [{ type: 'aim', angle: Math.PI / 2 }]);
  while (Math.abs(angleDifference(Math.PI / 2, state.beamAngle)) > 1e-9 && state.tick < 120) stepBattle(state, config, []);
  return state.tick * config.stepSeconds;
}

describe('Stage A quick-turn control scenarios (provisional, outside live purchases)', () => {
  it('shortens a half turn without teleporting; each rank has a measurable benefit', () => {
    const times = [halfTurn(0), halfTurn(1), halfTurn(2)];
    expect(times[0]).toBe(2);
    expect(times[1]).toBeLessThan(times[0]!);
    expect(times[2]).toBeLessThan(times[1]!);
    expect(times[2]).toBeGreaterThan(1.2);
    for (const rank of [1, 2] as const) {
      const { config, state } = control(rank);
      stepBattle(state, config, [{ type: 'aim', angle: Math.PI / 2 }]);
      expect(Math.abs(angleDifference(state.beamAngle, -Math.PI / 2)))
        .toBeCloseTo(config.beam.turnSpeed * config.stepSeconds); // Smooth activation begins at ordinary speed.
      expect(state.litEnemyIds).toEqual([]); // Desired direction is not a hit.
    }
    console.info('Stage A half-turn seconds [baseline, I, II]:', times);
  });

  it('retains normal tracking for nearby targets and takes the shortest wraparound arc', () => {
    for (const rank of [1, 2] as const) {
      const { config, state } = control(rank);
      state.beamAngle = state.desiredBeamAngle = 0;
      stepBattle(state, config, [{ type: 'aim', angle: Math.PI / 4 }]);
      expect(state.beamAngle).toBeCloseTo(config.beam.turnSpeed * config.stepSeconds);
      expect(state.quickTurn).toBeUndefined();
      state.beamAngle = Math.PI - .01;
      stepBattle(state, config, [{ type: 'aim', angle: -Math.PI + .01 }]);
      expect(state.beamAngle).toBeCloseTo(-Math.PI + .01);
      expect(state.quickTurn).toBeUndefined();
    }
  });

  it('fades the burst as it approaches the target and finishes at ordinary speed', () => {
    const { config, state } = control(2);
    const target = Math.PI / 2;
    stepBattle(state, config, [{ type: 'aim', angle: target }]);
    for (let i = 0; i < 5; i++) stepBattle(state, config, []);
    // Inspect angular fading in the middle of a still-live burst.
    state.beamAngle = target - Math.PI / 2;
    const before = state.beamAngle;
    stepBattle(state, config, []);
    const distance = angleDifference(state.beamAngle, before);
    expect(distance).toBeGreaterThan(config.beam.turnSpeed * config.stepSeconds);
    expect(distance).toBeLessThan(config.beam.turnSpeed * config.stepSeconds * 1.6);
    state.beamAngle = target - Math.PI / 6;
    const near = state.beamAngle;
    stepBattle(state, config, []);
    expect(angleDifference(state.beamAngle, near)).toBeCloseTo(config.beam.turnSpeed * config.stepSeconds);
    expect(state.quickTurn!.untilTick).toBeLessThan(state.tick);
  });

  it('does not rearm/extend from pointer jitter or multiple aim commands in one step', () => {
    const { config, state } = control(2);
    stepBattle(state, config, [{ type: 'aim', angle: Math.PI / 2 }]);
    const deadline = state.quickTurn!.untilTick, ready = state.quickTurn!.readyTick;
    while (state.tick < ready) {
      const before = state.beamAngle;
      // Alternate both directions, always requesting a large change.
      stepBattle(state, config, [{ type: 'aim', angle: before + 2.8 }, { type: 'aim', angle: before - 2.8 }]);
      expect(state.quickTurn!.readyTick).toBe(ready);
      expect(state.quickTurn!.untilTick).toBe(deadline);
      const limit = config.beam.turnSpeed * config.stepSeconds;
      if (state.tick > deadline) expect(Math.abs(angleDifference(state.beamAngle, before))).toBeCloseTo(limit);
      else expect(Math.abs(angleDifference(state.beamAngle, before))).toBeLessThanOrEqual(limit * 1.6 + 1e-9);
    }
    stepBattle(state, config, [{ type: 'aim', angle: state.beamAngle + Math.PI }]);
    expect(state.quickTurn!.readyTick).toBeGreaterThan(ready);
  });

  it('does not add damage or change occlusion/target limits for a held beam', () => {
    for (const rank of [0, 1, 2] as const) {
      const { config, state } = control(rank);
      state.beamAngle = state.desiredBeamAngle = 0;
      state.enemies = [110, 220].map((x, index) => ({ ...state.enemies[0]!, id: index + 1, x, y: 0, armor: 0 }));
      const health = state.enemies[0]!.health;
      stepBattle(state, config, []);
      expect(state.litEnemyIds).toEqual([1]);
      expect(state.blockedEnemyIds).toContain(2);
      expect(health - state.enemies[0]!.health).toBeCloseTo(config.beam.damagePerSecond * config.stepSeconds);
      expect(state.enemies[1]!.health).toBe(health);
      state.enemies = [-.1, 0, .1].map((a, i) => ({ ...state.enemies[0]!, id: i + 1, x: 180 * Math.cos(a), y: 180 * Math.sin(a) }));
      stepBattle(state, config, []);
      expect(state.litEnemyIds).toHaveLength(2);
    }
  });

  it('uses only the last valid aim and preserves a burst through unrelated commands', () => {
    const { config, state } = control(1);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }, { type: 'aim', angle: Math.PI / 2 }, { type: 'aim', angle: NaN }]);
    expect(state.desiredBeamAngle).toBeCloseTo(Math.PI / 2);
    const readyTick = state.quickTurn!.readyTick;
    stepBattle(state, config, [{ type: 'callWave' }, { type: 'flash' }, { type: 'cannon-priority', deviceId: 99, priority: 'weakest' }]);
    expect(state.desiredBeamAngle).toBeCloseTo(Math.PI / 2);
    expect(state.quickTurn!.readyTick).toBe(readyTick);
  });

  it('replays the same burst and state from the same seed and commands', () => {
    const a = control(2), b = control(2);
    for (let i = 0; i < 240; i++) {
      const commands = i % 45 === 0 ? [{ type: 'aim' as const, angle: i % 90 ? Math.PI / 2 : -Math.PI / 2 }] : [];
      stepBattle(a.state, a.config, commands); stepBattle(b.state, b.config, commands);
    }
    expect(a.state).toEqual(b.state);
  });

  it('pauses the active burst/cooldown and resumes without replaying real elapsed time', () => {
    const { config } = control(2);
    let raw: string | null = null;
    const app = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, config, () => ({ id: 'stage-a', seed: 42 }));
    app.openPreparation(); app.start();
    app.command({ type: 'aim', angle: Math.PI / 2 }); app.advance(1000 / 30);
    const before = structuredClone(app.view.battle!);
    expect(before.quickTurn).toBeDefined();
    app.pause(); app.advance(10000); app.resume(); app.advance(10000);
    expect(app.view.battle).toEqual(before);
    app.advance(1000 / 30);
    expect(app.view.battle!.tick).toBe(before.tick + 1);
    expect(app.view.battle!.quickTurn).toEqual(before.quickTurn);
    expect(raw).not.toContain('quickTurn');
  });
});
