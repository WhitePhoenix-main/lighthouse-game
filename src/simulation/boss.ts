import { damageLighthouse } from './lighthouse';
import { sealSlowMultiplier } from './seal';
import type { BattleState, BossState, DeviceState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';
import { contactFraction } from './geometry';
import { hitShield, isProtected } from './shield';
import { movementSlowMultiplier } from './slows';
import { damageDevice } from './deviceDamage';

export function createBoss(config: NightConfig): BossState | null {
  const rules = config.boss;
  if (!rules) return null;
  return { id: rules.id, health: rules.health, stunnedUntilTick: 0,
    tentacles: Array.from({ length: rules.tentacleCount }, (_, index) => {
      // Sea-facing arc is deterministic and independent of display coordinates.
      const angle = -1.05 + 2.1 * (index + 0.5) / rules.tentacleCount;
      return { id: -1001 - index, x: Math.cos(angle) * rules.spawnRadius,
        y: Math.sin(angle) * rules.spawnRadius, attackCooldown: 0 };
    }) };
}
export function damageBoss(state: BattleState, damage: number, position: { x: number; y: number }): void {
  const boss = state.boss;
  if (!boss || boss.health <= 0) return;
  const before = boss.health;
  boss.health = Math.max(0, before - damage);
  if (before > boss.health) emitCombatEvent(state, { type: 'boss-hit', healthDamage: before - boss.health, ...position });
  if (boss.health === 0) {
    state.litTentacleIds = []; state.blockedTentacleIds = [];
    emitCombatEvent(state, { type: 'boss-died', ...position });
  }
}
export function bossIntersects(state: BattleState, config: NightConfig, x: number, y: number, radius: number): boolean {
  return !!config.boss && !!state.boss && state.boss.health > 0 && state.boss.tentacles.some(zone =>
    Math.hypot(zone.x - x, zone.y - y) <= radius + config.boss!.radius + 1e-9);
}
export function moveTentacles(state: BattleState, config: NightConfig, litIds: readonly number[]): Map<number, DeviceState | 'shield'> {
  const contacts = new Map<number, DeviceState | 'shield'>();
  const boss = state.boss, rules = config.boss;
  if (!boss || !rules || boss.health <= 0 || state.tick < boss.stunnedUntilTick) return contacts;
  for (const zone of boss.tentacles) {
    zone.attackCooldown = Math.max(0, zone.attackCooldown - config.stepSeconds);
    const distance = Math.hypot(zone.x, zone.y);
    const multiplier = Math.min(movementSlowMultiplier(zone, state.tick), sealSlowMultiplier(zone, state, config),
      litIds.includes(zone.id) ? Math.min(rules.litSpeedMultiplier, config.lens?.slowMultiplier ?? 1) : 1);
    const next = Math.max(config.lighthouseRadius + rules.radius, distance - rules.speed * multiplier * config.stepSeconds);
    const scale = distance > next ? next / distance - 1 : 0;
    const dx = zone.x * scale, dy = zone.y * scale;
    let first = 1, obstruction: DeviceState | 'shield' | undefined;
    if (state.shield.current > 0) {
      const fraction = contactFraction(zone.x, zone.y, dx, dy, config.shield.radius + rules.radius);
      if (fraction !== null) { first = fraction; obstruction = 'shield'; }
    }
    for (const device of state.devices) {
      if (device.health <= 0 || device.consumed || (state.shield.current > 0 && isProtected(device, config))) continue;
      const fraction = contactFraction(zone.x - device.x, zone.y - device.y, dx, dy, rules.radius + config.devices.definitions[device.kind].radius);
      if (fraction !== null && (!obstruction || fraction < first - 1e-9 || (Math.abs(fraction - first) <= 1e-9 && obstruction !== 'shield' && device.id < obstruction.id))) {
        first = fraction; obstruction = device;
      }
    }
    zone.x += dx * first; zone.y += dy * first;
    if (obstruction) contacts.set(zone.id, obstruction);
  }
  return contacts;
}
export function attackTentacles(state: BattleState, config: NightConfig, contacts: Map<number, DeviceState | 'shield'>): void {
  const boss = state.boss, rules = config.boss;
  if (!boss || !rules || boss.health <= 0 || state.tick < boss.stunnedUntilTick) return;
  for (const zone of boss.tentacles) {
    if (zone.attackCooldown > 1e-9 || state.litTentacleIds.includes(zone.id)) continue;
    const target = contacts.get(zone.id);
    if (target === 'shield') {
      if (state.shield.current <= 0) continue;
      hitShield(state, config, rules.attackDamage, zone.x, zone.y, true);
    } else if (target) {
      if (target.health <= 0 || target.consumed || (state.shield.current > 0 && isProtected(target, config))) continue;
      damageDevice(state, config, target, rules.attackDamage, false, true);
    } else if (Math.hypot(zone.x, zone.y) <= config.lighthouseRadius + rules.radius + 1e-9) {
      damageLighthouse(state, config, rules.attackDamage, true);
    } else continue;
    zone.attackCooldown = rules.attackInterval;
  }
}
