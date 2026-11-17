import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyState } from '../src/contracts';
import { getBossRules, BOSS_LEVELS } from '../src/content/boss';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectBeamTargets } from '../src/simulation/beam';
import { damageBoss } from '../src/simulation/boss';

function setup(placements: DevicePlacement[] = []) {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.boss = { ...getBossRules(1), speed: 0, radius: 5 };
  rules.waves = [{ id: 'support', enemies: ['ghost'], spawnInterval: 1 }];
  rules.beam = { turnSpeed: Math.PI / rules.stepSeconds, range: 400, halfAngle: 0.5, damagePerSecond: 30, maxTargets: 2 };
  const state = createBattle(rules, 42, undefined, placements);
  state.enemies = []; state.waves[0]!.spawned = 1;
  state.boss!.tentacles = [
    { id: -1001, x: 100, y: -15, attackCooldown: 0 },
    { id: -1002, x: 100, y: 15, attackCooldown: 0 },
    { id: -1003, x: 100, y: 40, attackCooldown: 0 },
  ];
  state.beamAngle = state.desiredBeamAngle = 0;
  return { state, rules };
}
function enemy(id: number, x: number, y = 0): EnemyState {
  return { id, kind: 'ghost', x, y, health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

describe('boss zones and shared health', () => {
  it('has three cloned provisional levels and deterministic sea-facing spawn', () => {
    expect(BOSS_LEVELS.map(rules => rules.materialReward)).toEqual([2, 3, 4]);
    const rules = getBossRules(9); rules.health = 0;
    expect(getBossRules(3).health).toBe(780);
    const config = { ...NIGHT_CONFIG, boss: getBossRules(1) };
    const one = createBattle(config, 6), two = createBattle(config, 6);
    expect(one).toEqual(two);
    expect(one.boss!.tentacles.every(zone => zone.id < -1000 && zone.x > 0)).toBe(true);
  });
  it('sums full beam damage from two selected zones including paired-light', () => {
    const { state, rules } = setup(); rules.pairedDamageBonus = 0.2;
    stepBattle(state, rules, []);
    expect(state.boss!.health).toBeCloseTo(rules.boss!.health - 2 * 30 * rules.stepSeconds * 1.2);
    expect(state.litTentacleIds).toHaveLength(2);
    expect(state.kills).toBe(0); expect(state.earnedResources).toBe(0);
    expect(state.events.filter(event => event.type === 'boss-hit')).toHaveLength(2);
  });
  it('shares sector, occlusion, axis ordering and target count with enemies and ship', () => {
    const { state, rules } = setup();
    state.enemies = [enemy(1, 50)];
    state.boss!.tentacles = [{ id: -1001, x: 100, y: 0, attackCooldown: 0 }, { id: -1002, x: 100, y: 35, attackCooldown: 0 }];
    rules.beam.maxTargets = 1;
    const selection = selectBeamTargets(state.enemies, rules, 0, null, state.boss);
    expect(selection).toEqual({ lit: [1], blocked: [], litTentacles: [], blockedTentacles: [-1001] });
    state.boss!.health = 0;
    expect(selectBeamTargets([], rules, 0, null, state.boss).litTentacles).toEqual([]);
    const ship = { x: 30, y: 0, radius: 2, progress: 0, remaining: 1, status: 'waiting' as const, lit: false };
    expect(selectBeamTargets(state.enemies, rules, 0, ship, state.boss).shipLit).toBe(true);
  });
  it('deduplicates flash damage and stuns all owner zones, even remote ones', () => {
    const { state, rules } = setup(); rules.boss!.speed = 30; rules.beam.damagePerSecond = 0;
    state.boss!.tentacles[2]!.x = 300;
    const before = structuredClone(state.boss!.tentacles);
    stepBattle(state, rules, [{ type: 'flash' }]);
    expect(state.boss!.health).toBe(rules.boss!.health - rules.flash.damage);
    expect(state.boss!.tentacles).toEqual(before);
    expect(state.events.filter(event => event.type === 'boss-stunned')).toHaveLength(1);
    expect(state.boss!.stunnedUntilTick).toBe(Math.ceil(rules.flash.stunDuration / rules.stepSeconds));
  });
  it('slows selected zones with strongest multiplier and suppresses their attacks', () => {
    const { state, rules } = setup(); rules.boss!.speed = 30; rules.boss!.litSpeedMultiplier = 0.4;
    rules.lens = { id: 'slowing', slowMultiplier: 0.6, armorMultiplier: 1 };
    rules.beam.damagePerSecond = 0; rules.beam.maxTargets = 1;
    state.boss!.tentacles = [{ id: -1001, x: 100, y: 0, attackCooldown: 0 }];
    stepBattle(state, rules, []);
    expect(state.boss!.tentacles[0]!.x).toBeCloseTo(100 - 30 * 0.4 * rules.stepSeconds);
    state.boss!.tentacles[0]!.x = rules.lighthouseRadius + rules.boss!.radius;
    stepBattle(state, rules, []);
    expect(state.lighthouseHealth).toBe(rules.lighthouseHealth);
    stepBattle(state, rules, [{ type: 'aim', angle: Math.PI }]);
    expect(state.lighthouseHealth).toBe(rules.lighthouseHealth - rules.boss!.attackDamage);
  });
  it('cannons accept a manual zone id and deal damage once per shot', () => {
    const { state, rules } = setup([{ id: 1, kind: 'cannon', x: 80, y: 80 }]);
    rules.beam.damagePerSecond = 0;
    stepBattle(state, rules, [{ type: 'cannon-target', deviceId: 1, enemyId: -1002 }]);
    expect(state.devices[0]!.targetId).toBe(-1002);
    expect(state.boss!.health).toBe(rules.boss!.health - rules.devices.definitions.cannon.damage);
    expect(state.devices[0]!.lastShot?.x).toBe(100);
  });
  it('traps trigger on zones and damage their owner once, then remain consumed', () => {
    const { state, rules } = setup([{ id: 1, kind: 'light-trap', x: 100, y: 0 }]); rules.beam.damagePerSecond = 0;
    stepBattle(state, rules, []); stepBattle(state, rules, []);
    expect(state.boss!.health).toBe(rules.boss!.health - rules.devices.trap.damage);
    expect(state.devices[0]!.consumed).toBe(true);
  });
  it('requires completed support waves and a dead boss, and defeat takes priority', () => {
    const { state, rules } = setup(); rules.beam.damagePerSecond = 0;
    damageBoss(state, rules.boss!.health, { x: 100, y: 0 });
    expect(state.events.filter(event => event.type === 'boss-died')).toHaveLength(1);
    stepBattle(state, rules, []); expect(state.outcome).toBe('playing');
    state.enemies = [enemy(1, rules.lighthouseRadius + rules.enemies.ghost.radius)];
    state.lighthouseHealth = 1;
    stepBattle(state, rules, []); expect(state.outcome).toBe('defeat');
    const win = setup(); win.state.waves[0]!.defeated = 1;
    stepBattle(win.state, win.rules, []); expect(win.state.outcome).toBe('playing');
    win.state.boss!.health = 0;
    stepBattle(win.state, win.rules, []); expect(win.state.outcome).toBe('victory');
  });
  it('uses the shield contact boundary and restores it around living zones', () => {
    const { state, rules } = setup([{ id: 1, kind: 'generator', x: 0, y: 50 }]); rules.beam.damagePerSecond = 0;
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    state.boss!.tentacles = [{ id: -1001, x: rules.shield.radius + rules.boss!.radius, y: 0, attackCooldown: 0 }];
    stepBattle(state, rules, []);
    expect(state.shield.current).toBe(rules.shield.capacityPerGenerator - rules.boss!.attackDamage);
    expect(state.lighthouseHealth).toBe(rules.lighthouseHealth);
    state.shield.current = 0; state.shield.recoveryRemaining = 0;
    state.boss!.tentacles[0]!.x = 50;
    stepBattle(state, rules, []);
    expect(state.boss!.tentacles[0]!.x).toBeCloseTo(rules.shield.radius + rules.boss!.radius);
  });
  it('respects the swept device boundary and suppresses device attacks while lit', () => {
    const { state, rules } = setup([{ id: 1, kind: 'barrier', x: 80, y: 0 }]);
    rules.beam.damagePerSecond = 0; rules.boss!.speed = 10000;
    state.boss!.tentacles = [{ id: -1001, x: 200, y: 0, attackCooldown: 0 }];
    const before = state.devices[0]!.health;
    stepBattle(state, rules, []);
    expect(state.devices[0]!.health).toBe(before);
    expect(state.boss!.tentacles[0]!.x).toBeCloseTo(80 + rules.boss!.radius + rules.devices.definitions.barrier.radius);
    stepBattle(state, rules, [{ type: 'aim', angle: Math.PI }]);
    expect(state.devices[0]!.health).toBe(before - rules.boss!.attackDamage);
  });
  it('prioritizes defeat when the last support kill and lighthouse destruction coincide', () => {
    const { state, rules } = setup(); state.boss!.health = 0; state.lighthouseHealth = 0;
    state.enemies = [enemy(1, 100)]; state.enemies[0]!.health = 0.1;
    stepBattle(state, rules, []);
    expect(state.waves[0]!.completed).toBe(true); expect(state.outcome).toBe('defeat');
  });
  it('removes dead owner zones from occlusion and never counts a boss as an ordinary kill', () => {
    const { state, rules } = setup(); state.boss!.tentacles = [{ id: -1001, x: 60, y: 0, attackCooldown: 0 }];
    state.enemies = [enemy(1, 180)];
    expect(selectBeamTargets(state.enemies, rules, 0, null, state.boss).blocked).toEqual([1]);
    damageBoss(state, 10000, { x: 60, y: 0 }); damageBoss(state, 10000, { x: 60, y: 0 });
    expect(selectBeamTargets(state.enemies, rules, 0, null, state.boss).lit).toEqual([1]);
    expect(state.events.filter(event => event.type === 'boss-died')).toHaveLength(1);
    expect(state.kills).toBe(0); expect(state.earnedResources).toBe(0);
  });
  it('uses a stronger slowing lens without multiplying the boss light penalty', () => {
    const { state, rules } = setup(); rules.boss!.speed = 30; rules.boss!.litSpeedMultiplier = 0.45;
    rules.lens = { id: 'slowing', slowMultiplier: 0.2, armorMultiplier: 1 };
    state.boss!.tentacles = [{ id: -1001, x: 100, y: 0, attackCooldown: 0 }];
    stepBattle(state, rules, []);
    expect(state.boss!.tentacles[0]!.x).toBeCloseTo(100 - 30 * 0.2 * rules.stepSeconds);
  });
  it('replays boss combat and support waves from the same seed and commands', () => {
    const rules = { ...NIGHT_CONFIG, boss: getBossRules(2) };
    const a = createBattle(rules, 42), b = createBattle(rules, 42);
    for (let tick = 0; tick < 300; tick++) {
      const commands = [{ type: 'aim' as const, angle: Math.sin(tick / 20) }, ...(tick % 40 === 0 ? [{ type: 'flash' as const }] : [])];
      stepBattle(a, rules, commands); stepBattle(b, rules, commands);
    }
    expect(a).toEqual(b);
  });
});
