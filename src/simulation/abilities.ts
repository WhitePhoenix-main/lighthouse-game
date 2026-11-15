import type { BattleState, NightConfig } from '../contracts';
import { bossIntersects, damageBoss } from './boss';
import { damageEnemy } from './devices';
import { emitCombatEvent } from './events';
import { applyRadialEffect } from './radialEffect';

export function useFlash(state: BattleState, config: NightConfig): void {
  if (config.flash.enabled === false || state.flash.cooldownRemaining > 1e-9) return;
  state.flash.cooldownRemaining = Math.ceil(config.flash.cooldown / config.stepSeconds - 1e-9) * config.stepSeconds;
  state.flash.lastUsedTick = state.tick;
  emitCombatEvent(state, { type: 'flash-used', x: 0, y: 0 });
  if (bossIntersects(state, config, 0, 0, config.flash.radius)) {
    damageBoss(state, config.flash.damage, state.boss!.tentacles.find(zone => Math.hypot(zone.x, zone.y) <= config.flash.radius + config.boss!.radius + 1e-9)!);
    state.boss!.stunnedUntilTick = Math.max(state.boss!.stunnedUntilTick, state.tick + Math.ceil(config.flash.stunDuration / config.stepSeconds - 1e-9));
    emitCombatEvent(state, { type: 'boss-stunned', x: 0, y: 0 });
  }
  applyRadialEffect(state.enemies.filter(enemy => enemy.health > 0), 0, 0, config.flash.radius,
    enemy => ({ ...enemy, radius: config.enemies[enemy.kind].radius }), enemy => enemy.id,
    enemy => {
      damageEnemy(enemy, config.flash.damage, state);
      enemy.stunnedUntilTick = Math.max(enemy.stunnedUntilTick ?? 0,
        state.tick + Math.ceil(config.flash.stunDuration / config.stepSeconds - 1e-9));
    });
}

export function triggerTraps(state: BattleState, config: NightConfig): void {
  for (const trap of [...state.devices].sort((a, b) => a.id - b.id)) {
    if (trap.kind !== 'light-trap' || trap.health <= 0 || trap.consumed
      || (trap.trapCharges ?? 1) <= 0 || state.tick < (trap.trapReadyTick ?? 0)) continue;
    if (!state.enemies.some(enemy => enemy.health > 0 && Math.hypot(enemy.x - trap.x, enemy.y - trap.y)
      <= config.devices.trap.triggerRadius + config.enemies[enemy.kind].radius + 1e-9) && !bossIntersects(state, config, trap.x, trap.y, config.devices.trap.triggerRadius)) continue;
    // A partial magazine remains a live body while its next charge rearms.
    trap.trapCharges = (trap.trapCharges ?? 1) - 1;
    trap.consumed = trap.trapCharges === 0;
    trap.trapReadyTick = state.tick + Math.ceil(config.devices.trap.rearmSeconds / config.stepSeconds - 1e-9);
    emitCombatEvent(state, { type: 'trap-triggered', deviceId: trap.id, x: trap.x, y: trap.y });
    if (bossIntersects(state, config, trap.x, trap.y, config.devices.trap.blastRadius)) damageBoss(state, config.devices.trap.damage, trap);
    applyRadialEffect(state.enemies.filter(enemy => enemy.health > 0), trap.x, trap.y, config.devices.trap.blastRadius,
      enemy => ({ ...enemy, radius: config.enemies[enemy.kind].radius }), enemy => enemy.id,
      enemy => damageEnemy(enemy, config.devices.trap.damage, state, config.devices.trap.armorMultiplier));
  }
}
