import type { NightConfig } from '../contracts';

export type Terrain = NonNullable<NightConfig['terrain']>;
export interface TerrainPoint { x: number; y: number }
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

export function validateTerrain(terrain: NightConfig['terrain']): void {
  if (!terrain) return;
  if (!Number.isFinite(terrain.shoreX) || typeof terrain.landOnlyPlacement !== 'boolean') throw new Error('Неверные правила берега.');
  if (terrain.shoreline && (terrain.shoreline.length < 2 || terrain.shoreline.some((p,i,points) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || (i > 0 && p.y <= points[i-1]!.y)))) throw new Error('Берег должен быть конечной полилинией с возрастающим y.');
}

/** Outside the traced y extent, the endpoint continues as a vertical coast. */
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
export function isLandPoint(terrain: NightConfig['terrain'], point: TerrainPoint): boolean {
  return !terrain || point.x <= shoreAtY(terrain, point.y) + EPSILON;
}
export function isLandCircle(terrain: NightConfig['terrain'], point: TerrainPoint, radius: number): boolean {
  if (!terrain) return true;
  if (!isLandPoint(terrain, point)) return false;
  const points = terrain.shoreline;
  if (!points?.length) return point.x + radius <= terrain.shoreX + EPSILON;
  const first=points[0]!, last=points[points.length-1]!;
  // Include endpoint rays, so circles crossing outside the trace are also checked.
  const extended = [{ x:first.x, y: Math.min(first.y,point.y-radius-1) }, ...points, { x:last.x, y:Math.max(last.y,point.y+radius+1) }];
  for (let i=1; i<extended.length; i++) {
    const a=extended[i-1]!, b=extended[i]!;
    const dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)) : 0;
    if (Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy) < radius-EPSILON) return false;
  }
  return true;
}
const arcsCache = new WeakMap<Terrain, Map<string, readonly (readonly [number,number])[]>>();
/** One random sample uniformly selects permitted arcs. Boundaries are refined without
 * consuming random numbers. 2048 brackets resolve coast features far below body size. */
export function landSpawnAngle(terrain: Terrain, spawnRadius: number, bodyRadius: number, sample: number): number {
  let cache=arcsCache.get(terrain); if (!cache) { cache=new Map(); arcsCache.set(terrain,cache); }
  const key=`${spawnRadius}:${bodyRadius}`;
  let arcs=cache.get(key);
  if (!arcs) {
    const allowed=(angle:number) => isLandCircle(terrain,{x:Math.cos(angle)*spawnRadius,y:Math.sin(angle)*spawnRadius},bodyRadius);
    const found: [number,number][]=[]; const step=Math.PI*2/2048;
    let start=allowed(0)?0:null, previous=allowed(0);
    for (let i=1;i<=2048;i++) {
      const angle=i*step, current=allowed(angle);
      if (current!==previous) {
        let low=angle-step, high=angle;
        for(let j=0;j<40;j++) { const mid=(low+high)/2; if(allowed(mid)===previous) low=mid; else high=mid; }
        const boundary=current?high:low;
        if(current) start=boundary; else if(start!==null) { found.push([start,boundary]); start=null; }
      }
      previous=current;
    }
    if(start!==null) found.push([start,Math.PI*2]);
    if(!found.length) throw new Error('Нет допустимой дуги появления наземного врага.');
    arcs=found; cache.set(key,arcs);
  }
  let distance=Math.max(0,Math.min(1,sample))*arcs.reduce((sum,[a,b])=>sum+b-a,0);
  for(const [a,b] of arcs) { if(distance<=b-a) return a+distance; distance-=b-a; }
  return arcs[arcs.length-1]![1];
}
