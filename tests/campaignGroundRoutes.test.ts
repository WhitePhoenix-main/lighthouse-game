import { describe, expect, it, vi } from 'vitest';
import type { EnemyKind, NightConfig } from '../src/contracts';
import { CAMPAIGN_CONTROL_MAPS } from '../src/content/campaignControlMaps';
import { CAMPAIGN_TERRAIN } from '../src/content/campaignTerrain';
import { NIGHT_CONFIG } from '../src/content/night';
import { CHAPTER_TERRAIN, isLandCircle, isLandPath, type Terrain } from '../src/content/terrain';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectGroundSpawn } from '../src/simulation/groundRoutes';
import { updateShield } from '../src/simulation/shield';

const lighthouse = { x: 0, y: 0 };

function notchedCoast(notchX: number): Terrain {
  return { shoreX: 0, landOnlyPlacement: true, shoreline: [
    { x: 0, y: -20 }, { x: 0, y: -8 }, { x: notchX, y: 0 }, { x: 0, y: 8 }, { x: 0, y: 20 },
  ] };
}

function scenario(terrain: Terrain, kind: EnemyKind = 'turtle'): NightConfig {
  return { ...NIGHT_CONFIG, terrain, waves: [{ id: 'ground-approach', enemies: [kind], spawnInterval: 1 }] };
}

describe('continuous ground approaches', () => {
  it('detects a wet centerline between two dry endpoints, even for zero radius', () => {
    const terrain = notchedCoast(-12);
    const from = { x: -10, y: -12 }, to = { x: -10, y: 12 };
    expect(isLandCircle(terrain, from, 0)).toBe(true);
    expect(isLandCircle(terrain, to, 0)).toBe(true);
    expect(isLandPath(terrain, from, to, 0)).toBe(false);
    expect(isLandPath(terrain, to, from, 0)).toBe(false);
  });

  it('rejects an interior body collision despite a dry centerline and dry end footprints', () => {
    const terrain = notchedCoast(-9);
    const from = { x: -10, y: -12 }, to = { x: -10, y: 12 };
    expect(isLandCircle(terrain, from, 2)).toBe(true);
    expect(isLandCircle(terrain, to, 2)).toBe(true);
    expect(isLandPath(terrain, from, to, 0)).toBe(true);
    expect(isLandPath(terrain, from, to, 2)).toBe(false);
  });

  it('permits tangency and continues a straight coast beyond its last vertex', () => {
    const terrain: Terrain = { shoreX: 0, landOnlyPlacement: true,
      shoreline: [{ x: 0, y: -2 }, { x: 0, y: 2 }] };
    const from = { x: -5, y: 8 }, to = { x: -5, y: 20 };
    expect(isLandPath(terrain, from, to, 5)).toBe(true);
    expect(isLandPath(terrain, from, to, 5.01)).toBe(false);
  });

  it('replaces the wet headland spawn of seed 7 and keeps the moving body dry to contact', () => {
    const reference = scenario(CHAPTER_TERRAIN);
    const corrected = scenario(CAMPAIGN_CONTROL_MAPS.headland.terrain);
    const radius = reference.enemies.turtle.radius;
    const previousSpawn = createBattle(reference, 7).enemies[0]!;
    expect(isLandCircle(reference.terrain, previousSpawn, radius)).toBe(true);
    expect(isLandPath(reference.terrain, previousSpawn, lighthouse, radius)).toBe(false);

    const state = createBattle(corrected, 7);
    const enemy = state.enemies[0]!;
    expect(isLandPath(corrected.terrain, enemy, lighthouse, radius)).toBe(true);
    const contactDistance = corrected.lighthouseRadius + radius;
    for (let step = 0; step < 1600 && Math.hypot(enemy.x, enemy.y) > contactDistance + 1e-6; step++) {
      stepBattle(state, corrected, []);
      expect(isLandCircle(corrected.terrain, enemy, radius)).toBe(true);
    }
    expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(contactDistance, 6);
  });

  it.each(['ghost', 'bat'] as const)('does not move the %s spawn or consume another sample', kind => {
    const previous = createBattle(scenario(CHAPTER_TERRAIN, kind), 7);
    const draw = vi.fn(() => 0.4);
    const atSample = createBattle(scenario(CHAPTER_TERRAIN, kind), 7, { next: () => 0.4 });
    const changed = createBattle(scenario(CAMPAIGN_CONTROL_MAPS.headland.terrain, kind), 7, { next: draw });
    expect(changed.enemies[0]).toEqual(atSample.enemies[0]);
    expect(changed.rngState).toBe(previous.rngState);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('rejects a map without a dry approach rather than spawning on a wet route', () => {
    const terrain: Terrain = { shoreX: -100, landOnlyPlacement: true, groundSpawn: 'dry-approach' };
    expect(() => createBattle(scenario(terrain), 42)).toThrow('Нет допустимой дуги появления наземного врага');
  });

  it.each(['north', 'south'] as const)('follows the %s marsh route and reaches attack contact', front => {
    const terrain = CAMPAIGN_TERRAIN['marsh-islands'];
    const rules = scenario(terrain);
    const config = { ...rules, waves: [{ ...rules.waves[0]!, fronts: [front] }] };
    const radius = config.enemies.turtle.radius;
    const sample = .3;
    const spawn = selectGroundSpawn(terrain, config.spawnRadius, radius, sample, front)!;
    const draw = vi.fn(() => sample);
    const state = createBattle(config, 7, { next: draw });
    const enemy = state.enemies[0]!;
    expect(draw).toHaveBeenCalledTimes(1);
    expect(enemy).toMatchObject({ x: spawn.x, y: spawn.y });
    expect(isLandPath(terrain, enemy, lighthouse, radius)).toBe(false);
    const turn = spawn.waypoints[0]!;
    let reachedTurn = false;
    let steps = 0;
    while (steps < 2000 && state.lighthouseHealth === config.lighthouseHealth) {
      const before = { x: enemy.x, y: enemy.y };
      stepBattle(state, config, []);
      expect(isLandPath(terrain, before, enemy, radius)).toBe(true);
      reachedTurn ||= Math.hypot(enemy.x - turn.x, enemy.y - turn.y) < 1e-7;
      steps++;
    }
    expect(reachedTurn).toBe(true);
    expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(config.lighthouseRadius + radius, 6);
    expect(state.lighthouseHealth).toBeLessThan(config.lighthouseHealth);
  });

  it('starts the marsh minotaur windup inside the actual interception radius, not near a waypoint', () => {
    const config = scenario(CAMPAIGN_TERRAIN['marsh-islands'], 'minotaur');
    const state = createBattle(config, 7);
    const enemy = state.enemies[0]!;
    const trigger = config.enemies.minotaur.charge!.triggerDistance;
    stepBattle(state, config, []);
    expect(enemy.chargePhase).toBe('ready');
    while (state.tick < 600 && enemy.chargePhase === 'ready') stepBattle(state, config, []);
    expect(enemy.chargePhase).toBe('windup');
    expect(Math.hypot(enemy.x, enemy.y)).toBeLessThanOrEqual(trigger);
    expect(Math.hypot(enemy.x, enemy.y)).toBeGreaterThan(trigger - config.enemies.minotaur.speed * config.stepSeconds - 1e-7);
  });

  it('pushes a boarder at the wreck-channel coast to a dry spot when the field restores', () => {
    const config = scenario(CAMPAIGN_TERRAIN['wreck-channel'], 'boarder');
    const state = createBattle(config, 7, undefined, [{ id: 1, kind: 'generator', x: -65, y: 55 }]);
    const enemy = state.enemies[0]!;
    const position = { x: 37.8, y: -77.35 };
    Object.assign(enemy, position);
    const radius = config.enemies.boarder.radius;
    const boundary = config.shield.radius + radius;
    const bearing = Math.atan2(position.y, position.x);
    expect(isLandCircle(config.terrain, position, radius)).toBe(true);
    expect(isLandCircle(config.terrain, { x: Math.cos(bearing) * boundary, y: Math.sin(bearing) * boundary }, radius)).toBe(false);
    state.shield.current = 0;
    updateShield(state, config);
    expect(state.shield.current).toBeGreaterThan(0);
    expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(boundary);
    expect(isLandPath(config.terrain, position, enemy, radius)).toBe(true);
    expect(isLandPath(config.terrain, enemy, lighthouse, radius)).toBe(true);
  });
});
