/** Pure shared ability configuration; no content or platform dependencies. */
export interface CommonAbilityRules {
  readonly cooldownSeconds: number;
  readonly initiallyReady: boolean;
}
export interface OverloadAbilityRules extends CommonAbilityRules {
  readonly abilityId: 'overload';
  readonly durationSeconds: number;
  readonly damageBonus: number;
  readonly turnSpeedBonus: number;
  readonly armorDamageBonus: number;
  readonly guidanceDamageBonus: number;
  readonly damageBonusCap: number;
  readonly turnSpeedBonusCap: number;
}
export interface SealAbilityRules extends CommonAbilityRules {
  readonly abilityId: 'seal';
  readonly durationSeconds: number;
  readonly targetingRange: number;
  readonly radius: number;
  readonly speedMultiplier: number;
  readonly minimumSpeedMultiplier: number;
  readonly lingeringSeconds: number;
  readonly entrySeconds: number;
  readonly entrySpeedMultiplier: number;
}
export interface BarrageAbilityRules extends CommonAbilityRules {
  readonly abilityId: 'barrage';
  readonly targetingRange: number;
  readonly damageBonus: number;
  readonly armorDamageBonus: number;
  readonly airDamageBonus: number;
  readonly blastRadiusBonus: number;
  readonly projectileSpeedBonus: number;
  readonly litDamageBonus: number;
  readonly damageBonusCap: number;
  readonly additionalAttacksPerWeapon: 1;
}
export interface BastionAbilityRules extends CommonAbilityRules {
  readonly abilityId: 'bastion';
  readonly durationSeconds: number;
  readonly damageReduction: number;
  readonly mechanismReduction: number;
  readonly heavyReduction: number;
  readonly fadeSeconds: number;
  readonly fadeReduction: number;
  readonly abilityReductionCap: number;
  readonly totalReductionCap: number;
}
export type CampaignAbilityRules = OverloadAbilityRules | SealAbilityRules | BarrageAbilityRules | BastionAbilityRules;
export interface CampaignAbilityRulesById {
  readonly overload: OverloadAbilityRules;
  readonly seal: SealAbilityRules;
  readonly barrage: BarrageAbilityRules;
  readonly bastion: BastionAbilityRules;
}
