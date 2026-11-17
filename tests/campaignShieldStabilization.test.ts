import { describe, expect, it } from 'vitest';
import type { BattleState, DevicePlacement, NightConfig } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { SHIELD_STABILIZATION_DRAFT_RANKS as DRAFT_RANKS } from '../src/content/campaignGeneralDraft';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { damageDevice } from '../src/simulation/deviceDamage';
import { damageLighthouse } from '../src/simulation/lighthouse';
import { hitShield, syncShield, updateShield } from '../src/simulation/shield';

function setup(rank: 0 | 1 = 1, placements: DevicePlacement[] = [{ id: 1, kind: 'generator', x: 70, y: 0 }]) {
  const rules = structuredClone(NIGHT_CONFIG);
  rules.shield.stabilization = { ...DRAFT_RANKS[rank]! };
  rules.beam.damagePerSecond = 0;
  return { rules, state: createBattle(rules, 123, undefined, placements) };
}

function advance(state: BattleState, rules: NightConfig, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    updateShield(state, rules);
    state.tick++;
  }
}

function exhaust(state: BattleState, rules: NightConfig): void {
  hitShield(state, rules, state.shield.current + 1, 155, 0);
}

function recover(state: BattleState, rules: NightConfig): void {
  advance(state, rules, Math.ceil(rules.shield.regenerationDelay / rules.stepSeconds - 1e-9));
}

describe('draft shared-field stabilization', () => {
  it.each([0, 1] as const)('rank %s waits the full delay, then boosts ordinary regeneration without an instant grant', rank => {
    const { state, rules } = setup(rank);
    exhaust(state, rules);
    expect(state.shield.current).toBe(0);
    expect(state.shield.stabilizationPending).toBe(true);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    advance(state, rules, 119);
    expect(state.shield.current).toBe(0);
    advance(state, rules, 1);
    const increment = rules.shield.regenerationPerSecond * rules.stepSeconds * (1 + DRAFT_RANKS[rank]!.regenerationBonus);
    expect(state.shield.current).toBeCloseTo(increment);
    expect(state.shield.stabilizationPending).toBeUndefined();
    expect(state.shield.stabilizationUntilTick).toBe(179);
    advance(state, rules, 59);
    expect(state.shield.current).toBeCloseTo(increment * 60);
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(increment * 60 + .5);
    expect(state.shield.stabilizationBudget).toBeUndefined();
    expect(state.events.filter(e => e.type === 'shield-restored')).toHaveLength(1);
  });

  it('rounds a non-integral window up to ticks and excludes its end', () => {
    const { state, rules } = setup();
    rules.stepSeconds = .3;
    rules.shield.regenerationDelay = .6;
    rules.shield.stabilization!.durationSeconds = .7;
    exhaust(state, rules);
    advance(state, rules, 2);
    expect(state.shield.stabilizationUntilTick).toBe(4);
    advance(state, rules, 2);
    expect(state.shield.current).toBeCloseTo(3 * 6.75);
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(3 * 6.75 + 4.5);
  });

  it.each(['lighthouse', 'generator', 'barrier'] as const)('damage to protected %s postpones the pending recovery', target => {
    const { state, rules } = setup(1, [
      { id: 1, kind: 'generator', x: 70, y: 0 }, { id: 2, kind: 'barrier', x: -70, y: 0 },
    ]);
    exhaust(state, rules);
    advance(state, rules, 119);
    if (target === 'lighthouse') damageLighthouse(state, rules, 1);
    else damageDevice(state, rules, state.devices.find(d => d.kind === target)!, 1);
    advance(state, rules, 119);
    expect(state.shield.current).toBe(0);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(.75);
  });

  it('outside body damage does not postpone the pending recovery', () => {
    const { state, rules } = setup(1, [
      { id: 1, kind: 'generator', x: 70, y: 0 }, { id: 2, kind: 'barrier', x: 250, y: 0 },
    ]);
    exhaust(state, rules);
    advance(state, rules, 119);
    damageDevice(state, rules, state.devices[1]!, 1);
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(.75);
  });

  it('does not trigger at startup, on partial recovery, or when capacity returns after all generators are lost', () => {
    const { state, rules } = setup();
    updateShield(state, rules);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    hitShield(state, rules, 20, 155, 0);
    recover(state, rules);
    expect(state.shield.current).toBeCloseTo(70.5);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    state.devices[0]!.health = 0;
    syncShield(state, rules);
    expect(state.shield.current).toBe(0);
    state.devices[0]!.health = 60;
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(.5);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
  });

  it('does not classify an initially empty field or a hit on zero as a real break', () => {
    const { state, rules } = setup();
    state.shield.current = 0;
    hitShield(state, rules, 10, 155, 0);
    recover(state, rules);
    expect(state.shield.current).toBeCloseTo(.5);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
  });

  it('does not multiply or restart the common bonus when a generator is added or lost', () => {
    const { state, rules } = setup();
    exhaust(state, rules); recover(state, rules);
    const until = state.shield.stabilizationUntilTick;
    const generator = { ...state.devices[0]!, id: 2, x: -70 };
    state.devices.push(generator);
    advance(state, rules, 1);
    expect(state.shield.maximum).toBe(180);
    expect(state.shield.current).toBeCloseTo(1.5);
    expect(state.shield.stabilizationUntilTick).toBe(until);
    generator.health = 0;
    advance(state, rules, 1);
    expect(state.shield.maximum).toBe(90);
    expect(state.shield.current).toBeCloseTo(2.25);
    expect(state.shield.stabilizationUntilTick).toBe(until);
  });

  it.each(['pending', 'active'] as const)('losing the whole field cancels a %s window', phase => {
    const { state, rules } = setup();
    exhaust(state, rules);
    if (phase === 'active') recover(state, rules);
    state.devices[0]!.health = 0;
    syncShield(state, rules);
    expect(state.shield.stabilizationPending).toBeUndefined();
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    expect(state.shield.stabilizationBudget).toBeUndefined();
    state.devices[0]!.health = 60;
    recover(state, rules);
    expect(state.shield.current).toBeGreaterThan(0);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
  });

  it('residual capacity retains charge but never generates or starts a pending window', () => {
    const { state, rules } = setup();
    rules.devices.generator.residualSeconds = 3;
    exhaust(state, rules);
    damageDevice(state, rules, state.devices[0]!, 1000);
    // The normal four-second delay exceeds this residual lifetime: shorten it
    // only in this control fixture to isolate the generation restriction.
    state.shield.recoveryRemaining = 0;
    advance(state, rules, 89);
    expect(state.shield.maximum).toBe(90);
    expect(state.shield.current).toBe(0);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    advance(state, rules, 2);
    expect(state.shield.maximum).toBe(0);
    expect(state.shield.stabilizationPending).toBeUndefined();

    const active = setup();
    exhaust(active.state, active.rules); recover(active.state, active.rules);
    active.state.devices[0]!.residualUntilTick = active.state.tick + 90;
    active.state.devices[0]!.health = 0;
    const charge = active.state.shield.current;
    advance(active.state, active.rules, 10);
    expect(active.state.shield.current).toBe(charge);
  });

  it('a new real break cancels the current window and starts one fresh window after a new delay', () => {
    const { state, rules } = setup();
    exhaust(state, rules); recover(state, rules);
    advance(state, rules, 10);
    const oldEnd = state.shield.stabilizationUntilTick!;
    const breakingCharge = state.shield.current;
    const oldBudget = state.shield.stabilizationBudget!;
    exhaust(state, rules);
    expect(state.shield.stabilizationBudget).toBeCloseTo(breakingCharge * .5);
    expect(state.shield.stabilizationBudget).toBeLessThan(oldBudget);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    advance(state, rules, 119);
    expect(state.shield.current).toBe(0);
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(.75);
    expect(state.shield.stabilizationUntilTick).toBe(state.tick - 1 + 60);
    expect(state.shield.stabilizationUntilTick).toBeGreaterThan(oldEnd);
    expect(state.events.filter(e => e.type === 'shield-restored')).toHaveLength(2);
  });

  it('partial hits consume the existing window in real simulation ticks without extending it', () => {
    const { state, rules } = setup();
    exhaust(state, rules); recover(state, rules);
    advance(state, rules, 20);
    hitShield(state, rules, 1, 155, 0);
    const charge = state.shield.current;
    recover(state, rules);
    expect(state.shield.current).toBeCloseTo(charge + .5);
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
  });

  it('coexists with restoration damage protection without granting capacity or extra regeneration', () => {
    const { state, rules } = setup();
    rules.progression = { shieldRestoreReduction: .5 };
    exhaust(state, rules); recover(state, rules);
    hitShield(state, rules, .5, 155, 0);
    expect(state.shield.current).toBeCloseTo(.5);
    expect(state.shield.maximum).toBe(90);
    expect(state.shield.stabilizationPending).toBeUndefined();
  });

  it('leaves the old behavior and state shape intact when the optional draft is absent', () => {
    const { state, rules } = setup();
    delete rules.shield.stabilization;
    exhaust(state, rules); recover(state, rules);
    expect(state.shield.current).toBeCloseTo(.5);
    expect(state.shield).not.toHaveProperty('stabilizationPending');
    expect(state.shield).not.toHaveProperty('stabilizationUntilTick');
    expect(state.shield).not.toHaveProperty('stabilizationBudget');
  });

  it('replays the same seed and command sequence identically in a complete battle', () => {
    const first = setup(), second = setup();
    first.rules.enemies.ghost.attackDamage = 100;
    second.rules.enemies.ghost.attackDamage = 100;
    const events: string[] = [];
    for (let tick = 0; tick < 1800; tick++) {
      const commands = tick % 120 === 0 ? [{ type: 'aim' as const, angle: tick / 120 }] : [];
      stepBattle(first.state, first.rules, commands);
      stepBattle(second.state, second.rules, commands);
      events.push(...first.state.events.map(e => e.type));
      expect(second.state).toEqual(first.state);
    }
    expect(events).toContain('shield-broken');
    expect(events).toContain('shield-restored');
  });

  it.each([.5, 1, 2])('deliberate exhaustion loses to preservation on the quiet control at scale %s', scale => {
    // Finite controls for the provisional cap, not proof of arbitrary combat
    // schedules. Include the tiny reserve that exploited the uncapped draft.
    for (const rank of [0, 1] as const) for (const count of [1, 2]) for (const alreadyWaiting of [false, true])
      for (const reserve of [.0001, 1, 90 * count * scale * .25, 90 * count * scale * .5]) {
      const placements = Array.from({ length: count }, (_, id) => ({ id, kind: 'generator' as const, x: 70, y: id * 40 }));
      const kept = setup(rank, placements), broken = setup(rank, placements);
      for (const pair of [kept, broken]) {
        pair.rules.shield.capacityPerGenerator *= scale;
        pair.rules.shield.regenerationPerSecond *= scale;
        syncShield(pair.state, pair.rules);
        pair.state.shield.current = reserve;
        if (alreadyWaiting) pair.state.shield.recoveryRemaining = pair.rules.shield.regenerationDelay;
      }
      exhaust(broken.state, broken.rules);
      // Check the complete waiting + boosted phase, including every transient.
      for (let tick = 0; tick < 180; tick++) {
        advance(kept.state, kept.rules, 1); advance(broken.state, broken.rules, 1);
        expect(kept.state.shield.current + 1e-9).toBeGreaterThanOrEqual(broken.state.shield.current);
      }
      expect(kept.state.shield.current).toBeGreaterThan(broken.state.shield.current);
    }
  });

  it.each([0, 1] as const)('rank %s caps additional recovery by the real breaking loss and stops when its budget is spent', rank => {
    const { state, rules } = setup(rank);
    state.shield.current = .1;
    exhaust(state, rules);
    const budget = .1 * DRAFT_RANKS[rank]!.regenerationBonus;
    expect(state.shield.stabilizationBudget).toBeCloseTo(budget);
    recover(state, rules);
    expect(state.shield.current).toBeCloseTo(.5 + budget);
    expect(state.shield.stabilizationBudget).toBe(0);
    advance(state, rules, 1);
    expect(state.shield.current).toBeCloseTo(1 + budget);
    // Rebreaking replaces the old budget, even within the old window.
    state.shield.current = .01;
    exhaust(state, rules);
    expect(state.shield.stabilizationBudget).toBeCloseTo(.01 * DRAFT_RANKS[rank]!.regenerationBonus);
  });

  it('clears the remaining budget on full recovery instead of carrying it into another break', () => {
    const { state, rules } = setup();
    exhaust(state, rules); recover(state, rules);
    state.shield.current = state.shield.maximum - .1;
    advance(state, rules, 1);
    expect(state.shield.current).toBe(state.shield.maximum);
    expect(state.shield.stabilizationBudget).toBeUndefined();
    expect(state.shield.stabilizationUntilTick).toBeUndefined();
    state.shield.current = .01;
    exhaust(state, rules);
    expect(state.shield.stabilizationBudget).toBeCloseTo(.005);
  });
});
