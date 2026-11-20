import { shoreAtY, type Terrain } from '../../../content/terrain';
import { CHAPTER_SCENERY, type CampaignMap, type LighthouseStage } from './chapterScenery';
import { screenToWorld, WATCH_BEACON, worldToScreen } from './worldGeometry';
import type { ChapterWorldAssets, WorldCamera } from './worldTypes';

type Vertex = readonly [number, number];

function polygon(path: CanvasRenderingContext2D | Path2D, points: readonly Vertex[], closed = true): void {
  const [first, ...rest] = points;
  if (!first) return;
  path.moveTo(...first);
  for (const point of rest) path.lineTo(...point);
  if (closed) path.closePath();
}

export function campaignLandPaths(terrain: Terrain, camera: WorldCamera): { land: Path2D; shore: Path2D; lips: Vertex[][] } {
  const land = new Path2D(), shore = new Path2D();
  const lips: Vertex[][] = [];
  const project = ({ x, y }: { x: number; y: number }): Vertex => {
    const screen = worldToScreen(camera, x, y);
    return [screen.x, screen.y];
  };
  if (terrain.landRegions) {
    for (const region of terrain.landRegions) {
      const vertices = region.map(project);
      polygon(land, vertices);
      polygon(shore, vertices);
      lips.push([...vertices, vertices[0]!]);
    }
  } else {
    const top = screenToWorld(camera, -32, -32), bottom = screenToWorld(camera, 0, camera.height + 32);
    const contour = [
      { x: shoreAtY(terrain, top.y), y: top.y },
      ...(terrain.shoreline ?? []).filter(({ y }) => y > top.y && y < bottom.y),
      { x: shoreAtY(terrain, bottom.y), y: bottom.y },
    ].map(project);
    const left = Math.min(-32, ...contour.map(([x]) => x)) - 32;
    polygon(land, [[left, -32], ...contour, [left, camera.height + 32]]);
    polygon(shore, contour, false);
    lips.push(contour);
  }
  return { land, shore, lips };
}

// Low, angular silhouettes painted into the ground or water layer.
const LANDMARKS: Record<(typeof CHAPTER_SCENERY)[CampaignMap]['motif'], readonly (readonly Vertex[])[]> = {
  shale: [[[-.62,.16],[-.39,-.17],[-.2,-.23],[.1,-.13],[.69,.03],[.46,.2],[-.14,.18]]],
  dune: [[[-.77,.12],[-.36,-.17],[.07,-.22],[.68,-.09],[.06,-.08],[-.26,.03],[-.59,.23]]],
  reed: [[[-.44,.16],[-.73,-.34],[-.37,-.14],[-.34,-.62],[-.15,-.15],[.03,-.49],[.1,-.14],[.42,-.4],[.29,.15]]],
  basalt: [[[-.72,.22],[-.61,-.08],[-.41,-.08],[-.33,-.36],[-.04,-.36],[.07,-.17],[.43,-.17],[.61,.11],[.34,.25]]],
  wreck: [
    [[-.73,-.04],[-.51,.3],[.36,.22],[.75,-.25],[.37,-.02],[-.27,.08]],
    [[-.29,.17],[-.11,-.42],[-.02,-.43],[-.12,.17]],
    [[.05,.16],[.32,-.37],[.39,-.28],[.19,.19]],
    [[.3,.14],[.55,-.24],[.61,-.18],[.44,.13]],
  ],
  ruin: [[[-.58,.21],[-.58,-.4],[-.37,-.43],[-.37,-.23],[-.15,-.26],[-.15,-.5],[.09,-.54],[.1,-.18],[.39,-.21],[.56,.17],[.17,.25],[.14,.01],[-.16,.05],[-.19,.27]]],
  rift: [[[-.79,-.34],[-.28,-.27],[.03,-.03],[.43,-.06],[.74,.26],[.37,.08],[-.05,.15],[-.46,-.13]]],
};

type GroundArt = Pick<ChapterWorldAssets, 'headland' | 'rock' | 'arch'>;
const surfaceTiles = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
const groundFrames = new WeakMap<Terrain, { key: string; source: HTMLImageElement | undefined; frame: HTMLCanvasElement }>();
const SURFACE_PIXEL_SIZE = 2.1;
const RIFT_SURFACE_PIXEL_SIZE = 1.45;

/** Recolour an open patch of the approved raster and mirror its edges. */
function surfaceTile(image: HTMLImageElement, color: string, kind: 'land' | 'land-detail' | 'sea'): HTMLCanvasElement {
  let textures = surfaceTiles.get(image);
  if (!textures) {
    textures = new Map();
    surfaceTiles.set(image, textures);
  }
  const key = kind + color;
  const cached = textures.get(key);
  if (cached) return cached;
  const [x, y, width, height] = kind === 'sea' ? [758, 11, 228, 377]
    : kind === 'land' ? [8, 705, 399, 183] : [17, 4, 483, 148];
  const tile = image.ownerDocument.createElement('canvas');
  tile.width = width;
  tile.height = height;
  const ctx = tile.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  const sample = ctx.getImageData(0, 0, width, height);
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const means = [0, 0, 0];
  for (let i = 0; i < sample.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) means[channel]! += sample.data[i + channel]!;
  }
  for (let channel = 0; channel < 3; channel++) means[channel]! /= width * height;
  for (let i = 0; i < sample.data.length; i += 4) {
    const dr = sample.data[i]! - means[0]!, dg = sample.data[i + 1]! - means[1]!, db = sample.data[i + 2]! - means[2]!;
    const value = .21 * dr + .72 * dg + .07 * db;
    for (const [channel, difference] of [dr, dg, db].entries()) {
      sample.data[i + channel] = rgb[channel]! + value * 1.15 + (difference - value) * .3;
    }
  }
  ctx.putImageData(sample, 0, 0);
  const mirrored = image.ownerDocument.createElement('canvas');
  mirrored.width = width * 2;
  mirrored.height = height * 2;
  const target = mirrored.getContext('2d')!;
  for (const column of [0, 1]) for (const row of [0, 1]) {
    target.setTransform(column ? -1 : 1, 0, 0, row ? -1 : 1, column * width * 2, row * height * 2);
    target.drawImage(tile, 0, 0);
  }
  textures.set(key, mirrored);
  return mirrored;
}

function paintRoute(ctx: CanvasRenderingContext2D, terrain: Terrain, camera: WorldCamera, range: number, dry: string, shadow: string, edge: string): void {
  if (!terrain.groundRoutes) return;
  const { zoom } = camera;
  for (const route of Object.values(terrain.groundRoutes)) {
    const distance = Math.hypot(route.direction.x, route.direction.y);
    const front = { x: route.direction.x / distance * range, y: route.direction.y / distance * range };
    const points = [front, ...(route.via ?? []), { x: 0, y: 0 }].map(({ x, y }) => worldToScreen(camera, x, y));
    const road = new Path2D();
    polygon(road, points.map(({ x, y }) => [x, y]), false);
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [size, color, opacity] of [[52, shadow, .36], [39, dry, .62], [23, edge, .18]] as const) {
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = size * zoom;
      ctx.stroke(road);
    }
    ctx.globalAlpha = 1;
    for (let leg = 1; leg < points.length; leg++) {
      const a = points[leg - 1]!, b = points[leg]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) / zoom;
      for (let offset = 12, index = 0; offset < length; offset += 14, index++) {
        const t = offset / length;
        const hash = (Math.imul(index + 37, 389321) ^ Math.imul(leg + 19, 928371)) >>> 0;
        const x = Math.round(a.x + (b.x - a.x) * t + ((hash & 15) - 8) * zoom);
        const y = Math.round(a.y + (b.y - a.y) * t + (((hash >>> 8) & 15) - 8) * zoom);
        const span = Math.max(2, (4 + hash % 7) * zoom);
        ctx.fillStyle = shadow + 'ba';
        ctx.fillRect(x, y + 1, span, 2);
        ctx.fillStyle = edge + '8a';
        ctx.fillRect(x + 1, y, Math.max(1, span - 2), 1);
      }
    }
  }
}

function paintSurf(ctx: CanvasRenderingContext2D, lips: readonly Vertex[][], camera: WorldCamera, color: string): void {
  const { zoom } = camera;
  const streaks = new Path2D(), reflections = new Path2D();
  const step = Math.max(3, 7 * zoom);
  for (const lip of lips) for (let index = 1; index < lip.length; index++) {
    const [x, y] = lip[index - 1]!, [endX, endY] = lip[index]!;
    const dx = endX - x, dy = endY - y;
    const length = Math.hypot(dx, dy);
    for (let along = step / 2; along < length; along += step) {
      const t = along / length;
      const world = screenToWorld(camera, x + dx * t, y + dy * t);
      const seed = (Math.imul(Math.round(world.x), 92837111) ^ Math.imul(Math.round(world.y), 689287499)) >>> 0;
      if (seed % 8 >= 5) continue;
      const px = Math.round(x + dx * t - 9 * zoom);
      const py = Math.round(y + dy * t + (seed % 17 - 5) * zoom);
      streaks.rect(px, py, Math.max(2, (12 + seed % 14) * zoom), 1);
      if (seed % 4 === 0) reflections.rect(px + 8 * zoom, py + 3 * zoom, Math.max(3, (12 + seed % 19) * zoom), 1);
    }
  }
  ctx.fillStyle = color + '9c';
  ctx.fill(streaks);
  ctx.fillStyle = color + '49';
  ctx.fill(reflections);
}

function drawGround(ctx: CanvasRenderingContext2D, camera: WorldCamera, terrain: Terrain, map: CampaignMap, spawnRadius: number, art?: GroundArt | null): void {
  const { palette: [deep, surface, shadow, dry, grain, edge, haze], motif, landmarks } = CHAPTER_SCENERY[map];
  const rift = map === 'rift-coast';
  const surfacePixelSize = rift ? RIFT_SURFACE_PIXEL_SIZE : SURFACE_PIXEL_SIZE;
  const { land, shore, lips } = campaignLandPaths(terrain, camera);
  const { width, height, zoom } = camera;
  const water = ctx.createLinearGradient(0, 0, width, height);
  water.addColorStop(0, surface); water.addColorStop(1, deep);
  ctx.fillStyle = water; ctx.fillRect(0, 0, width, height);

  for (const onLand of [false, true]) {
    ctx.save();
    if (onLand) {
      ctx.clip(land);
      ctx.fillStyle = dry; ctx.fillRect(0, 0, width, height);
    } else {
      const sea = new Path2D();
      sea.rect(0, 0, width, height); sea.addPath(land);
      ctx.clip(sea, 'evenodd');
    }
    const source = art?.headland;
    const paint = source && ctx.createPattern(surfaceTile(source, onLand ? dry : surface, onLand ? 'land' : 'sea'), 'repeat');
    if (paint) {
      const size = surfacePixelSize * zoom;
      paint.setTransform(new DOMMatrix([size, 0, 0, size, camera.x + 113 * zoom, camera.y + 193 * zoom]));
      ctx.fillStyle = paint;
      ctx.globalAlpha = rift ? .58 : (onLand ? .90 : .78);
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    if (onLand) {
      const detail = source && ctx.createPattern(surfaceTile(source, dry, 'land-detail'), 'repeat');
      if (detail) {
        // A second crop at a different period prevents mirrored tufts from
        // forming straight bands, especially where the coast runs diagonally.
        const detailSize = surfacePixelSize * zoom * 1.27;
        detail.setTransform(new DOMMatrix([detailSize, 0, 0, detailSize, camera.x - 287 * zoom, camera.y + 331 * zoom]));
        ctx.fillStyle = detail;
        ctx.globalAlpha = rift ? .22 : .39;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = grain; ctx.globalAlpha = .36; ctx.lineWidth = 43 * zoom;
      ctx.stroke(shore); ctx.globalAlpha = 1;
      paintRoute(ctx, terrain, camera, spawnRadius, dry, shadow, edge);
    } else {
      // The cliff and reflected crest extend into water without moving the walkable lip.
      for (const [offset, lineWidth, color] of [[10, 37, deep + 'cc'], [13, 28, edge + '40'], [7, 17, shadow]] as const) {
        ctx.save();
        ctx.translate(0, offset * zoom);
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, lineWidth * zoom);
        ctx.stroke(shore);
        ctx.restore();
      }
      paintSurf(ctx, lips, camera, haze);
    }
    // Fixed world-space grain; skip subpixel details and bound work when zoomed out.
    const stride = Math.max(22, Math.ceil(12 / zoom / 22) * 22);
    const from = screenToWorld(camera, -32, -32), to = screenToWorld(camera, width + 32, height + 32);
    const texture = new Path2D(), facets = new Path2D();
    for (let row = Math.floor(from.y / stride); row * stride < to.y; row++) {
      for (let col = Math.floor(from.x / stride); col * stride < to.x; col++) {
        const hash = (Math.imul(row, 92837111) ^ Math.imul(col, 689287499)) >>> 0;
        if (hash % 5 < 3) continue;
        const p = worldToScreen(camera, (col + (hash % 11) / 11) * stride, (row + (hash % 13) / 13) * stride);
        const length = (onLand ? 4 : 12) + hash % 17;
        const pixel = Math.max(1, zoom * 2);
        texture.rect(p.x, p.y, length * zoom, pixel);
        if (hash % 7 < 2) {
          texture.rect(p.x - 4 * zoom, p.y + pixel, length * zoom * .65, pixel);
          texture.rect(p.x + 7 * zoom, p.y - pixel, length * zoom * .45, pixel);
        }
        if (hash % 17 < 3) {
          const dx = stride * zoom, dy = dx * camera.projectionY;
          polygon(facets, [[p.x-dx,p.y], [p.x-dx*.6,p.y-dy*.36], [p.x+dx*.34,p.y-dy*.43],
            [p.x+dx,p.y-dy*.1], [p.x+dx*.2,p.y+dy*.2], [p.x-dx*.5,p.y+dy*.12]]);
        }
      }
    }
    ctx.fillStyle = onLand ? shadow : deep;
    ctx.globalAlpha = rift ? .20 : .30; ctx.fill(facets);
    ctx.fillStyle = onLand ? grain : surface;
    ctx.globalAlpha = paint ? (rift ? .18 : .27) : .7; ctx.fill(texture); ctx.globalAlpha = 1;
    if (onLand === (motif !== 'wreck' && motif !== 'rift')) {
      for (const [x, y, size] of landmarks) {
        const p = worldToScreen(camera, x, y), scale = size * zoom;
        const sprite = motif === 'ruin' ? art?.arch : motif === 'basalt' || motif === 'shale' || motif === 'dune' ? art?.rock : undefined;
        if (sprite) {
          const wide = scale * (motif === 'ruin' ? 1.72 : 1.6);
          const high = wide * sprite.naturalHeight / sprite.naturalWidth;
          ctx.filter = motif === 'dune' ? 'sepia(.73) saturate(.65)' : motif === 'basalt' ? 'grayscale(.8) sepia(.28)' : 'none';
          ctx.drawImage(sprite, Math.round(p.x - wide / 2), Math.round(p.y - high * .74), Math.round(wide), Math.round(high));
          ctx.filter = 'none';
        } else {
          ctx.beginPath();
          for (const shape of LANDMARKS[motif]) {
            polygon(ctx, shape.map(([px, py]) => [p.x + px * scale, p.y + py * scale]));
          }
          ctx.fillStyle = onLand ? shadow : deep; ctx.fill();
          ctx.strokeStyle = onLand ? grain : surface; ctx.lineWidth = Math.max(1, zoom * 2); ctx.stroke();
          ctx.fillStyle = (onLand ? edge : haze) + '90';
          const pixel = Math.max(1, Math.round(zoom * 2));
          for (let index = 0; index < 5; index++) {
            ctx.fillRect(Math.round(p.x + (index - 2) * scale * .18), Math.round(p.y + (index % 3 - 1) * scale * .09),
              pixel * (index % 2 + 1), pixel);
          }
        }
      }
    }
    ctx.restore();
  }

  ctx.strokeStyle = shadow; ctx.lineWidth = Math.max(2, zoom * 5); ctx.stroke(shore);
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, zoom * 2); ctx.stroke(shore);
}

export function paintCampaignGround(ctx: CanvasRenderingContext2D, camera: WorldCamera, terrain: Terrain,
    map: CampaignMap, spawnRadius: number, atmosphereSeconds = 0, art?: GroundArt | null): void {
  const { width, height, x, y, zoom } = camera;
  // Preserve a finer shoreline and texture on the chapter-seven pilot while
  // retaining the existing low-resolution cached frame for the other maps.
  const surfacePixelSize = map === 'rift-coast' ? RIFT_SURFACE_PIXEL_SIZE : SURFACE_PIXEL_SIZE;
  const factor = Math.min(1, 1 / (surfacePixelSize * zoom));
  const key = [map, width, height, x, y, zoom, spawnRadius].join('/');
  let cached = groundFrames.get(terrain);
  if (!cached || cached.key !== key || cached.source !== art?.headland) {
    const frame = cached?.frame ?? ctx.canvas.ownerDocument.createElement('canvas');
    frame.width = Math.ceil(width * factor);
    frame.height = Math.ceil(height * factor);
    const ground = frame.getContext('2d')!;
    ground.imageSmoothingEnabled = false;
    drawGround(ground, { ...camera, width: frame.width, height: frame.height, x: x * factor, y: y * factor, zoom: zoom * factor },
      terrain, map, spawnRadius, art);
    cached = { key, source: art?.headland, frame };
    groundFrames.set(terrain, cached);
  }
  ctx.drawImage(cached.frame, 0, 0, cached.frame.width / factor, cached.frame.height / factor);

  const { palette: [,,,,,, haze] } = CHAPTER_SCENERY[map];
  const motion = ctx.canvas.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const max = Math.max(width, height);
  const shift = motion ? 0 : Math.sin(atmosphereSeconds * .28) * width * .04;
  const fog = ctx.createRadialGradient(width * .48 + shift, height * .52, max * .19, width * .48 + shift, height * .52, max * .75);
  fog.addColorStop(0, haze + '00'); fog.addColorStop(1, haze + '39');
  ctx.fillStyle = fog; ctx.fillRect(0, 0, width, height);
}

export function lighthouseLantern(camera: WorldCamera, _map?: CampaignMap, dawn = false): { x: number; y: number } {
  const sprite = WATCH_BEACON;
  const scale = Math.min(sprite.width / sprite.frame.width, sprite.height / sprite.frame.height) * camera.zoom;
  // Aperture in source pixels, shared by the battle beam and the tower art.
  return {
    x: camera.x + ((dawn ? 42 : 41) - sprite.frame.width * sprite.anchorX) * scale,
    y: camera.y + ((dawn ? 25 : 27) - sprite.frame.height * sprite.anchorY) * scale,
  };
}

export function paintLanternGlow(ctx: CanvasRenderingContext2D, camera: WorldCamera, dawn = false): void {
  const light = lighthouseLantern(camera, undefined, dawn);
  const scale = camera.zoom * WATCH_BEACON.width / WATCH_BEACON.frame.width;
  const radius = Math.max(15, 33 * scale);
  ctx.save();
  ctx.translate(light.x, light.y);
  ctx.scale(1, .75);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  glow.addColorStop(0, '#ffca6c65');
  glow.addColorStop(.38, '#ffca6c36');
  glow.addColorStop(.7, '#ffca6c10');
  glow.addColorStop(1, '#ffca6c00');
  ctx.fillStyle = glow;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

type Addition = readonly [x: number, y: number, width: number, bottom: number];
const TOWER_ADDITIONS: Record<LighthouseStage, readonly Addition[]> = {
  1: [],
  2: [[11, 78, 15, 108], [54, 78, 15, 108]],
  3: [[14, 53, 12, 102], [54, 53, 12, 103]],
  4: [[10, 70, 17, 108], [54, 64, 17, 108]],
  5: [[11, 50, 16, 106], [56, 67, 14, 105]],
  6: [[10, 47, 13, 105], [57, 47, 13, 105]],
  7: [[7, 29, 13, 106], [61, 25, 13, 106]],
};
const beaconTiles = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

function chapterBeacon(image: HTMLImageElement, stage: LighthouseStage, map: CampaignMap, dawn: boolean): CanvasImageSource {
  if (stage === 1 && !dawn) return image;
  let sprites = beaconTiles.get(image);
  if (!sprites) {
    sprites = new Map();
    beaconTiles.set(image, sprites);
  }
  const key = `${map}/${stage}/${dawn}`;
  const cached = sprites.get(key);
  if (cached) return cached;

  const { palette: [deep, , shadow, dry, grain, edge, haze] } = CHAPTER_SCENERY[map];
  const trim = dawn ? '#d59d68' : haze;
  const tile = image.ownerDocument.createElement('canvas');
  tile.width = WATCH_BEACON.frame.width;
  tile.height = WATCH_BEACON.frame.height;
  const ctx = tile.getContext('2d')!;
  for (const [x, y, wide, bottom] of TOWER_ADDITIONS[stage]) {
    ctx.fillStyle = deep;
    ctx.fillRect(x, y + 4, wide + 1, bottom - y - 4);
    ctx.fillStyle = dry;
    ctx.fillRect(x + 1, y + 5, wide - 2, bottom - y - 6);
    ctx.fillStyle = shadow;
    ctx.fillRect(x + wide - 5, y + 6, 4, bottom - y - 8);
    ctx.fillStyle = edge;
    ctx.fillRect(x + 1, y + 5, 2, bottom - y - 7);
    for (let row = y + 10; row < bottom - 3; row += 5) {
      ctx.fillStyle = grain;
      ctx.fillRect(x + 2, row, wide - 3, 1);
      ctx.fillStyle = shadow;
      ctx.fillRect(x + 3 + (row % 4), row, 1, 4);
    }
    ctx.fillStyle = edge;
    for (let row = 0; row < 5; row++) {
      ctx.fillRect(x + Math.max(0, 4 - row), y + row, wide - 2 * Math.max(0, 4 - row), 1);
    }
    ctx.fillStyle = trim;
    ctx.fillRect(x + 2, y + 4, wide - 4, 1);
    ctx.fillRect(x + Math.floor(wide / 2) - 1, y + 8, 2, stage >= 6 ? 11 : 5);
  }
  if (dawn) ctx.filter = 'sepia(.58) saturate(1.43) brightness(1.14)';
  ctx.drawImage(image, 0, 0);
  ctx.filter = 'none';
  if (stage >= 2) {
    for (const y of stage >= 5 ? [53, 66, 78] : [55, 76]) {
      ctx.fillStyle = shadow;
      ctx.fillRect(24, y + 1, 5, 2);
      ctx.fillRect(50, y + 1, 6, 2);
      ctx.fillStyle = trim;
      ctx.fillRect(25, y, 4, 1);
      ctx.fillRect(50, y, 5, 1);
    }
  }
  if (dawn) {
    ctx.fillStyle = '#85513e';
    ctx.fillRect(35, 22, 14, 10);
    ctx.fillStyle = '#eaa354';
    ctx.fillRect(36, 23, 13, 7);
    ctx.fillStyle = '#ffdc8f';
    ctx.fillRect(37, 23, 10, 5);
    ctx.fillStyle = '#fff1bf';
    ctx.fillRect(40, 24, 5, 3);
  }
  sprites.set(key, tile);
  return tile;
}

const TOWER_PROFILES: Record<LighthouseStage, readonly Vertex[]> = {
  1: [[-23,50],[-17,39],[-13,2],[-9,-105],[9,-105],[13,2],[17,39],[23,50]],
  2: [[-29,50],[-29,37],[-21,37],[-17,-66],[-21,-66],[-21,-77],[-13,-77],[-11,-107],[11,-107],[13,-77],[21,-77],[21,-66],[17,-66],[21,37],[29,37],[29,50]],
  3: [[-24,50],[-20,36],[-16,-69],[-25,-82],[-25,-94],[-15,-94],[-15,-108],[15,-108],[15,-94],[25,-94],[25,-82],[16,-69],[20,36],[24,50]],
  4: [[-28,50],[-17,30],[-13,-49],[-20,-61],[-12,-67],[-11,-106],[11,-106],[12,-67],[20,-61],[13,-49],[17,30],[28,50]],
  5: [[-34,50],[-34,-18],[-29,-18],[-29,-26],[-23,-26],[-23,-18],[-18,-18],[-14,-107],[14,-107],[18,-18],[23,-18],[23,-26],[29,-26],[29,-18],[34,-18],[34,50]],
  6: [[-31,50],[-22,35],[-18,-21],[-25,-59],[-20,-77],[-15,-53],[-12,-105],[12,-105],[15,-53],[20,-77],[25,-59],[18,-21],[22,35],[31,50]],
  7: [[-34,50],[-30,3],[-23,-13],[-27,-67],[-32,-99],[-26,-106],[-21,-96],[-16,-61],[-12,-108],
    [12,-108],[16,-61],[21,-96],[26,-106],[32,-99],[27,-67],[23,-13],[30,3],[34,50]],
};

export function paintCampaignLighthouse(ctx: CanvasRenderingContext2D, camera: WorldCamera, stage: LighthouseStage,
    map: CampaignMap, dawn: boolean, image?: HTMLImageElement): void {
  const lantern = lighthouseLantern(camera, map, dawn);
  if (image) {
    const { width, height, anchorX, anchorY } = WATCH_BEACON;
    const w = width * camera.zoom, h = height * camera.zoom;
    ctx.drawImage(chapterBeacon(image, stage, map, dawn), camera.x - w * anchorX, camera.y - h * anchorY, w, h);
    return;
  }
  const { palette: [deep, , shadow, dry, grain, edge] } = CHAPTER_SCENERY[map];
  const trim = dawn ? '#d59d68' : stage >= 6 ? '#b5a8c4' : edge;
  const glass = dawn ? '#ffe4b4' : '#ffd99b';
  ctx.save();
  ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
  const lampX = (lantern.x - camera.x) / camera.zoom, lampY = (lantern.y - camera.y) / camera.zoom;
  ctx.fillStyle = deep;
  ctx.beginPath(); ctx.ellipse(0, 3, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  polygon(ctx, TOWER_PROFILES[stage].map(([x, y]) => [x, y - 48]));
  ctx.fillStyle = shadow; ctx.fill(); ctx.strokeStyle = deep; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = grain;
  ctx.beginPath(); polygon(ctx, [[-36,-160],[3,-160],[7,-12],[17,5],[-36,5]]); ctx.fill();
  ctx.fillStyle = dry;
  for (let y = -94; y < -4; y += 14) {
    ctx.fillRect(-35, y, 70, 2);
    ctx.fillRect(y % 3 * 3, y, 2, 14);
  }
  ctx.fillStyle = trim;
  const inlays = stage >= 4 ? [-86, -58, -30] : [-63];
  for (const y of inlays) {
    ctx.beginPath(); polygon(ctx, [[0,y-6],[3,y],[0,y+6],[-3,y]]); ctx.fill();
  }
  if (stage >= 5) {
    ctx.fillRect(-25, -22, 3, 14); ctx.fillRect(22, -22, 3, 14);
  }
  ctx.restore();

  ctx.translate(lampX, lampY);
  ctx.fillStyle = deep; ctx.fillRect(-20, -17, 40, 36);
  ctx.fillStyle = trim; ctx.fillRect(-19, 13, 38, 4);
  ctx.fillStyle = glass; ctx.fillRect(-12, -8, 24, 16);
  ctx.fillStyle = trim; ctx.fillRect(-3, -8, 2, 16); ctx.fillRect(7, -8, 2, 16);
  ctx.beginPath();
  polygon(ctx, [[-23,-13],[-19,-22],[-9,-25],[0,-(stage >= 6 ? 45 : 37)],[9,-25],[19,-22],[23,-13]]);
  ctx.fillStyle = shadow; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.stroke();
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 53);
  glow.addColorStop(0, glass + '4d'); glow.addColorStop(1, glass + '00');
  ctx.fillStyle = glow; ctx.fillRect(-53, -53, 106, 106);
  ctx.restore();
}
