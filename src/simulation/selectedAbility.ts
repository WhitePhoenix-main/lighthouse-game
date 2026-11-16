import type { BattleCommand, BattleState, NightConfig, SelectedAbilityState } from '../contracts';
import { abilityTicks } from './abilityEffects';
import { castSeal } from './seal';
import { castBarrage } from './barrage';
import { emitCombatEvent } from './events';

export function createSelectedAbility(config: NightConfig): SelectedAbilityState | undefined {
  const rules = config.ability;
  return rules ? { id: rules.abilityId, readyTick: rules.initiallyReady ? 0 : abilityTicks(rules.cooldownSeconds, config),
    activeUntilTick: 0, fadeUntilTick: 0, nextCastId: 1 } : undefined;
}

export function useSelectedAbility(state: BattleState, config: NightConfig,
  command: Extract<BattleCommand, { type: 'use-ability' }>): boolean {
  const rules = config.ability, ability = state.ability;
  if (state.outcome !== 'playing' || !rules || !ability || ability.id !== rules.abilityId || state.tick < ability.readyTick) return false;
  let position = { x: 0, y: 0 };
  if (rules.abilityId === 'seal') {
    if (!command.target || !castSeal(state, config, command.target)) return false;
    position = { x: command.target.x, y: command.target.y };
  } else if (rules.abilityId === 'barrage') {
    const target = command.target;
    if (target) {
      const anchored = target.enemyId === undefined ? target
        : state.enemies.find(enemy => enemy.id === target.enemyId)
          ?? state.boss?.tentacles.find(zone => zone.id === target.enemyId);
      if (anchored) position = { x: anchored.x, y: anchored.y };
    }
    if (!command.target || !castBarrage(state, config, command.target)) return false;
  }
  const duration = 'durationSeconds' in rules ? abilityTicks(rules.durationSeconds, config) : 0;
  ability.activeUntilTick = state.tick + duration;
  ability.fadeUntilTick = ability.activeUntilTick + (rules.abilityId === 'bastion' ? abilityTicks(rules.fadeSeconds, config) : 0);
  ability.readyTick = state.tick + abilityTicks(rules.cooldownSeconds, config);
  emitCombatEvent(state, { type: 'ability-used', abilityId: rules.abilityId,
    x: position.x, y: position.y });
  return true;
}
