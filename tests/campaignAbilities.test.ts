import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ABILITY_DRAFT, type CampaignAbilityDraftId, type CampaignAbilityNodeId } from '../src/content/campaignAbilityDraft';
import { ABILITY_BASE_RULES } from '../src/content/campaignAbilityBalance';
import { ABILITY_PRICES } from '../src/content/campaignAbilityEconomy';
import { calculateCandidateAbility, candidateAbilityAvailability, candidateAbilityCost } from '../src/progression/campaignAbilities';

const all = CAMPAIGN_ABILITY_DRAFT.map(node => node.id);
const branch = (id: CampaignAbilityDraftId): CampaignAbilityNodeId[] => CAMPAIGN_ABILITY_DRAFT.filter(node => node.abilityId === id).map(node => node.id);

describe('candidate ability progression without live purchases', () => {
  it('requires an opening and counts only the selected ability even if all four are owned', () => {
    expect(calculateCandidateAbility('overload', [])).toBeNull();
    expect(calculateCandidateAbility('overload', branch('seal'))).toBeNull();
    for (const id of ['overload', 'seal', 'barrage', 'bastion'] as const) {
      expect(calculateCandidateAbility(id, [`ability-${id}-unlock`])).toEqual(ABILITY_BASE_RULES[id]);
      expect(calculateCandidateAbility(id, all)).toEqual(calculateCandidateAbility(id, branch(id)));
    }
  });

  it('adds deltas once, is purchase-order independent and leaves source rules unchanged', () => {
    const before = structuredClone(ABILITY_BASE_RULES);
    const forward = calculateCandidateAbility('overload', all)!;
    expect(forward.damageBonus).toBeCloseTo(.55);
    expect(forward.durationSeconds).toBe(6);
    expect(forward.cooldownSeconds).toBe(20);
    expect(forward.turnSpeedBonus).toBeCloseTo(.35);
    expect(calculateCandidateAbility('overload', [...all].reverse())).toEqual(forward);
    (forward as { durationSeconds: number }).durationSeconds = 999;
    expect(ABILITY_BASE_RULES).toEqual(before);
    expect(calculateCandidateAbility('overload', all)!.durationSeconds).toBe(6);
  });

  it('rejects unknown, duplicate and missing prerequisite purchases rather than granting bonuses', () => {
    expect(() => calculateCandidateAbility('overload', ['not-an-id' as CampaignAbilityNodeId])).toThrow(/Unknown/);
    expect(() => calculateCandidateAbility('overload', ['ability-overload-unlock', 'ability-overload-unlock'])).toThrow(/Duplicate/);
    expect(() => calculateCandidateAbility('overload', ['ability-overload-power-1'])).toThrow(/prerequisite/);
    expect(() => calculateCandidateAbility('overload', ['ability-overload-unlock', 'ability-overload-power-2'])).toThrow(/prerequisite/);
  });

  it('distinguishes chapter, dependency and currency shortage without changing the wallet', () => {
    const price = ABILITY_PRICES.find(node => node.id === 'ability-overload-guidance')!;
    const owned: CampaignAbilityNodeId[] = ['ability-overload-unlock'];
    const wallet = { chapter: price.chapter, shards: price.shards - 1, pearls: price.pearls - 1 };
    const before = structuredClone(wallet);
    expect(candidateAbilityAvailability(price.id, owned, wallet)).toEqual({ status: 'insufficient', missingShards: 1, missingPearls: 1 });
    expect(candidateAbilityAvailability(price.id, [], { ...wallet, shards: 10000, pearls: 10000 }).status).toBe('requires');
    expect(candidateAbilityAvailability(price.id, owned, { ...wallet, chapter: 1, shards: 10000, pearls: 10000 }).status).toBe('chapter');
    expect(candidateAbilityAvailability(price.id, owned, { ...wallet, shards: price.shards, pearls: price.pearls }).status).toBe('available');
    expect(candidateAbilityAvailability(price.id, [...owned, price.id], wallet).status).toBe('purchased');
    expect(wallet).toEqual(before);
    expect(owned).toEqual(['ability-overload-unlock']);
  });

  it('requires no pearl to unlock or buy power I, while optional leaves consume both currencies', () => {
    const opening: CampaignAbilityNodeId[] = ['ability-overload-unlock', 'ability-overload-power-1'];
    expect(candidateAbilityCost(opening)).toEqual({ shards: 110, pearls: 0 });
    expect(candidateAbilityCost([...opening, 'ability-overload-guidance']).pearls).toBe(2);
    expect(candidateAbilityCost(all).pearls).toBe(12);
    expect(() => candidateAbilityCost([...opening, opening[0]!])).toThrow(/Duplicate/);
  });

  it.each([{ chapter: 0, shards: 0, pearls: 0 }, { chapter: 8, shards: 0, pearls: 0 },
    { chapter: 2, shards: NaN, pearls: 0 }, { chapter: 2, shards: 100, pearls: -.1 }])('rejects invalid budget %j', wallet => {
    expect(() => candidateAbilityAvailability('ability-overload-unlock', [], wallet)).toThrow(/budget/);
  });
});
