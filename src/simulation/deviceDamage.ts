import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';
import { delayShieldRecovery, isProtected, syncShield } from './shield';
import { applyMovementSlow } from './slows';
import { bastionDamage } from './abilityEffects';

/** Body protection never changes damage dealt to the field or lighthouse. */
export function incomingDeviceDamage(device: Pick<DeviceState, 'kind'>, config: NightConfig, amount: number, charged = false): number {
  const multiplier = device.kind === 'barrier'
    ? Math.min(config.devices.barrier.incomingDamageMultiplier, charged ? config.devices.barrier.chargeDamageMultiplier : 1)
    : device.kind === 'generator' ? config.devices.generator.incomingDamageMultiplier
    : device.kind === 'bell' ? config.devices.bell.incomingDamageMultiplier
    : device.kind === 'repair-lamp' ? config.devices.repairLamp.incomingDamageMultiplier : 1;
  return amount * multiplier;
}

function slowOnBarrierBreak(state: BattleState, config: NightConfig, device: DeviceState): void {
  const rules = config.devices.barrier;
  if (rules.breakSlowMultiplier >= 1 || rules.breakSlowSeconds <= 0) return;
  // Destruction follows movement: affect the next full duration of movement steps.
  const untilTick = state.tick + 1 + Math.ceil(rules.breakSlowSeconds / config.stepSeconds - 1e-9);
  const targets = [
    ...state.enemies.filter(enemy => enemy.health > 0).map(target => ({ target, radius: config.enemies[target.kind].radius })),
    ...(state.boss && state.boss.health > 0 && config.boss
      ? state.boss.tentacles.map(target => ({ target, radius: config.boss!.radius })) : []),
  ];
  for (const { target, radius } of targets) {
    if (Math.hypot(target.x - device.x, target.y - device.y) <= rules.breakSlowRadius + radius + 1e-9) {
      applyMovementSlow(target, device.id, untilTick, rules.breakSlowMultiplier, state.tick);
    }
  }
  emitCombatEvent(state, { type: 'barrier-slow', deviceId: device.id, radius: rules.breakSlowRadius,
    multiplier: rules.breakSlowMultiplier, x: device.x, y: device.y });
}

/** One path for ordinary attacks and boss strikes, including destruction side effects. */
export function damageDevice(state: BattleState, config: NightConfig, device: DeviceState, amount: number, charged = false, heavy = charged): void {
  if (device.health <= 0 || device.consumed || amount <= 0) return;
  const before = device.health;
  device.health = Math.max(0, before - bastionDamage(state, config, amount,
    incomingDeviceDamage(device, config, amount, charged), 'device', heavy));
  if (device.health === 0 && device.kind === 'generator' && config.devices.generator.lastStandEnabled && !device.lastStandUsed) {
    device.lastStandUsed = true;
    device.health = Math.min(before, 1);
    emitCombatEvent(state, { type: 'generator-saved', deviceId: device.id, x: device.x, y: device.y });
  }
  const damage = before - device.health;
  if (damage > 0) {
    if (isProtected(device, config)) delayShieldRecovery(state, config);
    const target = { deviceId: device.id, deviceKind: device.kind, damage, x: device.x, y: device.y };
    emitCombatEvent(state, { type: 'device-hit', ...target });
    if (device.health === 0) {
      emitCombatEvent(state, { type: 'device-destroyed', ...target });
      if (device.kind === 'barrier') slowOnBarrierBreak(state, config, device);
      if (device.kind === 'generator' && config.devices.generator.residualSeconds > 0) {
        device.residualUntilTick = state.tick + Math.ceil(config.devices.generator.residualSeconds / config.stepSeconds - 1e-9);
        emitCombatEvent(state, { type: 'generator-residual', deviceId: device.id,
          untilTick: device.residualUntilTick, x: device.x, y: device.y });
      }
    }
    syncShield(state, config);
  }
}
