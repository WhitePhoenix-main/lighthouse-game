import { describe, expect, it } from 'vitest';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import type { CampaignProfile, CampaignRewardRequest } from '../src/application/campaignProfileTypes';
import { abandonCampaignReward, campaignRewardCollection, campaignRewardLedger, campaignRewardOffer, claimCampaignReward, confirmCampaignReward,
  equipCampaignCosmetic, prepareCampaignReward } from '../src/application/campaignRewards';
import { CAMPAIGN_CHAPTER_DRAFT, CAMPAIGN_STORY_DRAFT, type CampaignStoryDraftNightId } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_REWARD_WINDOW_MS } from '../src/content/campaignRewards';

const shards = { kind: 'shards' } as const;
const pearl = { kind: 'pearl' } as const;
const siege = { kind: 'collection', rewardId: 'siege-cannon' } as const;
const moonbeam = { kind: 'collection', rewardId: 'moonbeam' } as const;
const start = 100_000_000;
const day = CAMPAIGN_REWARD_WINDOW_MS;

function wonThrough(id: CampaignStoryDraftNightId): CampaignProfile {
  const wins = CAMPAIGN_STORY_DRAFT.slice(0, CAMPAIGN_STORY_DRAFT.findIndex(night => night.id === id) + 1).map(night => night.id);
  return { ...emptyCampaignProfile(), wonNightIds: wins, completedNights: wins.length };
}

function earn(profile: CampaignProfile, id: string, request: CampaignRewardRequest, now: number): CampaignProfile {
  return confirmCampaignReward(prepareCampaignReward(profile, id, campaignRewardOffer(profile, request, now), now), id, now);
}

describe('campaign reward offers and collection', () => {
  it('quotes the provisional chapter amount even with an earlier night selected', () => {
    const amounts = [10, 15, 25, 34, 45, 60, 75];
    const replayBudgets = [80, 115, 170, 230, 310, 400, 520];
    for (const [index, amount] of amounts.entries()) {
      const profile = index === 0 ? emptyCampaignProfile() : wonThrough(CAMPAIGN_CHAPTER_DRAFT[index - 1]!.bossId);
      expect(campaignRewardOffer(profile, shards, start)).toMatchObject({ request: shards, amount, unavailableReason: null });
      expect(2 * amount).toBeLessThanOrEqual(0.3 * replayBudgets[index]!);
    }
    const before = emptyCampaignProfile();
    const stale = campaignRewardOffer(before, shards, start);
    expect(() => prepareCampaignReward(wonThrough('abyss-warden'), 'stale', stale, start)).toThrow('изменилось');
  });

  it('opens pearl after the Warden and enforces category and global caps at the rolling boundary', () => {
    const locked = wonThrough('misty-shore-05');
    const unavailable = campaignRewardOffer(locked, pearl, start);
    expect(unavailable.unavailableReason).toBe('warden-required');
    expect(() => prepareCampaignReward(locked, 'pearl-locked', unavailable, start)).toThrow('недоступно');
    let profile = wonThrough('abyss-warden');
    profile = earn(profile, 'first-shards', shards, start);
    profile = earn(profile, 'second-shards', shards, start + 10);
    expect(campaignRewardOffer(profile, shards, start + 20)).toMatchObject({ remainingGlobal: 1,
      remainingCategory: 0, unavailableReason: 'category-limit' });
    profile = earn(profile, 'pearl', pearl, start + 20);
    expect(profile).toMatchObject({ shards: 30, pearls: 1, wonNightIds: wonThrough('abyss-warden').wonNightIds,
      selectedLensId: 'basic', selectedNightId: 'first-light' });
    expect(campaignRewardOffer(profile, moonbeam, start + day - 1)).toMatchObject({ remainingGlobal: 0,
      remainingCategory: 2, unavailableReason: 'global-limit' });
    expect(campaignRewardOffer(profile, shards, start + day)).toMatchObject({ remainingGlobal: 1,
      remainingCategory: 1, unavailableReason: null });
    expect(campaignRewardOffer(profile, pearl, start + day + 19).unavailableReason).toBe('category-limit');
    expect(campaignRewardOffer(profile, pearl, start + day + 20).unavailableReason).toBeNull();
    expect(campaignRewardOffer(profile, shards, start - day).remainingGlobal).toBe(0);
    expect(() => campaignRewardOffer(profile, shards, Infinity)).toThrow('время');
  });

  it('charges the rolling window at confirmation, keeping the explicitly quoted amount', () => {
    const initial = emptyCampaignProfile();
    const pending = prepareCampaignReward(initial, 'delayed', campaignRewardOffer(initial, shards, start), start);
    const progressed = { ...pending, wonNightIds: wonThrough('abyss-warden').wonNightIds, completedNights: 6 };
    const confirmed = confirmCampaignReward(progressed, 'delayed', start + day);
    expect(confirmed.shards).toBe(10);
    expect(campaignRewardOffer(confirmed, shards, start + day)).toMatchObject({ amount: 15, remainingCategory: 1 });
    expect(decodeCampaignProfile(JSON.stringify(confirmed))).toEqual(confirmed);
    expect(campaignRewardLedger(confirmCampaignReward(pending, 'delayed', start - 1)).operations[0]).toMatchObject({ confirmedAt: start });
  });

  it('accumulates a point for only the selected reward and unlocks a variant on point three', () => {
    expect(campaignRewardOffer(wonThrough('thorn-marsh-07'), siege, start).unavailableReason).toBe('chapter-locked');
    const baseline = wonThrough('marsh-heart');
    let profile = earn(baseline, 'siege-1', siege, start);
    profile = earn(profile, 'other', moonbeam, start);
    expect(campaignRewardOffer(profile, siege, start).unavailableReason).toBe('category-limit');
    expect(campaignRewardLedger(profile).collectionPoints).toEqual({ 'siege-cannon': 1, moonbeam: 1 });
    profile = earn(profile, 'siege-2', siege, start + day);
    profile = earn(profile, 'siege-3', siege, start + day);
    expect(profile.rewards).toMatchObject({ unlockedIds: ['siege-cannon'], collectionPoints: { 'siege-cannon': 3, moonbeam: 1 } });
    expect(profile).toMatchObject({ inventory: baseline.inventory, layouts: baseline.layouts, nextDeviceId: baseline.nextDeviceId,
      shards: baseline.shards, pearls: baseline.pearls });
    expect(campaignRewardOffer(profile, siege, start + 2 * day).unavailableReason).toBe('already-unlocked');
    expect(decodeCampaignProfile(JSON.stringify(profile))).toEqual(profile);
    const { wonNightIds, completedNights } = wonThrough('ashen-cliffs-03');
    const later = { ...profile, wonNightIds, completedNights };
    expect(claimCampaignReward(later, 'siege-cannon')).toBe(later);
  });

  it('claims only after saved victories and equips only an unlocked cosmetic in its slot', () => {
    const profile = wonThrough('ashen-cliffs-03');
    const pending = prepareCampaignReward(profile, 'siege-ad', campaignRewardOffer(profile, siege, start), start);
    const claimed = claimCampaignReward(pending, 'siege-cannon');
    expect(claimCampaignReward(claimed, 'siege-cannon')).toBe(claimed);
    expect(confirmCampaignReward(claimed, 'siege-ad', start)).toBe(claimed);
    expect(claimed.rewards).toMatchObject({ unlockedIds: ['siege-cannon'], collectionPoints: {}, operations: [{ status: 'abandoned' }] });
    expect(claimed).toMatchObject({ inventory: profile.inventory, shards: profile.shards, pearls: profile.pearls, nextDeviceId: profile.nextDeviceId });
    expect(campaignRewardCollection(claimed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'siege-cannon', unlocked: true, canClaimOrdinary: false }),
      expect.objectContaining({ id: 'long-harpoon', unlocked: false, canClaimOrdinary: false }),
      expect.objectContaining({ id: 'moonbeam', unlocked: false, canClaimOrdinary: true, ordinaryVictoryNightId: 'marsh-heart' }),
    ]));
    expect(() => claimCampaignReward(claimed, 'long-harpoon')).toThrow('победа');
    expect(() => equipCampaignCosmetic(claimed, 'beam', 'moonbeam')).toThrow('не открыто');
    const cosmetic = claimCampaignReward(claimed, 'moonbeam');
    expect(() => equipCampaignCosmetic(cosmetic, 'beacon', 'moonbeam')).toThrow('ячейки');
    const equipped = equipCampaignCosmetic(cosmetic, 'beam', 'moonbeam');
    expect(campaignRewardLedger(decodeCampaignProfile(JSON.stringify(equipped))).equipped).toEqual({ beam: 'moonbeam' });
    expect(campaignRewardLedger(equipCampaignCosmetic(equipped, 'beam', null)).equipped).toEqual({});
  });

  it('treats dismissals as terminal and does not spend a slot or pay a late callback', () => {
    const profile = emptyCampaignProfile();
    const offer = campaignRewardOffer(profile, shards, start);
    expect(profile.rewards).toBeUndefined();
    const prepared = prepareCampaignReward(profile, 'discard', offer, start);
    expect(prepareCampaignReward(prepared, 'discard', offer, start + 15)).toBe(prepared);
    expect(() => prepareCampaignReward(prepared, 'discard', campaignRewardOffer(profile, moonbeam, start), start)).toThrow('не совпадает');
    expect(campaignRewardOffer(prepared, moonbeam, start).unavailableReason).toBe('pending-operation');
    const abandoned = abandonCampaignReward(prepared, 'discard');
    expect(confirmCampaignReward(abandoned, 'discard', start)).toBe(abandoned);
    expect(prepareCampaignReward(abandoned, 'discard', offer, start)).toBe(abandoned);
    expect(campaignRewardOffer(abandoned, shards, start)).toMatchObject({ remainingGlobal: 3, remainingCategory: 2, unavailableReason: null });
    expect(abandoned.shards).toBe(0);
  });
});
