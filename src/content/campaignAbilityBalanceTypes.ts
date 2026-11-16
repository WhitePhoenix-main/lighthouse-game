import type { CampaignAbilityDraftId, CampaignAbilityNodeId } from './campaignAbilityDraft';

export type { CommonAbilityRules, OverloadAbilityRules, SealAbilityRules, BarrageAbilityRules, BastionAbilityRules, CampaignAbilityRules, CampaignAbilityRulesById } from '../abilityRules';

export type AbilityNumericStat = 'cooldownSeconds' | 'durationSeconds' | 'damageBonus' | 'turnSpeedBonus'
  | 'armorDamageBonus' | 'guidanceDamageBonus' | 'radius' | 'speedMultiplier' | 'lingeringSeconds'
  | 'entrySeconds' | 'entrySpeedMultiplier' | 'airDamageBonus' | 'blastRadiusBonus'
  | 'projectileSpeedBonus' | 'litDamageBonus' | 'damageReduction' | 'mechanismReduction'
  | 'heavyReduction' | 'fadeSeconds' | 'fadeReduction';
export interface CampaignAbilityNumericNode {
  readonly id: CampaignAbilityNodeId;
  readonly abilityId: CampaignAbilityDraftId;
  readonly balanceStatus: 'provisional';
  /** Additive deltas from purchased nodes; unlock uses the base rules without a second bonus. */
  readonly adjustments: readonly { readonly stat: AbilityNumericStat; readonly amount: number }[];
}
export interface CampaignAbilityPrice {
  readonly id: CampaignAbilityNodeId;
  readonly abilityId: CampaignAbilityDraftId;
  readonly chapter: number;
  readonly shards: number;
  readonly pearls: number;
  readonly currency: 'shards' | 'shards-and-pearls';
  readonly status: 'provisional';
}
