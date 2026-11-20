import type { CampaignAbilityId, CampaignOwnedDevice, CampaignProfile } from '../application/campaignProfileTypes';
import type { DeviceKind, LensId, LensUpgradeId, NightConfig, UpgradeId } from '../contracts';
import { CAMPAIGN_ABILITY_DRAFT } from '../content/campaignAbilityDraft';
import { ABILITY_NUMERIC_NODES } from '../content/campaignAbilityBalance';
import { CAMPAIGN_GENERAL_DRAFT, type CampaignGeneralDraftNode, type CampaignGeneralEffect } from '../content/campaignGeneralDraft';
import { CAMPAIGN_PURCHASE_DRAFT, type CampaignPurchaseDraft } from '../content/campaignPurchaseDraft';
import { campaignLensUnlockId } from '../content/campaignTreeDraft';
import { DEVICE_VARIANTS, type DeviceVariantId } from '../content/campaignVariants';
import { DEVICE_RULES } from '../content/devices';
import { LENSES, LENS_UPGRADES } from '../content/lenses';
import { NIGHT_CONFIG } from '../content/night';
import { UPGRADES } from '../content/upgrades';
import { calculateCandidateAbility } from './campaignAbilities';
import { applyCampaignGeneral, campaignBeamBase, campaignGeneralRanks } from './campaignGeneralLoadout';
import { DEVICE_KINDS, engineeringRepairMultiplier, rechargeCost, remainingTrapCharges, repairCost,
  trapChargeCapacity, trapRechargeMultiplier } from './devices';
import { calculateNightConfig } from './upgrades';

const purchaseById = new Map(CAMPAIGN_PURCHASE_DRAFT.map(node => [node.id, node]));
const upgradeById = new Map<string, (typeof UPGRADES)[number]>(UPGRADES.map(node => [node.id, node]));
const lensById = new Map<string, (typeof LENSES)[number]>(LENSES.map(lens => [lens.id, lens]));
const lensUpgradeById = new Map<string, (typeof LENS_UPGRADES)[number]>(LENS_UPGRADES.map(node => [node.id, node]));
const abilityNodeById = new Map<string, (typeof CAMPAIGN_ABILITY_DRAFT)[number]>(CAMPAIGN_ABILITY_DRAFT.map(node => [node.id, node]));
const abilityUnlockById = new Map<CampaignAbilityId, string>([['flash', 'unlock-flash'],
  ...CAMPAIGN_ABILITY_DRAFT.filter(node => node.kind === 'unlock').map(node => [node.abilityId, node.id] as const)]);
const generalById = new Map<string, CampaignGeneralDraftNode>(CAMPAIGN_GENERAL_DRAFT.map(node => [node.id, node]));

function legacyPurchases(owned: ReadonlySet<string>): UpgradeId[] {
  return UPGRADES.filter(node => owned.has(node.id)).map(node => node.id);
}

function lensPurchases(owned: ReadonlySet<string>): LensUpgradeId[] {
  return LENS_UPGRADES.filter(node => owned.has(node.id)).map(node => node.id);
}

function lensUnlocked(owned: ReadonlySet<string>, id: LensId): boolean {
  return lensById.has(id) && (id === 'basic' || owned.has(campaignLensUnlockId(id)));
}

export function isCampaignAbilityUnlocked(profile: Readonly<CampaignProfile>, id: CampaignAbilityId): boolean {
  const unlock = abilityUnlockById.get(id);
  return unlock !== undefined && profile.purchasedNodeIds.includes(unlock);
}

export function selectCampaignAbility(profile: Readonly<CampaignProfile>, id: CampaignAbilityId | null): CampaignProfile {
  if (id !== null && !isCampaignAbilityUnlocked(profile, id)) throw new Error('Способность не открыта.');
  return profile.selectedAbilityId === id ? profile : { ...profile, selectedAbilityId: id };
}

export function selectCampaignLens(profile: Readonly<CampaignProfile>, id: LensId): CampaignProfile {
  if (!lensUnlocked(new Set(profile.purchasedNodeIds), id)) throw new Error('Линза не открыта.');
  return profile.selectedLensId === id ? profile : { ...profile, selectedLensId: id };
}

export function calculateCampaignLoadout(base: NightConfig, profile: Readonly<CampaignProfile>): NightConfig {
  const owned = new Set(profile.purchasedNodeIds);
  const { selectedLensId, selectedAbilityId } = profile;
  if (!lensUnlocked(owned, selectedLensId)) throw new Error('Линза не открыта.');
  if (selectedAbilityId !== null && !isCampaignAbilityUnlocked(profile, selectedAbilityId)) throw new Error('Способность не открыта.');

  const ranks = campaignGeneralRanks(owned);
  const config = calculateNightConfig(campaignBeamBase(base, ranks), legacyPurchases(owned), false,
    { lensId: selectedLensId, upgrades: lensPurchases(owned) });
  applyCampaignGeneral(config, ranks);
  config.flash.enabled = selectedAbilityId === 'flash';
  delete config.ability;
  if (selectedAbilityId !== null && selectedAbilityId !== 'flash') {
    const ids = CAMPAIGN_ABILITY_DRAFT.filter(node => owned.has(node.id)).map(node => node.id);
    const rules = calculateCandidateAbility(selectedAbilityId, ids);
    if (rules) config.ability = rules;
  }
  return config;
}

export type CampaignPurchaseBlocker = { code: 'purchased' }
  | { code: 'wins'; required: number; missing: number }
  | { code: 'requires'; nodeIds: string[] }
  | { code: 'shards' | 'pearls'; missing: number };

export interface CampaignPurchaseStat {
  key: string;
  current: number | boolean | string | null;
  next: CampaignPurchaseStat['current'];
}

export interface CampaignPurchaseView {
  node: CampaignPurchaseDraft;
  purchased: boolean;
  available: boolean;
  reasons: CampaignPurchaseBlocker[];
  stats: CampaignPurchaseStat[];
}

function purchaseBlockers(node: CampaignPurchaseDraft, profile: Readonly<CampaignProfile>,
  owned: ReadonlySet<string>, wins: number): CampaignPurchaseBlocker[] {
  if (owned.has(node.id)) return [{ code: 'purchased' }];
  const reasons: CampaignPurchaseBlocker[] = [];
  if (wins < node.winsBeforePurchase) reasons.push({ code: 'wins', required: node.winsBeforePurchase, missing: node.winsBeforePurchase - wins });
  const nodeIds = node.requires.filter(id => !owned.has(id));
  if (nodeIds.length) reasons.push({ code: 'requires', nodeIds });
  if (profile.shards < node.shards) reasons.push({ code: 'shards', missing: node.shards - profile.shards });
  if (profile.pearls < node.pearls) reasons.push({ code: 'pearls', missing: node.pearls - profile.pearls });
  return reasons;
}

function blockerMessage(reason: CampaignPurchaseBlocker): string {
  switch (reason.code) {
    case 'purchased': return 'Узел уже куплен.';
    case 'wins': return `Нужно побед в кампании: ${reason.required}.`;
    case 'requires': return `Сначала купите ${reason.nodeIds.map(id => purchaseById.get(id)!.name).join(', ')}.`;
    case 'shards': return `Не хватает осколков: ${reason.missing}.`;
    case 'pearls': return `Не хватает жемчуга: ${reason.missing}.`;
  }
}

function addDevice(profile: CampaignProfile, kind: DeviceKind, variantId?: DeviceVariantId): CampaignProfile {
  const id = profile.nextDeviceId;
  if (!Number.isSafeInteger(id + 1)) throw new Error('Исчерпаны идентификаторы устройств.');
  const device: CampaignOwnedDevice = { id, kind, health: DEVICE_RULES.definitions[kind].health, consumed: false,
    ...(variantId === undefined ? {} : { variantId }),
    ...(kind === 'light-trap' ? { trapCharges: trapChargeCapacity(legacyPurchases(new Set(profile.purchasedNodeIds))) } : {}) };
  return { ...profile, nextDeviceId: id + 1, inventory: [...profile.inventory, device] };
}

export function purchaseCampaignNode(profile: Readonly<CampaignProfile>, id: string): CampaignProfile {
  const node = purchaseById.get(id);
  if (!node) throw new Error(`Неизвестный узел кампании: ${id}.`);
  const owned = new Set(profile.purchasedNodeIds);
  if (owned.has(id)) return profile;
  const [reason] = purchaseBlockers(node, profile, owned, new Set(profile.wonNightIds).size);
  if (reason) throw new Error(blockerMessage(reason));

  const next = { ...profile, shards: profile.shards - node.shards, pearls: profile.pearls - node.pearls,
    purchasedNodeIds: [...profile.purchasedNodeIds, id] };
  const stat = node.source === 'existing-upgrade' ? upgradeById.get(node.sourceId)!.effect.stat : undefined;
  const kind = DEVICE_KINDS.find(kind => kind === stat);
  return kind ? addDevice(next, kind) : next;
}

function spendShards(profile: Readonly<CampaignProfile>, cost: number): CampaignProfile {
  if (profile.shards < cost) throw new Error('Недостаточно осколков.');
  return { ...profile, shards: profile.shards - cost };
}

export function purchaseCampaignDevice(profile: Readonly<CampaignProfile>, kind: DeviceKind, id: number,
  variantId?: DeviceVariantId, unlockedVariantIds: readonly DeviceVariantId[] = []): CampaignProfile {
  if (!DEVICE_KINDS.includes(kind) || !Number.isSafeInteger(id) || id < 1) throw new Error('Неверный экземпляр.');
  if (variantId !== undefined && DEVICE_VARIANTS[variantId]?.kind !== kind) throw new Error('Вариант не подходит типу устройства.');
  const existing = profile.inventory.find(device => device.id === id);
  if (existing) {
    if (existing.kind !== kind || existing.variantId !== variantId) throw new Error('Идентификатор уже занят другим устройством.');
    return profile;
  }
  if (id !== profile.nextDeviceId) throw new Error('Устаревший идентификатор покупки.');
  if (!UPGRADES.some(node => node.effect.stat === kind && profile.purchasedNodeIds.includes(node.id))) {
    throw new Error('Тип устройства не открыт.');
  }
  if (variantId !== undefined && !unlockedVariantIds.includes(variantId)) throw new Error('Вариант устройства не открыт.');
  return addDevice(spendShards(profile, DEVICE_RULES.definitions[kind].cost), kind, variantId);
}

function serviceDevice(profile: Readonly<CampaignProfile>, device: CampaignOwnedDevice, cost: number): CampaignProfile {
  return { ...spendShards(profile, cost), inventory: profile.inventory.map(item => item.id === device.id ? device : item) };
}

export function repairCampaignDevice(profile: Readonly<CampaignProfile>, id: number): CampaignProfile {
  const device = profile.inventory.find(item => item.id === id);
  if (!device) throw new Error('Устройство не принадлежит игроку.');
  const health = DEVICE_RULES.definitions[device.kind].health;
  if (device.health === health) return profile;
  const cost = repairCost({ ...device, position: null }, legacyPurchases(new Set(profile.purchasedNodeIds)));
  return serviceDevice(profile, { ...device, health }, cost);
}

export function rechargeCampaignDevice(profile: Readonly<CampaignProfile>, id: number): CampaignProfile {
  const device = profile.inventory.find(item => item.id === id);
  if (!device || device.kind !== 'light-trap') throw new Error('Можно перезарядить только свою ловушку.');
  const purchased = legacyPurchases(new Set(profile.purchasedNodeIds));
  const trapCharges = trapChargeCapacity(purchased);
  if (remainingTrapCharges(device) === trapCharges) return profile;
  const cost = rechargeCost({ ...device, position: null }, purchased);
  return serviceDevice(profile, { ...device, trapCharges, consumed: false }, cost);
}

type StatValue = Exclude<CampaignPurchaseStat['current'], null>;
type StatSnapshot = Record<string, StatValue>;

function snapshot(value: object, prefix = '', stats: StatSnapshot = {}): StatSnapshot {
  for (const [name, field] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof field === 'number' || typeof field === 'boolean' || typeof field === 'string') stats[key] = field;
    else if (field && typeof field === 'object') snapshot(field, key, stats);
  }
  return stats;
}

function legacyStats(config: NightConfig, ids: readonly UpgradeId[]): StatSnapshot {
  return snapshot({ beam: config.beam, lighthouseHealth: config.lighthouseHealth, shield: config.shield,
    flash: { ...config.flash, enabled: ids.includes('unlock-flash') }, devices: config.devices,
    deviceUnlocked: Object.fromEntries(DEVICE_KINDS.map(kind => [kind, config.availableDevices?.includes(kind) ?? false])),
    progression: config.progression, pairedDamageBonus: config.pairedDamageBonus ?? 0,
    repairCostMultiplier: engineeringRepairMultiplier(ids), rechargeCostMultiplier: trapRechargeMultiplier(ids) });
}

function legacyDependencies(id: UpgradeId, required = new Set<UpgradeId>()): Set<UpgradeId> {
  for (const dependency of upgradeById.get(id)!.requires) {
    if (required.has(dependency)) continue;
    required.add(dependency);
    legacyDependencies(dependency, required);
  }
  return required;
}

// Isolate each original node's effect from its requirements, including for locked previews.
// Run the existing calculator on valid configurations rather than duplicating its stat formulas.
let legacyChanges: ReadonlyMap<string, readonly CampaignPurchaseStat[]> | undefined;
function getLegacyChanges(): ReadonlyMap<string, readonly CampaignPurchaseStat[]> {
  return legacyChanges ??= new Map(UPGRADES.map(node => {
    const beforeIds = [...legacyDependencies(node.id)];
    const afterIds = [...beforeIds, node.id];
    const base = { ...NIGHT_CONFIG, availableDevices: [] };
    const before = legacyStats(calculateNightConfig(base, beforeIds), beforeIds);
    const after = legacyStats(calculateNightConfig(base, afterIds), afterIds);
    const changes = Object.entries(after).flatMap(([key, next]) => {
      const current = before[key] ?? (typeof next === 'number' ? 0 : null);
      return current === next ? [] : [{ key, current, next }];
    });
    return [node.id, changes];
  }));
}

function beamLensScale(key: string, lensId: LensId): number {
  const lens = lensById.get(lensId)!;
  if (key === 'beam.range') return lens.rangeMultiplier;
  if (key === 'beam.halfAngle') return lens.widthMultiplier;
  if (key === 'beam.damagePerSecond') return lens.damageMultiplier;
  return 1;
}

function lensStats(config: NightConfig): StatSnapshot {
  return snapshot({ beam: { range: config.beam.range, halfAngle: config.beam.halfAngle,
    damagePerSecond: config.beam.damagePerSecond, maxTargets: config.beam.maxTargets },
    lens: config.lens, pairedDamageBonus: config.pairedDamageBonus ?? 0 });
}

const lensStatKeys = {
  range: 'beam.range', halfAngle: 'beam.halfAngle', damagePerSecond: 'beam.damagePerSecond', maxTargets: 'beam.maxTargets',
  slowMultiplier: 'lens.slowMultiplier', armorMultiplier: 'lens.armorMultiplier', pairedDamageBonus: 'pairedDamageBonus',
  focusDamageBonus: 'lens.focus.damageBonus', burnDamagePerSecond: 'lens.burn.damagePerSecond',
  burnDuration: 'lens.burn.seconds', resonanceDamageBonus: 'lens.resonance.damageBonus',
} as const;

function generalStats(effect: CampaignGeneralEffect): StatSnapshot {
  switch (effect.kind) {
    case 'conditionalBeamDamage': return { bonus: effect.bonus, combinedConditionalBonusCap: effect.combinedConditionalBonusCap };
    case 'quickTurn': return { ...effect.rules };
    case 'beamGeometry': return {};
    case 'onslaughtResilience': return { reduction: effect.reduction, durationSeconds: effect.durationSeconds,
      totalHullReductionCap: effect.totalHullReductionCap };
    case 'emergencyWindow': return { additionalSeconds: effect.additionalSeconds };
    case 'shieldStabilization': return { ...effect.rules };
    case 'bombardmentProtection': return { reduction: effect.reduction, totalDeviceReductionCap: effect.totalDeviceReductionCap };
    case 'backupControl': return { durationMultiplier: effect.durationMultiplier };
  }
}

/** Compare against the standard night rules. Lens branch previews assume that branch is equipped. */
export function campaignPurchaseViews(profile: Readonly<CampaignProfile>): CampaignPurchaseView[] {
  const owned = new Set(profile.purchasedNodeIds);
  const wins = new Set(profile.wonNightIds).size;
  const ranks = campaignGeneralRanks(owned);
  const base = campaignBeamBase(NIGHT_CONFIG, ranks);
  const legacyIds = legacyPurchases(owned);
  const lensIds = lensPurchases(owned);
  const abilityIds = CAMPAIGN_ABILITY_DRAFT.filter(node => owned.has(node.id)).map(node => node.id);
  const lensSnapshots = new Map<LensId, StatSnapshot>();
  const abilitySnapshots = new Map<Exclude<CampaignAbilityId, 'flash'>, StatSnapshot>();
  const selectedConfig = calculateNightConfig(base, legacyIds, false, { lensId: profile.selectedLensId, upgrades: lensIds });
  const currentLegacy = legacyStats(selectedConfig, legacyIds);
  const currentLens = lensStats(selectedConfig);
  lensSnapshots.set(profile.selectedLensId, currentLens);
  const legacyDeltas = getLegacyChanges();

  function statsFor(node: CampaignPurchaseDraft, purchased: boolean): CampaignPurchaseStat[] {
    switch (node.source) {
      case 'existing-upgrade': return legacyDeltas.get(node.sourceId)!.map(change => {
        const { key } = change;
        const current = currentLegacy[key] ?? change.current;
        const next = typeof change.next === 'number' && typeof change.current === 'number' && typeof current === 'number'
          ? current + (change.next - change.current) * beamLensScale(key, profile.selectedLensId) : change.next;
        return { key, current, next: purchased ? current : next };
      });
      case 'existing-lens-unlock': {
        const lens = lensById.get(node.sourceId)!;
        const destination = readLens(lens.id);
        const stats: CampaignPurchaseStat[] = [{ key: 'lens.unlocked', current: purchased, next: true }];
        for (const key of new Set([...Object.keys(currentLens), ...Object.keys(destination)])) {
          const next = destination[key] ?? null;
          const current = purchased ? next : currentLens[key] ?? null;
          if (current !== next) stats.push({ key, current, next });
        }
        return stats;
      }
      case 'existing-lens-upgrade': {
        const upgrade = lensUpgradeById.get(node.sourceId)!;
        const key = lensStatKeys[upgrade.effect.stat];
        const current = Number(readLens(upgrade.lensId)[key]);
        return [{ key, current, next: purchased ? current : current + upgrade.effect.amount }];
      }
      case 'general-draft': {
        const general = generalById.get(node.sourceId)!;
        const { effect, family } = general;
        if (effect.kind === 'beamGeometry') {
          const key = `beam.${effect.stat}`;
          const current = selectedConfig.beam[effect.stat];
          return [{ key, current, next: purchased ? current : current + effect.amount * beamLensScale(key, profile.selectedLensId) }];
        }
        const active = ranks.get(family);
        const current = active ? generalStats(active.effect) : {};
        return Object.entries(generalStats(effect)).map(([stat, value]) => {
          const before = current[stat] ?? (stat === 'durationMultiplier' ? 1 : 0);
          return { key: `campaignGeneral.${family}.${stat}`, current: before, next: purchased ? before : value };
        });
      }
      case 'ability-draft': {
        const ability = abilityNodeById.get(node.sourceId)!;
        const { abilityId } = ability;
        let rules = abilitySnapshots.get(abilityId);
        if (!rules) {
          const unlockId = `ability-${abilityId}-unlock` as const;
          const ids = owned.has(unlockId) ? abilityIds : [...abilityIds, unlockId];
          rules = snapshot(calculateCandidateAbility(abilityId, ids)!);
          abilitySnapshots.set(abilityId, rules);
        }
        if (ability.kind === 'unlock') {
          const stats: CampaignPurchaseStat[] = [{ key: 'ability.unlocked', current: purchased, next: true }];
          for (const [stat, next] of Object.entries(rules)) {
            if (stat !== 'abilityId') stats.push({ key: `ability.${stat}`, current: purchased ? next : null, next });
          }
          return stats;
        }
        return ABILITY_NUMERIC_NODES.find(node => node.id === ability.id)!.adjustments.map(({ stat, amount }) => {
          const current = Number(rules[stat]);
          return { key: `ability.${stat}`, current, next: purchased ? current : current + amount };
        });
      }
    }
  }

  function readLens(id: LensId): StatSnapshot {
    const cached = lensSnapshots.get(id);
    if (cached) return cached;
    const stats = lensStats(calculateNightConfig(base, legacyIds, false, { lensId: id, upgrades: lensIds }));
    lensSnapshots.set(id, stats);
    return stats;
  }

  return CAMPAIGN_PURCHASE_DRAFT.map(node => {
    const purchased = owned.has(node.id);
    const reasons = purchaseBlockers(node, profile, owned, wins);
    return { node: { ...node, requires: [...node.requires] }, purchased, available: reasons.length === 0, reasons,
      stats: statsFor(node, purchased) };
  });
}
