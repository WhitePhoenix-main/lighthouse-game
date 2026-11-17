import type Phaser from 'phaser';
import type { NightConfig } from '../../contracts';
import { shoreAtY } from '../../content/terrain';

/** Geometric fallback follows the same shoreline when raster artwork is unavailable. */
export function drawCoast(g: Phaser.GameObjects.Graphics, width: number, height: number, cx: number, cy: number, unit: number, terrain?: NightConfig['terrain'], projectionY = .7): void {
  g.fillStyle(0x0a202c); g.fillRect(0, 0, width, height);
  const shore: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const y = height * i / 40;
    const worldY = (y - cy) / (unit * projectionY);
    shore.push({ x: cx + (terrain ? shoreAtY(terrain, worldY) : 0) * unit, y });
  }
  g.fillStyle(0x233a35); g.fillPoints([{ x: 0, y: 0 }, ...shore, { x: 0, y: height }], true);
  g.lineStyle(7, 0x536357, .35); g.strokePoints(shore);
  g.lineStyle(2, 0x91a69a, .45); g.strokePoints(shore);
  for (let i = 0; i < 35; i++) {
    const x = (i * 179 + 47) % Math.max(width, 1), y = (i * 83 + 25) % Math.max(height, 1);
    if (x > cx + 23) {
      g.lineStyle(1, 0x789ba3, .25); g.lineBetween(x, y, x + 15 + i % 5 * 5, y);
    } else if (x < cx - 25) {
      g.fillStyle(i % 3 ? 0x607263 : 0x82907a, .25); g.fillEllipse(x, y, 4 + i % 5, 3 + i % 3);
    }
  }
  // Small distant hulls sit below all combat objects and the accurate beam.
  for (const [fx, fy] of [[.89, .16], [.91, .84]] as const) {
    const x = width * fx, y = height * fy, s = Math.max(5, Math.min(9, unit * 16));
    g.fillStyle(0x56747c, .55); g.fillTriangle(x - s, y, x + s, y, x + s * .35, y + s * .55);
    g.lineStyle(1, 0x93a6a2, .55); g.lineBetween(x, y, x, y - s * 1.9);
    g.fillStyle(0x8c9e99, .4); g.fillTriangle(x - 1, y - s * 1.7, x - 1, y - 2, x - s * .8, y - 2);
  }
}
