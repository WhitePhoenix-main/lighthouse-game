import { CAMPAIGN_ABILITY_DRAFT, validateCampaignAbilityDraft,
  type CampaignAbilityDraftId, type CampaignAbilityDraftNode, type CampaignAbilityNodeId } from './campaignAbilityDraft';
import type { CampaignAbilityPrice } from './campaignAbilityBalanceTypes';
import { LENSES, LENS_UPGRADES } from './lenses';

const OPENING = { overload: 2, seal: 3, barrage: 4, bastion: 5 } as const;
const AVERAGE_NODE_PRICE = [35, 55, 80, 110, 145, 185, 235] as const;
/** Earmarked INSIDE chapter 3 otherProgression, not an additional/double charge. */
export const BASIC_PAIRED_PREREQUISITE_SHARDS = LENS_UPGRADES
  .filter(u => ['basic-power-1', 'basic-power-2', 'basic-width'].includes(u.id))
  .reduce((sum, u) => sum + u.cost, 0);
/** Two optional leaves per branch. No pearl purchase gates a shard-only path. */
const SPECIALIZATIONS: Partial<Record<CampaignAbilityNodeId, readonly [number, number]>> = {
  'ability-overload-armor': [4, 1], 'ability-overload-guidance': [6, 2],
  'ability-seal-lingering': [5, 1], 'ability-seal-entry': [6, 2],
  'ability-barrage-air-intercept': [5, 1], 'ability-barrage-correction': [7, 2],
  'ability-bastion-heavy-impact': [6, 1], 'ability-bastion-fade': [7, 2],
};

/** Candidate placement/prices, not a replacement for live progression. */
export const ABILITY_PRICES: readonly CampaignAbilityPrice[] = CAMPAIGN_ABILITY_DRAFT.map(node => {
  const special = SPECIALIZATIONS[node.id];
  const offset = node.kind === 'unlock' || (node.family === 'power' && node.rank === 1) ? 0
    : node.rank === 2 ? 2 : 1;
  const chapter = special?.[0] ?? Math.min(7, OPENING[node.abilityId] + offset);
  const pearls = special?.[1] ?? 0;
  return { id: node.id, abilityId: node.abilityId, chapter, shards: AVERAGE_NODE_PRICE[chapter - 1]!, pearls,
    currency: pearls === 0 ? 'shards' : 'shards-and-pearls', status: 'provisional' };
});

export function validateCampaignAbilityEconomy(prices: readonly CampaignAbilityPrice[] = ABILITY_PRICES,
  nodes: readonly CampaignAbilityDraftNode[] = CAMPAIGN_ABILITY_DRAFT): void {
  validateCampaignAbilityDraft(nodes);
  const fail = (message: string): never => { throw new Error(`Campaign ability economy: ${message}`); };
  if (prices.length !== nodes.length) fail('expected forty prices');
  const byId = new Map<CampaignAbilityNodeId, CampaignAbilityPrice>();
  for (const price of prices) {
    if (byId.has(price.id)) fail(`duplicate price ${price.id}`);
    const node = nodes.find(n => n.id === price.id);
    if (!node || node.abilityId !== price.abilityId) fail(`unknown/mismatched ability ${price.id}`);
    if (!Number.isInteger(price.chapter) || price.chapter < OPENING[price.abilityId] || price.chapter > 7
      || (node!.kind === 'unlock' && price.chapter !== OPENING[price.abilityId])) fail(`invalid chapter ${price.id}`);
    if (!Number.isSafeInteger(price.shards) || price.shards <= 0
      || !Number.isSafeInteger(price.pearls) || price.pearls < 0) fail(`invalid price ${price.id}`);
    if (price.currency !== (price.pearls === 0 ? 'shards' : 'shards-and-pearls')
      || price.status !== 'provisional') fail(`invalid currency/status ${price.id}`);
    const special = SPECIALIZATIONS[price.id];
    if (price.pearls !== (special?.[1] ?? 0)) fail(`unexpected pearl gate ${price.id}`);
    byId.set(price.id, price);
  }
  for (const node of nodes) {
    const price = byId.get(node.id);
    if (!price) fail(`missing price ${node.id}`);
    for (const dependency of node.requires) {
      const parent = byId.get(dependency)!;
      if (parent.chapter > price!.chapter) fail(`dependency available later ${node.id}`);
      if (price!.pearls === 0 && parent.pearls > 0) fail(`pearl gate on shard path ${node.id}`);
    }
  }
}

export const ABILITY_ECONOMY_CHAPTERS = [
  { chapter: 1, nights: 6, firstWin: 100, killBudget: 35, repair: 8, recharge: 0, instances: 40, otherProgression: 350, lensShards: 0, fieldValue: 80 },
  { chapter: 2, nights: 7, firstWin: 150, killBudget: 50, repair: 12, recharge: 2, instances: 80, otherProgression: 550, lensShards: 90, fieldValue: 120 },
  { chapter: 3, nights: 8, firstWin: 220, killBudget: 75, repair: 18, recharge: 2, instances: 120, otherProgression: 1000, lensShards: 200, fieldValue: 160 },
  { chapter: 4, nights: 8, firstWin: 300, killBudget: 100, repair: 24, recharge: 2, instances: 160, otherProgression: 1200, lensShards: 110, fieldValue: 220 },
  { chapter: 5, nights: 9, firstWin: 400, killBudget: 135, repair: 32, recharge: 2, instances: 240, otherProgression: 2200, lensShards: 65, fieldValue: 300 },
  { chapter: 6, nights: 9, firstWin: 520, killBudget: 175, repair: 40, recharge: 2, instances: 320, otherProgression: 3000, lensShards: 0, fieldValue: 400 },
  { chapter: 7, nights: 9, firstWin: 680, killBudget: 225, repair: 50, recharge: 2, instances: 440, otherProgression: 4200, lensShards: 0, fieldValue: 520 },
] as const;

export type AbilityEconomyRoute = 'main' | 'broad' | 'complete';
/** Main: full overload + first power on all other branches (16 nodes).
 * Broad: unlock, power I/II, recovery I and two specializations per branch (24 nodes).
 * Complete: all forty nodes, a deliberately expensive stress route.
 * These quotas do not certify the other 216 nodes. */
export function abilityEconomyRoutePrices(route: AbilityEconomyRoute): readonly CampaignAbilityPrice[] {
  return ABILITY_PRICES.filter(price => route === 'complete'
    || (route === 'broad' ? price.pearls > 0 || price.id.includes('-power-') || price.id.endsWith('-recovery-1')
      || price.id.endsWith('-unlock') : price.abilityId === 'overload'
        || price.id.endsWith('-unlock') || price.id.endsWith('-power-1')));
}

export function auditAbilityShardRoute(route: AbilityEconomyRoute,
  reserveScenario: 'ability-priority' | 'original-reserve' = 'ability-priority',
  lensScenario: 'first-upgrades' | 'focused-complete' = 'first-upgrades') {
  const purchases = abilityEconomyRoutePrices(route);
  let carry = 0;
  return ABILITY_ECONOMY_CHAPTERS.map(chapter => {
    const abilityShards = purchases.filter(p => p.chapter === chapter.chapter).reduce((sum, p) => sum + p.shards, 0);
    const income = chapter.nights * chapter.firstWin;
    const maintenance = chapter.nights * (chapter.repair + chapter.recharge);
    const carryIn = carry;
    const otherProgression = chapter.otherProgression
      + (reserveScenario === 'original-reserve' && chapter.chapter === 4 ? 200 : 0);
    const basicPairedPrerequisites = chapter.chapter === 3 ? BASIC_PAIRED_PREREQUISITE_SHARDS : 0;
    const focusedExtraIds = chapter.chapter === 5 ? ['focused-range'] : chapter.chapter === 6
      ? ['focused-hold-1'] : chapter.chapter === 7 ? ['focused-hold-2'] : [];
    const lensShards = chapter.lensShards + (lensScenario === 'focused-complete'
      ? LENS_UPGRADES.filter(u => focusedExtraIds.includes(u.id)).reduce((sum, u) => sum + u.cost, 0) : 0);
    carry += income - maintenance - chapter.instances - otherProgression - lensShards - abilityShards;
    const fullRepair = Math.ceil(chapter.fieldValue * .25);
    const emergencyReserve = 3 * (fullRepair + chapter.recharge);
    const halfKills = Math.floor(chapter.killBudget / 2);
    return { chapter: chapter.chapter, carryIn, income, maintenance, instances: chapter.instances,
      otherProgression, lensShards, abilityShards, carryOut: carry,
      basicPairedPrerequisites, otherProgressionAfterEarmark: otherProgression - basicPairedPrerequisites,
      beforeBossIfAllChapterPurchasesPaid: carry - (chapter.firstWin - chapter.repair - chapter.recharge),
      emergencyReserve, spendableAfterReserve: carry - emergencyReserve,
      afterThreeZeroKillDefeats: carry - emergencyReserve,
      afterThreeHalfKillDefeats: carry + 3 * halfKills - emergencyReserve };
  });
}

/** Opening and power I after two ordinary first wins, with new-instance allocation and
 * two maintenance bills reserved. Other progression must yield purchasing priority. */
export function auditAbilityOpening(abilityId: CampaignAbilityDraftId) {
  const chapter = ABILITY_ECONOMY_CHAPTERS[OPENING[abilityId] - 1]!;
  const cost = ABILITY_PRICES.filter(p => p.abilityId === abilityId
    && (p.id.endsWith('-unlock') || p.id.endsWith('-power-1'))).reduce((sum, p) => sum + p.shards, 0);
  const ordinaryWins = 2;
  const spendable = ordinaryWins * (chapter.firstWin - chapter.repair - chapter.recharge) - chapter.instances;
  return { abilityId, chapter: chapter.chapter, ordinaryWins, ordinaryNightsBeforeBoss: chapter.nights - 1,
    cost, spendable, surplus: spendable - cost };
}

/** Proposal ONLY: first full victory of each boss night; neither implemented nor approved. */
export const PROPOSED_FIRST_BOSS_PEARLS = [7, 9, 9, 7, 6, 5, 4] as const;
const LENS_RESERVE_GROUPS = [
  ['expanded', 'slowing'], ['focused', 'smoldering'], ['armor-breaker', 'long-range'], ['resonant'],
] as const;

export function auditAbilityPearlRoute(route: AbilityEconomyRoute) {
  let earned = 0, lensReserve = 0, spent = 0;
  const purchased = new Set<CampaignAbilityNodeId>();
  const prices = abilityEconomyRoutePrices(route);
  return PROPOSED_FIRST_BOSS_PEARLS.map((reward, index) => {
    const nextChapter = index + 2;
    earned += reward;
    const lensIds: readonly string[] = LENS_RESERVE_GROUPS[index] ?? [];
    const openingReserve = LENSES.filter(l => lensIds.includes(l.id)).reduce((sum, l) => sum + l.materialCost, 0);
    const firstUpgradeReserve = lensIds.reduce((sum, id) => sum + LENS_UPGRADES.find(u => u.lensId === id && u.requires.length === 0)!.materialCost, 0);
    // basic-paired is additional to the seven new-lens first upgrades; reserve after boss 2.
    const basicReserve = index === 1 ? LENS_UPGRADES.find(u => u.id === 'basic-paired')!.materialCost : 0;
    lensReserve += openingReserve + firstUpgradeReserve + basicReserve;
    const bought: CampaignAbilityNodeId[] = [];
    for (const price of prices) {
      if (price.pearls === 0 || price.chapter > Math.min(7, nextChapter) || purchased.has(price.id)) continue;
      if (earned - lensReserve - spent < price.pearls) continue;
      spent += price.pearls; purchased.add(price.id); bought.push(price.id);
    }
    return { afterBossChapter: index + 1, usableBeforeChapter: nextChapter, reward, earned,
      openingReserve, firstUpgradeReserve, basicReserve, lensReserve, abilityPearls: spent,
      available: earned - lensReserve - spent, bought };
  });
}
