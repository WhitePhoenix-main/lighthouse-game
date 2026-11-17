import { describe, expect, it } from 'vitest';
import type { EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { CAMPAIGN_ABILITY_DRAFT } from '../src/content/campaignAbilityDraft';
import { calculateCandidateAbility } from '../src/progression/campaignAbilities';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { castSeal, sealSlowMultiplier, updateSeal } from '../src/simulation/seal';

function enemy(id = 1, x = 250, kind: EnemyKind = 'ghost', y = 0): EnemyState {
  return { id, kind, x, y, health: 1000, armor: 20, waveIndex: 0, attackCooldown: 4 };
}
function setup(full = false, boss = false) {
  const config = structuredClone(NIGHT_CONFIG);
  config.ability = calculateCandidateAbility('seal', full
    ? CAMPAIGN_ABILITY_DRAFT.filter(node => node.abilityId === 'seal').map(node => node.id)
    : ['ability-seal-unlock'])!;
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }];
  if (boss) config.boss = getBossRules(1);
  const state = createBattle(config, 12);
  state.enemies = [enemy()];
  state.waves[0]!.started = true;
  state.waves[0]!.spawned = 1;
  state.nextEnemyId = 2;
  return { state, config, rules: config.ability };
}

describe('seal body intersections and finite area lifetime', () => {
  it('accepts boundary locations but rejects nonfinite, out-of-range and outside-world points without mutation', () => {
    const { state, config, rules } = setup();
    const before = structuredClone(state);
    for (const target of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: rules.targetingRange + 0.01, y: 0 }]) {
      expect(castSeal(state, config, target)).toBe(false);
      expect(state).toEqual(before);
    }
    expect(castSeal(state, { ...config, worldRadius: 10 }, { x: 11, y: 0 })).toBe(false);
    expect(castSeal(state, config, { x: rules.targetingRange, y: 0 })).toBe(true);
    expect(state.ability!.readyTick).toBe(before.ability!.readyTick);
  });

  it('affects all four living kinds at the body boundary and changes neither health nor illumination', () => {
    const { state, config, rules } = setup();
    state.enemies = (['ghost', 'turtle', 'minotaur', 'bat'] as const).flatMap((kind, index) => [
      enemy(index * 2 + 1, 150 + rules.radius + config.enemies[kind].radius, kind),
      enemy(index * 2 + 2, 150 + rules.radius + config.enemies[kind].radius + 0.01, kind),
    ]);
    state.enemies.push({ ...enemy(99, 150), health: 0 });
    const before = state.enemies.map(target => [target.health, target.armor, target.attackCooldown]);
    castSeal(state, config, { x: 150, y: 0 }); updateSeal(state, config);
    expect(state.enemies.map(target => sealSlowMultiplier(target, state, config))).toEqual([
      rules.speedMultiplier, 1, rules.speedMultiplier, 1, rules.speedMultiplier, 1, rules.speedMultiplier, 1, 1,
    ]);
    expect(state.enemies.map(target => [target.health, target.armor, target.attackCooldown])).toEqual(before);
    expect(state.litEnemyIds).toEqual([]);
    expect([state.kills, state.earnedResources, state.earnedBonus]).toEqual([0, 0, 0]);
  });

  it('grants entry once per cast, cancels it on exit and keeps only ordinary lingering strength', () => {
    const { state, config, rules } = setup(true);
    const target = state.enemies[0]!;
    castSeal(state, config, { x: 250, y: 0 }); updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.entrySpeedMultiplier);
    state.tick++; target.x = 500; updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.speedMultiplier);
    state.tick++; target.x = 250; updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.speedMultiplier);
    expect(state.ability!.seal!.enteredIds).toEqual([1]);
    castSeal(state, config, { x: 250, y: 0 }); updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.entrySpeedMultiplier);
    expect(target.sealMark!.castId).toBe(2);
  });

  it('ends entry at its exact exclusive tick while the ordinary area remains active', () => {
    const { state, config, rules } = setup(true);
    const target = state.enemies[0]!;
    castSeal(state, config, { x: 250, y: 0 }); updateSeal(state, config);
    state.tick = target.sealMark!.entryUntilTick - 1; updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.entrySpeedMultiplier);
    state.tick++; updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(rules.speedMultiplier);
    expect(state.ability!.seal!.enteredIds).toEqual([1]);
  });

  it.each([false, true])('expires exclusively and never refreshes lingering after area expiry (full=%s)', full => {
    const { state, config, rules } = setup(full);
    const target = state.enemies[0]!;
    castSeal(state, config, { x: 250, y: 0 });
    const until = state.ability!.seal!.untilTick;
    for (; state.tick < until; state.tick++) updateSeal(state, config);
    updateSeal(state, config);
    expect(state.ability!.seal).toBeUndefined();
    const linger = Math.ceil(rules.lingeringSeconds / config.stepSeconds - 1e-9);
    expect(sealSlowMultiplier(target, state, config)).toBe(linger ? rules.speedMultiplier : 1);
    for (; state.tick < until + linger; state.tick++) {
      updateSeal(state, config);
      expect(sealSlowMultiplier(target, state, config)).toBe(rules.speedMultiplier);
    }
    updateSeal(state, config);
    expect(sealSlowMultiplier(target, state, config)).toBe(1);
    expect(target.sealMark).toBeUndefined();
  });

  it('tracks boss hit zones independently while preserving shared HP and ability timers', () => {
    const { state, config, rules } = setup(true, true);
    state.boss!.tentacles = [
      { id: -1, x: 250, y: 0, attackCooldown: 3 },
      { id: -2, x: 250 + rules.radius + config.boss!.radius, y: 0, attackCooldown: 3 },
      { id: -3, x: 500, y: 0, attackCooldown: 3 },
    ];
    const health = state.boss!.health;
    castSeal(state, config, { x: 250, y: 0 }); updateSeal(state, config);
    expect(state.boss!.tentacles.map(target => sealSlowMultiplier(target, state, config)))
      .toEqual([rules.entrySpeedMultiplier, rules.entrySpeedMultiplier, 1]);
    expect(state.boss!.health).toBe(health);
    expect(state.boss!.stunnedUntilTick).toBe(0);
    expect(state.boss!.tentacles.map(target => target.attackCooldown)).toEqual([3, 3, 3]);
  });
});

describe('seal in real fixed-step combat', () => {
  it('slows ground, flight, charge and individual boss zones without changing their speed sources', () => {
    const { state, config, rules } = setup(true, true);
    state.enemies = (['ghost', 'turtle', 'bat', 'minotaur'] as const).map((kind, index) => ({
      ...enemy(index + 1, 250, kind), ...(kind === 'minotaur' ? { chargePhase: 'charging' as const } : {}),
    }));
    state.boss!.tentacles = [
      { id: -1, x: 250, y: 0, attackCooldown: 3 },
      { id: -2, x: -250, y: 0, attackCooldown: 3 },
    ];
    state.beamAngle = state.desiredBeamAngle = Math.PI / 2;
    stepBattle(state, config, [{ type: 'use-ability', target: { x: 250, y: 0 } }]);
    for (const target of state.enemies) {
      const definition = config.enemies[target.kind];
      const speed = target.kind === 'minotaur' ? definition.charge!.speed : definition.speed;
      expect(target.x).toBeCloseTo(250 - speed * config.stepSeconds * rules.entrySpeedMultiplier);
    }
    expect(state.boss!.tentacles[0]!.x).toBeCloseTo(250 - config.boss!.speed * config.stepSeconds * rules.entrySpeedMultiplier);
    expect(state.boss!.tentacles[1]!.x).toBeCloseTo(-250 + config.boss!.speed * config.stepSeconds);
  });

  it('applies before movement and composes by minimum with independent stronger or weaker slows', () => {
    for (const other of [0.1, 0.8]) {
      const { state, config, rules } = setup();
      const target = state.enemies[0]!;
      target.bellSlows = [{ sourceId: 1, untilTick: 50, multiplier: other }];
      stepBattle(state, config, [{ type: 'use-ability', target: { x: 250, y: 0 } }]);
      expect(target.x).toBeCloseTo(250 - config.enemies.ghost.speed * config.stepSeconds * Math.min(other, rules.speedMultiplier));
      expect(target.attackCooldown).toBeCloseTo(4 - config.stepSeconds);
      expect(target.health).toBe(1000);
    }
  });

  it('does not interrupt stationary charge windup or boss attacks', () => {
    const { state, config } = setup(true, true);
    state.enemies = [{ ...enemy(1, 250, 'minotaur'), chargePhase: 'windup', chargeRemaining: 1 }];
    state.boss!.tentacles = [{ id: -1, x: 250, y: 0, attackCooldown: 3 }];
    stepBattle(state, config, [{ type: 'use-ability', target: { x: 250, y: 0 } }]);
    expect(state.enemies[0]!.chargeRemaining).toBeCloseTo(1 - config.stepSeconds);
    expect(state.enemies[0]!.chargePhase).toBe('windup');
    expect(state.enemies[0]!.x).toBe(250);
    expect(state.boss!.tentacles[0]!.attackCooldown).toBeCloseTo(3 - config.stepSeconds);
  });

  it('is deterministic for a seed and freezes all effects when the night ends', () => {
    const one = setup(true), two = setup(true);
    const commands = [{ type: 'use-ability' as const, target: { x: 250, y: 0 } }];
    stepBattle(one.state, one.config, commands); stepBattle(two.state, two.config, commands);
    for (let index = 0; index < 60; index++) {
      stepBattle(one.state, one.config, []); stepBattle(two.state, two.config, []);
    }
    expect(one.state).toEqual(two.state);
    one.state.outcome = 'defeat';
    const ended = structuredClone(one.state);
    stepBattle(one.state, one.config, commands);
    expect(one.state).toEqual(ended);
  });
});
