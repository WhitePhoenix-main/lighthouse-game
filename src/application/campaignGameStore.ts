import type { CampaignGameView, CampaignRewardOffer, RewardPreviewDecision } from './campaignView';
import type { AttemptRecord, DeviceDeployment, DeviceKind, DevicePlacement, DeviceVariantId, EnemyKind, LensId, LensUpgradeId, NightConfig, NightId, Profile, SaveStore, SettledAttempt, UpgradeId } from '../contracts';
import { CAMPAIGN_ABILITY_DRAFT } from '../content/campaignAbilityDraft';
import { campaignChapterFor, campaignFirstRewards, campaignIntro } from '../content/campaignRuntime';
import { campaignLensUnlockId } from '../content/campaignTreeDraft';
import { LENSES, LENS_UPGRADES } from '../content/lenses';
import { UPGRADES } from '../content/upgrades';
import { calculateCampaignLoadout, campaignPurchaseViews, purchaseCampaignDevice, purchaseCampaignNode, rechargeCampaignDevice,
  repairCampaignDevice, selectCampaignAbility, selectCampaignLens } from '../progression/campaignProgression';
import { CampaignProfileRepository } from './campaignProfileRepository';
import type { CampaignAbilityId, CampaignProfile, CampaignRewardRequest } from './campaignProfileTypes';
import { abandonCampaignReward, campaignRewardCollection, campaignRewardLedger, campaignRewardOffer, claimCampaignReward, confirmCampaignReward,
  equipCampaignCosmetic, prepareCampaignReward } from './campaignRewards';
import { CAMPAIGN_REWARD_WINDOW_MS, type CampaignCosmeticId, type CampaignCosmeticSlot, type CampaignRewardId } from '../content/campaignRewards';

const abilityTitles: Readonly<Record<CampaignAbilityId, readonly [string, string]>> = {
  flash: ['Вспышка', 'Flash'], overload: ['Перегрузка света', 'Light Overload'], seal: ['Печать сдерживания', 'Seal'],
  barrage: ['Орудийный залп', 'Barrage'], bastion: ['Бастион Авалона', 'Bastion'],
};

export interface CampaignRewardPreview {
  /** A development adapter returns the outcome of a deliberately simulated view. */
  finish(result: RewardPreviewDecision): RewardPreviewDecision;
}
interface ResolvedRewardPreview {
  id: string;
  result: RewardPreviewDecision;
  at: number;
}

export class CampaignGameStore {
  private readonly repository: CampaignProfileRepository;
  private pendingKey: string | object | null = null;
  private readonly completedResets = new WeakSet<object>();

  constructor(store: SaveStore, private readonly rewardPreview?: CampaignRewardPreview, private readonly now = Date.now) {
    this.repository = new CampaignProfileRepository(store);
  }

  get hasProfile(): boolean { return this.repository.hasProfile; }
  get selectedNightId() { return this.repository.current.selectedNightId; }

  get current(): { profile: Profile; activeAttempt: AttemptRecord | null } {
    const profile = this.repository.current;
    const map = campaignChapterFor(profile.selectedNightId).chapter.mapId;
    const active = profile.activeAttempt;
    return { profile: {
      resources: profile.shards, bossMaterials: profile.pearls, bossLevel: 1, legacyEquipment: false,
      completedNights: profile.completedNights, encountered: profile.encountered, nextDeviceId: profile.nextDeviceId,
      wonNightIds: profile.wonNightIds, purchasedUpgrades: UPGRADES.filter(node => profile.purchasedNodeIds.includes(node.id)).map(node => node.id),
      devices: profile.inventory.map(device => {
        const where = profile.layouts[map]?.find(position => position.deviceId === device.id);
        return { ...device, position: where ? { x: where.x, y: where.y } : null };
      }),
      unlockedLenses: LENSES.filter(lens => lens.id === 'basic' || profile.purchasedNodeIds.includes(campaignLensUnlockId(lens.id))).map(lens => lens.id),
      lensUpgrades: LENS_UPGRADES.filter(node => profile.purchasedNodeIds.includes(node.id)).map(node => node.id),
      selectedLensId: profile.selectedLensId,
    }, activeAttempt: active ? { id: active.id, seed: active.seed, nightId: active.nightId, placementCost: 0,
      lensId: active.lensId, deviceSnapshot: active.devices } : null };
  }

  presentationView(includePurchases: boolean): CampaignGameView {
    const profile = this.repository.current;
    const intro = campaignIntro(profile.selectedNightId);
    const ownership = new Set(profile.purchasedNodeIds);
    const rewardTime = this.now();
    const ledger = campaignRewardLedger(profile);
    const pending = ledger.operations.at(-1);
    const nextExpiry = ledger.operations.find(operation => operation.status === 'confirmed'
      && operation.confirmedAt + CAMPAIGN_REWARD_WINDOW_MS > rewardTime);
    return { mapId: campaignChapterFor(profile.selectedNightId).chapter.mapId, selectedAbilityId: profile.selectedAbilityId,
      purchases: includePurchases ? campaignPurchaseViews(profile) : [], intro: profile.seenIntroIds.includes(intro.id) ? null : intro,
      seenIntroIds: profile.seenIntroIds,
      rewards: {
        testAvailable: !!this.rewardPreview,
        currency: [campaignRewardOffer(profile, { kind: 'shards' }, rewardTime), campaignRewardOffer(profile, { kind: 'pearl' }, rewardTime)],
        collection: campaignRewardCollection(profile).map(item => ({
          ...item, offer: campaignRewardOffer(profile, { kind: 'collection', rewardId: item.id }, rewardTime),
        })),
        equipped: ledger.equipped,
        pending: pending?.status === 'pending' ? pending : null,
        refreshInMs: nextExpiry?.status === 'confirmed' ? nextExpiry.confirmedAt + CAMPAIGN_REWARD_WINDOW_MS - rewardTime : null,
      },
      abilities: (Object.keys(abilityTitles) as CampaignAbilityId[]).map(id => ({ id, ru: abilityTitles[id][0], en: abilityTitles[id][1],
        available: id === 'flash' ? ownership.has('unlock-flash')
          : CAMPAIGN_ABILITY_DRAFT.some(node => node.abilityId === id && node.kind === 'unlock' && ownership.has(node.id)) })),
    };
  }

  calculateConfig(base: NightConfig): NightConfig {
    const profile = this.repository.current;
    const repeatBoss = profile.wonNightIds.includes(profile.selectedNightId) && base.id === profile.selectedNightId && base.boss?.campaign;
    // A replay changes approach timing without advancing the boss level or the reward table.
    const config = calculateCampaignLoadout(repeatBoss ? {
      ...base,
      rulesVersion: `${base.rulesVersion}-boss-replay`,
      waves: base.waves.map((wave, index) => index % 2 === 0 ? wave : {
        ...wave, fronts: wave.fronts?.map(front => front === 'north' ? 'south' : 'north'),
      }),
    } : base, profile);
    const { beacon, devices, beam } = campaignRewardLedger(profile).equipped;
    if (beacon || devices || beam) config.campaignAppearance = {
      ...(beacon === 'dawn-beacon' ? { beacon } : {}),
      ...(devices === 'bronze-devices' ? { devices } : {}),
      ...(beam === 'moonbeam' ? { beam } : {}),
    };
    return config;
  }

  load(): void { this.repository.load(); }
  ensureProfile(): void { this.perform('ensure', () => this.repository.ensureProfile()); }
  resetProfile(operation: object): void {
    if (this.completedResets.has(operation)) return;
    this.perform(operation, () => this.repository.resetProfile());
    this.completedResets.add(operation);
  }
  cancelReset(operation: object): 'cancelled' | 'completed' {
    if (this.completedResets.has(operation)) return 'completed';
    if (this.repository.hasPending && this.pendingKey !== operation) throw new Error('Ожидается другая операция кампании.');
    const result = this.repository.cancelPending();
    this.pendingKey = null;
    if (result === 'committed') { this.completedResets.add(operation); return 'completed'; }
    return 'cancelled';
  }

  selectNight(id: NightId): void { this.perform(`night:${id}`, () => this.repository.selectNight(campaignChapterFor(id).night.id)); }
  selectLens(id: LensId): void { this.change(`lens:${id}`, profile => selectCampaignLens(profile, id)); }
  selectAbility(id: CampaignAbilityId | null): void { this.change(`ability:${id}`, profile => selectCampaignAbility(profile, id)); }
  acknowledgeIntro(): void { this.change('intro', profile => {
    const id = campaignIntro(profile.selectedNightId).id;
    return profile.seenIntroIds.includes(id) ? { ...profile } : { ...profile, seenIntroIds: [...profile.seenIntroIds, id] };
  }); }

  purchase(id: UpgradeId): void { this.purchaseNode(id); }
  purchaseNode(id: string): void { this.change(`node:${id}`, profile => purchaseCampaignNode(profile, id)); }
  purchaseLens(id: LensId): void { this.purchaseNode(campaignLensUnlockId(id)); }
  purchaseLensUpgrade(id: LensUpgradeId): void { this.purchaseNode(id); }
  purchaseDevice(kind: DeviceKind, id: number, variantId?: DeviceVariantId): void {
    this.change(`purchase-device:${kind}:${id}:${variantId ?? ''}`, profile => purchaseCampaignDevice(profile, kind, id, variantId,
      campaignRewardLedger(profile).unlockedIds.filter((id): id is DeviceVariantId => id === 'siege-cannon' || id === 'long-harpoon')));
  }
  claimReward(id: CampaignRewardId): void { this.change(`claim-reward:${id}`, profile => claimCampaignReward(profile, id)); }
  equipCosmetic(slot: CampaignCosmeticSlot, id: CampaignCosmeticId | null): void {
    this.change(`equip-cosmetic:${slot}:${id ?? ''}`, profile => equipCampaignCosmetic(profile, slot, id));
  }
  rewardOffer(request: CampaignRewardRequest): CampaignRewardOffer {
    return campaignRewardOffer(this.repository.current, request, this.now());
  }
  beginRewardPreview(id: string, offer: CampaignRewardOffer): void {
    if (!this.rewardPreview) return;
    this.change(JSON.stringify(['reward-preview-start', id, offer.request, offer.amount]),
      profile => prepareCampaignReward(profile, id, offer, this.now()));
  }
  resolveRewardPreview(id: string, decision: RewardPreviewDecision): ResolvedRewardPreview | undefined {
    const result = decision === 'dismissed' ? decision : this.rewardPreview?.finish(decision);
    if (result) return { id, result, at: this.now() };
    return undefined;
  }
  saveRewardResolution({ id, result, at }: ResolvedRewardPreview): void {
    this.change(JSON.stringify(['reward-preview-finish', id, result, at]), profile => result === 'confirmed'
      ? confirmCampaignReward(profile, id, at) : abandonCampaignReward(profile, id));
  }
  repairDevice(id: number): void { this.change(`repair:${id}`, profile => repairCampaignDevice(profile, id)); }
  rechargeDevice(id: number): void { this.change(`recharge:${id}`, profile => rechargeCampaignDevice(profile, id)); }

  savePlacements(placements: readonly DevicePlacement[], config: NightConfig): void {
    this.perform(JSON.stringify(['placements', config.campaignMapId, config.id, config.rulesVersion, placements]), () => {
      const mapId = config.campaignMapId;
      if (!mapId) throw new Error('Карта в подготовке изменилась.');
      this.repository.replaceLayout({ mapId, config }, placements);
    });
  }

  begin(attempt: AttemptRecord, config?: NightConfig): void {
    this.perform(JSON.stringify(['begin', attempt, config?.id, config?.rulesVersion, config?.campaignMapId]), () => {
      const profile = this.repository.current;
      const { night, chapter } = campaignChapterFor(profile.selectedNightId);
      if (!config || attempt.nightId !== night.id || config.campaignMapId !== chapter.mapId || config.id !== night.id || attempt.placementCost !== 0) {
        throw new Error('Ночь кампании изменилась до запуска.');
      }
      this.repository.beginAttempt({ id: attempt.id, seed: attempt.seed, nightId: night.id, mapId: chapter.mapId,
        rulesVersion: config.rulesVersion, lensId: profile.selectedLensId, abilityId: profile.selectedAbilityId,
        devices: attempt.deviceSnapshot ?? [], ...campaignFirstRewards(night.id) });
    });
  }

  settle(id: string, outcome: SettledAttempt['outcome'], reward: number, encountered: readonly EnemyKind[], devices: readonly DeviceDeployment[] = []): void {
    this.perform(JSON.stringify(['settle', id, outcome, reward, encountered, devices]), () => this.repository.settleAttempt(id, outcome, reward, encountered, devices));
  }

  firstRewards(id: NightId, victory: boolean) {
    return victory && !this.repository.current.wonNightIds.includes(campaignChapterFor(id).night.id)
      ? campaignFirstRewards(id) : { firstWinShards: 0, firstWinPearls: 0 };
  }

  private change(key: string, edit: (profile: Readonly<CampaignProfile>) => CampaignProfile): void {
    this.perform(key, () => this.repository.updatePreparation(edit));
  }

  private perform(key: string | object, operation: () => void): void {
    if (this.repository.hasPending && this.pendingKey !== key) throw new Error('Ожидается другая операция кампании.');
    try {
      if (this.repository.hasPending) this.repository.retryPending();
      else operation();
    } finally { this.pendingKey = this.repository.hasPending ? key : null; }
  }
}
