import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectBeamTargets } from '../src/simulation/beam';

function setup() {
  const rules = structuredClone(NIGHT_CONFIG);
  // Isolate damage/selection timing; production turn limits have separate tests.
  rules.beam.turnSpeed = Math.PI / rules.stepSeconds;
  rules.ship = { x: 180, y: 0, radius: 15, rescueSeconds: 1, deadline: 3, reward: 12 };
  rules.waves = [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }];
  rules.enemies.ghost.speed = 0; rules.enemies.ghost.attackDamage = 0;
  const state = createBattle(rules, 42);
  state.enemies[0]!.x = -250; state.enemies[0]!.y = 0;
  return { rules, state, ship: state.ship! };
}
function enemy(id: number, x: number, y = 0): EnemyState {
  return { id, kind: 'ghost', x, y, health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

describe('optional ship beam rescue', () => {
  it('uses full occlusion in both directions and keeps unselected bodies opaque', () => {
    const { rules, ship } = setup();
    expect(selectBeamTargets([enemy(1, 100)], rules, 0, ship).shipLit).toBe(false);
    expect(selectBeamTargets([enemy(1, 250)], rules, 0, ship)).toEqual({ lit: [], blocked: [1], shipLit: true });
    rules.beam.maxTargets = 1;
    expect(selectBeamTargets([enemy(1, 100)], rules, 0, ship).shipLit).toBe(false);
    const offset = enemy(1, 100, 10);
    expect(selectBeamTargets([offset], rules, 0, ship).shipLit).toBe(true);
    ship.x = 100; ship.y = 0; rules.beam.halfAngle = 0.6;
    const axis = enemy(1, 250, -50);
    // Move axis onto its own aim; the unselected ship still hides the rear body.
    const selected = selectBeamTargets([axis, enemy(2, 220)], rules, Math.atan2(axis.y, axis.x), ship);
    expect(selected.blocked).toContain(2);
  });

  it('shares the target cap and axis priority, and respects sector and range', () => {
    const { rules, ship } = setup(); rules.beam.halfAngle = 0.5; rules.beam.maxTargets = 1;
    ship.y = 30;
    expect(selectBeamTargets([enemy(1, 220)], rules, 0, ship).shipLit).toBe(false);
    expect(selectBeamTargets([enemy(1, 220)], rules, Math.atan2(ship.y, ship.x), ship).shipLit).toBe(true);
    ship.x = 400; ship.y = 0;
    expect(selectBeamTargets([], rules, 0, ship).shipLit).toBe(false);
    ship.x = 180;
    expect(selectBeamTargets([], rules, Math.PI, ship).shipLit).toBe(false);
  });

  it('preserves progress across switching, rewards once and becomes transparent after rescue', () => {
    const { rules, state, ship } = setup();
    for (let tick = 0; tick < 15; tick++) stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(ship.progress).toBeCloseTo(0.5);
    for (let tick = 0; tick < 10; tick++) stepBattle(state, rules, [{ type: 'aim', angle: Math.PI / 2 }]);
    expect(ship.progress).toBeCloseTo(0.5);
    for (let tick = 0; tick < 15; tick++) stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(ship.status).toBe('rescued'); expect(state.earnedRescue).toBe(12);
    for (let tick = 0; tick < 20; tick++) stepBattle(state, rules, []);
    expect(state.earnedRescue).toBe(12); expect(state.events.filter(e => e.type === 'ship-rescued')).toHaveLength(1);
    expect(selectBeamTargets([enemy(2, 250)], rules, 0, ship).lit).toEqual([2]);
    expect(state.earnedResources).toBe(0);
  });

  it('expires once without penalty and no longer blocks targets', () => {
    const { rules, state, ship } = setup();
    for (let i = 0; i < 100; i++) stepBattle(state, rules, []);
    expect(ship.status).toBe('lost'); expect(ship.remaining).toBe(0); expect(state.earnedRescue).toBe(0);
    expect(state.lighthouseHealth).toBe(120); expect(state.events.filter(e => e.type === 'ship-lost')).toHaveLength(1);
    expect(selectBeamTargets([enemy(2, 250)], rules, 0, ship).lit).toEqual([2]);
  });

  it.each(['victory', 'defeat'])('never blocks battle %s and resolves a waiting ship once', outcome => {
    const { rules, state, ship } = setup();
    if (outcome === 'victory') { state.enemies = []; state.waves[0]!.defeated = 1; }
    else state.lighthouseHealth = 0;
    stepBattle(state, rules, []);
    expect(state.outcome).toBe(outcome); expect(ship.status).toBe('lost'); expect(state.earnedRescue).toBe(0);
    stepBattle(state, rules, []);
    expect(state.events.filter(e => e.type === 'ship-lost')).toHaveLength(1);
  });

  it('does not trigger a trap or receive cannon fire and supports disabled flash', () => {
    const { rules, state, ship } = setup();
    state.devices.push(...([
      { id: 1, kind: 'light-trap' as const, x: ship.x, y: ship.y },
      { id: 2, kind: 'cannon' as const, x: ship.x - 50, y: ship.y },
    ].map(placement => ({ ...placement, health: 70, consumed: false, attackCooldown: 0, lastShot: null,
      priority: 'nearest' as const, targetId: null }))));
    rules.flash.enabled = false;
    stepBattle(state, rules, [{ type: 'flash' }]);
    expect(state.flash.lastUsedTick).toBeNull(); expect(ship.progress).toBe(0);
    expect(state.devices[0]!.consumed).toBe(false); expect(state.devices[1]!.lastShot).toBeNull();
    rules.flash.enabled = true;
    stepBattle(state, rules, [{ type: 'flash' }]);
    expect(state.flash.lastUsedTick).not.toBeNull(); expect(ship.progress).toBe(0); expect(ship.status).toBe('waiting');
  });
});

describe('paired beam damage counts actual hostile targets only', () => {
  it('boosts each full damage with two available hostiles and excludes occlusion and target limits', () => {
    const { rules, state } = setup(); state.ship = null; rules.pairedDamageBonus = 0.25; rules.beam.halfAngle = 0.5;
    state.enemies = [enemy(1, 200, -35), enemy(2, 200, 35)];
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(state.litEnemyIds).toHaveLength(2); expect(state.enemies.map(e => e.health)).toEqual([98.75, 98.75]);
    state.enemies = [enemy(1, 100, 0), enemy(2, 200, 0)];
    stepBattle(state, rules, []);
    expect(state.enemies.map(e => e.health)).toEqual([99, 100]);
    state.ship = null; rules.beam.maxTargets = 1; state.enemies = [enemy(1, 200, -35), enemy(2, 200, 35)];
    stepBattle(state, rules, []);
    expect(state.enemies.map(e => e.health)).toEqual([99, 100]);
  });

  it('does not count an illuminated ship as a hostile for the bonus', () => {
    const { rules, state, ship } = setup(); rules.pairedDamageBonus = 0.25;
    ship.y = 30; state.enemies = [enemy(1, 200, -20)];
    stepBattle(state, rules, [{ type: 'aim', angle: 0 }]);
    expect(ship.lit).toBe(true); expect(state.litEnemyIds).toEqual([1]); expect(state.enemies[0]!.health).toBe(99);
  });
});
