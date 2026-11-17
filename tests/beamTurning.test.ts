import { describe, expect, it } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { angleDifference } from '../src/simulation/beam';
import { LighthouseApplication } from '../src/application/gameApplication';

function setup() {
  const config = structuredClone(NIGHT_CONFIG);
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 10000;
  config.waves = [{ id: 'turn', enemies: ['ghost'], spawnInterval: 1 }];
  const state = createBattle(config, 42, undefined, [{ id: 1, kind: 'cannon', x: -200, y: 0 }]);
  state.enemies[0]!.x = 200; state.enemies[0]!.y = 0;
  return { config, state };
}

describe('limited simulation beam rotation', () => {
  it('takes two seconds for a half turn and keeps moving without repeated input', () => {
    const { config, state } = setup();
    expect(config.beam.turnSpeed).toBe(Math.PI / 2);
    stepBattle(state, config, [{ type: 'aim', angle: Math.PI / 2 }]);
    expect(state.beamAngle).toBeCloseTo(-Math.PI / 2 + Math.PI / 60);
    expect(state.desiredBeamAngle).toBeCloseTo(Math.PI / 2);
    for (let i = 1; i < 30; i++) stepBattle(state, config, []);
    expect(state.beamAngle).toBeCloseTo(0);
    for (let i = 30; i < 60; i++) stepBattle(state, config, []);
    expect(state.beamAngle).toBeCloseTo(Math.PI / 2);
    stepBattle(state, config, []);
    expect(state.beamAngle).toBeCloseTo(Math.PI / 2);
  });

  it.each([1, -1])('takes the short arc across the angle boundary (%s)', sign => {
    const { config, state } = setup();
    state.beamAngle = state.desiredBeamAngle = sign * (Math.PI - .02);
    stepBattle(state, config, [{ type: 'aim', angle: -sign * (Math.PI - .02) }]);
    expect(state.beamAngle).toBeCloseTo(-sign * (Math.PI - .02));
  });

  it('applies only the last valid aim and a single turn budget per fixed step', () => {
    const { config, state } = setup();
    stepBattle(state, config, [{ type: 'aim', angle: Math.PI }, { type: 'aim', angle: 0 },
      { type: 'aim', angle: Number.NaN }, { type: 'aim', angle: Infinity }]);
    expect(state.desiredBeamAngle).toBe(0);
    expect(state.beamAngle).toBeCloseTo(-Math.PI / 2 + config.beam.turnSpeed * config.stepSeconds);
    stepBattle(state, config, [{ type: 'aim', angle: 8 * Math.PI }]);
    expect(state.desiredBeamAngle).toBeCloseTo(0);
  });

  it('uses the actual angle for hits instead of the desired direction', () => {
    const { config, state } = setup();
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state.litEnemyIds).toEqual([]);
    expect(state.enemies[0]!.health).toBe(10000);
    for (let i = 1; i < 30; i++) stepBattle(state, config, []);
    expect(state.litEnemyIds).toEqual([1]);
    expect(state.enemies[0]!.health).toBeLessThan(10000);
  });

  it('continues the existing turn through device, wave and flash commands', () => {
    const { config, state } = setup();
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    const before = state.beamAngle;
    stepBattle(state, config, [{ type: 'cannon-priority', deviceId: 1, priority: 'weakest' },
      { type: 'cannon-target', deviceId: 1, enemyId: 1 }, { type: 'callWave' }, { type: 'flash' }]);
    expect(state.desiredBeamAngle).toBe(0);
    expect(angleDifference(state.beamAngle, before)).toBeCloseTo(config.beam.turnSpeed * config.stepSeconds);
  });

  it('freezes both angles after the result', () => {
    const { config, state } = setup();
    state.outcome = 'defeat';
    const before = structuredClone(state);
    stepBattle(state, config, [{ type: 'aim', angle: 0 }]);
    expect(state).toEqual(before);
  });
});

describe('rotation through application lifecycle', () => {
  function application() {
    const { config } = setup();
    let raw: string | null = null;
    const app = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, config, () => ({ id: 'turn', seed: 42 }));
    app.openPreparation(); app.start();
    return app;
  }
  it('freezes during pause, rejects paused aim and resumes without catching up', () => {
    const app = application();
    app.command({ type: 'aim', angle: Math.PI / 2 }); app.advance(1000 / 30);
    const before = structuredClone(app.view.battle!);
    app.pause(); app.command({ type: 'aim', angle: 0 }); app.advance(10000);
    expect(app.view.battle).toEqual(before);
    app.resume(); app.advance(10000);
    expect(app.view.battle).toEqual(before);
    app.advance(1000 / 30);
    expect(app.view.battle!.desiredBeamAngle).toBe(before.desiredBeamAngle);
    expect(angleDifference(app.view.battle!.beamAngle, before.beamAngle)).toBeCloseTo(Math.PI / 60);
  });
  it('produces the same state at 30, 60 and 120 presentation frames per second', () => {
    const apps = [30, 60, 120].map(fps => {
      const app = application(); app.command({ type: 'aim', angle: Math.PI / 2 });
      for (let frame = 0; frame < fps; frame++) app.advance(1000 / fps);
      return app;
    });
    expect(apps[0]!.view.battle!.tick).toBe(30);
    expect(apps[1]!.view.battle).toEqual(apps[0]!.view.battle);
    expect(apps[2]!.view.battle).toEqual(apps[0]!.view.battle);
  });
});
