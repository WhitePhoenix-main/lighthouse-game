import type { BattleState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';
import { applyMovementSlow } from './slows';
export { movementSlowMultiplier as bellSlowMultiplier } from './slows';
export { incomingDeviceDamage } from './deviceDamage';

export function updateBells(state: BattleState, config: NightConfig): void {
  const targets = [
    ...state.enemies.filter(enemy => enemy.health > 0).map(enemy => ({ target: enemy, radius: config.enemies[enemy.kind].radius })),
    ...(state.boss && state.boss.health > 0 && config.boss
      ? state.boss.tentacles.map(target => ({ target, radius: config.boss!.radius })) : []),
  ];
  for (const { target } of targets) {
    if (target.bellSlows) target.bellSlows = target.bellSlows.filter(effect => state.tick < effect.untilTick);
  }
  for (const bell of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (bell.kind !== 'bell' || bell.health <= 0 || bell.consumed) continue;
    bell.attackCooldown = Math.max(0, bell.attackCooldown - config.stepSeconds);
    if (bell.attackCooldown > 1e-9) continue;
    const definition = config.devices.definitions.bell;
    const affected = targets.filter(({ target, radius }) => Math.hypot(target.x - bell.x, target.y - bell.y) <= definition.range + radius + 1e-9);
    if (!affected.length) continue;
    const multiplier = (bell.bellPulses ?? 0) === 0 ? config.devices.bell.firstPulseSlowMultiplier : config.devices.bell.slowMultiplier;
    const untilTick = state.tick + Math.ceil(config.devices.bell.duration / config.stepSeconds - 1e-9);
    for (const { target } of affected) {
      applyMovementSlow(target, bell.id, untilTick, multiplier, state.tick);
    }
    bell.bellPulses = (bell.bellPulses ?? 0) + 1;
    bell.attackCooldown = definition.attackInterval;
    emitCombatEvent(state, { type: 'bell-pulse', deviceId: bell.id, radius: definition.range, multiplier, x: bell.x, y: bell.y });
  }
}
