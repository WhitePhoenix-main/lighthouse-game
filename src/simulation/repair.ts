import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';

const EPSILON = 1e-9;

/** A missing ceiling in a legacy fixture grants no restoration of older damage. */
function repairCeiling(device: DeviceState): number {
  return device.startHealth ?? device.health;
}

/** Post-attack support: finite attempt-local budgets, no revival or repair chains. */
export function updateRepairLamps(state: BattleState, config: NightConfig): void {
  if (state.lighthouseHealth <= 0) return;
  const rules = config.devices.repairLamp;
  const definition = config.devices.definitions['repair-lamp'];
  for (const lamp of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (lamp.kind !== 'repair-lamp' || lamp.health <= 0 || lamp.consumed) continue;
    lamp.attackCooldown = Math.max(0, lamp.attackCooldown - config.stepSeconds);
    if ((lamp.repairCharges ?? 0) <= 0) continue;
    const candidates = state.devices.filter(target => target.kind !== 'repair-lamp'
      && target.health > 0 && !target.consumed && target.health < repairCeiling(target)
      && Math.hypot(target.x - lamp.x, target.y - lamp.y) <= definition.range + EPSILON);
    candidates.sort((a, b) => a.health / repairCeiling(a) - b.health / repairCeiling(b) || a.id - b.id);
    const emergencyTarget = rules.emergencyEnabled && !lamp.emergencyRepairUsed
      ? candidates.find(target => target.health <= config.devices.definitions[target.kind].health * rules.emergencyThreshold)
      : undefined;
    const target = emergencyTarget ?? (lamp.attackCooldown <= EPSILON ? candidates[0] : undefined);
    if (!target) continue;
    const emergency = emergencyTarget !== undefined;
    const requested = Math.min(repairCeiling(target) - target.health,
      rules.healAmount * (emergency ? rules.emergencyMultiplier : 1));
    const before = target.health;
    target.health = Math.min(repairCeiling(target), target.health + requested);
    const amount = target.health - before;
    if (amount <= 0) continue;
    lamp.repairCharges = (lamp.repairCharges ?? 0) - 1;
    if (emergency) lamp.emergencyRepairUsed = true;
    lamp.attackCooldown = definition.attackInterval;
    emitCombatEvent(state, { type: 'device-repaired', deviceId: target.id, sourceId: lamp.id, amount, emergency, x: target.x, y: target.y });
  }
}
