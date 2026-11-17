import type { MortarProjectile } from '../../contracts';
/** Pure projection of a fixed simulation flight; pause leaves its position unchanged. */
export function mortarFlight(projectile: MortarProjectile, tick: number): { x: number; y: number; lift: number; progress: number } {
  const progress = Math.max(0, Math.min(1, (tick - projectile.launchTick) / Math.max(1, projectile.impactTick - projectile.launchTick)));
  return { x: projectile.fromX + (projectile.x - projectile.fromX) * progress, y: projectile.fromY + (projectile.y - projectile.fromY) * progress, lift: Math.sin(progress * Math.PI) * 45, progress };
}
