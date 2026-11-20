export interface TerrainPoint { x: number; y: number }

export type GroundFront = 'north' | 'south';

export interface GroundApproach {
  /** A vector from the lighthouse toward the center of the spawn sector. */
  readonly direction: TerrainPoint;
  readonly halfAngle: number;
  /** Interior turns in travel order. The last leg ends at the lighthouse. */
  readonly via?: readonly TerrainPoint[];
}

export interface Terrain {
  shoreX: number;
  landOnlyPlacement: boolean;
  groundSpawn?: 'dry-approach';
  /** Increasing y, with land to the left. */
  shoreline?: readonly TerrainPoint[];
  /** Disjoint simple polygons, with implicit closing edges. Replaces the legacy coast. */
  landRegions?: readonly (readonly TerrainPoint[])[];
  groundRoutes?: Readonly<Record<GroundFront, GroundApproach>>;
}

export const CHAPTER_TERRAIN_BOUNDS = { minX: -1125, maxX: 1125, minY: -750 / .7, maxY: 750 / .7 } as const;
/** Manually traced walkable upper cliff lip, not foam or cliff foot.
 * Source: art/concepts/preparation-2026-11-17/world-v2/terrain-coast-irregular-v1.png,
 * 1536x1024. Pixel -> world mapping is the same as the painter; no runtime mask.
 * Trace is provisional (art is raster), but authoritative for placement/spawning. */
export const SHORELINE_SOURCE_PIXELS: readonly (readonly [number, number])[] = [
  [792,0],[799,20],[749,40],[730,62],[741,89],[777,109],
  [716,135],[697,156],[716,180],[738,199],[742,213],
  [700,235],[684,258],[710,282],[736,303],[722,320],
  [682,342],[698,371],[721,394],[717,414],[737,442],
  [787,464],[821,483],[822,505],[777,531],[751,548],
  [777,570],[783,588],[737,611],[700,638],[684,649],
  [697,672],[695,690],[713,712],[751,729],[770,751],
  [777,775],[750,800],[737,824],[772,852],[776,875],
  [739,898],[714,924],[727,944],[703,960],[736,983],[748,1002],[743,1024],
];
export const CHAPTER_TERRAIN: Terrain = {
  shoreX: 0, landOnlyPlacement: true,
  shoreline: SHORELINE_SOURCE_PIXELS.map(([x,y]) => ({ x: (x / 1536 - .5) * 2250, y: (y / 1024 - .5) * 1500 / .7 })),
};
const EPSILON = 1e-9;

export function validateTerrain(terrain: Terrain | undefined): void {
  if (!terrain) return;
  if (!Number.isFinite(terrain.shoreX) || typeof terrain.landOnlyPlacement !== 'boolean'
    || (terrain.groundSpawn !== undefined && terrain.groundSpawn !== 'dry-approach')) throw new Error('Неверные правила берега.');
  if (terrain.shoreline && (terrain.shoreline.length < 2 || terrain.shoreline.some((p,i,points) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || (i > 0 && p.y <= points[i-1]!.y)))) throw new Error('Берег должен быть конечной полилинией с возрастающим y.');
  if (terrain.landRegions) {
    if (terrain.shoreline || !terrain.landRegions.length) throw new Error('Области суши заменяют полилинию берега.');
    for (const [index, polygon] of terrain.landRegions.entries()) {
      validateLandRegion(polygon);
      for (const other of terrain.landRegions.slice(0, index)) {
        if (pointInRegion(polygon, other[0]!) || pointInRegion(other, polygon[0]!)
          || edges(polygon).some(([a, b]) => edges(other).some(([c, d]) => intersectionFractions(a, b, c, d).length))) {
          throw new Error('Области суши должны быть раздельными.');
        }
      }
    }
  }
  if (terrain.groundRoutes) {
    for (const front of ['north', 'south'] as const) {
      const route = terrain.groundRoutes[front];
      if (!route || !finitePoint(route.direction) || Math.hypot(route.direction.x, route.direction.y) <= EPSILON
        || !(route.halfAngle > 0 && route.halfAngle < Math.PI)
        || route.via?.some(point => !finitePoint(point) || Math.hypot(point.x, point.y) <= EPSILON)) {
        throw new Error('Наземному подходу нужны направление, ширина и конечные точки поворота.');
      }
    }
  }
}

/** Polyline accessor for coastal maps. Outside the traced y extent, the endpoint continues vertically. */
export function shoreAtY(terrain: Terrain, y: number): number {
  const points = terrain.shoreline;
  if (!points?.length) return terrain.shoreX;
  if (y <= points[0]!.y) return points[0]!.x;
  for (let i=1; i<points.length; i++) {
    const a=points[i-1]!, b=points[i]!;
    if (y <= b.y) return a.x + (b.x-a.x) * (y-a.y)/(b.y-a.y);
  }
  return points[points.length-1]!.x;
}
export function isLandPoint(terrain: Terrain | undefined, point: TerrainPoint): boolean {
  if (terrain?.landRegions) return terrain.landRegions.some(polygon => pointInRegion(polygon, point));
  return !terrain || point.x <= shoreAtY(terrain, point.y) + EPSILON;
}

function pointSegmentDistance(point: TerrainPoint, from: TerrainPoint, to: TerrainPoint): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - from.x - fraction * dx, point.y - from.y - fraction * dy);
}

type RegionEdge = readonly [TerrainPoint, TerrainPoint];
const regionEdges = new WeakMap<readonly TerrainPoint[], readonly RegionEdge[]>();

function edges(polygon: readonly TerrainPoint[]): readonly RegionEdge[] {
  const cached = regionEdges.get(polygon);
  if (cached) return cached;
  const segments = polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]!] as const);
  regionEdges.set(polygon, segments);
  return segments;
}

const finitePoint = ({ x, y }: TerrainPoint): boolean => Number.isFinite(x) && Number.isFinite(y);
const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

function pointInRegion(polygon: readonly TerrainPoint[], point: TerrainPoint): boolean {
  let inside = false;
  for (const [a, b] of edges(polygon)) {
    if (pointSegmentDistance(point, a, b) <= EPSILON) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (b.x - a.x) * (point.y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

/** Contact parameters on from–to, including both ends of a collinear overlap. */
function intersectionFractions(from: TerrainPoint, to: TerrainPoint, a: TerrainPoint, b: TerrainPoint): number[] {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ex = b.x - a.x, ey = b.y - a.y;
  const ax = a.x - from.x, ay = a.y - from.y;
  const determinant = cross(dx, dy, ex, ey);
  if (Math.abs(determinant) > EPSILON) {
    const t = cross(ax, ay, ex, ey) / determinant;
    const u = cross(ax, ay, dx, dy) / determinant;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t] : [];
  }
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0 || Math.abs(cross(ax, ay, dx, dy)) > EPSILON) return [];
  const t = (ax * dx + ay * dy) / lengthSquared;
  const u = ((b.x - from.x) * dx + (b.y - from.y) * dy) / lengthSquared;
  const start = Math.max(0, Math.min(t, u)), end = Math.min(1, Math.max(t, u));
  return start <= end ? [start, end] : [];
}

function validateLandRegion(polygon: readonly TerrainPoint[]): void {
  const segments = edges(polygon);
  const signedArea = segments.reduce((area, [a, b]) => area + cross(a.x, a.y, b.x, b.y), 0);
  const hasCrossing = segments.some(([a, b], i) => segments.some(([c, d], j) =>
    j > i + 1 && (i !== 0 || j !== segments.length - 1) && intersectionFractions(a, b, c, d).length > 0));
  if (polygon.length < 3 || !polygon.every(finitePoint) || Math.abs(signedArea) <= EPSILON
    || hasCrossing || segments.some(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) <= EPSILON)) {
    throw new Error('Область суши должна быть простым многоугольником.');
  }
}

function isRegionPath(polygon: readonly TerrainPoint[], from: TerrainPoint, to: TerrainPoint, radius: number): boolean {
  if (!pointInRegion(polygon, from) || (from !== to && !pointInRegion(polygon, to))) return false;
  if (radius > EPSILON) {
    // With both centers inside, a swept disk is dry iff it clears every edge.
    return edges(polygon).every(([a, b]) => pointSegmentDistance(from, a, b) >= radius - EPSILON
      && (from === to || (pointSegmentDistance(to, a, b) >= radius - EPSILON
        && pointSegmentDistance(a, from, to) >= radius - EPSILON
        && pointSegmentDistance(b, from, to) >= radius - EPSILON
        && !intersectionFractions(from, to, a, b).length)));
  }
  if (from === to) return true;
  const cuts = [0, 1, ...edges(polygon).flatMap(([a, b]) => intersectionFractions(from, to, a, b))].sort((a, b) => a - b);
  // Between consecutive boundary contacts the path is wholly inside or outside.
  return cuts.slice(1).every((end, index) => {
    const t = (end + cuts[index]!) / 2;
    return pointInRegion(polygon, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  });
}

export function isLandCircle(terrain: Terrain | undefined, point: TerrainPoint, radius: number): boolean {
  return isLandPath(terrain, point, point, radius);
}

export function isLandPath(terrain: Terrain | undefined, from: TerrainPoint, to: TerrainPoint, radius: number): boolean {
  if (!terrain) return true;
  if (terrain.landRegions) return terrain.landRegions.some(polygon => isRegionPath(polygon, from, to, radius));
  if (!isLandPoint(terrain, from) || (from !== to && !isLandPoint(terrain, to))) return false;
  const points = terrain.shoreline;
  if (!points?.length) return Math.max(from.x, to.x) + radius <= terrain.shoreX + EPSILON;
  const minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
  if (minY !== maxY && points.some(point => point.y > minY && point.y < maxY
    && from.x + (to.x - from.x) * ((point.y - from.y) / (to.y - from.y)) > point.x + EPSILON)) return false;
  if (radius <= EPSILON) return true;
  const first = points[0]!, last = points[points.length - 1]!;
  const extended = [{ x: first.x, y: Math.min(first.y, minY - radius - 1) },
    ...points, { x: last.x, y: Math.max(last.y, maxY + radius + 1) }];
  for (let index = 1; index < extended.length; index++) {
    const start = extended[index - 1]!, end = extended[index]!;
    if (end.y < minY - radius || start.y > maxY + radius) continue;
    if (pointSegmentDistance(from, start, end) < radius - EPSILON) return false;
    if (from !== to && (pointSegmentDistance(to, start, end) < radius - EPSILON
      || pointSegmentDistance(start, from, to) < radius - EPSILON
      || pointSegmentDistance(end, from, to) < radius - EPSILON)) return false;
  }
  return true;
}

interface SpawnArcs {
  arcs: readonly (readonly [number, number])[];
  safeAngle: number;
}

const lighthouseOrigin = { x: 0, y: 0 };
const arcsCache = new WeakMap<Terrain, Map<string, SpawnArcs>>();

export function landSpawnAngle(terrain: Terrain, spawnRadius: number, bodyRadius: number, sample: number): number {
  let cache=arcsCache.get(terrain); if (!cache) { cache=new Map(); arcsCache.set(terrain,cache); }
  const requireDryApproach = terrain.groundSpawn === 'dry-approach';
  const key=`${spawnRadius}:${bodyRadius}:${requireDryApproach}`;
  const allowed = (angle: number): boolean => {
    const from = { x: Math.cos(angle) * spawnRadius, y: Math.sin(angle) * spawnRadius };
    return requireDryApproach ? isLandPath(terrain, from, lighthouseOrigin, bodyRadius) : isLandCircle(terrain, from, bodyRadius);
  };
  let profile = cache.get(key);
  if (!profile) {
    const found: [number,number][]=[]; const step=Math.PI*2/2048;
    let previous = allowed(0);
    let safeAngle = previous ? 0 : undefined;
    let start = previous ? 0 : null;
    for (let i=1;i<=2048;i++) {
      const angle=i*step, current=allowed(angle);
      if (current && safeAngle === undefined) safeAngle = angle;
      if (current!==previous) {
        let low=angle-step, high=angle;
        for(let j=0;j<40;j++) { const mid=(low+high)/2; if(allowed(mid)===previous) low=mid; else high=mid; }
        const boundary=current?high:low;
        if(current) start=boundary; else if(start!==null) { found.push([start,boundary]); start=null; }
      }
      previous=current;
    }
    if(start!==null) found.push([start,Math.PI*2]);
    const nonEmpty = found.filter(([from, to]) => to > from);
    if (!nonEmpty.length || safeAngle === undefined) throw new Error('Нет допустимой дуги появления наземного врага.');
    profile = { arcs: nonEmpty, safeAngle };
    cache.set(key, profile);
  }
  const { arcs, safeAngle } = profile;
  let distance = Math.max(0, Math.min(1, sample)) * arcs.reduce((sum, [from, to]) => sum + to - from, 0);
  let angle = arcs.at(-1)![1];
  for (const [from, to] of arcs) {
    if (distance <= to - from) { angle = from + distance; break; }
    distance -= to - from;
  }
  return !requireDryApproach || allowed(angle) ? angle : safeAngle;
}
