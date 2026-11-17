import type { BattleState, EnemyKind, EnemyState, NightConfig } from '../../contracts';
import { worldToScreen } from '../shared/world/worldGeometry';
import { lighthouseLantern } from './battleBeam';
import type { WorldCamera } from '../shared/world/worldTypes';

export interface BattleArtwork { atlas: HTMLImageElement }
const FRAMES: Record<EnemyKind, { x: number; y: number; width: number; height: number }> = {
  ghost: { x: 111, y: 117, width: 407, height: 440 },
  minotaur: { x: 717, y: 88, width: 479, height: 476 },
  turtle: { x: 33, y: 767, width: 577, height: 388 },
  bat: { x: 670, y: 783, width: 546, height: 278 },
};
let artworkPromise: Promise<BattleArtwork> | undefined;

export async function loadBattleArtwork(): Promise<BattleArtwork> {
  artworkPromise ??= new Promise<BattleArtwork>((resolve, reject) => {
    const atlas = new Image();
    atlas.onload = () => resolve({ atlas });
    atlas.onerror = () => { artworkPromise = undefined; reject(new Error('Не удалось загрузить спрайты существ')); };
    atlas.src = `${import.meta.env.BASE_URL}images/battle/enemies.png`;
  });
  return artworkPromise;
}

// Width and height describe the visible, tightly cropped asset in world units.
const sizes: Record<EnemyKind, { width: number; height: number }> = {
  ghost: { width: 45, height: 60 }, turtle: { width: 65, height: 44 },
  minotaur: { width: 55, height: 65 }, bat: { width: 65, height: 38 },
};
export function battleEnemyBounds(enemy: EnemyState, _config: NightConfig, camera: WorldCamera): { x: number; y: number; width: number; height: number } {
  const size = sizes[enemy.kind];
  const frame = FRAMES[enemy.kind];
  const sourceScale = Math.min(size.width / frame.width, size.height / frame.height);
  const minPixels = enemy.kind === 'turtle' ? 40 : enemy.kind === 'minotaur' ? 38 : 32;
  const scale = Math.max(camera.zoom, minPixels / Math.max(frame.width * sourceScale, frame.height * sourceScale)) * sourceScale;
  const width = frame.width * scale, height = frame.height * scale;
  const point = worldToScreen(camera, enemy.x, enemy.y);
  return { x: point.x - width / 2, y: point.y - height * .8, width, height };
}
export function paintBattleEnemy(ctx: CanvasRenderingContext2D, art: BattleArtwork, enemy: EnemyState, config: NightConfig, battle: Readonly<BattleState>, camera: WorldCamera): void {
  const bounds = battleEnemyBounds(enemy, config, camera);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const frame = FRAMES[enemy.kind];
  if (battle.litEnemyIds.includes(enemy.id)) { ctx.shadowColor = '#ffd48a'; ctx.shadowBlur = 5; }
  if (enemy.x > 0) { ctx.translate(bounds.x * 2 + bounds.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(art.atlas, frame.x, frame.y, frame.width, frame.height, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

/** Painted on the world background before beam, creatures and indicators. */
export function paintBattleNight(ctx: CanvasRenderingContext2D, camera: WorldCamera, _config: NightConfig, _battle: Readonly<BattleState>): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 22, 44, .27)';
  ctx.fillRect(0, 0, camera.width, camera.height);
  const fog = ctx.createRadialGradient(camera.width / 2, camera.height / 2, Math.min(camera.width, camera.height) * .2, camera.width / 2, camera.height / 2, Math.max(camera.width, camera.height) * .7);
  fog.addColorStop(0, 'rgba(35, 78, 99, 0)');
  fog.addColorStop(1, 'rgba(69, 115, 133, .22)');
  ctx.fillStyle = fog; ctx.fillRect(0, 0, camera.width, camera.height);
  const light = lighthouseLantern(camera), lanternY = light.y;
  const radius = Math.max(24, 95 * camera.zoom);
  const glow = ctx.createRadialGradient(light.x, lanternY, 0, light.x, lanternY, radius);
  glow.addColorStop(0, 'rgba(255, 190, 70, .28)'); glow.addColorStop(1, 'rgba(255, 190, 70, 0)');
  ctx.fillStyle = glow; ctx.fillRect(light.x - radius, lanternY - radius, radius * 2, radius * 2);
  ctx.restore();
}
