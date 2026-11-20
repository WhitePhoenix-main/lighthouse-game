import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../src/application/placement';
import { CAMPAIGN_CHAPTER_DRAFT } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_TERRAIN } from '../src/content/campaignTerrain';
import { NIGHT_CONFIG } from '../src/content/night';
import { isLandCircle, isLandPath, isLandPoint, validateTerrain, type GroundFront, type Terrain, type TerrainPoint } from '../src/content/terrain';
import { selectGroundSpawn } from '../src/simulation/groundRoutes';

const origin = { x: 0, y: 0 };
const { spawnRadius, worldRadius } = NIGHT_CONFIG;
const largestBody = Math.max(...Object.values(NIGHT_CONFIG.enemies).filter(enemy => enemy.spawnSide === 'land').map(enemy => enemy.radius));
const fronts = ['north', 'south'] as const;
const firingPositions = {
  headland: [{ x: -200, y: -130 }, { x: -200, y: 100 }],
  sandspit: [{ x: -176, y: -146 }, { x: -208, y: 42 }],
  'marsh-islands': [{ x: -150, y: -179 }, { x: -153, y: 183 }],
  'ashen-plateau': [{ x: -155, y: -171 }, { x: -155, y: 171 }],
  'wreck-channel': [{ x: -180, y: -128 }, { x: -211, y: 75 }],
  'ruined-towers': [{ x: -146, y: -167 }, { x: -142, y: 172 }],
  'rift-coast': [{ x: -176, y: -115 }, { x: -176, y: 115 }],
} satisfies Record<keyof typeof CAMPAIGN_TERRAIN, readonly TerrainPoint[]>;

describe('authored campaign approaches', () => {
  it.each(CAMPAIGN_CHAPTER_DRAFT.map(({ mapId }) => mapId))('%s has a dry spawn sector and firing position for each front', mapId => {
    const terrain = CAMPAIGN_TERRAIN[mapId];
    expect(() => validateTerrain(terrain)).not.toThrow();
    const config = { ...NIGHT_CONFIG, terrain };
    expect(isLandCircle(terrain, origin, config.lighthouseRadius)).toBe(true);
    fronts.forEach((front, frontIndex) => {
      const cannon = firingPositions[mapId][frontIndex]!;
      expect(checkPlacement(config, [], 'cannon', cannon.x, cannon.y).valid).toBe(true);
      const angles = new Set<number>();
      for (let sample = 0; sample <= 32; sample++) {
        const spawn = selectGroundSpawn(terrain, spawnRadius, largestBody, sample / 32, front)!;
        expect(Math.sign(spawn.y), front).toBe(front === 'north' ? -1 : 1);
        expect(Math.hypot(spawn.x, spawn.y), front).toBeCloseTo(spawnRadius, 9);
        expect(Math.hypot(spawn.x, spawn.y) + largestBody).toBeLessThan(worldRadius);
        angles.add(Math.atan2(spawn.y, spawn.x));
        let from: TerrainPoint = spawn;
        for (const to of spawn.waypoints) {
          expect(isLandPath(terrain, from, to, largestBody + .5), `${front}: ${from.x},${from.y} → ${to.x},${to.y}`).toBe(true);
          expect(Math.hypot(to.x, to.y) + largestBody).toBeLessThan(worldRadius);
          from = to;
        }
        expect(from).toEqual(origin);
      }
      expect(angles.size).toBe(33);
      const center = selectGroundSpawn(terrain, spawnRadius, largestBody, .5, front)!;
      expect(Math.hypot(center.x - cannon.x, center.y - cannon.y)).toBeLessThan(config.devices.definitions.cannon.range);
    });
  });

  it.each(fronts)('takes the dry marsh detour from %s around a flooded direct chord', front => {
    const terrain = CAMPAIGN_TERRAIN['marsh-islands'];
    const spawn = selectGroundSpawn(terrain, spawnRadius, largestBody, .5, front)!;
    expect(isLandPath(terrain, spawn, origin, 0)).toBe(false);
    expect(spawn.waypoints).toHaveLength(2);
    expect(isLandPath(terrain, spawn, spawn.waypoints[0]!, largestBody)).toBe(true);
    expect(isLandPath(terrain, spawn.waypoints[0]!, origin, largestBody)).toBe(true);
  });

  it('distinguishes the disconnected islands, shallows and full placement footprint', () => {
    const terrain = CAMPAIGN_TERRAIN['marsh-islands'];
    const islet = { x: 193, y: -182 }, shallows = { x: 114, y: -190 };
    expect(isLandCircle(terrain, islet, 16)).toBe(true);
    expect(isLandPath(terrain, islet, origin, 0)).toBe(false);
    expect(isLandPoint(terrain, shallows)).toBe(false);
    const edge = { x: 125, y: 0 };
    expect(isLandPoint(terrain, edge)).toBe(true);
    expect(checkPlacement({ ...NIGHT_CONFIG, terrain }, [], 'barrier', edge.x, edge.y).valid).toBe(false);
  });

  it('uses one reproducible sample to choose a default front and its offset', () => {
    const terrain = CAMPAIGN_TERRAIN['marsh-islands'];
    const select = (sample: number, front?: GroundFront) => selectGroundSpawn(terrain, spawnRadius, largestBody, sample, front);
    expect(select(.125)).toEqual(select(.25, 'north'));
    expect(select(.875)).toEqual(select(.75, 'south'));
    expect(selectGroundSpawn({ shoreX: 0, landOnlyPlacement: true }, spawnRadius, largestBody, .5)).toBeUndefined();
  });

  it('rejects an authored route with no dry spawn for the requested body', () => {
    expect(() => selectGroundSpawn(CAMPAIGN_TERRAIN['marsh-islands'], spawnRadius, 75, .5, 'north')).toThrow(/сухого маршрута/);
  });
});

describe('polygon land footprint', () => {
  const terrain: Terrain = {
    shoreX: 0, landOnlyPlacement: true,
    landRegions: [[
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 25 }, { x: 8, y: 25 },
      { x: 8, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 55 }, { x: 0, y: 55 },
    ]],
  };

  it('rejects a water crossing through concave vertices while allowing an edge tangent', () => {
    const from = { x: 15, y: 23 }, to = { x: 15, y: 33 };
    expect(isLandCircle(terrain, from, 2)).toBe(true);
    expect(isLandCircle(terrain, to, 2)).toBe(true);
    expect(isLandPath(terrain, from, to, 0)).toBe(false);
    expect(isLandPath(terrain, to, from, 2)).toBe(false);
    const a = { x: 14, y: 25 }, b = { x: 26, y: 25 };
    expect(isLandPath(terrain, a, b, 0)).toBe(true);
    expect(isLandPath(terrain, a, b, .01)).toBe(false);
    expect(isLandPath(terrain, { x: 4, y: 21 }, { x: 4, y: 35 }, 4)).toBe(true);
    expect(isLandPath(terrain, { x: 4, y: 21 }, { x: 4, y: 35 }, 4.01)).toBe(false);
  });
});
