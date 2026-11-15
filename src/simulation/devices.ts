import type { BattleState, DeviceState, EnemyState, NightConfig } from '../contracts';
import { emitCombatEvent } from './events';
import { contactFraction } from './geometry';
import { damageBoss } from './boss';
import { isProtected } from './shield';
import { applyMovementSlow, movementSlowMultiplier } from './slows';

const EPSILON = 1e-9;

export function damageEnemy(enemy: EnemyState, damage: number, state?: BattleState, armorMultiplier = 1): void {
  const healthBefore = enemy.health;
  const armorBefore = enemy.armor;
  const absorbed = Math.min(enemy.armor, damage * armorMultiplier);
  enemy.armor -= absorbed;
  enemy.health = Math.max(0, enemy.health - (damage - absorbed / armorMultiplier));
  if (!state || healthBefore <= 0) return;
  const healthDamage = healthBefore - enemy.health;
  const armorDamage = armorBefore - enemy.armor;
  const target = { enemyId: enemy.id, enemyKind: enemy.kind, x: enemy.x, y: enemy.y };
  if (healthDamage > 0 || armorDamage > 0) emitCombatEvent(state, { type: 'enemy-hit', ...target, healthDamage, armorDamage });
  if (armorBefore > 0 && enemy.armor === 0) emitCombatEvent(state, { type: 'armor-broken', ...target });
  if (enemy.health === 0) emitCombatEvent(state, { type: 'enemy-died', ...target });
}

/** Swept movement records the first obstruction; flying enemies seek devices. */
export function moveEnemies(state: BattleState, config: NightConfig, litIds: readonly number[] = []): Map<number, DeviceState | 'shield'> {
  const contacts = new Map<number, DeviceState | 'shield'>();
  const dt = config.stepSeconds;
  for (const device of state.devices) if (device.kind !== 'bell' && device.kind !== 'repair-lamp') device.attackCooldown = Math.max(0, device.attackCooldown - dt);
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || state.tick < (enemy.stunnedUntilTick ?? 0)) continue;
    const definition = config.enemies[enemy.kind];
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    let targetX = 0, targetY = 0;
    let targetRadius = config.lighthouseRadius;
    if (enemy.kind === 'bat') {
      const targets = state.devices.filter(device => device.health > 0 && !device.consumed && device.kind !== 'barrier');
      targets.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y) || a.id - b.id);
      const target = targets[0];
      enemy.targetDeviceId = target?.id ?? null;
      if (target) { targetX = target.x; targetY = target.y; targetRadius = config.devices.definitions[target.kind].radius; }
    }
    const distance = Math.hypot(enemy.x - targetX, enemy.y - targetY);
    if (definition.charge) {
      enemy.chargePhase ??= 'ready';
      if (enemy.chargePhase === 'ready' && distance <= definition.charge.triggerDistance) {
        enemy.chargePhase = 'windup'; enemy.chargeRemaining = definition.charge.windup;
        emitCombatEvent(state, { type: 'charge-started', enemyId: enemy.id, enemyKind: enemy.kind, x: enemy.x, y: enemy.y });
      }
      if (enemy.chargePhase === 'windup') {
        if ((enemy.chargeRemaining ?? 0) > EPSILON) {
          enemy.chargeRemaining = Math.max(0, (enemy.chargeRemaining ?? 0) - dt);
          continue;
        }
        enemy.chargePhase = 'charging';
      }
    }
    const speed = enemy.chargePhase === 'charging' && definition.charge ? definition.charge.speed : definition.speed;
    const multiplier = Math.min(movementSlowMultiplier(enemy, state.tick), litIds.includes(enemy.id) ? config.lens?.slowMultiplier ?? 1 : 1);
    const nextDistance = Math.max(targetRadius + definition.radius, distance - speed * dt * multiplier);
    const scale = distance > nextDistance ? nextDistance / distance - 1 : 0;
    const dx = (enemy.x - targetX) * scale, dy = (enemy.y - targetY) * scale;
    let first = 1;
    let obstruction: DeviceState | 'shield' | undefined;
    if (state.shield.current > 0) {
      const boundary = config.shield.radius + definition.radius;
      // A restored field pushes bodies to tangency. Flying enemies whose target
      // is outside must be able to leave that tangency instead of attacking it.
      const leavesBoundary = Math.hypot(enemy.x, enemy.y) >= boundary - EPSILON
        && dx * dx + dy * dy > EPSILON && enemy.x * dx + enemy.y * dy >= -EPSILON;
      const fraction = leavesBoundary ? null : contactFraction(enemy.x, enemy.y, dx, dy, boundary);
      if (fraction !== null) { first = fraction; obstruction = 'shield'; }
    }
    for (const device of state.devices) {
      if (device.health <= 0 || device.consumed || ((enemy.kind === 'ghost' || enemy.kind === 'bat') && device.kind === 'barrier')) continue;
      if (state.shield.current > 0 && isProtected(device, config)) continue;
      const fraction = contactFraction(enemy.x - device.x, enemy.y - device.y, dx, dy,
        definition.radius + config.devices.definitions[device.kind].radius);
      if (fraction === null) continue;
      if (!obstruction || fraction < first - EPSILON || (Math.abs(fraction - first) <= EPSILON && obstruction !== 'shield' && device.id < obstruction.id)) {
        first = fraction;
        obstruction = device;
      }
    }
    enemy.x += dx * first;
    enemy.y += dy * first;
    if (obstruction) contacts.set(enemy.id, obstruction);
  }
  return contacts;
}

export function fireCannons(state: BattleState, config: NightConfig): void {
  for (const cannon of [...state.devices].sort((a, b) => a.id - b.id)) {
    if ((cannon.kind !== 'cannon' && cannon.kind !== 'harpoon') || cannon.health <= 0 || cannon.consumed) continue;
    const zones = state.boss && state.boss.health > 0 ? state.boss.tentacles.map(zone => ({ ...zone, health: state.boss!.health, armor: 0 })) : [];
    const candidates = [...state.enemies.filter(enemy => enemy.health > 0 && (cannon.kind === 'harpoon' || enemy.kind !== 'bat')), ...zones];
    const manual = candidates.find(target => target.id === cannon.targetId);
    if (!manual) cannon.targetId = null;
    if (cannon.attackCooldown > EPSILON) continue;
    const definition = config.devices.definitions[cannon.kind];
    const available = candidates.filter(target => (!manual || target.id === manual.id)
      && Math.hypot(target.x - cannon.x, target.y - cannon.y) <= definition.range + EPSILON);
    const score = (target: typeof candidates[number]): number => cannon.priority === 'strongest' ? -(target.health + target.armor)
      : cannon.priority === 'weakest' ? target.health + target.armor : Math.hypot(target.x - cannon.x, target.y - cannon.y);
    available.sort((a, b) => score(a) - score(b) || a.id - b.id);
    const target = available[0];
    if (!target) continue;
    const enemy = state.enemies.find(enemy => enemy.id === target.id);
    // All boss hit zones share key 0: switching tentacles cannot repeat the bonus.
    const ownerKey = enemy ? enemy.id : 0;
    const bonus = cannon.kind === 'cannon' && manual && !(cannon.manualBonusTargets ?? []).includes(ownerKey)
      ? config.devices.cannon.manualDamageBonus : 0;
    const flyingBonus = cannon.kind === 'harpoon' && enemy && config.enemies[enemy.kind].movement === 'flying'
      ? config.devices.harpoon.flyingDamageMultiplier : 1;
    const damage = definition.damage * (1 + bonus) * flyingBonus;
    if (enemy) damageEnemy(enemy, damage, state, cannon.kind === 'cannon' ? config.devices.cannon.armorMultiplier : 1);
    else damageBoss(state, damage, target);
    if (cannon.kind === 'harpoon' && config.devices.harpoon.slowMultiplier < 1 && config.devices.harpoon.slowSeconds > 0) {
      const slowTarget = enemy ?? state.boss?.tentacles.find(zone => zone.id === target.id);
      // Shots follow movement, so preserve the full duration on following steps.
      if (slowTarget) applyMovementSlow(slowTarget, cannon.id,
        state.tick + 1 + Math.ceil(config.devices.harpoon.slowSeconds / config.stepSeconds - EPSILON),
        config.devices.harpoon.slowMultiplier, state.tick);
    }
    if (bonus > 0) cannon.manualBonusTargets = [...(cannon.manualBonusTargets ?? []), ownerKey];
    cannon.attackCooldown = definition.attackInterval;
    cannon.lastShot = { tick: state.tick, x: target.x, y: target.y };
  }
}
