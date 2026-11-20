import type { CampaignMapDraftId } from '../content/campaignFoundationDraft';
import type { campaignChapterIntro } from '../content/campaignIntros';
import type { CampaignRewardDefinition, CampaignRewardId } from '../content/campaignRewards';
import type { CampaignPurchaseView } from '../progression/campaignProgression';
import type { CampaignAbilityId, CampaignIntroId, CampaignRewardLedger, CampaignRewardOperation, CampaignRewardRequest } from './campaignProfileTypes';

type CampaignIntro = NonNullable<ReturnType<typeof campaignChapterIntro>>;
export type RewardPreviewDecision = 'confirmed' | 'dismissed' | 'unavailable';

export type CampaignRewardUnavailableReason = 'active-attempt' | 'pending-operation' | 'chapter-locked'
  | 'warden-required' | 'already-unlocked' | 'global-limit' | 'category-limit' | 'balance-limit';

export interface CampaignRewardOffer {
  request: CampaignRewardRequest;
  amount: number;
  remainingGlobal: number;
  remainingCategory: number;
  unavailableReason: CampaignRewardUnavailableReason | null;
}

export type CampaignRewardCollectionItem = CampaignRewardDefinition & {
  id: CampaignRewardId;
  unlocked: boolean;
  collectionPoints: number;
  requiredPoints: number;
  canClaimOrdinary: boolean;
  collectionAvailable: boolean;
};

export interface CampaignGameView {
  mapId: CampaignMapDraftId;
  purchases: readonly CampaignPurchaseView[];
  selectedAbilityId: CampaignAbilityId | null;
  abilities: { id: CampaignAbilityId; ru: string; en: string; available: boolean }[];
  intro: CampaignIntro | null;
  seenIntroIds: readonly CampaignIntroId[];
  rewards: {
    testAvailable: boolean;
    currency: readonly [CampaignRewardOffer, CampaignRewardOffer];
    collection: readonly (CampaignRewardCollectionItem & { offer: CampaignRewardOffer })[];
    equipped: Readonly<CampaignRewardLedger['equipped']>;
    pending: CampaignRewardOperation | null;
    refreshInMs: number | null;
    notice?: RewardPreviewDecision;
  };
}
