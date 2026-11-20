import { CAMPAIGN_ABILITY_DRAFT } from '../content/campaignAbilityDraft';
import { CAMPAIGN_CHAPTER_DRAFT, CAMPAIGN_STORY_DRAFT, draftStoryNightAccess,
  type CampaignMapDraftId, type CampaignStoryDraftNightId } from '../content/campaignFoundationDraft';
import {
  CAMPAIGN_COSMETIC_SLOTS, isCampaignCosmeticForSlot, isCampaignRewardId,
} from '../content/campaignRewards';
import { CAMPAIGN_TREE_DRAFT, campaignLensUnlockId } from '../content/campaignTreeDraft';
import { DEVICE_VARIANTS, type DeviceVariantId } from '../content/campaignVariants';
import { DEVICE_RULES } from '../content/devices';
import { ENEMIES } from '../content/enemies';
import { LENSES } from '../content/lenses';
import { UPGRADES } from '../content/upgrades';
import type { DeviceDeployment, DeviceKind } from '../contracts';
import { DEVICE_KINDS, trapChargeCapacity } from '../progression/devices';
import type { CampaignAbilityId, CampaignAttempt, CampaignOwnedDevice, CampaignProfile, CampaignRewardLedger,
  CampaignRewardRequest, CampaignSettlement } from './campaignProfileTypes';
import { campaignRewardLedger } from './campaignRewards';

const nodeIds = new Set(CAMPAIGN_TREE_DRAFT.map(node => node.id));
const storyIds = new Set(CAMPAIGN_STORY_DRAFT.map(night => night.id));
const introIds = new Set(CAMPAIGN_CHAPTER_DRAFT.map(chapter => chapter.introId));
const mapIds = new Set(CAMPAIGN_CHAPTER_DRAFT.map(chapter => chapter.mapId));
const deviceKinds = new Set(DEVICE_KINDS);
const deviceVariantIds = new Set(Object.keys(DEVICE_VARIANTS) as DeviceVariantId[]);
const enemyKinds = new Set(Object.values(ENEMIES).map(enemy => enemy.id));
const abilityUnlocks = [{ abilityId: 'flash', id: 'unlock-flash' } as const,
  ...CAMPAIGN_ABILITY_DRAFT.filter(node => node.kind === 'unlock')];
const profileKeys = [...Object.keys(emptyCampaignProfile()), 'rewards', 'deviceHealthBases'];
const inventoryKeys = ['id', 'kind', 'health', 'consumed', 'trapCharges', 'variantId'];
const layoutKeys = ['deviceId', 'x', 'y'];
const attemptKeys = ['id', 'seed', 'nightId', 'mapId', 'rulesVersion', 'lensId', 'abilityId', 'devices', 'firstWinShards', 'firstWinPearls'];
const deploymentKeys = [...inventoryKeys, 'x', 'y'];
const settlementKeys = ['id', 'outcome', 'shards', 'pearls'];
const rewardKeys = ['operations', 'unlockedIds', 'collectionPoints', 'equipped'];
const rewardOperationKeys = ['id', 'request', 'amount', 'preparedAt', 'status'];

// Units of v1 saves written before the base health was recorded explicitly.
const originalHealthBases: Readonly<Record<DeviceKind, number>> = {
  cannon: 70, barrier: 140, generator: 60, 'light-trap': 30, harpoon: 60, mortar: 80, bell: 70, 'repair-lamp': 60,
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  record(value) && Object.keys(value).every(key => keys.includes(key));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const natural = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const knownId = <Id extends string>(value: unknown, catalog: ReadonlySet<Id>): value is Id =>
  typeof value === 'string' && (catalog as ReadonlySet<string>).has(value);

function invalid(field: string): never {
  throw new Error(`Некорректный профиль кампании: ${field}.`);
}

function readUniqueIds<Id extends string>(value: unknown, catalog: ReadonlySet<Id>, field: string): Id[] {
  if (!Array.isArray(value)) invalid(field);
  const ids = new Set<Id>();
  for (const id of value) {
    if (!knownId(id, catalog) || ids.has(id)) invalid(field);
    ids.add(id);
  }
  return [...ids];
}

function readHealthBases(profile: Record<string, unknown>): Readonly<Record<DeviceKind, number>> {
  if (!Object.hasOwn(profile, 'deviceHealthBases')) return originalHealthBases;
  const input = profile.deviceHealthBases;
  if (!onlyKeys(input, DEVICE_KINDS)) invalid('базовая прочность устройств');
  const bases = { ...originalHealthBases };
  for (const kind of DEVICE_KINDS) {
    if (!Object.hasOwn(input, kind)) continue;
    const value = input[kind];
    if (!finite(value) || value <= 0) invalid('базовая прочность устройств');
    bases[kind] = value;
  }
  return bases;
}

function normalizeHealth<T extends CampaignOwnedDevice>(device: T, bases: Readonly<Record<DeviceKind, number>>): T {
  const base = bases[device.kind], current = DEVICE_RULES.definitions[device.kind].health;
  return base === current ? device : { ...device, health: device.health / base * current };
}

function readInventory(value: unknown, nextDeviceId: number, unlocked: ReadonlySet<DeviceKind>,
  bases: Readonly<Record<DeviceKind, number>>, chargeCapacity: number, rewards: CampaignRewardLedger | undefined): CampaignOwnedDevice[] {
  if (!Array.isArray(value)) invalid('инвентарь');
  const ids = new Set<number>(), ownedKinds = new Set<DeviceKind>();
  const inventory = value.map((device: unknown): CampaignOwnedDevice => {
    if (!onlyKeys(device, inventoryKeys)) invalid('поля экземпляра');
    const { id, kind, health, consumed, trapCharges, variantId } = device;
    if (!natural(id) || id === 0 || id >= nextDeviceId || ids.has(id)) invalid('id экземпляра');
    if (!knownId(kind, unlocked)) invalid('тип экземпляра не открыт');
    if (!finite(health) || health < 0 || health > bases[kind]) invalid('прочность экземпляра');
    if (variantId !== undefined && (!knownId(variantId, deviceVariantIds) || DEVICE_VARIANTS[variantId].kind !== kind
      || !rewards?.unlockedIds.includes(variantId))) invalid('вариант экземпляра');
    ids.add(id);
    ownedKinds.add(kind);
    if (kind === 'light-trap') {
      if (!natural(trapCharges) || trapCharges > chargeCapacity || consumed !== (trapCharges === 0)) invalid('состояние зарядов ловушки');
      return { id, kind, health, consumed, trapCharges };
    }
    if (consumed !== false || Object.hasOwn(device, 'trapCharges')) invalid('состояние устройства без зарядов');
    return { id, kind, health, consumed, ...(variantId === undefined ? {} : { variantId }) };
  });
  if (ownedKinds.size !== unlocked.size) invalid('нет первого экземпляра открытого типа');
  return inventory;
}

function readLayouts(value: unknown, inventory: readonly CampaignOwnedDevice[]): CampaignProfile['layouts'] {
  if (!record(value)) invalid('расстановки');
  const layouts: CampaignProfile['layouts'] = {};
  const inventoryIds = new Set(inventory.map(device => device.id));
  for (const [mapId, entries] of Object.entries(value)) {
    if (!knownId(mapId, mapIds) || !Array.isArray(entries)) invalid('расстановка карты');
    const placed = new Set<number>();
    layouts[mapId] = entries.map((entry: unknown) => {
      if (!onlyKeys(entry, layoutKeys)) invalid('поля позиции');
      const { deviceId, x, y } = entry;
      if (!natural(deviceId) || !inventoryIds.has(deviceId) || placed.has(deviceId)) invalid('ссылка расстановки на экземпляр');
      if (!finite(x) || !finite(y)) invalid('координаты расстановки');
      placed.add(deviceId);
      return { deviceId, x, y };
    });
  }
  return layouts;
}

function readAttempt(value: unknown, profile: CampaignProfile, selectedMapId: CampaignMapDraftId | undefined): CampaignAttempt | null {
  if (value === null) return null;
  if (!onlyKeys(value, attemptKeys)) invalid('поля активной попытки');
  const { id, seed, nightId, mapId, rulesVersion, lensId, abilityId, devices, firstWinShards, firstWinPearls } = value;
  if (!nonBlank(id) || id === profile.lastSettled?.id || !natural(seed) || seed > 0xffff_ffff || !nonBlank(rulesVersion)) {
    invalid('id, seed или версия правил активной попытки');
  }
  if (!natural(firstWinShards) || !natural(firstWinPearls)) invalid('бонусы первой победы');
  if (nightId !== profile.selectedNightId || !knownId(mapId, mapIds) || mapId !== selectedMapId
    || lensId !== profile.selectedLensId || abilityId !== profile.selectedAbilityId) invalid('оснащение, ночь или карта активной попытки');

  const layout = profile.layouts[mapId] ?? [];
  if (!Array.isArray(devices) || devices.length !== layout.length) invalid('состав стартового снимка');
  const positions = new Map(layout.map(entry => [entry.deviceId, entry]));
  const inventory = new Map(profile.inventory.map(device => [device.id, device]));
  const snapshot = devices.map((device: unknown): DeviceDeployment => {
    if (!onlyKeys(device, deploymentKeys) || !natural(device.id)) invalid('поля устройства стартового снимка');
    const position = positions.get(device.id);
    const owned = inventory.get(device.id);
    if (!position || !owned || device.kind !== owned.kind || device.variantId !== owned.variantId || device.x !== position.x || device.y !== position.y
      || device.health !== owned.health || device.consumed !== owned.consumed || device.trapCharges !== owned.trapCharges) {
      invalid('устройство стартового снимка не совпадает с инвентарём или расстановкой');
    }
    positions.delete(device.id);
    return { ...owned, x: position.x, y: position.y };
  });
  return { id, seed, nightId: profile.selectedNightId, mapId, rulesVersion, lensId: profile.selectedLensId,
    abilityId: profile.selectedAbilityId, devices: snapshot, firstWinShards, firstWinPearls };
}

function readSettlement(value: unknown): CampaignSettlement | null {
  if (value === null) return null;
  if (!onlyKeys(value, settlementKeys)) invalid('поля последнего исхода');
  const { id, outcome, shards, pearls } = value;
  if (!nonBlank(id) || (outcome !== 'victory' && outcome !== 'defeat' && outcome !== 'interrupted')
    || !natural(shards) || !natural(pearls) || (outcome !== 'victory' && pearls !== 0)
    || (outcome === 'interrupted' && shards !== 0)) invalid('состояние последнего исхода');
  return { id, outcome, shards, pearls };
}

function readRewardRequest(value: unknown): CampaignRewardRequest {
  if (onlyKeys(value, ['kind']) && (value.kind === 'shards' || value.kind === 'pearl')) return { kind: value.kind };
  if (onlyKeys(value, ['kind', 'rewardId']) && value.kind === 'collection' && isCampaignRewardId(value.rewardId)) {
    return { kind: value.kind, rewardId: value.rewardId };
  }
  return invalid('предложение награды');
}

function readRewards(value: unknown, victories: readonly CampaignStoryDraftNightId[]): CampaignRewardLedger {
  if (!onlyKeys(value, rewardKeys) || !Array.isArray(value.operations) || !Array.isArray(value.unlockedIds)
    || !record(value.collectionPoints) || !onlyKeys(value.equipped, CAMPAIGN_COSMETIC_SLOTS)) invalid('журнал наград');
  const { operations, unlockedIds, collectionPoints, equipped } = campaignRewardLedger({});
  const seenIds = new Set<string>();
  let lastConfirmedAt = 0;
  for (const input of value.operations as unknown[]) {
    if (!record(input) || operations.at(-1)?.status === 'pending') invalid('операции наград');
    const { id, amount, preparedAt, status, confirmedAt } = input;
    const fields = status === 'confirmed' ? [...rewardOperationKeys, 'confirmedAt'] : rewardOperationKeys;
    if (!onlyKeys(input, fields) || !nonBlank(id) || seenIds.has(id) || !natural(preparedAt) || preparedAt < lastConfirmedAt
      || !natural(amount) || amount === 0 || (status !== 'pending' && status !== 'abandoned' && status !== 'confirmed')) invalid('операция награды');
    seenIds.add(id);
    const request = readRewardRequest(input.request);
    const operation = { id, request, amount, preparedAt };
    if (status !== 'confirmed') {
      operations.push({ ...operation, status });
      continue;
    }
    if (!natural(confirmedAt) || confirmedAt < preparedAt) invalid('время подтверждения награды');
    operations.push({ ...operation, status, confirmedAt });
    lastConfirmedAt = confirmedAt;
    if (request.kind === 'collection') {
      const points = (collectionPoints[request.rewardId] ?? 0) + amount;
      if (!natural(points)) invalid('очки коллекции');
      collectionPoints[request.rewardId] = points;
    }
  }
  for (const id of value.unlockedIds as unknown[]) {
    // v1 records the unlock but has no record of its original victory or collection threshold.
    if (!isCampaignRewardId(id) || unlockedIds.includes(id) || (victories.length === 0 && collectionPoints[id] === undefined)) {
      invalid('открытия коллекции');
    }
    unlockedIds.push(id);
  }
  const pending = operations.at(-1);
  if (pending?.status === 'pending' && pending.request.kind === 'collection' && unlockedIds.includes(pending.request.rewardId)) {
    invalid('ожидающая награда уже открыта');
  }
  if (Object.keys(value.collectionPoints).length !== Object.keys(collectionPoints).length) invalid('очки коллекции');
  for (const [id, points] of Object.entries(collectionPoints)) {
    if (value.collectionPoints[id] !== points) invalid('очки коллекции');
  }
  for (const slot of CAMPAIGN_COSMETIC_SLOTS) {
    if (!Object.hasOwn(value.equipped, slot)) continue;
    const id = value.equipped[slot];
    if (!isCampaignCosmeticForSlot(id, slot) || !unlockedIds.includes(id)) invalid('выбранное оформление');
    equipped[slot] = id;
  }
  return { operations, unlockedIds, collectionPoints, equipped };
}

export function emptyCampaignProfile(): CampaignProfile {
  return { version: 1, shards: 0, pearls: 0, purchasedNodeIds: [], wonNightIds: [],
    selectedNightId: CAMPAIGN_CHAPTER_DRAFT[0].nights[0], selectedLensId: 'basic', selectedAbilityId: null,
    seenIntroIds: [], nextDeviceId: 1, inventory: [], layouts: {},
    activeAttempt: null, lastSettled: null, encountered: [], completedNights: 0 };
}

export function encodeCampaignProfile(profile: CampaignProfile): string {
  const deviceHealthBases: Partial<Record<DeviceKind, number>> = {};
  for (const { kind } of profile.inventory) {
    const base = DEVICE_RULES.definitions[kind].health;
    if (base !== originalHealthBases[kind]) deviceHealthBases[kind] = base;
  }
  return JSON.stringify(Object.keys(deviceHealthBases).length === 0 ? profile : { ...profile, deviceHealthBases });
}

export function decodeCampaignProfile(raw: string): CampaignProfile {
  const profile: unknown = JSON.parse(raw);
  if (!onlyKeys(profile, profileKeys) || profile.version !== 1) invalid('структура или версия');
  const { shards, pearls, nextDeviceId } = profile;
  if (!natural(shards) || !natural(pearls)) invalid('баланс');
  if (!natural(nextDeviceId) || nextDeviceId === 0) invalid('следующий id экземпляра');

  const purchasedNodeIds = readUniqueIds(profile.purchasedNodeIds, nodeIds, 'покупки');
  const purchases = new Set(purchasedNodeIds);
  if (CAMPAIGN_TREE_DRAFT.some(node => purchases.has(node.id) && node.requires.some(id => !purchases.has(id)))) invalid('зависимости покупок');

  const wonNightIds = readUniqueIds(profile.wonNightIds, storyIds, 'победы');
  const { completedNights } = profile;
  if (!natural(completedNights) || completedNights < wonNightIds.length) invalid('счётчик побед');
  const encountered = readUniqueIds(profile.encountered, enemyKinds, 'встреченные враги');
  const lastSettled = readSettlement(profile.lastSettled);
  if (lastSettled?.outcome === 'victory' && wonNightIds.length === 0) invalid('последняя победа отсутствует в прогрессе');
  const victories = new Set(wonNightIds);
  if (CAMPAIGN_STORY_DRAFT.some(night => victories.has(night.id)
    && night.requiresVictoryOf !== null && !victories.has(night.requiresVictoryOf))) invalid('цепочка побед');
  const night = CAMPAIGN_STORY_DRAFT.find(night => night.id === profile.selectedNightId);
  if (!night || !draftStoryNightAccess(night, victories)) invalid('выбранная ночь');

  const lens = LENSES.find(lens => lens.id === profile.selectedLensId);
  if (!lens || (lens.id !== 'basic' && !purchases.has(campaignLensUnlockId(lens.id)))) invalid('выбранная линза');
  let selectedAbilityId: CampaignAbilityId | null = null;
  if (profile.selectedAbilityId !== null) {
    const unlock = abilityUnlocks.find(node => node.abilityId === profile.selectedAbilityId);
    if (!unlock || !purchases.has(unlock.id)) invalid('выбранная способность');
    selectedAbilityId = unlock.abilityId;
  }

  const seenIntroIds = readUniqueIds(profile.seenIntroIds, introIds, 'вступления');
  const livePurchases = UPGRADES.filter(node => purchases.has(node.id));
  const unlocked = new Set(livePurchases.map(node => node.effect.stat).filter(stat => knownId(stat, deviceKinds)));
  const rewards = Object.hasOwn(profile, 'rewards') ? readRewards(profile.rewards, wonNightIds) : undefined;
  const bases = readHealthBases(profile);
  const inventory = readInventory(profile.inventory, nextDeviceId, unlocked, bases,
    trapChargeCapacity(livePurchases.map(node => node.id)), rewards);
  const layouts = readLayouts(profile.layouts, inventory);
  const decoded: CampaignProfile = { version: 1, shards, pearls, purchasedNodeIds, wonNightIds, selectedNightId: night.id,
    selectedLensId: lens.id, selectedAbilityId, seenIntroIds, nextDeviceId, inventory, layouts,
    activeAttempt: null, lastSettled, encountered, completedNights, ...(rewards === undefined ? {} : { rewards }) };
  const mapId = CAMPAIGN_CHAPTER_DRAFT.find(chapter => chapter.id === night.chapterId)?.mapId;
  decoded.activeAttempt = readAttempt(profile.activeAttempt, decoded, mapId);
  // Compare the saved snapshot to the saved inventory before changing their units.
  decoded.inventory = decoded.inventory.map(device => normalizeHealth(device, bases));
  if (decoded.activeAttempt) decoded.activeAttempt.devices = decoded.activeAttempt.devices.map(device => normalizeHealth(device, bases));
  return decoded;
}
