import type { DeviceKind, DeviceVariantId } from '../../../contracts';
import { CHAPTER_TERRAIN, isLandCircle, shoreAtY, type Terrain } from '../../../content/terrain';
import { deviceArea, deviceSprite, HEADLAND_WORLD_PER_PIXEL, spriteBounds, WATCH_BEACON, WATCH_DEVICE_SPRITES, WORLD_PROJECTION_Y, worldToScreen } from './worldGeometry';
import type { SpriteSpec } from './worldGeometry';
import type { ChapterWorldAssets, WorldCamera, WorldDevice, WorldPaintOptions } from './worldTypes';

import { paintCampaignGround, paintCampaignLighthouse, paintLanternGlow } from './chapterPaint';
import { CHAPTER_SCENERY, type CampaignPresentationConfig } from './chapterScenery';

const worldImages = new Map<string, Promise<HTMLImageElement>>();
const headlandLayers = new WeakMap<HTMLImageElement, WeakMap<Terrain, HTMLCanvasElement>>();
const HEADLAND_ORIGIN = { x: 497, y: 447 };

function loadWorldImage(name: string, folder = 'world'): Promise<HTMLImageElement> {
  const key = `${folder}/${name}`;
  const cached = worldImages.get(key);
  if (cached) return cached;
  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить изображение мира: ${name}`));
    image.src = `${import.meta.env.BASE_URL}images/avalon-watch/${key}.png`;
  }).catch(error => { worldImages.delete(key); throw error; });
  worldImages.set(key, imagePromise);
  return imagePromise;
}

export async function loadChapterWorldAssets(_campaign = false): Promise<ChapterWorldAssets> {
  const fallback = (name: string, folder?: string) => loadWorldImage(name, folder).catch(() => undefined);
  const [headland, lighthouse, rock, arch, devices, variants] = await Promise.all([
    fallback('headland'), fallback('beacon'), fallback('tidal-rock'), fallback('ruined-arch'),
    Promise.all((Object.keys(WATCH_DEVICE_SPRITES) as DeviceKind[]).map(async kind =>
      [kind, await fallback(WATCH_DEVICE_SPRITES[kind].image)] as const)),
    Promise.all((Object.keys(VARIANT_FRAMES) as DeviceVariantId[]).map(async id =>
      [id, await fallback(id, 'navigation')] as const)),
  ]);
  return { headland, lighthouse, rock, arch, devices: Object.fromEntries(devices), variants: Object.fromEntries(variants) };
}

const VARIANT_FRAMES: Record<DeviceVariantId, SpriteSpec['frame']> = {
  'siege-cannon': { x: 8, y: 5, width: 49, height: 40 },
  'long-harpoon': { x: 10, y: 3, width: 50, height: 40 },
};

function sourceShore(y: number): number {
  return Math.round(507 + 22 * Math.sin((y - 380) / 72) + 13 * Math.sin((y - 400) / 37)
    + 8 * Math.sin(y / 19) + 4 * Math.sin(y / 8));
}

/** The source lip is the one rasterized by the concept's world.py. The
 * destination lip comes from the same terrain as movement and placement. */
function headlandPlate(image: HTMLImageElement, terrain: Terrain): HTMLCanvasElement {
  let layers = headlandLayers.get(image);
  if (!layers) { layers = new WeakMap(); headlandLayers.set(image, layers); }
  const cached = layers.get(terrain);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < canvas.height; y++) {
    const row = y - y % 6;
    const a = sourceShore(row), b = sourceShore(row + 6);
    const source = Math.round(a + (b - a) * (y - row) / 6);
    const worldY = (y - HEADLAND_ORIGIN.y) * HEADLAND_WORLD_PER_PIXEL / WORLD_PROJECTION_Y;
    const destination = Math.max(1, Math.min(canvas.width - 1,
      Math.round(HEADLAND_ORIGIN.x + shoreAtY(terrain, worldY) / HEADLAND_WORLD_PER_PIXEL)));
    // Keep the arch, trails and offshore rocks in their original proportions.
    // Blend in the terrain correction on either side of a rigid coastal strip.
    const left = Math.max(0, Math.min(source, destination) - 138);
    const right = Math.min(canvas.width, Math.max(source, destination) + 148);
    const shift = destination - source;
    const start = Math.max(left + 1, source - 18), end = Math.min(right - 1, source + 41);
    const spans = [[0, left, 0, left], [left, start, left, start + shift], [start, end, start + shift, end + shift],
      [end, right, end + shift, right], [right, canvas.width, right, canvas.width]] as const;
    for (const [from, to, targetFrom, targetTo] of spans) {
      if (to > from && targetTo > targetFrom) ctx.drawImage(image, from, y, to - from, 1, targetFrom, y, targetTo - targetFrom, 1);
    }
  }
  layers.set(terrain, canvas);
  return canvas;
}
const GLYPHS:Record<DeviceKind,readonly string[]>={
 cannon:['......###','....###..','..###....','..##.....','.#####...','##...##..','##...##..','.#####...','#########'],
 barrier:['..#####..','.#######.','#########','##.###.##','#########','###.###.#','#########','#########','#########'],
 generator:['..#####..','.##...##.','##..#..##','#..###..#','#.#####.#','#..###..#','##..#..##','.##...##.','..#####..'],
 'light-trap':['....#....','...###...','..#.#.#..','.##.#.##.','#########','.##.#.##.','..#.#.#..','...###...','....#....'],
 harpoon:['....#....','...###...','..#####..','....#....','....#....','....#....','...###...','..#####..','.#######.'],
 mortar:['.........','...####..','..##..##.','..##..##.','...####..','...###...','..#####..','.#######.','#########'],
 bell:['...###...','..#...#..','..#...#..','.#.....#.','.#.....#.','#########','....#....','...###...','.........'],
 'repair-lamp':['...###...','..#####..','..#.#.#..','..#####..','...###...','....#....','..#####..','..#...#..','.#######.'],
};
const COLORS:Record<DeviceKind,string>={cannon:'#babbb5',barrier:'#9e9278',generator:'#82c9e6','light-trap':'#dfdc94',harpoon:'#94bcb9',mortar:'#afa59b',bell:'#e4bd76','repair-lamp':'#a7d9a0'};

function paintHeadland(ctx: CanvasRenderingContext2D, camera: WorldCamera, plate: HTMLCanvasElement): void {
  const scale = HEADLAND_WORLD_PER_PIXEL * camera.zoom;
  const left = camera.x - HEADLAND_ORIGIN.x * scale, top = camera.y - HEADLAND_ORIGIN.y * scale;
  const right = left + plate.width * scale, bottom = top + plate.height * scale;
  const paintRows = (from: number, rows: number, y: number, mirror = false) => {
    const height = rows * scale;
    ctx.save();
    ctx.translate(0, y + (mirror ? height : 0));
    if (mirror) ctx.scale(1, -1);
    ctx.drawImage(plate, 0, from, plate.width, rows, left, 0, right - left, height);
    for (const [edge, outside, east] of [[left, left, false], [right, camera.width - right, true]] as const) {
      if (outside <= 0) continue;
      // Continue the open surface using a strip that excludes the lip and pier.
      const sample = Math.min(192, Math.ceil(outside / scale));
      ctx.save();
      ctx.translate(edge, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(plate, east ? plate.width - sample : 0, from, sample, rows,
        east ? -outside : 0, 0, outside, height);
      ctx.restore();
    }
    ctx.restore();
  };
  paintRows(0, plate.height, top);
  if (top > 0) {
    const rows = Math.min(plate.height, Math.ceil(top / scale));
    paintRows(0, rows, top - rows * scale, true);
  }
  if (bottom < camera.height) {
    const rows = Math.min(plate.height, Math.ceil((camera.height - bottom) / scale));
    paintRows(plate.height - rows, rows, bottom, true);
  }
}

/** Shared backdrop and world objects, sorted by their ground contact point. */
export function paintChapterWorld(ctx: CanvasRenderingContext2D, assets: ChapterWorldAssets | null,
    config: CampaignPresentationConfig, camera: WorldCamera, options: WorldPaintOptions & { atmosphereSeconds?: number }): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#061c25';
  ctx.fillRect(0, 0, camera.width, camera.height);
  const map = config.campaignMapId ?? 'headland';
  const isRift = map === 'rift-coast';
  const terrain = config.terrain ?? CHAPTER_TERRAIN;
  if (map === 'headland' && !terrain.landRegions && assets?.headland) {
    paintHeadland(ctx, camera, headlandPlate(assets.headland, terrain));
  } else {
    ctx.save();
    paintCampaignGround(ctx, camera, terrain, map, config.spawnRadius, options.atmosphereSeconds, assets);
    ctx.restore();
  }

  const ellipse = (x: number, y: number, radius: number, color: string, dash: number[] = [], fill?: string) => {
    const p = worldToScreen(camera, x, y);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * camera.zoom, radius * camera.zoom * camera.projectionY, 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (options.showRanges) {
    const pixel = Math.max(.8, camera.zoom * HEADLAND_WORLD_PER_PIXEL);
    for (const [radius, color] of [[config.spawnRadius, '#7498a4'], [config.beam.range, '#c0a673']] as const) {
      ctx.fillStyle = color;
      for (let degrees = 0; degrees < 360; degrees += 5) {
        const angle = degrees * Math.PI / 180;
        const p = worldToScreen(camera, Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2 * pixel, pixel);
      }
    }
  }
  const selected = options.devices.find(device => device.id === options.selectedDeviceId);
  if (selected) {
    const area = deviceArea(config, selected);
    ellipse(area.x, area.y, area.radius, '#e6d795cc', [], '#dcd9a10c');
  }
  if (options.paintGround) {
    ctx.save();
    options.paintGround(ctx);
    ctx.restore();
  }

  const drawSprite = (image: HTMLImageElement, x: number, y: number, spec: SpriteSpec) => {
    const bounds = spriteBounds(x, y, spec), { frame } = spec, { zoom } = camera;
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height,
      camera.x + bounds.minX * zoom, camera.y + bounds.minY * zoom,
      (bounds.maxX - bounds.minX) * zoom, (bounds.maxY - bounds.minY) * zoom);
  };
  const drawContactShadow = (x: number, y: number, width: number) => {
    const pixel = Math.max(1, Math.round(camera.zoom * HEADLAND_WORLD_PER_PIXEL));
    const center = Math.round(x), top = Math.round(y);
    const color = CHAPTER_SCENERY['rift-coast'].palette[0];
    const span = Math.round(width);
    ctx.fillStyle = color + '52';
    ctx.fillRect(center - Math.round(span * .44), top - pixel, Math.round(span * .88), pixel * 3);
    ctx.fillRect(center - Math.round(span * .35), top + 2 * pixel, Math.round(span * .7), pixel);
    ctx.fillStyle = color + '85';
    ctx.fillRect(center - Math.round(span * .32), top, Math.round(span * .64), pixel * 2);
  };
  const bronze = config.campaignAppearance?.devices === 'bronze-devices';
  const drawDevice = (device: WorldDevice, preview = false) => {
    const { x, y, kind, variantId, health, maxHealth, consumed } = device;
    const { zoom } = camera, p = worldToScreen(camera, x, y);
    const { radius } = config.devices.definitions[kind];
    const valid = isLandCircle(config.terrain, device, radius);
    const spent = consumed || (health !== undefined && health <= 0);
    if (device.id === options.selectedDeviceId || !valid || preview) {
      ellipse(x, y, radius, valid ? '#e9dc9a' : '#fa8179', [], valid ? undefined : '#dc665a44');
    }
    const spec = deviceSprite(kind);
    const riftBody = isRift && (kind === 'cannon' || kind === 'barrier');
    ctx.save();
    if (riftBody) {
      drawContactShadow(p.x, p.y, spec.width * zoom);
    } else {
      ctx.fillStyle = '#0b2028aa';
      ctx.beginPath();
      ctx.ellipse(p.x + 2 * zoom, p.y + 2 * zoom, Math.max(7, radius * 1.32 * zoom), Math.max(2, radius * .36 * zoom), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (spent) ctx.globalAlpha *= .4;
    const variant = variantId ? assets?.variants[variantId] : undefined;
    const image = variant ?? assets?.devices[kind];
    if (image) {
      if (bronze) ctx.filter = 'sepia(.8) saturate(1.25)';
      else if (riftBody) ctx.filter = 'brightness(1.12)';
      drawSprite(image, x, y, variant && variantId ? { ...spec, frame: VARIANT_FRAMES[variantId] } : spec);
    } else {
      const step = 4 * zoom;
      ctx.fillStyle = '#07191dcc';
      ctx.fillRect(p.x - 21 * zoom, p.y - 38 * zoom, 42 * zoom, 40 * zoom);
      if (bronze) {
        ctx.fillStyle = '#cd9c68';
        ctx.fillRect(p.x - 17 * zoom, p.y - 2 * zoom, 34 * zoom, 2 * zoom);
      }
      ctx.fillStyle = COLORS[kind];
      GLYPHS[kind].forEach((line, row) => {
        for (let col = 0; col < line.length; col++) {
          if (line[col] === '#') ctx.fillRect(p.x + (col - 4.5) * step, p.y + (row - 9) * step, step, step);
        }
      });
    }
    ctx.restore();

    if (options.showRanges && !preview) {
      const scale = Math.max(.75, camera.zoom * HEADLAND_WORLD_PER_PIXEL);
      const halfWidth = spec.width * zoom / 2 + 2 * scale;
      ctx.fillStyle = valid ? '#e9ba77' : '#ff9c85';
      for (const direction of [-1, 1]) {
        const x = Math.round(p.x + direction * halfWidth), y = Math.round(p.y + 3 * scale);
        ctx.fillRect(x - (direction > 0 ? 5 * scale : 0), y, 5 * scale, scale);
        ctx.fillRect(x, y - 3 * scale, scale, 4 * scale);
      }
    }

    if (spent) {
      ctx.strokeStyle = consumed ? '#ddb36c' : '#f09888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y - 14);
      ctx.lineTo(p.x + 7, p.y);
      if (!consumed) {
        ctx.moveTo(p.x + 7, p.y - 14);
        ctx.lineTo(p.x - 7, p.y);
      }
      ctx.stroke();
    }
    if (options.showHealthBars !== false && !preview && health !== undefined && maxHealth && maxHealth > 0 && health < maxHealth) {
      const barY = p.y + 11 * zoom, width = 42 * zoom;
      ctx.fillStyle = '#091716';
      ctx.fillRect(p.x - width / 2 - 1, barY - 1, width + 2, 5);
      ctx.fillStyle = health / maxHealth < .35 ? '#e18975' : '#bad1a2';
      ctx.fillRect(p.x - width / 2, barY, width * Math.max(0, health / maxHealth), 3);
    }
  };

  const sorted: { y: number; draw: () => void }[] = [];
  if (options.drawLighthouse !== false) sorted.push({ y: 0, draw: () => {
    const stage = config.lighthouseStage ?? CHAPTER_SCENERY[map].stage;
    const dawn = config.campaignAppearance?.beacon === 'dawn-beacon';
    if (isRift && assets?.lighthouse) drawContactShadow(camera.x, camera.y + 8 * camera.zoom, WATCH_BEACON.width * camera.zoom);
    paintCampaignLighthouse(ctx, camera, stage, map, dawn, assets?.lighthouse);
  } });
  if (options.drawDevices !== false) {
    for (const device of options.devices) sorted.push({ y: device.y, draw: () => drawDevice(device) });
  }
  sorted.sort((left, right) => left.y - right.y);
  for (const item of sorted) item.draw();
  if (options.drawLighthouse !== false) paintLanternGlow(ctx, camera, config.campaignAppearance?.beacon === 'dawn-beacon');
  const preview = options.preview;
  if (preview) {
    const device = { id: -1, ...preview };
    const area = deviceArea(config, device);
    ellipse(area.x, area.y, area.radius, preview.valid ? '#c7dd9a99' : '#ef817999', [4, 4]);
    ctx.globalAlpha = .65;
    drawDevice(device, true);
    ctx.globalAlpha = 1;
    ellipse(preview.x, preview.y, config.devices.definitions[preview.kind].radius,
      preview.valid ? '#d4edab' : '#ff8d7f', [], preview.valid ? '#9cca7d22' : '#d5665c44');
    const point = worldToScreen(camera, preview.x, preview.y);
    const scale = Math.max(1, HEADLAND_WORLD_PER_PIXEL * camera.zoom);
    ctx.save();
    ctx.translate(Math.round(point.x), Math.round(point.y + 6 * scale));
    ctx.scale(scale, scale);
    ctx.lineWidth = 2;
    ctx.strokeStyle = preview.valid ? '#baf3bc' : '#ff9c85';
    ctx.beginPath();
    if (preview.valid) {
      ctx.moveTo(-5, 1); ctx.lineTo(-1, 5); ctx.lineTo(7, -3);
    } else {
      ctx.moveTo(-5, -3); ctx.lineTo(5, 5);
      ctx.moveTo(-5, 5); ctx.lineTo(5, -3);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
