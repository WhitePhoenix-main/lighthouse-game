import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';

const EPSILON = 1e-9;

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
  if (wasActive && state.shield.current === 0) emitCombatEvent(state, { type: 'shield-broken', x: 0, y: 0 });
}

export function updateShield(state: BattleState, config: NightConfig): void {
  syncShield(state, config);
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
  state.shield.current = Math.min(state.shield.maximum, state.shield.current + config.shield.regenerationPerSecond * config.stepSeconds);
  if (!restoring || state.shield.current <= 0) return;
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

export function hitShield(state: BattleState, config: NightConfig, damage: number, x: number, y: number): void {
  const before = state.shield.current;
  state.shield.current = Math.max(0, before - damage);
  delayShieldRecovery(state, config);
  emitCombatEvent(state, { type: 'shield-hit', damage: before - state.shield.current, x, y });
  if (before > 0 && state.shield.current === 0) emitCombatEvent(state, { type: 'shield-broken', x: 0, y: 0 });
}
