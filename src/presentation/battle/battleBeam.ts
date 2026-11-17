import type { NightConfig } from '../../contracts';
import { worldToScreen, WORLD_SPRITES } from '../shared/world/worldGeometry';
import type { WorldCamera } from '../shared/world/worldTypes';

interface Point { x: number; y: number }
export const BEAM_LIGHT_STOPS = [[0, .4], [.1, 1], [.5, .85], [.8, .4], [1, 0]] as const;

export function lighthouseLantern(camera: WorldCamera): Point {
  const sprite = WORLD_SPRITES.lighthouse;
  const scale = Math.min(sprite.width / sprite.frame.width, sprite.height / sprite.frame.height) * camera.zoom;
  // Centre of the illuminated glass in lighthouse-main.png, in source pixels.
  return {
    x: camera.x + (512 - sprite.frame.x - sprite.frame.width * sprite.anchorX) * scale,
    y: camera.y + (440 - sprite.frame.y - sprite.frame.height * sprite.anchorY) * scale,
  };
}

/** Atmospheric light, not a hit-area outline. Both ends use the lantern's
 * height so looking north cannot flatten or invert the cone in projection. */
export function beamLightGeometry(camera: WorldCamera, beam: NightConfig['beam'], angle: number, origin = lighthouseLantern(camera)) {
  const length = beam.range * .95;
  const axis = { x: Math.cos(angle) * length * camera.zoom, y: Math.sin(angle) * length * camera.zoom * camera.projectionY };
  const normal = { x: -Math.sin(angle) * camera.zoom, y: Math.cos(angle) * camera.zoom * camera.projectionY };
  const end = { x: origin.x + axis.x, y: origin.y + axis.y };
  const nearWidth = 10, farWidth = nearWidth + Math.tan(beam.halfAngle) * length * 1.8;
  const offset = (point: Point, width: number): Point => ({ x: point.x + normal.x * width, y: point.y + normal.y * width });
  const bands = Array.from({ length: 20 }, (_, index) => {
    const inner = index / 20, outer = (index + 1) / 20;
    return {
      // Nested bands approximate a smooth cross-beam falloff without a blur
      // buffer or a hard outside stroke. The far end fades to zero as well.
      opacity: (Math.exp(-2 * inner * inner) - Math.exp(-2 * outer * outer)) * .85,
      points: [offset(origin, -nearWidth * outer), offset(end, -farWidth * outer), offset(end, farWidth * outer), offset(origin, nearWidth * outer)] as const,
    };
  });
  return { origin, end, bands };
}

/** Above the tower, below creatures and all indicators. No contour or end arc. */
export function paintBattleBeam(ctx: CanvasRenderingContext2D, camera: WorldCamera, config: NightConfig, angle: number): void {
  const { origin, end, bands } = beamLightGeometry(camera, config.beam, angle);
  ctx.save();
  for (const band of bands) {
    const light = ctx.createLinearGradient(origin.x, origin.y, end.x, end.y);
    for (const [position, strength] of BEAM_LIGHT_STOPS) light.addColorStop(position, `rgba(255, 211, 130, ${band.opacity * strength})`);
    ctx.beginPath();
    ctx.moveTo(band.points[0].x, band.points[0].y);
    for (const point of band.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
  }
  ctx.restore();
}

/** The aiming reference stays on the combat plane, behind world objects. */
export function paintBeamGuide(ctx: CanvasRenderingContext2D, camera: WorldCamera, config: NightConfig, angle: number): void {
  const origin = worldToScreen(camera, 0, 0);
  const end = worldToScreen(camera, Math.cos(angle) * config.beam.range, Math.sin(angle) * config.beam.range);
  const length = Math.hypot(end.x - origin.x, end.y - origin.y);
  const start = Math.max(28, config.lighthouseRadius * camera.zoom * 1.4);
  if (length <= start + 10) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(156, 232, 244, .6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(origin.x + (end.x - origin.x) * start / length, origin.y + (end.y - origin.y) * start / length);
  ctx.lineTo(origin.x + (end.x - origin.x) * (length - 10) / length, origin.y + (end.y - origin.y) * (length - 10) / length);
  ctx.stroke();
  ctx.restore();
}
