import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';
import { bastionDamage } from './abilityEffects';

const EPSILON = 1e-9;

function clearStabilization(state: BattleState): void {
  delete state.shield.stabilizationPending;
  delete state.shield.stabilizationUntilTick;
  delete state.shield.stabilizationBudget;
}

export function isProtected(device: DeviceState, config: NightConfig): boolean {
  return Math.hypot(device.x, device.y) + config.devices.definitions[device.kind].radius <= config.shield.radius + EPSILON;
}

/** Recompute immediately after each generator loss, before another attacker acts. */
export function syncShield(state: BattleState, config: NightConfig): void {
  const maximum = state.devices.filter(device => device.kind === 'generator' && !device.consumed
    && (device.health > 0 || state.tick < (device.residualUntilTick ?? 0))).length * config.shield.capacityPerGenerator;
  const wasActive = state.shield.current > 0;
  state.shield.maximum = maximum;
  state.shield.current = Math.min(state.shield.current, maximum);
  if (config.shield.stabilization && (maximum === 0 || state.shield.current >= maximum)) clearStabilization(state);
  if (wasActive && state.shield.current === 0) emitCombatEvent(state, { type: 'shield-broken', x: 0, y: 0 });
}

export function updateShield(state: BattleState, config: NightConfig): void {
  syncShield(state, config);
  if (config.shield.stabilization && state.tick >= (state.shield.stabilizationUntilTick ?? Infinity)) clearStabilization(state);
  if (state.shield.maximum <= 0 || state.shield.current >= state.shield.maximum) return;
  // Integer-sized steps avoid a one-tick drift from floating point countdowns.
  if (state.shield.recoveryRemaining > EPSILON) {
    state.shield.recoveryRemaining = Math.max(0, state.shield.recoveryRemaining - config.stepSeconds);
    if (state.shield.recoveryRemaining > EPSILON) return;
    state.shield.recoveryRemaining = 0;
  }
  // A residual contribution retains capacity and existing charge, never generation.
  if (!state.devices.some(device => device.kind === 'generator' && device.health > 0 && !device.consumed)) return;
  const restoring = state.shield.current === 0;
  const stabilization = config.shield.stabilization;
  if (stabilization && restoring && state.shield.stabilizationPending && config.shield.regenerationPerSecond > 0) {
    // The first ordinary recovery step starts the window; there is no separate grant.
    state.shield.stabilizationUntilTick = state.tick + Math.ceil(stabilization.durationSeconds / config.stepSeconds - EPSILON);
    delete state.shield.stabilizationPending;
  }
  const baseRecovery = config.shield.regenerationPerSecond * config.stepSeconds;
  const additionalRecovery = stabilization && state.tick < (state.shield.stabilizationUntilTick ?? 0)
    ? Math.min(baseRecovery * stabilization.regenerationBonus, state.shield.stabilizationBudget ?? 0) : 0;
  if (additionalRecovery > 0) state.shield.stabilizationBudget = Math.max(0, state.shield.stabilizationBudget! - additionalRecovery);
  state.shield.current = Math.min(state.shield.maximum, state.shield.current + baseRecovery + additionalRecovery);
  if (stabilization && state.shield.current >= state.shield.maximum) clearStabilization(state);
  if (!restoring || state.shield.current <= 0) return;
  if ((config.progression?.shieldRestoreReduction ?? 0) > 0)
    state.shield.guardUntilTick = state.tick + Math.ceil(1 / config.stepSeconds - EPSILON);
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    const distance = Math.hypot(enemy.x, enemy.y);
    const boundary = config.shield.radius + config.enemies[enemy.kind].radius;
    if (distance >= boundary) continue;
    // Origin has a deterministic push direction; no random sampling.
    const angle = distance > EPSILON ? Math.atan2(enemy.y, enemy.x) : 0;
    enemy.x = Math.cos(angle) * boundary;
    enemy.y = Math.sin(angle) * boundary;
  }
  if (state.boss && state.boss.health > 0 && config.boss) {
    for (const zone of state.boss.tentacles) {
      const distance = Math.hypot(zone.x, zone.y), boundary = config.shield.radius + config.boss.radius;
      if (distance >= boundary) continue;
      const angle = distance > EPSILON ? Math.atan2(zone.y, zone.x) : 0;
      zone.x = Math.cos(angle) * boundary; zone.y = Math.sin(angle) * boundary;
    }
  }
  emitCombatEvent(state, { type: 'shield-restored', x: 0, y: 0 });
}

export function delayShieldRecovery(state: BattleState, config: NightConfig): void {
  if (state.shield.maximum > 0) state.shield.recoveryRemaining = config.shield.regenerationDelay;
}

export function hitShield(state: BattleState, config: NightConfig, damage: number, x: number, y: number, heavy = false): void {
  const before = state.shield.current;
  const guard = state.tick < (state.shield.guardUntilTick ?? 0) ? config.progression?.shieldRestoreReduction ?? 0 : 0;
  state.shield.current = Math.max(0, before - bastionDamage(state, config, damage, damage * (1 - guard), 'field', heavy));
  delayShieldRecovery(state, config);
  emitCombatEvent(state, { type: 'shield-hit', damage: before - state.shield.current, x, y });
  if (before > 0 && state.shield.current === 0) {
    if (config.shield.stabilization) {
      state.shield.stabilizationPending = true;
      // Preliminary anti-farming cap: the extra recovery cannot repay the
      // charge lost in the breaking hit. A rebreak replaces this budget.
      state.shield.stabilizationBudget = before * config.shield.stabilization.regenerationBonus;
      delete state.shield.stabilizationUntilTick;
    }
    emitCombatEvent(state, { type: 'shield-broken', x: 0, y: 0 });
  }
}
