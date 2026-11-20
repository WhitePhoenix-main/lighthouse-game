import type { DeviceDeployment, DevicePlacement, EnemyKind, SaveStore } from '../contracts';
import type { CampaignStoryDraftNightId } from '../content/campaignFoundationDraft';
import { settleCampaignAttempt } from './campaignAttempt';
import { editCampaignLayout, replaceCampaignLayout, selectCampaignNight, type CampaignLayoutEdit, type CampaignPreparationRules } from './campaignPreparation';
import { decodeCampaignProfile, emptyCampaignProfile, encodeCampaignProfile } from './campaignProfileCodec';
import type { CampaignAttempt, CampaignProfile, CampaignSettlement } from './campaignProfileTypes';

interface PendingCampaignProfile {
  raw: string;
  profile: CampaignProfile;
}

export class CampaignProfileRepository {
  private raw: string | null = null;
  private profile: CampaignProfile | null = null;
  private pending: PendingCampaignProfile | null = null;

  constructor(private readonly store: SaveStore) {}

  load(): void {
    this.requireNoPending();
    this.profile = null;
    const raw = this.store.read();
    const profile = raw === null ? emptyCampaignProfile() : decodeCampaignProfile(raw);
    this.raw = raw;
    this.profile = profile;
  }

  get current(): CampaignProfile {
    return structuredClone(this.requireLoaded());
  }

  get hasProfile(): boolean {
    this.requireLoaded();
    return this.raw !== null;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  ensureProfile(): void {
    this.requireNoPending();
    this.saveIfChanged(this.requireLoaded(), true);
  }

  resetProfile(): void {
    this.requireNoPending();
    this.requirePreparation();
    this.saveIfChanged(emptyCampaignProfile(), true);
  }

  beginAttempt(attempt: CampaignAttempt): void {
    this.requireNoPending();
    const profile = this.requireLoaded();
    if (profile.lastSettled?.id === attempt.id) throw new Error('Попытка кампании уже завершена.');
    if (profile.activeAttempt && profile.activeAttempt.id !== attempt.id) throw new Error('Уже есть активная попытка кампании.');
    const next = decodeCampaignProfile(encodeCampaignProfile({ ...profile, activeAttempt: attempt }));
    if (profile.activeAttempt && JSON.stringify(profile.activeAttempt) !== JSON.stringify(next.activeAttempt)) {
      throw new Error('Повторный старт не совпадает с активной попыткой кампании.');
    }
    this.saveIfChanged(next);
  }

  settleAttempt(id: string, outcome: CampaignSettlement['outcome'], reward: number,
    encountered: readonly EnemyKind[], devices: readonly DeviceDeployment[]): void {
    this.requireNoPending();
    const profile = this.requireLoaded();
    const next = settleCampaignAttempt(profile, id, outcome, reward, encountered, devices);
    if (next === profile) this.confirmUnchanged();
    else this.saveIfChanged(decodeCampaignProfile(encodeCampaignProfile(next)));
  }

  updatePreparation(edit: (profile: Readonly<CampaignProfile>) => CampaignProfile): void {
    this.requireNoPending();
    const profile = this.requirePreparation();
    const next = decodeCampaignProfile(encodeCampaignProfile(edit(structuredClone(profile))));
    this.requireNoPending();
    if (profile !== this.profile) throw new Error('Профиль кампании изменился при подготовке.');
    if (next.activeAttempt !== null || JSON.stringify(next.lastSettled) !== JSON.stringify(profile.lastSettled)
      || next.completedNights !== profile.completedNights || JSON.stringify(next.wonNightIds) !== JSON.stringify(profile.wonNightIds)
      || JSON.stringify(next.encountered) !== JSON.stringify(profile.encountered)) {
      throw new Error('Операция подготовки меняет попытку или результаты боёв кампании.');
    }
    this.saveIfChanged(next);
  }

  selectNight(nightId: CampaignStoryDraftNightId): void {
    this.updatePreparation(profile => selectCampaignNight(profile, nightId));
  }

  editLayout(rules: CampaignPreparationRules, edit: CampaignLayoutEdit): void {
    this.updatePreparation(profile => editCampaignLayout(profile, rules, edit));
  }

  replaceLayout(rules: CampaignPreparationRules, placements: readonly DevicePlacement[]): void {
    this.updatePreparation(profile => replaceCampaignLayout(profile, rules, placements));
  }

  retryPending(): void {
    this.requireLoaded();
    const pending = this.pending;
    if (!pending || this.confirmPending(pending)) return;

    try {
      this.store.write(pending.raw);
    } catch (error) {
      if (this.confirmPending(pending)) return;
      throw error;
    }
    if (!this.confirmPending(pending)) throw new Error('Запись профиля кампании не подтверждена.');
  }

  cancelPending(): 'cancelled' | 'committed' | 'none' {
    this.requireLoaded();
    const pending = this.pending;
    if (!pending) return 'none';
    const stored = this.store.read();
    if (stored === pending.raw) {
      this.accept(pending);
      return 'committed';
    }
    this.pending = null;
    if (stored !== this.raw) this.profile = null;
    return 'cancelled';
  }

  private requireNoPending(): void {
    if (this.pending) throw new Error('Сначала подтвердите или отмените ожидающую запись профиля кампании.');
  }

  private requireLoaded(): CampaignProfile {
    if (this.profile === null) throw new Error('Сначала загрузите профиль кампании.');
    return this.profile;
  }

  private requirePreparation(): CampaignProfile {
    const profile = this.requireLoaded();
    if (profile.activeAttempt) throw new Error('Сначала завершите активную попытку кампании.');
    return profile;
  }

  private saveIfChanged(profile: CampaignProfile, createIfMissing = false): void {
    const raw = encodeCampaignProfile(profile);
    if ((!createIfMissing || this.raw !== null) && raw === encodeCampaignProfile(this.requireLoaded())) {
      this.confirmUnchanged();
      return;
    }
    this.pending = { raw, profile };
    this.retryPending();
  }

  private confirmPending(pending: PendingCampaignProfile): boolean {
    const stored = this.store.read();
    if (stored === pending.raw) {
      this.accept(pending);
      return true;
    }
    if (stored !== this.raw) throw new Error('Профиль кампании изменился в хранилище.');
    return false;
  }

  private confirmUnchanged(): void {
    if (this.store.read() === this.raw) return;
    this.profile = null;
    throw new Error('Профиль кампании изменился в хранилище.');
  }

  private accept(pending: PendingCampaignProfile): void {
    this.raw = pending.raw;
    this.profile = pending.profile;
    this.pending = null;
  }
}
