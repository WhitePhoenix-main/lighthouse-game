import { lightGuidanceMultiplier, overloadGuidanceBonus } from './lightSupport';
import type { BarrageAbilityRules } from '../abilityRules';
import { effectiveWeaponDefinition } from '../content/campaignVariants';
import type { BattleState, DeviceState, EnemyState, NightConfig } from '../contracts';
import { activeCampaignCast, campaignDeviceRooted, campaignDeviceTarget, campaignMovementMultiplier } from './campaignEnemies';
import { emitCombatEvent } from './events';
import { contactFraction } from './geometry';
import { damageBoss } from './boss';
import { isProtected } from './shield';
import { applyMovementSlow, movementSlowMultiplier } from './slows';
import { sealSlowMultiplier } from './seal';

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
    if (activeCampaignCast(enemy)) continue;
    let targetX = 0, targetY = 0;
    let targetRadius = config.lighthouseRadius;
    const routeIndex = enemy.groundWaypointIndex ?? 0;
    const waypoint = enemy.groundWaypoints?.[routeIndex];
    const isTurn = waypoint && routeIndex < enemy.groundWaypoints!.length - 1;
    if (isTurn) { targetX = waypoint.x; targetY = waypoint.y; targetRadius = -definition.radius; }
    if (enemy.kind === 'bat' || definition.campaign?.kind === 'hunt-device') {
      const target = enemy.kind === 'bat' ? state.devices.filter(device => device.health > 0 && !device.consumed && device.kind !== 'barrier')
        .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y) || a.id - b.id)[0]
        : campaignDeviceTarget(state, config, enemy);
      enemy.targetDeviceId = target?.id ?? null;
      if (target) { targetX = target.x; targetY = target.y; targetRadius = config.devices.definitions[target.kind].radius; }
    }
    const distance = Math.hypot(enemy.x - targetX, enemy.y - targetY);
    if (definition.charge) {
      enemy.chargePhase ??= 'ready';
      if (enemy.chargePhase === 'ready' && Math.hypot(enemy.x, enemy.y) <= definition.charge.triggerDistance) {
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
    const multiplier = Math.min(movementSlowMultiplier(enemy, state.tick), litIds.includes(enemy.id) ? config.lens?.slowMultiplier ?? 1 : 1,
      sealSlowMultiplier(enemy, state, config)) * (config.campaignMapId ? campaignMovementMultiplier(state, config, enemy) : 1);
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
      if (device.health <= 0 || device.consumed || ((definition.movement === 'ethereal' || definition.movement === 'flying') && device.kind === 'barrier')) continue;
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
    if (isTurn && enemy.targetDeviceId == null && Math.hypot(enemy.x - waypoint.x, enemy.y - waypoint.y) <= EPSILON) {
      enemy.groundWaypointIndex = routeIndex + 1;
    }
    if (obstruction) contacts.set(enemy.id, obstruction);
  }
  return contacts;
}

export function fireCannons(state: BattleState, config: NightConfig): void {
  for (const cannon of [...state.devices].sort((a, b) => a.id - b.id)) {
    if ((cannon.kind !== 'cannon' && cannon.kind !== 'harpoon') || cannon.health <= 0 || cannon.consumed
      || state.tick < (cannon.suppressedUntilTick ?? 0) || campaignDeviceRooted(state, cannon.id)) continue;
    const zones = state.boss && state.boss.health > 0 ? state.boss.tentacles.map(zone => ({ ...zone, health: state.boss!.health, armor: 0 })) : [];
    const candidates = [...state.enemies.filter(enemy => enemy.health > 0 && (cannon.kind === 'harpoon' || config.enemies[enemy.kind].movement !== 'flying')), ...zones];
    const manual = candidates.find(target => target.id === cannon.targetId);
    if (!manual) cannon.targetId = null;
    if (cannon.attackCooldown > EPSILON) continue;
    const definition = effectiveWeaponDefinition(config, cannon);
    const available = candidates.filter(target => (!manual || target.id === manual.id)
      && Math.hypot(target.x - cannon.x, target.y - cannon.y) <= definition.range + EPSILON);
    const score = (target: typeof candidates[number]): number => cannon.priority === 'strongest' ? -(target.health + target.armor)
      : cannon.priority === 'weakest' ? target.health + target.armor : Math.hypot(target.x - cannon.x, target.y - cannon.y);
    available.sort((a, b) => score(a) - score(b) || a.id - b.id);
    const target = available[0];
    if (!target) continue;
    fireDirectWeapon(state, config, cannon, target.id, Boolean(manual));
  }
}

/** Shares ordinary/manual weapon semantics with the extra aimed attack. */
export function fireDirectWeapon(state: BattleState, config: NightConfig, cannon: DeviceState,
  targetId: number, manual: boolean, barrage?: BarrageAbilityRules): boolean {
  if ((cannon.kind !== 'cannon' && cannon.kind !== 'harpoon') || cannon.health <= 0 || cannon.consumed
    || state.tick < (cannon.suppressedUntilTick ?? 0) || campaignDeviceRooted(state, cannon.id)) return false;
  const enemy = state.enemies.find(enemy => enemy.id === targetId && enemy.health > 0);
  const zone = state.boss && state.boss.health > 0 ? state.boss.tentacles.find(zone => zone.id === targetId) : undefined;
  const target = enemy ?? zone;
  if (!target || (enemy && config.enemies[enemy.kind].movement === 'flying' && cannon.kind === 'cannon')) return false;
  const definition = effectiveWeaponDefinition(config, cannon);
  if (Math.hypot(target.x - cannon.x, target.y - cannon.y) > definition.range + EPSILON) return false;
  const ownerKey = enemy ? enemy.id : 0;
  const bonus = cannon.kind === 'cannon' && manual && !(cannon.manualBonusTargets ?? []).includes(ownerKey)
    ? config.devices.cannon.manualDamageBonus : 0;
  const airborne = Boolean(enemy && config.enemies[enemy.kind].movement === 'flying');
  const flyingBonus = cannon.kind === 'harpoon' && airborne ? config.devices.harpoon.flyingDamageMultiplier : 1;
  const modifiers = barrageDamageMultipliers(state, config, target.id, barrage, bonus,
    cannon.kind === 'harpoon' && airborne ? barrage?.airDamageBonus ?? 0 : 0);
  const damage = barrage || overloadGuidanceBonus(state, config, target.id) > 0 ? definition.damage * flyingBonus * modifiers.health
    : definition.damage * (1 + bonus) * flyingBonus * lightGuidanceMultiplier(state, config, target.id);
  const armorRatio = modifiers.armor === modifiers.health ? 1 : modifiers.armor / modifiers.health;
  if (enemy) damageEnemy(enemy, damage, state,
    (cannon.kind === 'cannon' ? config.devices.cannon.armorMultiplier : 1) * armorRatio);
  else damageBoss(state, damage, target);
  if (cannon.kind === 'harpoon' && config.devices.harpoon.slowMultiplier < 1 && config.devices.harpoon.slowSeconds > 0) {
    applyMovementSlow(target, cannon.id,
      state.tick + 1 + Math.ceil(config.devices.harpoon.slowSeconds / config.stepSeconds - EPSILON),
      config.devices.harpoon.slowMultiplier, state.tick);
  }
  if (bonus > 0) cannon.manualBonusTargets = [...(cannon.manualBonusTargets ?? []), ownerKey];
  cannon.attackCooldown = definition.attackInterval;
  cannon.lastShot = { tick: state.tick, x: target.x, y: target.y };
  return true;
}

/** Ability bonuses add within their cap; existing conditional bonuses share one group. */
export function barrageDamageMultipliers(state: BattleState, config: NightConfig, targetId: number,
  barrage?: Pick<BarrageAbilityRules, 'damageBonus' | 'litDamageBonus' | 'armorDamageBonus' | 'damageBonusCap'>,
  manualBonus = 0, airBonus = 0): { health: number; armor: number } {
  const common = lightGuidanceMultiplier(state, config, targetId) - 1;
  if (!barrage) {
    // Preserve all old gains, then add the new guidance once, without multiplying it by manual bonuses.
    const lit = state.litEnemyIds.includes(targetId) || state.litTentacleIds.includes(targetId);
    const legacy = (1 + manualBonus) * (lit ? 1 + (config.progression?.litDeviceDamageBonus ?? 0) : 1)
      + overloadGuidanceBonus(state, config, targetId);
    return { health: legacy, armor: legacy };
  }
  const lit = state.litEnemyIds.includes(targetId) || state.litTentacleIds.includes(targetId);
  const bonus = barrage.damageBonus + airBonus + (lit ? barrage.litDamageBonus : 0);
  return { health: 1 + common + manualBonus + Math.min(barrage.damageBonusCap, bonus),
    armor: 1 + common + manualBonus + Math.min(barrage.damageBonusCap, bonus + barrage.armorDamageBonus) };
}
