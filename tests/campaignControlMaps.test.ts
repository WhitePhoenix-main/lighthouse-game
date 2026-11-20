import { describe, expect, it } from 'vitest';
import { checkDraft, checkPlacement } from '../src/application/placement';
import { CAMPAIGN_CONTROL_MAPS } from '../src/content/campaignControlMaps';
import { CAMPAIGN_TERRAIN } from '../src/content/campaignTerrain';
import { NIGHT_CONFIG } from '../src/content/night';
import { CHAPTER_TERRAIN, isLandCircle, isLandPoint, shoreAtY, validateTerrain,
  type Terrain, type TerrainPoint } from '../src/content/terrain';
import { createBattle } from '../src/simulation/battle';

const groundKinds = ['turtle', 'minotaur'] as const;
const groundRadius = Math.max(...groundKinds.map(kind => NIGHT_CONFIG.enemies[kind].radius));
const mapCases = [
  { mapId: 'headland', cannons: [{ x: -200, y: -130 }, { x: -200, y: 100 }], water: [{ x: 220, y: 0 }] },
  { mapId: 'ashen-plateau', cannons: [{ x: -155, y: -171 }, { x: -155, y: 171 }],
    water: [{ x: 225, y: 0 }, { x: 220, y: 180 }] },
  { mapId: 'rift-coast', cannons: [{ x: -176, y: -115 }, { x: -176, y: 115 }],
    water: [{ x: 115, y: 0 }, { x: 250, y: -190 }, { x: 250, y: 205 }] },
] as const;

function firstWetPointOnApproach(terrain: Terrain, from: TerrainPoint, radius: number): TerrainPoint | undefined {
  const steps = Math.ceil(Math.hypot(from.x, from.y));
  for (let step = 0; step <= steps; step++) {
    const fraction = 1 - step / steps;
    const point = { x: from.x * fraction, y: from.y * fraction };
    if (!isLandCircle(terrain, point, radius)) return point;
  }
  return undefined;
}

describe('campaign control map geometry', () => {
  it('exposes the three control maps and reuses the existing headland terrain', () => {
    expect(Object.keys(CAMPAIGN_CONTROL_MAPS).sort()).toEqual(['ashen-plateau', 'headland', 'rift-coast']);
    expect(CAMPAIGN_CONTROL_MAPS.headland.terrain).toBe(CAMPAIGN_TERRAIN.headland);
    expect(CAMPAIGN_CONTROL_MAPS.headland.terrain.shoreline).toBe(CHAPTER_TERRAIN.shoreline);
    expect(CAMPAIGN_CONTROL_MAPS.headland.terrain.groundSpawn).toBe('dry-approach');
    expect(CHAPTER_TERRAIN.groundSpawn).toBeUndefined();
  });

  it('gives the plateau a dry central shelf and the rift two dry capes around an open inlet', () => {
    const plateau = CAMPAIGN_CONTROL_MAPS['ashen-plateau'].terrain;
    const rift = CAMPAIGN_CONTROL_MAPS['rift-coast'].terrain;
    const center = { x: 115, y: 0 };
    const radius = NIGHT_CONFIG.devices.definitions.barrier.radius;
    expect(isLandCircle(plateau, center, radius)).toBe(true);
    expect(isLandPoint(CHAPTER_TERRAIN, center)).toBe(false);

    for (const y of [-190, 205]) {
      const cape = { x: center.x, y };
      expect(isLandCircle(rift, cape, radius)).toBe(true);
      expect(isLandCircle(plateau, cape, radius)).toBe(false);
    }

    const inletEdges = [-40, 40, ...rift.shoreline!.filter(({ y }) => Math.abs(y) < 40).map(({ y }) => y)];
    expect(Math.max(...inletEdges.map(y => shoreAtY(rift, y)))).toBeLessThan(center.x);
  });

  describe.each(mapCases)('$mapId', ({ mapId, cannons, water }) => {
    const { terrain, dryApproaches } = CAMPAIGN_CONTROL_MAPS[mapId];
    const config = { ...NIGHT_CONFIG, terrain };

    it('has a valid shoreline with a dry lighthouse footprint and seaward space', () => {
      expect(() => validateTerrain(terrain)).not.toThrow();
      expect(isLandCircle(terrain, { x: 0, y: 0 }, config.lighthouseRadius)).toBe(true);
      for (const point of water) {
        expect(Math.hypot(point.x, point.y)).toBeLessThan(config.worldRadius);
        expect(isLandPoint(terrain, point)).toBe(false);
      }
    });

    it('gives each dry approach room for the ground body and a cannon within reach', () => {
      const placements = cannons.map((point, index) => ({ id: index + 1, kind: 'cannon' as const, ...point }));
      expect(dryApproaches).toHaveLength(placements.length);
      expect(checkDraft(config, placements).valid).toBe(true);
      dryApproaches.forEach((from, index) => {
        expect(Math.hypot(from.x, from.y) + groundRadius).toBeLessThan(config.worldRadius);
        expect(firstWetPointOnApproach(terrain, from, groundRadius + 0.5)).toBeUndefined();
        const cannon = placements[index]!;
        expect(Math.hypot(cannon.x - from.x, cannon.y - from.y)).toBeLessThan(config.devices.definitions.cannon.range);
      });
    });

    it('rejects placement when the center is dry but the device footprint clips the shore', () => {
      const kind = 'barrier';
      const radius = config.devices.definitions[kind].radius;
      const y = 160;
      const x = shoreAtY(terrain, y) - radius / 2;
      expect(isLandPoint(terrain, { x, y })).toBe(true);
      expect(isLandCircle(terrain, { x, y }, radius)).toBe(false);
      expect(checkPlacement(config, [], kind, x, y).reason).toContain('целиком находиться на суше');
    });

    it('spawns full ground bodies on land and samples their direct paths', () => {
      const samples = Array.from({ length: 33 }, (_, index) => index / 32);
      for (const kind of groundKinds) {
        const rules = { ...config, waves: [{ id: 'geometry-probe', enemies: [kind], spawnInterval: 1 }] };
        const radius = rules.enemies[kind].radius;
        for (const sample of samples) {
          const { enemies } = createBattle(rules, 1, { next: () => sample });
          expect(enemies).toHaveLength(1);
          const enemy = enemies[0]!;
          const context = `${kind}, RNG sample ${sample}`;
          expect(isLandCircle(terrain, enemy, radius), context).toBe(true);
          expect(firstWetPointOnApproach(terrain, enemy, radius), context).toBeUndefined();
        }
      }
    });
  });
});
