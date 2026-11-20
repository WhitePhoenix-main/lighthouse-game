import type { LensId, NightId } from '../contracts';
import { ABILITY_ECONOMY_CHAPTERS, ABILITY_PRICES, AVERAGE_NODE_PRICE, PROPOSED_FIRST_BOSS_PEARLS } from './campaignAbilityEconomy';
import { CAMPAIGN_GENERAL_DRAFT } from './campaignGeneralDraft';
import { CAMPAIGN_TREE_DRAFT, campaignLensUnlockId, type CampaignTreeDraftNode } from './campaignTreeDraft';
import { LENSES, LENS_UPGRADES } from './lenses';
import { UPGRADES } from './upgrades';

export interface CampaignPurchaseDraft extends CampaignTreeDraftNode {
  readonly shards: number;
  readonly pearls: number;
  readonly winsBeforePurchase: number;
}

export const CAMPAIGN_LENS_CHAPTERS: Readonly<Record<LensId, number>> = {
  basic: 1, expanded: 2, slowing: 2, focused: 3, smoldering: 3,
  'armor-breaker': 4, 'long-range': 4, resonant: 5,
};

const draftedPrerequisiteWins: Partial<Record<NightId, number>> = {
  'first-light': 1, 'broken-shore': 2, 'winged-tide': 3,
  'abyss-warden': ABILITY_ECONOMY_CHAPTERS[0].nights,
  'far-shore': ABILITY_ECONOMY_CHAPTERS[0].nights + 1,
};
const minimumChapter: Readonly<Record<string, number>> = {
  'unlock-generator': 2, 'unlock-harpoon': 2, 'device-slots-3': 2,
  'unlock-mortar': 3, 'unlock-bell': 3, 'device-slots-4': 4, 'unlock-repair-lamp': 5,
  'device-objects-1': 4, 'device-objects-2': 5, 'device-objects-3': 6, 'device-objects-4': 7,
};

function chapterBudget(chapter: number) {
  const entry = ABILITY_ECONOMY_CHAPTERS[chapter - 1];
  if (!entry) throw new Error(`Unknown campaign draft chapter: ${chapter}`);
  return entry;
}

export function winsAtChapterStart(chapter: number): number {
  return ABILITY_ECONOMY_CHAPTERS.slice(0, chapterBudget(chapter).chapter - 1)
    .reduce((sum, entry) => sum + entry.nights, 0);
}

function terms(node: CampaignTreeDraftNode): Pick<CampaignPurchaseDraft, 'shards' | 'pearls' | 'winsBeforePurchase'> {
  switch (node.source) {
    case 'existing-upgrade': {
      const entry = UPGRADES.find(candidate => candidate.id === node.sourceId)!;
      const gate = entry.requiresNight ? draftedPrerequisiteWins[entry.requiresNight] : 0;
      if (gate === undefined) throw new Error(`No campaign draft gate for ${entry.requiresNight}`);
      return { shards: entry.cost, pearls: 0,
        winsBeforePurchase: Math.max(gate, winsAtChapterStart(minimumChapter[node.id] ?? 1)) };
    }
    case 'existing-lens-unlock': {
      const lens = LENSES.find(candidate => candidate.id === node.sourceId)!;
      return { shards: 0, pearls: lens.materialCost, winsBeforePurchase: winsAtChapterStart(CAMPAIGN_LENS_CHAPTERS[lens.id]) };
    }
    case 'existing-lens-upgrade': {
      const entry = LENS_UPGRADES.find(candidate => candidate.id === node.sourceId)!;
      const chapter = entry.id === 'basic-paired' ? 3 : CAMPAIGN_LENS_CHAPTERS[entry.lensId];
      return { shards: entry.cost, pearls: entry.materialCost, winsBeforePurchase: winsAtChapterStart(chapter) };
    }
    case 'general-draft': {
      const entry = CAMPAIGN_GENERAL_DRAFT.find(candidate => candidate.id === node.sourceId)!;
      return { shards: AVERAGE_NODE_PRICE[entry.chapter - 1]!, pearls: 0, winsBeforePurchase: winsAtChapterStart(entry.chapter) };
    }
    case 'ability-draft': {
      const entry = ABILITY_PRICES.find(candidate => candidate.id === node.sourceId)!;
      return { shards: entry.shards, pearls: entry.pearls, winsBeforePurchase: winsAtChapterStart(entry.chapter) };
    }
  }
}

const draftById = new Map(CAMPAIGN_TREE_DRAFT.map(node => [node.id, node]));
const resolved = new Map<string, CampaignPurchaseDraft>();

function resolvePurchase(node: CampaignTreeDraftNode): CampaignPurchaseDraft {
  const cached = resolved.get(node.id);
  if (cached) return cached;
  const purchase = terms(node);
  const winsBeforePurchase = Math.max(purchase.winsBeforePurchase,
    ...node.requires.map(id => resolvePurchase(draftById.get(id)!).winsBeforePurchase));
  const result = { ...node, ...purchase, winsBeforePurchase };
  resolved.set(node.id, result);
  return result;
}

export const CAMPAIGN_PURCHASE_DRAFT: readonly CampaignPurchaseDraft[] = CAMPAIGN_TREE_DRAFT.map(resolvePurchase);

export const CAMPAIGN_LENS_PAIRS = [
  ['expanded', 'slowing'], ['focused', 'smoldering'], ['armor-breaker', 'long-range'],
] as const;

const secondLensTranches = CAMPAIGN_LENS_PAIRS.map(([first]) => {
  const firstUnlock = resolved.get(campaignLensUnlockId(first))!;
  const firstUpgrade = CAMPAIGN_PURCHASE_DRAFT.find(node => node.source === 'existing-lens-upgrade'
    && node.branch === first && node.requires.length === 1)!;
  const bossReward = PROPOSED_FIRST_BOSS_PEARLS[CAMPAIGN_LENS_CHAPTERS[first] - 2]!;
  return bossReward - firstUnlock.pearls - firstUpgrade.pearls;
});

export function draftFirstWinPearls(chapter: number, night: number): number {
  const entry = chapterBudget(chapter);
  if (!Number.isInteger(night) || night < 1 || night > entry.nights) throw new Error(`Unknown campaign draft night: ${chapter}.${night}`);
  if (night === entry.nights) {
    return PROPOSED_FIRST_BOSS_PEARLS[chapter - 1]! - (secondLensTranches[chapter - 1] ?? 0);
  }
  return night === 2 ? secondLensTranches[chapter - 2] ?? 0 : 0;
}
