import type { NightConfig } from '../../contracts';
import { worldToScreen } from '../shared/world/worldGeometry';
import type { WorldCamera } from '../shared/world/worldTypes';
import { lighthouseLantern } from '../shared/world/chapterPaint';

export { lighthouseLantern };

interface Point { x: number; y: number }
export const BEAM_LIGHT_STOPS = [[0, .9], [.15, 1], [.35, .89], [.55, .70], [.75, .43], [.9, .19], [1, 0]] as const;

/** Atmospheric light, not a hit-area outline. Both ends use the lantern's
 * height so looking north cannot flatten or invert the cone in projection. */
export function beamLightGeometry(camera: WorldCamera, beam: NightConfig['beam'], angle: number,
    origin = lighthouseLantern(camera), contact?: Point) {
  const axis = { x: Math.cos(angle), y: Math.sin(angle) * camera.projectionY };
  const projectedRange = beam.range * camera.zoom * Math.hypot(axis.x, axis.y);
  const direction = contact ? { x: contact.x - origin.x, y: contact.y - origin.y } : axis;
  const distance = Math.hypot(direction.x, direction.y);
  const ray = distance > 1e-3 ? { x: direction.x / distance, y: direction.y / distance } : axis;
  const length = contact ? Math.max(projectedRange * .8, distance * 1.65) : projectedRange * 1.22;
  const normal = { x: -ray.y, y: ray.x };
  const end = { x: origin.x + ray.x * length, y: origin.y + ray.y * length };
  const nearWidth = Math.max(3, 11 * camera.zoom);
  const farWidth = nearWidth + Math.min(.43, Math.tan(beam.halfAngle) * 1.7) * length;
  const offset = (point: Point, width: number): Point => ({ x: point.x + normal.x * width, y: point.y + normal.y * width });
  const bands = Array.from({ length: 20 }, (_, index) => {
    const inner = index / 20, outer = (index + 1) / 20;
    return {
      // Nested bands approximate a smooth cross-beam falloff without a blur
      // buffer or a hard outside stroke. The far end fades to zero as well.
      opacity: (Math.exp(-4.8 * inner * inner) - Math.exp(-4.8 * outer * outer)) * .63,
      points: [offset(origin, -nearWidth * outer), offset(end, -farWidth * outer), offset(end, farWidth * outer), offset(origin, nearWidth * outer)] as const,
    };
  });
  return { origin, end, bands };
}

/** Above the tower, below creatures and all indicators. No contour or end arc. */
export function paintBattleBeam(ctx: CanvasRenderingContext2D, camera: WorldCamera, config: NightConfig, angle: number, contact?: Point): void {
  const { origin, end, bands } = beamLightGeometry(camera, config.beam, angle,
    lighthouseLantern(camera, config.campaignMapId, config.campaignAppearance?.beacon === 'dawn-beacon'), contact);
  const color = config.campaignAppearance?.beam === 'moonbeam' ? '176, 210, 252' : '255, 202, 108';
  ctx.save();
  for (const band of bands) {
    const light = ctx.createLinearGradient(origin.x, origin.y, end.x, end.y);
    for (const [position, strength] of BEAM_LIGHT_STOPS) light.addColorStop(position, `rgba(${color}, ${band.opacity * strength})`);
    ctx.beginPath();
    ctx.moveTo(band.points[0].x, band.points[0].y);
    for (const point of band.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
  }
  if (contact) {
    const radius = Math.max(12, 37 * camera.zoom);
    const halo = ctx.createRadialGradient(contact.x, contact.y, 0, contact.x, contact.y, radius);
    halo.addColorStop(0, `rgba(${color}, .48)`);
    halo.addColorStop(.55, `rgba(${color}, .16)`);
    halo.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(contact.x - radius, contact.y - radius, radius * 2, radius * 2);
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
  ctx.strokeStyle = 'rgba(156, 205, 221, .32)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(origin.x + (end.x - origin.x) * start / length, origin.y + (end.y - origin.y) * start / length);
  ctx.lineTo(origin.x + (end.x - origin.x) * (length - 10) / length, origin.y + (end.y - origin.y) * (length - 10) / length);
  ctx.stroke();
  ctx.restore();
}
