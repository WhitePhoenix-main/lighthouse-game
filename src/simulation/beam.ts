import type { BossState, EnemyState, NightConfig, ShipState } from '../contracts';

const EPSILON = 1e-9;
export function angleDifference(angle: number, axis: number): number {
  return Math.atan2(Math.sin(angle - axis), Math.cos(angle - axis));
}

function distanceToSegment(x: number, y: number, angle: number, range: number): number {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const along = Math.max(0, Math.min(range, x * dx + y * dy));
  return Math.hypot(x - dx * along, y - dy * along);
}

interface BeamBody { id: number; x: number; y: number; radius: number; health: number }

function intersectsBody(enemy: BeamBody, config: NightConfig, axis: number): boolean {
  const radius = enemy.radius;
  const distance = Math.hypot(enemy.x, enemy.y);
  if (distance - radius > config.beam.range + EPSILON) return false;
  const offset = Math.abs(angleDifference(Math.atan2(enemy.y, enemy.x), axis));
  if (offset <= config.beam.halfAngle) return true;
  return distanceToSegment(enemy.x, enemy.y, axis - config.beam.halfAngle, config.beam.range) <= radius + EPSILON
    || distanceToSegment(enemy.x, enemy.y, axis + config.beam.halfAngle, config.beam.range) <= radius + EPSILON;
}

/** Full angular silhouette coverage by the union of ALL nearer living bodies.
 * Selection limits do not make bodies transparent. Partial coverage keeps full damage.
 */
function blockedBody(target: BeamBody, enemies: readonly BeamBody[]): boolean {
  const distance = Math.hypot(target.x, target.y);
  const radius = target.radius;
  if (distance <= radius) return false;
  const axis = Math.atan2(target.y, target.x);
  const halfWidth = Math.asin(Math.min(1, radius / distance));
  const intervals: [number, number][] = [];
  for (const other of enemies) {
    if (other.id === target.id || other.health <= 0) continue;
    const otherDistance = Math.hypot(other.x, other.y);
    if (otherDistance >= distance - EPSILON) continue;
    const otherRadius = other.radius;
    if (otherDistance <= otherRadius) return true;
    const offset = angleDifference(Math.atan2(other.y, other.x), axis);
    const otherHalf = Math.asin(Math.min(1, otherRadius / otherDistance));
    for (const shift of [-2 * Math.PI, 0, 2 * Math.PI]) {
      intervals.push([offset + shift - otherHalf, offset + shift + otherHalf]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let coveredTo = -halfWidth;
  for (const [from, to] of intervals) {
    if (to < coveredTo - EPSILON) continue;
    if (from > coveredTo + EPSILON) return false;
    coveredTo = Math.max(coveredTo, to);
    if (coveredTo >= halfWidth - EPSILON) return true;
  }
  return false;
}

function body(enemy: EnemyState, config: NightConfig): BeamBody {
  return { ...enemy, radius: config.enemies[enemy.kind].radius };
}
export function intersectsBeam(enemy: EnemyState, config: NightConfig, axis: number): boolean {
  return intersectsBody(body(enemy, config), config, axis);
}
export function isFullyBlocked(target: EnemyState, enemies: readonly EnemyState[], config: NightConfig): boolean {
  return blockedBody(body(target, config), enemies.map(enemy => body(enemy, config)));
}

/** A waiting ship shares sector, opacity and target limit with hostile bodies. */
export function selectBeamTargets(enemies: readonly EnemyState[], config: NightConfig, axis: number,
  ship?: ShipState | null, boss?: BossState | null): { lit: number[]; blocked: number[]; shipLit?: boolean; litTentacles?: number[]; blockedTentacles?: number[] } {
  const bodies = enemies.filter(enemy => enemy.health > 0).map(enemy => body(enemy, config));
  if (boss && boss.health > 0 && config.boss) bodies.push(...boss.tentacles.map(zone => ({ ...zone, radius: config.boss!.radius, health: boss.health })));
  if (ship?.status === 'waiting') bodies.push({ ...ship, id: -1, health: 1 });
  const candidates = bodies.filter(target => intersectsBody(target, config, axis));
  const blocked = candidates.filter(target => blockedBody(target, bodies)).map(target => target.id);
  const available = candidates.filter(target => !blocked.includes(target.id));
  available.sort((a, b) => Math.abs(angleDifference(Math.atan2(a.y, a.x), axis))
    - Math.abs(angleDifference(Math.atan2(b.y, b.x), axis)) || a.id - b.id);
  const selected = available.slice(0, config.beam.maxTargets).map(target => target.id);
  const result = { lit: selected.filter(id => id > 0), blocked: blocked.filter(id => id > 0) };
  const hostiles = boss ? { ...result, litTentacles: selected.filter(id => id < -1000), blockedTentacles: blocked.filter(id => id < -1000) } : result;
  return ship ? { ...hostiles, shipLit: selected.includes(-1) } : hostiles;
}
