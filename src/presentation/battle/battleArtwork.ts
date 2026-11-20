import type { BattleState, BossId, EnemyState, NightConfig, PrototypeEnemyKind } from '../../contracts';
import type { CampaignEnemyKind } from '../../content/campaignEnemies';
import { HEADLAND_WORLD_PER_PIXEL, worldToScreen } from '../shared/world/worldGeometry';
import type { WorldCamera } from '../shared/world/worldTypes';

export interface BattleArtwork { creatures: Record<PrototypeEnemyKind, HTMLImageElement> }
export interface CampaignBattleArtwork { enemies: HTMLImageElement; bosses: HTMLImageElement; wardenCore: HTMLImageElement; wardenTentacle: HTMLImageElement }
const FRAMES = {
  ghost: { x: 2, y: 2, width: 28, height: 31, file: 'avalon-watch/world/ghost.png' },
  minotaur: { x: 717, y: 88, width: 479, height: 476, file: 'battle/enemies.png' },
  turtle: { x: 2, y: 2, width: 45, height: 29, file: 'avalon-watch/world/armored-turtle.png' },
  bat: { x: 2, y: 2, width: 40, height: 24, file: 'avalon-watch/world/bat.png' },
} satisfies Record<PrototypeEnemyKind, { x: number; y: number; width: number; height: number; file: string }>;
let artworkPromise: Promise<BattleArtwork> | undefined;
let campaignArtworkPromise: Promise<CampaignBattleArtwork> | undefined;

function loadImage(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить ${file}`));
    image.src = `${import.meta.env.BASE_URL}images/${file}`;
  });
}

export function loadCampaignBattleArtwork(): Promise<CampaignBattleArtwork> {
  campaignArtworkPromise ??= Promise.all([
    loadImage('campaign/enemies.webp'), loadImage('campaign/bosses.webp'),
    loadImage('avalon-watch/world/warden-core.png'), loadImage('avalon-watch/world/warden-tentacle.png'),
  ])
    .then(([enemies, bosses, wardenCore, wardenTentacle]) => ({ enemies, bosses, wardenCore, wardenTentacle }))
    .catch(error => { campaignArtworkPromise = undefined; throw error; });
  return campaignArtworkPromise;
}

export async function loadBattleArtwork(): Promise<BattleArtwork> {
  artworkPromise ??= Promise.all([
    loadImage(FRAMES.ghost.file), loadImage(FRAMES.minotaur.file),
    loadImage(FRAMES.turtle.file), loadImage(FRAMES.bat.file),
  ]).then(([ghost, minotaur, turtle, bat]) => ({ creatures: { ghost, minotaur, turtle, bat } }))
    .catch(error => { artworkPromise = undefined; throw error; });
  return artworkPromise;
}

const campaignGlyphs: Record<CampaignEnemyKind, readonly [string, string, 'wing' | 'shield' | 'ring' | 'spike']> = {
  shieldbearer: ['#81b2b9', '━', 'shield'], scavenger: ['#d1ad78', '›', 'spike'], ray: ['#88cce0', '◆', 'wing'],
  witch: ['#a4d5a6', '+', 'ring'], rootweaver: ['#a6bd68', '╳', 'spike'], brood: ['#d9ba82', '⁙', 'ring'],
  'siege-beast': ['#e8a38e', '⊕', 'shield'], golem: ['#aba09a', '▦', 'shield'], carrier: ['#c4af86', '▲', 'shield'],
  siren: ['#c8b6ef', '≈', 'wing'], boarder: ['#b7c4ad', '↑', 'spike'], bomber: ['#f2aa7f', '✦', 'wing'],
  'mirror-knight': ['#c2d0f4', '◇', 'shield'], snuffer: ['#c7addc', '⊘', 'spike'],
};
const campaignEnemySlots: Record<CampaignEnemyKind, number> = {
  shieldbearer: 0, scavenger: 1, ray: 2, witch: 3, rootweaver: 4, brood: 5,
  'siege-beast': 6, golem: 7, carrier: 8, siren: 9, boarder: 10, bomber: 11,
  'mirror-knight': 12, snuffer: 13,
};
// Visible bounds of the existing 160×160 atlas cells. Keep their screen-space
// body rectangles for picking and indicators while drawing less transparent padding.
const riftEnemyArtwork = {
  'mirror-knight': { sourceX: 6, sourceY: 5, sourceWidth: 147, sourceHeight: 150, filter: 'brightness(1.28)' },
  snuffer: { sourceX: 8, sourceY: 5, sourceWidth: 143, sourceHeight: 150, filter: 'brightness(1.38)' },
} as const;
const bossSlots: Partial<Record<BossId, number>> = {
  'drowned-captain': 0, 'marsh-heart': 1, 'ash-colossus': 2,
  'evening-knell': 3, 'fallen-keeper': 4, 'fog-heart': 5,
};

function paintTile(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, slot: number,
    x: number, y: number, width: number, height: number): void {
  const tile = 160;
  ctx.drawImage(atlas, slot % 4 * tile, Math.floor(slot / 4) * tile, tile, tile, x, y, width, height);
}

export function paintCampaignBossSprite(ctx: CanvasRenderingContext2D, art: CampaignBattleArtwork, bossId: BossId,
    partId: string, x: number, y: number, radius: number, lit: boolean): boolean {
  const core = bossSlots[bossId];
  if (core === undefined) return false;
  const body = partId === 'core';
  const slot = body ? core : partId.includes('root') ? 1 : partId.includes('gun') || partId === 'cannon' ? 6
    : partId === 'signal' || partId === 'standard' ? 0 : partId === 'furnace' ? 2 : partId === 'rift' ? 5 : 7;
  const size = Math.max(31, radius * (body ? 3.05 : 2.5));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = lit ? '#ffcb82' : '#361e5b';
  ctx.shadowBlur = lit ? 6 : 3;
  paintTile(ctx, art.bosses, slot, x - size / 2, y - size * .66, size, size);
  ctx.restore();
  return true;
}

export function wardenSpriteSize(zoom: number, tip: boolean): number {
  return Math.max(tip ? 34 : 45, 56 * HEADLAND_WORLD_PER_PIXEL * zoom);
}

export function wardenSpriteBounds(x: number, y: number, zoom: number, tip: boolean) {
  const size = wardenSpriteSize(zoom, tip);
  return { x: Math.round(x - size / 2), y: Math.round(y - size * 51 / 56), width: Math.round(size), height: Math.round(size) };
}

export function paintWardenPiece(ctx: CanvasRenderingContext2D, art: CampaignBattleArtwork, tip: boolean,
    x: number, y: number, zoom: number, lit = false): void {
  const bounds = wardenSpriteBounds(x, y, zoom, tip);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (lit) {
    ctx.filter = 'sepia(.38) saturate(1.35) brightness(1.28)';
    ctx.shadowColor = '#ffcb82';
    ctx.shadowBlur = 7;
  }
  ctx.drawImage(tip ? art.wardenTentacle : art.wardenCore, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

export function battleEnemyBounds(enemy: EnemyState, config: NightConfig, camera: WorldCamera): { x: number; y: number; width: number; height: number } {
  const frame = isPrototypeArtwork(enemy.kind) ? FRAMES[enemy.kind] : undefined;
  const point = worldToScreen(camera, enemy.x, enemy.y);
  if (!frame) {
    const radius = Math.max(12, config.enemies[enemy.kind].radius * camera.zoom);
    return { x: point.x - radius * 1.35, y: point.y - radius * 1.55, width: radius * 2.7, height: radius * 2.35 };
  }
  const minotaur = enemy.kind === 'minotaur';
  const scale = minotaur ? Math.max(55 * camera.zoom, 38) / frame.width : Math.max(.71, camera.zoom * HEADLAND_WORLD_PER_PIXEL);
  const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
  const foot = minotaur ? height * .8 : height + scale * 2;
  return { x: Math.round(point.x - width / 2), y: Math.round(point.y - foot), width, height };
}

export function isPrototypeArtwork(kind: EnemyState['kind']): kind is PrototypeEnemyKind {
  return kind in FRAMES;
}

export function paintCampaignEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyState, config: NightConfig, battle: Readonly<BattleState>, camera: WorldCamera,
    art?: CampaignBattleArtwork | null): void {
  if (isPrototypeArtwork(enemy.kind)) return;
  const { x, y, width, height } = battleEnemyBounds(enemy, config, camera);
  if (art) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (battle.litEnemyIds.includes(enemy.id)) { ctx.shadowColor = '#ffd48a'; ctx.shadowBlur = 5; }
    if (enemy.x < 0) { ctx.translate(x * 2 + width, 0); ctx.scale(-1, 1); }
    const slot = campaignEnemySlots[enemy.kind];
    if (config.campaignMapId === 'rift-coast' && (enemy.kind === 'mirror-knight' || enemy.kind === 'snuffer')) {
      const frame = riftEnemyArtwork[enemy.kind];
      ctx.filter = frame.filter;
      ctx.drawImage(art.enemies, slot % 4 * 160 + frame.sourceX, Math.floor(slot / 4) * 160 + frame.sourceY,
        frame.sourceWidth, frame.sourceHeight, x, y, width, height);
    } else {
      paintTile(ctx, art.enemies, slot, x, y, width, height);
    }
    ctx.restore();
    return;
  }
  const [color, symbol, silhouette] = campaignGlyphs[enemy.kind];
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(width / 2, height / 2);
  ctx.beginPath();
  if (silhouette === 'ring') ctx.ellipse(0, 0, .78, .88, 0, 0, Math.PI * 2);
  else {
    const points = silhouette === 'wing' ? [[-.98, -.38], [0, -.64], [.98, -.38], [.6, .4], [0, .84], [-.6, .4]]
      : silhouette === 'shield' ? [[-.76, -.85], [.76, -.85], [.79, .23], [0, .92], [-.79, .23]]
      : [[0, -.98], [.78, -.16], [.5, .83], [-.5, .83], [-.78, -.16]];
    for (const [index, [px, py]] of points.entries()) {
      if (index === 0) ctx.moveTo(px!, py!);
      else ctx.lineTo(px!, py!);
    }
    ctx.closePath();
  }
  ctx.fillStyle = battle.litEnemyIds.includes(enemy.id) ? '#ffe0a0' : color;
  ctx.fill();
  ctx.strokeStyle = '#122736'; ctx.lineWidth = .13; ctx.stroke();
  ctx.scale(2 / width, 2 / height);
  ctx.fillStyle = '#14303a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(height * .64)}px system-ui`;
  ctx.fillText(symbol, 0, 0);
  ctx.restore();
}

export function paintBattleEnemy(ctx: CanvasRenderingContext2D, art: BattleArtwork, enemy: EnemyState, config: NightConfig, battle: Readonly<BattleState>, camera: WorldCamera): void {
  if (!isPrototypeArtwork(enemy.kind)) { paintCampaignEnemy(ctx, enemy, config, battle, camera); return; }
  const frame = FRAMES[enemy.kind], image = art.creatures[enemy.kind];
  const bounds = battleEnemyBounds(enemy, config, camera);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (enemy.x > 0) { ctx.translate(bounds.x * 2 + bounds.width, 0); ctx.scale(-1, 1); }
  const sprite = (dx: number, dy: number) =>
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, bounds.x + dx, bounds.y + dy, bounds.width, bounds.height);
  if (battle.litEnemyIds.includes(enemy.id)) {
    ctx.filter = 'brightness(0) invert(91%) sepia(43%) saturate(624%) hue-rotate(331deg)';
    ctx.shadowColor = '#ffbc61'; ctx.shadowBlur = 5;
    const rim = Math.max(1, Math.round(camera.zoom * HEADLAND_WORLD_PER_PIXEL));
    sprite(-rim, 0); sprite(rim, 0); sprite(0, -rim); sprite(0, rim);
    ctx.shadowBlur = 0;
    ctx.filter = 'sepia(.46) saturate(1.25) brightness(1.27)';
  }
  sprite(0, 0);
  ctx.restore();
}

/** Painted on terrain before the lantern, devices and creatures. */
export function paintBattleNight(ctx: CanvasRenderingContext2D, camera: WorldCamera): void {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 22, 49, .37)';
  ctx.fillRect(0, 0, camera.width, camera.height);
  const fog = ctx.createRadialGradient(camera.width / 2, camera.height / 2, Math.min(camera.width, camera.height) * .2, camera.width / 2, camera.height / 2, Math.max(camera.width, camera.height) * .7);
  fog.addColorStop(0, 'rgba(35, 78, 99, 0)');
  fog.addColorStop(1, 'rgba(69, 115, 133, .10)');
  ctx.fillStyle = fog; ctx.fillRect(0, 0, camera.width, camera.height);
  ctx.restore();
}
