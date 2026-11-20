import type { CampaignStoryDraftNightId } from './campaignFoundationDraft';

// Provisional Stage G limits for the test reward flow.
export const CAMPAIGN_REWARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CAMPAIGN_REWARD_GLOBAL_CAP = 3;
export const CAMPAIGN_REWARD_CATEGORY_CAP = { shards: 2, pearl: 1, collection: 2 } as const;
export const CAMPAIGN_SHARD_REWARD_AMOUNTS = [10, 15, 25, 34, 45, 60, 75] as const;
export const CAMPAIGN_FIXED_REWARD_AMOUNTS = { pearl: 1, collection: 1 } as const;
export const CAMPAIGN_PEARL_REWARD_WIN = 'abyss-warden';
export const CAMPAIGN_COLLECTION_REWARD_POINTS = 3;

export const CAMPAIGN_COSMETIC_SLOTS = ['beacon', 'devices', 'beam'] as const;
export type CampaignCosmeticSlot = (typeof CAMPAIGN_COSMETIC_SLOTS)[number];

export type CampaignRewardDefinition = {
  title: { ru: string; en: string };
  ordinaryVictoryNightId: CampaignStoryDraftNightId;
  minimumChapter: number;
} & ({ type: 'variant' } | { type: 'cosmetic'; slot: CampaignCosmeticSlot });

export const CAMPAIGN_REWARD_CATALOG = {
  'siege-cannon': { type: 'variant', minimumChapter: 4, ordinaryVictoryNightId: 'ashen-cliffs-03',
    title: { ru: 'Осадная пушка', en: 'Siege cannon' } },
  'long-harpoon': { type: 'variant', minimumChapter: 4, ordinaryVictoryNightId: 'ashen-cliffs-06',
    title: { ru: 'Дальний гарпун', en: 'Long-range harpoon' } },
  'dawn-beacon': { type: 'cosmetic', slot: 'beacon', minimumChapter: 1, ordinaryVictoryNightId: 'fog-heart',
    title: { ru: 'Маяк рассвета', en: 'Dawn beacon' } },
  'bronze-devices': { type: 'cosmetic', slot: 'devices', minimumChapter: 1, ordinaryVictoryNightId: 'evening-knell',
    title: { ru: 'Бронзовые устройства', en: 'Bronze devices' } },
  'moonbeam': { type: 'cosmetic', slot: 'beam', minimumChapter: 1, ordinaryVictoryNightId: 'marsh-heart',
    title: { ru: 'Лунный луч', en: 'Moonbeam' } },
} as const satisfies Record<string, CampaignRewardDefinition>;

type RewardCatalog = typeof CAMPAIGN_REWARD_CATALOG;
export type CampaignRewardId = keyof RewardCatalog;
export type CampaignCosmeticId = { [Id in CampaignRewardId]: RewardCatalog[Id] extends { type: 'cosmetic' } ? Id : never }[CampaignRewardId];
export const CAMPAIGN_REWARD_IDS = Object.keys(CAMPAIGN_REWARD_CATALOG) as CampaignRewardId[];

export function isCampaignRewardId(id: unknown): id is CampaignRewardId {
  return typeof id === 'string' && Object.hasOwn(CAMPAIGN_REWARD_CATALOG, id);
}

export function isCampaignCosmeticForSlot(id: unknown, slot: CampaignCosmeticSlot): id is CampaignCosmeticId {
  if (!isCampaignRewardId(id)) return false;
  const reward = CAMPAIGN_REWARD_CATALOG[id];
  return reward.type === 'cosmetic' && reward.slot === slot;
}
