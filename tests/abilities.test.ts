import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { applyRadialEffect } from '../src/simulation/radialEffect';

function setup(placements: DevicePlacement[] = []) {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.beam.damagePerSecond = 0;
  rules.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  const state = createBattle(rules, 1, undefined, placements);
  state.enemies = []; state.waves[0]!.spawned = 100;
  return { rules, state };
}
function enemy(id: number, x: number): EnemyState {
  return { id, kind: 'ghost', x, y: 0, health: 1000, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

describe('flash ability', () => {
  it('uses body intersection, absorbs damage into armor and does not change beam direction', () => {
    const { rules, state } = setup();
    const edge = enemy(1, 222), outside = enemy(2, 222.01);
    edge.armor = 10; state.enemies = [edge, outside];
    stepBattle(state, rules, [{ type: 'aim', angle: 1 }, { type: 'flash' }, { type: 'flash' }]);
    expect(edge.armor).toBe(0); expect(edge.health).toBe(988);
    expect(outside.health).toBe(1000);
    expect(edge.stunnedUntilTick).toBe(60);
    expect(outside.stunnedUntilTick).toBeUndefined();
    expect(state.desiredBeamAngle).toBe(1);
    expect(state.beamAngle).toBeCloseTo(-Math.PI / 2 + rules.beam.turnSpeed * rules.stepSeconds);
    expect(state.events.filter(event => event.type === 'flash-used')).toHaveLength(1);
  });

  it('stops attacks and movement for exactly 60 fixed ticks', () => {
    const { rules, state } = setup();
    const attacker = enemy(1, -42), moving = enemy(2, 150); state.enemies = [attacker, moving];
    stepBattle(state, rules, [{ type: 'flash' }]);
    for (let i = 1; i < 60; i++) stepBattle(state, rules, []);
    expect(state.lighthouseHealth).toBe(120);
    expect(moving.x).toBe(150);
    stepBattle(state, rules, []);
    expect(state.lighthouseHealth).toBe(115);
    expect(moving.x).toBeCloseTo(149.6);
  });

  it('recharges precisely at tick 540 and can kill before an enemy attack with one reward', () => {
    const { rules, state } = setup();
    rules.enemies.ghost.speed = 0;
    state.enemies = [enemy(1, 200)];
    stepBattle(state, rules, [{ type: 'flash' }]);
    for (let i = 1; i < 540; i++) stepBattle(state, rules, [{ type: 'flash' }]);
    expect(state.flash.lastUsedTick).toBe(0);
    const attacker = enemy(2, -42); attacker.health = 1; state.enemies.push(attacker);
    stepBattle(state, rules, [{ type: 'flash' }]);
    expect(state.flash.lastUsedTick).toBe(540);
    expect(state.lighthouseHealth).toBe(120);
    expect(state.kills).toBe(1); expect(state.earnedResources).toBe(rules.enemies.ghost.reward);
  });
});

describe('radial effect ownership', () => {
  it('applies once to shared owners, including when an earlier zone is outside the area', () => {
    const zones = [{ x: 100, y: 0, radius: 1, owner: 1 }, { x: 0, y: 0, radius: 1, owner: 1 },
      { x: 1, y: 0, radius: 1, owner: 1 }, { x: 2, y: 0, radius: 1, owner: 2 }];
    const hit: number[] = [];
    applyRadialEffect(zones, 0, 0, 10, zone => zone, zone => zone.owner, zone => hit.push(zone.owner));
    expect(hit).toEqual([1, 2]);
  });
});

describe('single use automatic light traps', () => {
  const placement: DevicePlacement = { id: 1, kind: 'light-trap', x: 100, y: 0 };
  it('triggers only once, applies armored area damage and never stuns or damages allies', () => {
    const { rules, state } = setup([placement]);
    rules.enemies.ghost.speed = 0;
    const trigger = enemy(1, 160), blastEdge = enemy(2, 197), outside = enemy(3, 197.01);
    trigger.armor = 20; state.enemies = [trigger, blastEdge, outside];
    stepBattle(state, rules, []);
    expect(trigger.armor).toBe(0); expect(trigger.health).toBe(955);
    expect(blastEdge.health).toBe(935); expect(outside.health).toBe(1000);
    expect(state.devices[0]!.consumed).toBe(true);
    expect(state.devices[0]!.health).toBe(30);
    expect(trigger.stunnedUntilTick).toBeUndefined();
    stepBattle(state, rules, [{ type: 'callWave' }]);
    expect(trigger.health).toBe(955);
    expect(state.events.filter(event => event.type === 'trap-triggered')).toHaveLength(1);
  });

  it('ignores destroyed traps and removes consumed traps from movement obstacles', () => {
    const { rules, state } = setup([placement]);
    state.devices[0]!.health = 0; state.enemies = [enemy(1, 140)];
    stepBattle(state, rules, []);
    expect(state.devices[0]!.consumed).toBe(false);
    state.devices[0]!.health = 30; state.devices[0]!.consumed = true;
    state.enemies[0]!.x = 128; rules.enemies.ghost.speed = 300;
    stepBattle(state, rules, []);
    expect(state.enemies[0]!.x).toBe(118);
    expect(state.devices[0]!.health).toBe(30);
  });

  it('does not attack a trap consumed after movement or delay shield recovery through that stale contact', () => {
    const { rules, state } = setup([placement, { id: 2, kind: 'generator', x: -70, y: 0 }]);
    rules.enemies.ghost.speed = 10000;
    state.shield.current = 0; state.shield.recoveryRemaining = 1;
    state.enemies = [enemy(1, 300)];
    stepBattle(state, rules, []);
    expect(state.devices[0]!.consumed).toBe(true);
    expect(state.devices[0]!.health).toBe(30);
    expect(state.shield.recoveryRemaining).toBeCloseTo(1 - rules.stepSeconds);
    expect(state.events.some(event => event.type === 'device-hit')).toBe(false);
  });
});
