import { describe, expect, it } from 'vitest';
import { NIGHT_CATALOG, validateNightDefinitions } from '../../src/content/nights';
import { NIGHT_CONFIG } from '../../src/content/night';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { measureBattle } from '../helpers/balancePolicy';
import { checkDraft } from '../../src/application/placement';
import type { DevicePlacement, NightConfig, UpgradeId } from '../../src/contracts';

describe('provisional turning/pressure balance', () => {
  it('measures multiple seeds and reachable early equipment', () => {
    const rows = NIGHT_CATALOG.flatMap(night => [3, 42, 81].map(seed => {
      const config = calculateNightConfig(night.config, night.id === 'first-light' ? [] : ['beam-power-1', 'beam-width-1']);
      return { id: night.id, seed, ...measureBattle(config, seed) };
    }));
    console.table(rows.map(({ devices: _devices, encountered: _encountered, ...row }) => row));
    for (const row of rows) {
      expect(row.outcome, `${row.id}/${row.seed}`).toBe('victory');
      expect(row.seconds).toBeLessThan(240);
      expect(row.peak).toBeLessThanOrEqual(6);
      if (row.id !== 'abyss-warden') expect(row.seconds).toBeGreaterThanOrEqual(120);
      if (row.id === 'rescue-trial') expect(row.rescued).toBe(true);
    }
  });

  it('increases first-night pressure while keeping the revised victory budget bounded', () => {
    const comparison = [];
    for (const seed of [3, 42, 81]) {
      const previous = measureBattle({ ...structuredClone(NIGHT_CONFIG), terrain: { shoreX: 0, landOnlyPlacement: true } }, seed);
      const current = measureBattle(NIGHT_CATALOG[0]!.config, seed);
      comparison.push({ seed, previous, current });
      expect(current.seconds).toBeGreaterThanOrEqual(120);
      expect(current.switches).toBeGreaterThan(previous.switches);
      expect(current.enemiesPerMinute).toBeGreaterThan(previous.enemiesPerMinute * 1.2);
      expect(current.overlapSeconds / current.seconds).toBeGreaterThan(previous.overlapSeconds / previous.seconds);
      expect(current.emptyFraction).toBeLessThan(previous.emptyFraction);
      expect(current.reward).toBe(120);
      expect(current.rewardPerMinute).toBeGreaterThan(55);
      expect(current.rewardPerMinute).toBeLessThan(60);
    }
    console.table(comparison.map(({ seed, previous, current }) => ({ seed,
      oldSeconds: previous.seconds, newSeconds: current.seconds, oldEnemiesPerMinute: previous.enemiesPerMinute, newEnemiesPerMinute: current.enemiesPerMinute,
      oldEmpty: previous.emptyFraction, newEmpty: current.emptyFraction, oldOverlap: previous.overlapSeconds, newOverlap: current.overlapSeconds,
      oldIncome: previous.rewardPerMinute, newIncome: current.rewardPerMinute })));
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('keeps the free first-night peak readable (seed %s)', seed => {
    const result = measureBattle(NIGHT_CATALOG[0]!.config, seed);
    expect(result.outcome).toBe('victory');
    expect(result.peak).toBeLessThanOrEqual(6);
    expect(result.seconds).toBeGreaterThanOrEqual(120);
    expect(result.seconds).toBeLessThan(240);
  });

  it.each(['broken-shore', 'winged-tide', 'rescue-trial', 'abyss-warden', 'far-shore'])('supports a reachable device build in %s', id => {
    const upgrades: UpgradeId[] = ['beam-power-1', 'unlock-cannon', 'unlock-barrier'];
    // Three nodes cost 110; unlocks grant both first objects. Reachable from first-light's 120, leaving 10 for repairs.
    const config = calculateNightConfig(NIGHT_CATALOG.find(night => night.id === id)!.config, upgrades);
    const placements: DevicePlacement[] = [{ id: 1, kind: 'cannon', x: -90, y: -60 }, { id: 2, kind: 'barrier', x: -220, y: 0 }];
    expect(checkDraft(config, placements).valid).toBe(true);
    for (const seed of [3, 42, 81]) expect(measureBattle(config, seed, placements).outcome).toBe('victory');
  });

  it('has deterministic commands and metrics for identical input', () => {
    expect(measureBattle(NIGHT_CATALOG[1]!.config, 42)).toEqual(measureBattle(NIGHT_CATALOG[1]!.config, 42));
  });

  it('separates scheduled urgent enemies across wave edges', () => {
    for (const night of NIGHT_CATALOG) {
      const deadlines = night.config.waves.flatMap((wave, index) => wave.enemies.flatMap((kind, spawn) =>
        kind === 'minotaur' || kind === 'bat' ? [index * night.config.waveInterval + spawn * wave.spawnInterval] : []));
      deadlines.sort((a, b) => a - b);
      for (let index = 1; index < deadlines.length; index++) expect(deadlines[index]! - deadlines[index - 1]!).toBeGreaterThanOrEqual(12);
    }
  });

  it.each([.6, 1])('allows recognition %ss, opposite turn and base-DPS kill before shield/inner-device impact', delay => {
    for (const placements of [[], [{ id: 1, kind: 'barrier', x: -250, y: 0 }], [{ id: 1, kind: 'generator', x: -60, y: 0 }]] as DevicePlacement[][]) {
      const config: NightConfig = { ...structuredClone(NIGHT_CONFIG), spawnRadius: 350,
        terrain: { shoreX: 0, landOnlyPlacement: true }, waves: [{ id: 'reaction', enemies: ['minotaur'], spawnInterval: 1 }] };
      expect(checkDraft(config, placements).valid).toBe(true);
      const state = createBattle(config, 1, { next: () => .5 }, placements);
      state.beamAngle = 0; state.desiredBeamAngle = 0;
      let cueAt: number | null = null, deathAt = Infinity;
      for (let tick = 0; tick < 600 && state.outcome === 'playing'; tick++) {
        const enemy = state.enemies[0];
        // The visible windup is the reaction cue; aim remains opposite for delay.
        if (enemy?.chargePhase === 'windup' && cueAt === null) cueAt = state.elapsed;
        stepBattle(state, config, cueAt !== null && state.elapsed >= cueAt + delay ? [{ type: 'aim', angle: Math.PI }] : []);
        if (state.kills === 1) deathAt = state.elapsed;
      }
      expect(cueAt).not.toBeNull();
      expect(state.outcome).toBe('victory');
      expect(deathAt - cueAt!).toBeLessThan(config.enemies.minotaur.charge!.windup);
      expect(state.events.some(event => ['device-hit', 'shield-hit', 'lighthouse-hit', 'charge-impact'].includes(event.type))).toBe(false);
      expect(state.lighthouseHealth).toBe(config.lighthouseHealth);
    }
  });

  it('reports the risk of a device outside the interception zone as normal contact', () => {
    const config: NightConfig = { ...structuredClone(NIGHT_CONFIG), terrain: { shoreX: 0, landOnlyPlacement: true },
      waves: [{ id: 'frontier', enemies: ['minotaur'], spawnInterval: 1 }] };
    const placements: DevicePlacement[] = [{ id: 1, kind: 'barrier', x: -274, y: 0 }];
    expect(checkDraft(config, placements).valid).toBe(true);
    const state = createBattle(config, 1, { next: () => .5 }, placements);
    for (let tick = 0; tick < 180 && !state.events.some(event => event.type === 'device-hit'); tick++) stepBattle(state, config, []);
    const hit = state.events.find(event => event.type === 'device-hit');
    expect(hit?.type === 'device-hit' ? hit.damage : null).toBe(config.enemies.minotaur.attackDamage);
    expect(state.enemies[0]?.chargePhase).toBe('ready');
    expect(state.events.some(event => event.type === 'charge-impact')).toBe(false);
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid turn speed %s', turnSpeed => {
    const nights = structuredClone(NIGHT_CATALOG);
    nights[0]!.config.beam.turnSpeed = turnSpeed;
    expect(() => validateNightDefinitions(nights)).toThrow();
  });
});
