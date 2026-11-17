import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { bellSlowMultiplier, incomingDeviceDamage, updateBells } from '../src/simulation/bell';
import { moveEnemies } from '../src/simulation/devices';
import { attackTentacles, moveTentacles } from '../src/simulation/boss';

const placement: DevicePlacement = { id: 5, kind: 'bell', x: 150, y: 0 };
function enemy(id = 1, x = 250, kind: EnemyKind = 'ghost', y = 0): EnemyState {
  return { id, kind, x, y, health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 };
}
function setup(placements: DevicePlacement[] = [placement]) {
  const config = structuredClone(NIGHT_CONFIG);
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }];
  const state = createBattle(config, 12, undefined, placements);
  state.enemies = [enemy()]; state.waves[0]!.spawned = 1;
  return { state, config };
}

describe('bell pulses and source lifetime', () => {
  it('uses body intersections for all enemies, independent of beam, with no damage or rewards', () => {
    const { state, config } = setup();
    state.enemies = [enemy(1, 302), enemy(2, 302.01), enemy(3, 300, 'bat'), enemy(4, 320, 'turtle')];
    state.enemies[3]!.health = 0;
    const before = state.enemies.map(target => [target.health, target.armor]);
    updateBells(state, config);
    expect(state.enemies.map(target => bellSlowMultiplier(target, 0))).toEqual([0.65, 1, 0.65, 1]);
    expect(state.enemies.map(target => [target.health, target.armor])).toEqual(before);
    expect([state.kills, state.earnedResources, state.earnedBonus]).toEqual([0, 0, 0]);
    expect(state.litEnemyIds).toEqual([]);
    expect(state.events.filter(event => event.type === 'bell-pulse')).toEqual([
      expect.objectContaining({ deviceId: 5, radius: 140, multiplier: 0.65, tick: 0 }),
    ]);
  });

  it('does not consume an empty charge and strengthens only the first actual pulse per body per night', () => {
    const { state, config } = setup();
    config.devices.bell.firstPulseSlowMultiplier = 0.5;
    state.enemies = [];
    for (let tick = 0; tick < 200; tick++) { state.tick = tick; updateBells(state, config); }
    expect(state.devices[0]!.bellPulses ?? 0).toBe(0);
    expect(state.devices[0]!.attackCooldown).toBe(0);
    state.enemies = [enemy()]; updateBells(state, config);
    expect(bellSlowMultiplier(state.enemies[0]!, state.tick)).toBe(0.5);
    for (let tick = 1; tick < 180; tick++) { state.tick++; updateBells(state, config); }
    expect(state.devices[0]!.bellPulses).toBe(1);
    state.tick++; updateBells(state, config);
    expect(state.devices[0]!.bellPulses).toBe(2);
    expect(bellSlowMultiplier(state.enemies[0]!, state.tick)).toBe(0.65);
    expect(createBattle(config, 12, undefined, [placement]).devices[0]!.bellPulses ?? 0).toBe(0);
  });

  it('preserves weaker independent sources until the stronger one expires, then expires exclusively', () => {
    const { state, config } = setup([{ ...placement, id: 8 }, { ...placement, id: 2 }]);
    config.devices.bell.firstPulseSlowMultiplier = 0.4;
    state.devices[0]!.attackCooldown = 0.5;
    updateBells(state, config);
    state.tick = 15;
    state.devices[0]!.attackCooldown = 0; state.devices[0]!.bellPulses = 1;
    updateBells(state, config);
    const target = state.enemies[0]!;
    expect(target.bellSlows).toHaveLength(2);
    expect(bellSlowMultiplier(target, 44)).toBe(0.4);
    expect(bellSlowMultiplier(target, 45)).toBe(0.65);
    expect(bellSlowMultiplier(target, 59)).toBe(0.65);
    expect(bellSlowMultiplier(target, 60)).toBe(1);
  });

  it('continues a damaged bell and retains its effect after destruction without emitting new pulses', () => {
    const { state, config } = setup();
    state.devices[0]!.health = 1;
    updateBells(state, config);
    state.devices[0]!.health = 0; state.devices[0]!.attackCooldown = 0;
    state.tick = 44; updateBells(state, config);
    expect(bellSlowMultiplier(state.enemies[0]!, state.tick)).toBe(0.65);
    state.tick = 45; updateBells(state, config);
    expect(bellSlowMultiplier(state.enemies[0]!, state.tick)).toBe(1);
    expect(state.devices[0]!.bellPulses).toBe(1);
    expect(state.events.filter(event => event.type === 'bell-pulse')).toHaveLength(1);
  });
});

describe('movement only and strongest slow', () => {
  it('applies immediately before movement and decrements reload once each fixed step', () => {
    const { state, config } = setup();
    const before = state.enemies[0]!.x;
    stepBattle(state, config, []);
    expect(state.enemies[0]!.x).toBeCloseTo(before - config.enemies.ghost.speed * config.stepSeconds * 0.65);
    expect(state.devices[0]!.attackCooldown).toBe(6);
    stepBattle(state, config, []);
    expect(state.devices[0]!.attackCooldown).toBeCloseTo(6 - config.stepSeconds);
  });

  it('takes the strongest bell or actual lens slow, without multiplying them', () => {
    for (const lensSlow of [0.4, 0.8]) {
      const { state, config } = setup([]);
      config.lens = { id: 'slowing', slowMultiplier: lensSlow, armorMultiplier: 1 };
      state.enemies[0]!.bellSlows = [{ sourceId: 5, untilTick: 45, multiplier: 0.65 }];
      moveEnemies(state, config, [1]);
      expect(state.enemies[0]!.x).toBeCloseTo(250 - config.enemies.ghost.speed * config.stepSeconds * Math.min(lensSlow, 0.65));
    }
  });

  it('slows flight and charging movement but preserves windup and attack cooldown time', () => {
    for (const kind of ['bat', 'minotaur'] as const) {
      const { state, config } = setup([]);
      const target = enemy(1, 250, kind);
      target.bellSlows = [{ sourceId: 5, untilTick: 45, multiplier: 0.65 }];
      target.chargePhase = 'charging'; target.attackCooldown = 1;
      state.enemies = [target];
      moveEnemies(state, config);
      const speed = kind === 'bat' ? config.enemies.bat.speed : config.enemies.minotaur.charge!.speed;
      expect(target.x).toBeCloseTo(250 - speed * config.stepSeconds * 0.65);
      expect(target.attackCooldown).toBeCloseTo(1 - config.stepSeconds);
    }
    const { state, config } = setup([]);
    state.enemies = [enemy(1, 250, 'minotaur')];
    state.enemies[0]!.bellSlows = [{ sourceId: 5, untilTick: 45, multiplier: 0.65 }];
    moveEnemies(state, config);
    expect(state.enemies[0]!.x).toBe(250);
    expect(state.enemies[0]!.chargeRemaining).toBeCloseTo(config.enemies.minotaur.charge!.windup - config.stepSeconds);
  });

  it('does not suppress normal contact attacks and guards only the bell body', () => {
    const { state, config } = setup();
    config.devices.bell.incomingDamageMultiplier = 0.8;
    state.enemies[0]!.x = placement.x + 16 + config.enemies.ghost.radius;
    stepBattle(state, config, []);
    expect(state.devices[0]!.health).toBeCloseTo(70 - config.enemies.ghost.attackDamage * 0.8);
    expect(incomingDeviceDamage({ kind: 'cannon' }, config, 10)).toBe(10);
    expect(incomingDeviceDamage({ kind: 'bell' }, config, 10)).toBe(8);
  });

  it('does not change stun time or reduce incoming shield and lighthouse damage', () => {
    const stunned = setup();
    stunned.state.enemies[0]!.stunnedUntilTick = 10;
    updateBells(stunned.state, stunned.config);
    moveEnemies(stunned.state, stunned.config);
    expect(stunned.state.enemies[0]!.x).toBe(250);
    expect(stunned.state.enemies[0]!.stunnedUntilTick).toBe(10);
    stunned.state.tick = 10;
    moveEnemies(stunned.state, stunned.config);
    expect(stunned.state.enemies[0]!.x).toBeCloseTo(250 - 12 * stunned.config.stepSeconds * 0.65);

    const shielded = setup([{ ...placement, x: 100 }, { id: 6, kind: 'generator', x: 0, y: 0 }]);
    shielded.config.devices.bell.incomingDamageMultiplier = 0.8;
    shielded.state.enemies = [enemy(1, 167)];
    stepBattle(shielded.state, shielded.config, []);
    expect(shielded.state.shield.current).toBe(90 - 5);
    const exposed = setup([{ ...placement, x: 100 }]);
    exposed.config.devices.bell.incomingDamageMultiplier = 0.8;
    exposed.state.enemies = [enemy(1, 42)];
    stepBattle(exposed.state, exposed.config, []);
    expect(exposed.state.lighthouseHealth).toBe(exposed.config.lighthouseHealth - 5);
  });
});

describe('boss zones and deterministic replay', () => {
  it('slows individual overlapping zones with no shared health damage or attack suppression', () => {
    const { state, config } = setup();
    config.boss = getBossRules(1);
    const zones = [{ id: -1, x: 200, y: 0, attackCooldown: 0 }, { id: -2, x: -300, y: 0, attackCooldown: 0 }];
    state.boss = { id: 'abyss-warden', health: 420, stunnedUntilTick: 0, tentacles: zones };
    updateBells(state, config); moveTentacles(state, config, []);
    expect(zones[0]!.x).toBeCloseTo(200 - 12 * config.stepSeconds * 0.65);
    expect(zones[1]!.x).toBeCloseTo(-300 + 12 * config.stepSeconds);
    expect(state.boss.health).toBe(420);
    config.devices.bell.incomingDamageMultiplier = 0.8;
    attackTentacles(state, config, new Map([[-1, state.devices[0]!]]));
    expect(state.devices[0]!.health).toBeCloseTo(70 - 8 * 0.8);
    expect(zones[0]!.attackCooldown).toBe(1.5);
  });

  it('takes the minimum of lit boss, lens and bell slow, preserving light attack suppression', () => {
    const { state, config } = setup();
    config.boss = getBossRules(1);
    config.lens = { id: 'slowing', slowMultiplier: 0.4, armorMultiplier: 1 };
    const zone = { id: -1, x: 250, y: 0, attackCooldown: 0, bellSlows: [{ sourceId: 5, untilTick: 45, multiplier: 0.65 }] };
    state.boss = { id: 'abyss-warden', health: 420, stunnedUntilTick: 0, tentacles: [zone] };
    moveTentacles(state, config, [-1]);
    expect(zone.x).toBeCloseTo(250 - 12 * config.stepSeconds * 0.4);
    state.litTentacleIds = [-1];
    attackTentacles(state, config, new Map([[-1, state.devices[0]!]]));
    expect(state.devices[0]!.health).toBe(70);
  });

  it('replays identical states and events for equal data, seed and commands', () => {
    const { config } = setup();
    const first = createBattle(config, 42, undefined, [placement]);
    const second = createBattle(config, 42, undefined, [placement]);
    for (const state of [first, second]) { state.enemies = [enemy()]; state.waves[0]!.spawned = 1; }
    for (let tick = 0; tick < 600; tick++) {
      const commands = [{ type: 'aim' as const, angle: tick / 100 }];
      stepBattle(first, config, commands); stepBattle(second, config, commands);
    }
    expect(first).toEqual(second);
    expect(first.events.some(event => event.type === 'bell-pulse')).toBe(true);
  });
});
