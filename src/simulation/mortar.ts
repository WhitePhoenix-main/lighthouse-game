import { isLandPoint as terrainIsLandPoint } from '../content/terrain';
import type { BarrageAbilityRules } from '../abilityRules';
import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { bossIntersects, damageBoss } from './boss';
import { barrageDamageMultipliers, damageEnemy } from './devices';
import { emitCombatEvent } from './events';

const EPSILON = 1e-9;

/** Resolve immutable aimed shots first, then launch new shots in stable device order. */
export function updateMortars(state: BattleState, config: NightConfig): void {
  const due = state.mortarProjectiles.filter(shot => shot.impactTick <= state.tick).sort((a, b) => a.id - b.id);
  state.mortarProjectiles = state.mortarProjectiles.filter(shot => shot.impactTick > state.tick);
  for (const shot of due) {
    emitCombatEvent(state, { type: 'mortar-impact', deviceId: shot.deviceId, radius: shot.blastRadius, x: shot.x, y: shot.y });
    for (const enemy of [...state.enemies].sort((a, b) => a.id - b.id)) {
      if (enemy.health <= 0 || enemy.kind === 'bat' || (shot.barrage && !isLandPoint(config, enemy))) continue;
      if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) <= shot.blastRadius + config.enemies[enemy.kind].radius + EPSILON) {
        const modifiers = barrageDamageMultipliers(state, config, enemy.id, shot.barrage);
        const armorRatio = modifiers.armor === modifiers.health ? 1 : modifiers.armor / modifiers.health;
        damageEnemy(enemy, shot.damage * modifiers.health, state, shot.armorMultiplier * armorRatio);
      }
    }
    // Tentacles are hit zones belonging to one health owner, not separate splash victims.
    const hitZones = state.boss?.tentacles.filter(zone => (!shot.barrage || isLandPoint(config, zone))
      && Math.hypot(zone.x - shot.x, zone.y - shot.y) <= shot.blastRadius + (config.boss?.radius ?? 0) + EPSILON) ?? [];
    if (bossIntersects(state, config, shot.x, shot.y, shot.blastRadius) && (!shot.barrage || hitZones.length > 0)) {
      const litZone = hitZones.find(zone => state.litTentacleIds.includes(zone.id));
      const modifiers = barrageDamageMultipliers(state, config, litZone?.id ?? Number.NaN, shot.barrage);
      damageBoss(state, shot.damage * modifiers.health, { x: shot.x, y: shot.y });
    }
  }

  for (const mortar of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (mortar.kind !== 'mortar' || mortar.health <= 0 || mortar.consumed
      || state.tick < (mortar.suppressedUntilTick ?? 0)) continue;
    const zones = state.boss && state.boss.health > 0 ? state.boss.tentacles.map(zone => ({ ...zone, health: state.boss!.health, armor: 0 })) : [];
    const candidates = [...state.enemies.filter(enemy => enemy.health > 0 && enemy.kind !== 'bat'), ...zones];
    const manual = candidates.find(target => target.id === mortar.targetId);
    if (!manual) mortar.targetId = null;
    if (mortar.attackCooldown > EPSILON) continue;
    const definition = config.devices.definitions.mortar;
    const available = candidates.filter(target => (!manual || target.id === manual.id)
      && Math.hypot(target.x - mortar.x, target.y - mortar.y) <= definition.range + EPSILON);
    const score = (target: typeof candidates[number]): number => mortar.priority === 'strongest' ? -(target.health + target.armor)
      : mortar.priority === 'weakest' ? target.health + target.armor : Math.hypot(target.x - mortar.x, target.y - mortar.y);
    available.sort((a, b) => score(a) - score(b) || a.id - b.id);
    const target = available[0];
    if (!target) continue;
    launchMortar(state, config, mortar, target);
  }
}

export function isLandPoint(config: NightConfig, point: { x: number; y: number }): boolean {
  return terrainIsLandPoint(config.terrain, point);
}

/** A projectile freezes launch stats, while illumination is evaluated at impact. */
export function launchMortar(state: BattleState, config: NightConfig, mortar: DeviceState,
  target: { x: number; y: number }, barrage?: BarrageAbilityRules): boolean {
  if (mortar.kind !== 'mortar' || mortar.health <= 0 || mortar.consumed
    || state.tick < (mortar.suppressedUntilTick ?? 0) || (barrage && !isLandPoint(config, target))) return false;
  const definition = config.devices.definitions.mortar;
  const distance = Math.hypot(target.x - mortar.x, target.y - mortar.y);
  if (distance > definition.range + EPSILON) return false;
  const rules = config.devices.mortar;
  const speed = rules.projectileSpeed * (1 + (barrage?.projectileSpeedBonus ?? 0));
  const flightTicks = Math.max(1, Math.ceil(distance / speed / config.stepSeconds - EPSILON));
  state.mortarProjectiles.push({ id: state.nextProjectileId++, deviceId: mortar.id, fromX: mortar.x, fromY: mortar.y,
    x: target.x, y: target.y, launchTick: state.tick, impactTick: state.tick + flightTicks,
    damage: definition.damage, blastRadius: rules.blastRadius * (1 + (barrage?.blastRadiusBonus ?? 0)), armorMultiplier: rules.armorMultiplier,
    ...(barrage ? { barrage: { damageBonus: barrage.damageBonus, armorDamageBonus: barrage.armorDamageBonus,
      litDamageBonus: barrage.litDamageBonus, damageBonusCap: barrage.damageBonusCap } } : {}) });
  mortar.attackCooldown = definition.attackInterval;
  mortar.lastShot = { tick: state.tick, x: target.x, y: target.y };
  return true;
}
