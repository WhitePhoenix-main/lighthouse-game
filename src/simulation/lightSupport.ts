import type { BattleState, NightConfig } from '../contracts';
import { activeOverload } from './abilityEffects';

export function finishingLightMultiplier(config: NightConfig, health: number, maximum: number): number {
  return health > 0 && health < maximum * .25 ? 1 + (config.progression?.beamExecuteBonus ?? 0) : 1;
}

/** Selected zones only; mortar checks illumination at impact, not at launch. */
export function lightGuidanceMultiplier(state: BattleState, config: NightConfig, id: number): number {
  return state.litEnemyIds.includes(id) || state.litTentacleIds.includes(id)
    ? 1 + (config.progression?.litDeviceDamageBonus ?? 0) + (activeOverload(state, config)?.guidanceDamageBonus ?? 0) : 1;
}

export function overloadGuidanceBonus(state: BattleState, config: NightConfig, id: number): number {
  return state.litEnemyIds.includes(id) || state.litTentacleIds.includes(id)
    ? activeOverload(state, config)?.guidanceDamageBonus ?? 0 : 0;
}
