import { isLandPath, type GroundFront, type Terrain, type TerrainPoint } from '../content/terrain';

interface GroundSpawn extends TerrainPoint {
  readonly waypoints: readonly TerrainPoint[];
}

const lighthouse = { x: 0, y: 0 };

/** Uses one seed sample for both the default front and the offset within it. */
export function selectGroundSpawn(terrain: Terrain | undefined, spawnRadius: number, bodyRadius: number,
  sample: number, front?: GroundFront): GroundSpawn | undefined {
  if (!terrain?.groundRoutes) return undefined;
  const s = Math.max(0, Math.min(1, sample));
  const selected = front ?? (s < .5 ? 'north' : 'south');
  const local = front ? s : s * 2 - (selected === 'south' ? 1 : 0);
  const route = terrain.groundRoutes[selected];
  const bearing = Math.atan2(route.direction.y, route.direction.x);
  const waypoints = [...(route.via ?? []), lighthouse];
  const spawnAt = (angle: number): GroundSpawn => ({ x: Math.cos(angle) * spawnRadius, y: Math.sin(angle) * spawnRadius, waypoints });
  const isDry = (spawn: GroundSpawn): boolean => waypoints.every((point, index) =>
    isLandPath(terrain, index === 0 ? spawn : waypoints[index - 1]!, point, bodyRadius));

  const spawn = spawnAt(bearing + (local * 2 - 1) * route.halfAngle);
  if (isDry(spawn)) return spawn;
  const center = spawnAt(bearing);
  if (isDry(center)) return center;
  throw new Error(`Нет допустимого сухого маршрута появления наземного врага (${selected}).`);
}

/** Keep the full body dry during a field restoration and on the next route leg. */
export function groundShieldExit(terrain: Terrain, body: TerrainPoint, bodyRadius: number,
    boundary: number, next: TerrainPoint = lighthouse): TerrainPoint | undefined {
  const bearing = Math.atan2(body.y, body.x);
  const increments = 60;
  for (let offset = 0; offset <= increments; offset++) {
    for (const direction of offset === 0 || offset === increments ? [1] : [1, -1]) {
      const angle = bearing + offset * direction * Math.PI / increments;
      const point = { x: Math.cos(angle) * boundary, y: Math.sin(angle) * boundary };
      if (isLandPath(terrain, body, point, bodyRadius) && isLandPath(terrain, point, next, bodyRadius)) return point;
    }
  }
  return undefined;
}
