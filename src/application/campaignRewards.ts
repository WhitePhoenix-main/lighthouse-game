import type { CampaignRewardCollectionItem, CampaignRewardOffer } from './campaignView';
import { CAMPAIGN_CHAPTER_DRAFT, type CampaignStoryDraftNightId } from '../content/campaignFoundationDraft';
import {
  CAMPAIGN_COLLECTION_REWARD_POINTS, CAMPAIGN_FIXED_REWARD_AMOUNTS, CAMPAIGN_PEARL_REWARD_WIN, CAMPAIGN_REWARD_CATALOG,
  CAMPAIGN_REWARD_CATEGORY_CAP, CAMPAIGN_REWARD_GLOBAL_CAP, CAMPAIGN_REWARD_IDS, CAMPAIGN_REWARD_WINDOW_MS,
  CAMPAIGN_SHARD_REWARD_AMOUNTS, isCampaignCosmeticForSlot, isCampaignRewardId,
  type CampaignCosmeticId, type CampaignCosmeticSlot, type CampaignRewardId,
} from '../content/campaignRewards';
import type { CampaignProfile, CampaignRewardLedger, CampaignRewardOperation, CampaignRewardRequest } from './campaignProfileTypes';

export function campaignRewardLedger(profile: Pick<CampaignProfile, 'rewards'>): CampaignRewardLedger {
  return profile.rewards ?? { operations: [], unlockedIds: [], collectionPoints: {}, equipped: {} };
}

export function campaignRewardChapter(victories: readonly CampaignStoryDraftNightId[]): number {
  const firstClosedChapter = CAMPAIGN_CHAPTER_DRAFT.slice(0, -1).findIndex(chapter => !victories.includes(chapter.bossId));
  return firstClosedChapter === -1 ? CAMPAIGN_CHAPTER_DRAFT.length : firstClosedChapter + 1;
}

export function campaignRewardRemaining(operations: readonly CampaignRewardOperation[], kind: CampaignRewardRequest['kind'], now: number) {
  let remainingGlobal: number = CAMPAIGN_REWARD_GLOBAL_CAP;
  let remainingCategory: number = CAMPAIGN_REWARD_CATEGORY_CAP[kind];
  for (let index = operations.length - 1; index >= 0; index--) {
    const operation = operations[index]!;
    if (operation.status !== 'confirmed') continue;
    if (operation.confirmedAt <= now - CAMPAIGN_REWARD_WINDOW_MS) break;
    remainingGlobal--;
    if (operation.request.kind === kind) remainingCategory--;
  }
  return { remainingGlobal: Math.max(0, remainingGlobal), remainingCategory: Math.max(0, remainingCategory) };
}

function effectiveRewardTime(operations: readonly CampaignRewardOperation[], now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Некорректное время награды кампании.');
  // A local clock rollback cannot move a confirmation before an earlier one.
  for (let index = operations.length - 1; index >= 0; index--) {
    const operation = operations[index]!;
    if (operation.status === 'confirmed') return Math.max(now, operation.confirmedAt);
  }
  return now;
}

function balanceAllows(profile: Readonly<CampaignProfile>, request: CampaignRewardRequest, amount: number): boolean {
  if (request.kind === 'collection') {
    return Number.isSafeInteger((profile.rewards?.collectionPoints[request.rewardId] ?? 0) + amount);
  }
  const balance = request.kind === 'shards' ? profile.shards : profile.pearls;
  return Number.isSafeInteger(balance + amount);
}

export function campaignRewardOffer(profile: Readonly<CampaignProfile>, request: CampaignRewardRequest, now: number): CampaignRewardOffer {
  const { wonNightIds } = profile;
  const rewards = campaignRewardLedger(profile);
  const chapter = campaignRewardChapter(wonNightIds);
  const amount = request.kind === 'shards' ? CAMPAIGN_SHARD_REWARD_AMOUNTS[chapter - 1]! : CAMPAIGN_FIXED_REWARD_AMOUNTS[request.kind];
  const remaining = campaignRewardRemaining(rewards.operations, request.kind, effectiveRewardTime(rewards.operations, now));
  let unavailableReason: CampaignRewardOffer['unavailableReason'] = null;
  if (profile.activeAttempt) unavailableReason = 'active-attempt';
  else if (rewards.operations.at(-1)?.status === 'pending') unavailableReason = 'pending-operation';
  else if (request.kind === 'pearl' && !wonNightIds.includes(CAMPAIGN_PEARL_REWARD_WIN)) unavailableReason = 'warden-required';
  else if (request.kind === 'collection' && rewards.unlockedIds.includes(request.rewardId)) unavailableReason = 'already-unlocked';
  else if (request.kind === 'collection' && chapter < CAMPAIGN_REWARD_CATALOG[request.rewardId].minimumChapter) unavailableReason = 'chapter-locked';
  else if (remaining.remainingGlobal === 0) unavailableReason = 'global-limit';
  else if (remaining.remainingCategory === 0) unavailableReason = 'category-limit';
  else if (!balanceAllows(profile, request, amount)) unavailableReason = 'balance-limit';
  return { request: { ...request }, amount, ...remaining, unavailableReason };
}

export function campaignRewardCollection(profile: Readonly<CampaignProfile>): CampaignRewardCollectionItem[] {
  const chapter = campaignRewardChapter(profile.wonNightIds);
  const rewards = campaignRewardLedger(profile);
  return CAMPAIGN_REWARD_IDS.map(id => {
    const reward = CAMPAIGN_REWARD_CATALOG[id];
    const unlocked = rewards.unlockedIds.includes(id);
    return { id, ...reward, unlocked, collectionPoints: rewards.collectionPoints[id] ?? 0,
      requiredPoints: CAMPAIGN_COLLECTION_REWARD_POINTS,
      canClaimOrdinary: !profile.activeAttempt && !unlocked && profile.wonNightIds.includes(reward.ordinaryVictoryNightId),
      collectionAvailable: !profile.activeAttempt && !unlocked && chapter >= reward.minimumChapter };
  });
}

function requirePreparation(profile: Readonly<CampaignProfile>): void {
  if (profile.activeAttempt) throw new Error('Сначала завершите активную попытку кампании.');
}

export function prepareCampaignReward(profile: Readonly<CampaignProfile>, operationId: string, offer: CampaignRewardOffer,
  now: number): CampaignProfile {
  requirePreparation(profile);
  const { request, amount } = offer;
  const rewards = campaignRewardLedger(profile);
  if (!operationId.trim()) throw new Error('Некорректный id награды кампании.');
  const existing = rewards.operations.find(operation => operation.id === operationId);
  if (existing) {
    if (existing.amount !== amount || existing.request.kind !== request.kind
      || (existing.request.kind === 'collection' && request.kind === 'collection' && existing.request.rewardId !== request.rewardId)) {
      throw new Error('Повторное предложение не совпадает с операцией награды кампании.');
    }
    return profile;
  }
  const current = campaignRewardOffer(profile, request, now);
  if (offer.unavailableReason !== null || current.unavailableReason !== null || current.amount !== amount) {
    throw new Error('Предложение награды кампании изменилось или недоступно.');
  }
  const operations = rewards.operations;
  const operation: CampaignRewardOperation = { id: operationId, request: { ...request }, amount,
    preparedAt: effectiveRewardTime(operations, now), status: 'pending' };
  return { ...profile, rewards: { ...rewards, operations: [...operations, operation] } };
}

function findRewardOperation(operations: readonly CampaignRewardOperation[], operationId: string): CampaignRewardOperation {
  const operation = operations.find(entry => entry.id === operationId);
  if (!operation) throw new Error('Неизвестная операция награды кампании.');
  return operation;
}

function finishRewardOperation(operations: readonly CampaignRewardOperation[], operation: CampaignRewardOperation): CampaignRewardOperation[] {
  // Only the final ledger entry may be pending.
  return [...operations.slice(0, -1), operation];
}

export function confirmCampaignReward(profile: Readonly<CampaignProfile>, operationId: string, now: number): CampaignProfile {
  requirePreparation(profile);
  const rewards = campaignRewardLedger(profile);
  const operation = findRewardOperation(rewards.operations, operationId);
  if (operation.status !== 'pending') return profile;
  const { request, amount, preparedAt } = operation;
  const confirmedAt = Math.max(effectiveRewardTime(rewards.operations, now), preparedAt);
  const { remainingGlobal, remainingCategory } = campaignRewardRemaining(rewards.operations, request.kind, confirmedAt);
  if (remainingGlobal <= 0 || remainingCategory <= 0 || !balanceAllows(profile, request, amount)) {
    throw new Error('Достигнут лимит награды кампании.');
  }
  const operations = finishRewardOperation(rewards.operations, { ...operation, status: 'confirmed', confirmedAt });
  if (request.kind === 'shards') return { ...profile, shards: profile.shards + amount, rewards: { ...rewards, operations } };
  if (request.kind === 'pearl') return { ...profile, pearls: profile.pearls + amount, rewards: { ...rewards, operations } };

  const { rewardId } = request;
  const points = (rewards.collectionPoints[rewardId] ?? 0) + amount;
  return { ...profile, rewards: { ...rewards, operations, collectionPoints: { ...rewards.collectionPoints, [rewardId]: points },
    unlockedIds: points >= CAMPAIGN_COLLECTION_REWARD_POINTS ? [...rewards.unlockedIds, rewardId] : rewards.unlockedIds } };
}

export function abandonCampaignReward(profile: Readonly<CampaignProfile>, operationId: string): CampaignProfile {
  requirePreparation(profile);
  const rewards = campaignRewardLedger(profile);
  const operation = findRewardOperation(rewards.operations, operationId);
  if (operation.status !== 'pending') return profile;
  const operations = finishRewardOperation(rewards.operations, { ...operation, status: 'abandoned' });
  return { ...profile, rewards: { ...rewards, operations } };
}

export function claimCampaignReward(profile: Readonly<CampaignProfile>, rewardId: CampaignRewardId): CampaignProfile {
  requirePreparation(profile);
  if (!isCampaignRewardId(rewardId)) throw new Error('Неизвестная награда коллекции кампании.');
  const rewards = campaignRewardLedger(profile);
  if (rewards.unlockedIds.includes(rewardId)) return profile;
  if (!profile.wonNightIds.includes(CAMPAIGN_REWARD_CATALOG[rewardId].ordinaryVictoryNightId)) {
    throw new Error('Для награды коллекции нужна победа в указанной ночи кампании.');
  }
  const pending = rewards.operations.at(-1);
  const operations = pending?.status === 'pending' && pending.request.kind === 'collection' && pending.request.rewardId === rewardId
    ? finishRewardOperation(rewards.operations, { ...pending, status: 'abandoned' }) : rewards.operations;
  return { ...profile, rewards: { ...rewards, operations, unlockedIds: [...rewards.unlockedIds, rewardId] } };
}

export function equipCampaignCosmetic(profile: Readonly<CampaignProfile>, slot: CampaignCosmeticSlot,
  cosmeticId: CampaignCosmeticId | null): CampaignProfile {
  requirePreparation(profile);
  const rewards = campaignRewardLedger(profile);
  if (cosmeticId !== null && (!isCampaignCosmeticForSlot(cosmeticId, slot) || !rewards.unlockedIds.includes(cosmeticId))) {
    throw new Error('Оформление кампании не подходит для этой ячейки или ещё не открыто.');
  }
  if ((rewards.equipped[slot] ?? null) === cosmeticId) return profile;
  const equipped = { ...rewards.equipped };
  if (cosmeticId === null) delete equipped[slot];
  else equipped[slot] = cosmeticId;
  return { ...profile, rewards: { ...rewards, equipped } };
}
