import type { BattleState, NightConfig } from '../contracts';
import { bossIntersects, damageBoss } from './boss';
import { damageEnemy } from './devices';
import { emitCombatEvent } from './events';

const EPSILON = 1e-9;

/** Resolve immutable aimed shots first, then launch new shots in stable device order. */
export function updateMortars(state: BattleState, config: NightConfig): void {
  const due = state.mortarProjectiles.filter(shot => shot.impactTick <= state.tick).sort((a, b) => a.id - b.id);
  state.mortarProjectiles = state.mortarProjectiles.filter(shot => shot.impactTick > state.tick);
  for (const shot of due) {
    emitCombatEvent(state, { type: 'mortar-impact', deviceId: shot.deviceId, radius: shot.blastRadius, x: shot.x, y: shot.y });
    for (const enemy of [...state.enemies].sort((a, b) => a.id - b.id)) {
      if (enemy.health <= 0 || enemy.kind === 'bat') continue;
      if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) <= shot.blastRadius + config.enemies[enemy.kind].radius + EPSILON) {
        damageEnemy(enemy, shot.damage, state, shot.armorMultiplier);
      }
    }
    // Tentacles are hit zones belonging to one health owner, not separate splash victims.
    if (bossIntersects(state, config, shot.x, shot.y, shot.blastRadius)) damageBoss(state, shot.damage, { x: shot.x, y: shot.y });
  }

  for (const mortar of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (mortar.kind !== 'mortar' || mortar.health <= 0 || mortar.consumed) continue;
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
    const rules = config.devices.mortar;
    const distance = Math.hypot(target.x - mortar.x, target.y - mortar.y);
    const flightTicks = Math.max(1, Math.ceil(distance / rules.projectileSpeed / config.stepSeconds - EPSILON));
    state.mortarProjectiles.push({ id: state.nextProjectileId++, deviceId: mortar.id, fromX: mortar.x, fromY: mortar.y,
      x: target.x, y: target.y, launchTick: state.tick, impactTick: state.tick + flightTicks,
      damage: definition.damage, blastRadius: rules.blastRadius, armorMultiplier: rules.armorMultiplier });
    mortar.attackCooldown = definition.attackInterval;
    mortar.lastShot = { tick: state.tick, x: target.x, y: target.y };
  }
}
