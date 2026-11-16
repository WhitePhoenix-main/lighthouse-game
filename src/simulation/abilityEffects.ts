import type { BattleState, NightConfig } from '../contracts';
import type { BastionAbilityRules, OverloadAbilityRules } from '../abilityRules';

export const abilityTicks = (seconds: number, config: NightConfig): number => Math.ceil(seconds / config.stepSeconds - 1e-9);

export function activeOverload(state: BattleState, config: NightConfig): OverloadAbilityRules | null {
  return config.ability?.abilityId === 'overload' && state.ability?.id === 'overload'
    && state.tick < state.ability.activeUntilTick ? config.ability : null;
}

export function activeBastion(state: BattleState, config: NightConfig): { rules: BastionAbilityRules; fading: boolean } | null {
  if (config.ability?.abilityId !== 'bastion' || state.ability?.id !== 'bastion') return null;
  if (state.tick < state.ability.activeUntilTick) return { rules: config.ability, fading: false };
  return state.tick < state.ability.fadeUntilTick ? { rules: config.ability, fading: true } : null;
}

/** One receiving layer; preserve earlier protection even if it already exceeds the new cap. */
export function bastionDamage(state: BattleState, config: NightConfig, raw: number, existing: number,
  receiver: 'lighthouse' | 'device' | 'field', heavy = false): number {
  const active = activeBastion(state, config);
  if (!active || raw <= 0) return existing;
  const rules = active.rules;
  const reduction = active.fading ? rules.fadeReduction
    : rules.damageReduction + (receiver === 'device' ? rules.mechanismReduction : 0) + (heavy ? rules.heavyReduction : 0);
  return Math.min(existing, Math.max(raw * (1 - rules.totalReductionCap),
    existing * (1 - Math.min(rules.abilityReductionCap, reduction))));
}

export function overloadBeamMultipliers(state: BattleState, config: NightConfig, commonMultiplier: number): { health: number; armor: number } {
  const active = activeOverload(state, config);
  if (!active) return { health: commonMultiplier, armor: commonMultiplier };
  return { health: commonMultiplier + Math.min(active.damageBonusCap, active.damageBonus),
    armor: commonMultiplier + Math.min(active.damageBonusCap, active.damageBonus + active.armorDamageBonus) };
}
