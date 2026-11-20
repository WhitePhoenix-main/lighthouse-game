import type { DeviceDeployment, EnemyKind, LensId, OwnedDevice } from '../contracts';
import type { CampaignAbilityDraftId } from '../content/campaignAbilityDraft';
import type { CAMPAIGN_CHAPTER_DRAFT, CampaignMapDraftId, CampaignStoryDraftNightId } from '../content/campaignFoundationDraft';
import type { CampaignCosmeticId, CampaignCosmeticSlot, CampaignRewardId } from '../content/campaignRewards';

export type CampaignIntroId = (typeof CAMPAIGN_CHAPTER_DRAFT)[number]['introId'];
export type CampaignAbilityId = 'flash' | CampaignAbilityDraftId;
export type CampaignOwnedDevice = Omit<OwnedDevice, 'position'>;

export interface CampaignLayoutEntry {
  deviceId: number;
  x: number;
  y: number;
}

export interface CampaignAttempt {
  id: string;
  seed: number;
  nightId: CampaignStoryDraftNightId;
  mapId: CampaignMapDraftId;
  rulesVersion: string;
  lensId: LensId;
  abilityId: CampaignAbilityId | null;
  /** Health is in the same base units as inventory, before combat upgrades. */
  devices: DeviceDeployment[];
  firstWinShards: number;
  firstWinPearls: number;
}

export interface CampaignSettlement {
  id: string;
  outcome: 'victory' | 'defeat' | 'interrupted';
  shards: number;
  pearls: number;
}

export type CampaignRewardRequest = { kind: 'shards' } | { kind: 'pearl' } | { kind: 'collection'; rewardId: CampaignRewardId };

export type CampaignRewardOperation = {
  id: string;
  request: CampaignRewardRequest;
  amount: number;
  preparedAt: number;
} & ({ status: 'pending' | 'abandoned' } | { status: 'confirmed'; confirmedAt: number });

export interface CampaignRewardLedger {
  operations: CampaignRewardOperation[];
  unlockedIds: CampaignRewardId[];
  collectionPoints: Partial<Record<CampaignRewardId, number>>;
  equipped: Partial<Record<CampaignCosmeticSlot, CampaignCosmeticId>>;
}

export interface CampaignProfile {
  version: 1;
  shards: number;
  pearls: number;
  purchasedNodeIds: string[];
  wonNightIds: CampaignStoryDraftNightId[];
  selectedNightId: CampaignStoryDraftNightId;
  selectedLensId: LensId;
  selectedAbilityId: CampaignAbilityId | null;
  seenIntroIds: CampaignIntroId[];
  nextDeviceId: number;
  inventory: CampaignOwnedDevice[];
  layouts: Partial<Record<CampaignMapDraftId, CampaignLayoutEntry[]>>;
  activeAttempt: CampaignAttempt | null;
  lastSettled: CampaignSettlement | null;
  encountered: EnemyKind[];
  /** Total victories, including replays of previously won nights. */
  completedNights: number;
  rewards?: CampaignRewardLedger;
}
