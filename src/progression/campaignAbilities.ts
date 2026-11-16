import { CAMPAIGN_ABILITY_DRAFT, type CampaignAbilityDraftId, type CampaignAbilityNodeId } from '../content/campaignAbilityDraft';
import { ABILITY_BASE_RULES, ABILITY_NUMERIC_NODES, validateCampaignAbilityBalance } from '../content/campaignAbilityBalance';
import { ABILITY_PRICES, validateCampaignAbilityEconomy } from '../content/campaignAbilityEconomy';
import type { CampaignAbilityRulesById } from '../content/campaignAbilityBalanceTypes';

validateCampaignAbilityBalance();
validateCampaignAbilityEconomy();

/** Stage A calculations only; never writes a profile or purchases a live upgrade. */
export function validateCandidateAbilityPurchases(ids: readonly CampaignAbilityNodeId[]): void {
  const owned = new Set<string>(ids);
  if (owned.size !== ids.length) throw new Error('Duplicate candidate ability purchase');
  for (const id of ids) {
    const node = CAMPAIGN_ABILITY_DRAFT.find(node => node.id === id);
    if (!node) throw new Error(`Unknown candidate ability purchase: ${id}`);
    if (node.requires.some(requirement => !owned.has(requirement))) throw new Error(`Missing candidate ability prerequisite: ${id}`);
  }
}

export function calculateCandidateAbility<A extends CampaignAbilityDraftId>(
  abilityId: A, purchased: readonly CampaignAbilityNodeId[],
): CampaignAbilityRulesById[A] | null {
  validateCandidateAbilityPurchases(purchased);
  if (!Object.hasOwn(ABILITY_BASE_RULES, abilityId)) throw new Error(`Unknown candidate ability: ${abilityId}`);
  if (!purchased.includes(`ability-${abilityId}-unlock`)) return null;
  const result = structuredClone(ABILITY_BASE_RULES[abilityId]);
  // Only known, validated numeric deltas of the selected ability reach this copy.
  const numeric = result as unknown as Record<string, number>;
  for (const node of ABILITY_NUMERIC_NODES) {
    if (node.abilityId !== abilityId || !purchased.includes(node.id)) continue;
    for (const adjustment of node.adjustments) numeric[adjustment.stat] = numeric[adjustment.stat]! + adjustment.amount;
  }
  return result;
}

export function candidateAbilityCost(purchased: readonly CampaignAbilityNodeId[]): { shards: number; pearls: number } {
  validateCandidateAbilityPurchases(purchased);
  return purchased.reduce((sum, id) => {
    const price = ABILITY_PRICES.find(price => price.id === id)!;
    return { shards: sum.shards + price.shards, pearls: sum.pearls + price.pearls };
  }, { shards: 0, pearls: 0 });
}

export interface CandidateAbilityWallet { readonly chapter: number; readonly shards: number; readonly pearls: number }
export interface CandidateAbilityAvailability {
  readonly status: 'purchased' | 'chapter' | 'requires' | 'insufficient' | 'available';
  readonly missingShards: number;
  readonly missingPearls: number;
}

export function candidateAbilityAvailability(id: CampaignAbilityNodeId, purchased: readonly CampaignAbilityNodeId[],
  wallet: CandidateAbilityWallet): CandidateAbilityAvailability {
  validateCandidateAbilityPurchases(purchased);
  if (!Number.isSafeInteger(wallet.chapter) || wallet.chapter < 1 || wallet.chapter > 7
    || !Number.isSafeInteger(wallet.shards) || wallet.shards < 0 || !Number.isSafeInteger(wallet.pearls) || wallet.pearls < 0)
    throw new Error('Invalid candidate ability budget');
  const node = CAMPAIGN_ABILITY_DRAFT.find(node => node.id === id);
  const price = ABILITY_PRICES.find(price => price.id === id);
  if (!node || !price) throw new Error(`Unknown candidate ability purchase: ${id}`);
  if (purchased.includes(id)) return { status: 'purchased', missingShards: 0, missingPearls: 0 };
  if (wallet.chapter < price.chapter) return { status: 'chapter', missingShards: 0, missingPearls: 0 };
  if (node.requires.some(requirement => !purchased.includes(requirement))) return { status: 'requires', missingShards: 0, missingPearls: 0 };
  const missingShards = Math.max(0, price.shards - wallet.shards), missingPearls = Math.max(0, price.pearls - wallet.pearls);
  return { status: missingShards || missingPearls ? 'insufficient' : 'available', missingShards, missingPearls };
}
