import type { BattleState, NightConfig } from '../contracts';
import { fireDirectWeapon } from './devices';
import { launchMortar } from './mortar';

const EPSILON = 1e-9;

/** A named live target anchors the aim to its current position; an area fires mortars only. */
export function castBarrage(state: BattleState, config: NightConfig,
  target: { x: number; y: number; enemyId?: number }): boolean {
  const rules = config.ability;
  if (state.outcome !== 'playing' || state.ability?.id !== 'barrage' || rules?.abilityId !== 'barrage'
    || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
  let point: { x: number; y: number } = target;
  if (target.enemyId !== undefined) {
    const enemy = state.enemies.find(enemy => enemy.id === target.enemyId && enemy.health > 0);
    const zone = state.boss && state.boss.health > 0 ? state.boss.tentacles.find(zone => zone.id === target.enemyId) : undefined;
    if (!enemy && !zone) return false;
    point = (enemy ?? zone)!;
  }
  const distance = Math.hypot(point.x, point.y);
  if (!Number.isFinite(distance) || distance > Math.min(config.worldRadius, rules.targetingRange) + EPSILON) return false;
  // Freeze aim before the first direct shot can kill its owner. No retargeting occurs.
  const aimed = { x: point.x, y: point.y };
  let fired = false;
  for (const device of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (device.kind === 'mortar') fired = launchMortar(state, config, device, aimed, rules) || fired;
    else if (target.enemyId !== undefined) fired = fireDirectWeapon(state, config, device, target.enemyId, true, rules) || fired;
  }
  return fired;
}
