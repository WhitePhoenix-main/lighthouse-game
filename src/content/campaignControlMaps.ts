import { CAMPAIGN_TERRAIN } from './campaignTerrain';
import type { Terrain, TerrainPoint } from './terrain';

function controlMap(mapId: 'headland' | 'ashen-plateau' | 'rift-coast'): {
  readonly terrain: Terrain;
  readonly dryApproaches: readonly TerrainPoint[];
} {
  const terrain = CAMPAIGN_TERRAIN[mapId];
  const { north, south } = terrain.groundRoutes;
  return { terrain, dryApproaches: [north.direction, south.direction] };
}

export const CAMPAIGN_CONTROL_MAPS = {
  headland: controlMap('headland'),
  'ashen-plateau': controlMap('ashen-plateau'),
  'rift-coast': controlMap('rift-coast'),
};
