import { describe, expect, it, vi } from 'vitest';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { CampaignProfileRepository } from '../src/application/campaignProfileRepository';
import type { CampaignAttempt, CampaignProfile } from '../src/application/campaignProfileTypes';
import { abandonCampaignReward, campaignRewardLedger, campaignRewardOffer, claimCampaignReward, confirmCampaignReward,
  prepareCampaignReward } from '../src/application/campaignRewards';
import { CAMPAIGN_STORY_DRAFT, type CampaignStoryDraftNightId } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_REWARD_WINDOW_MS } from '../src/content/campaignRewards';
import { DEVICE_RULES } from '../src/content/devices';
import type { SaveStore } from '../src/contracts';
import { purchaseCampaignDevice } from '../src/progression/campaignProgression';

const now = 100_000_000;
const request = { kind: 'shards' } as const;
const attempt: CampaignAttempt = { id: 'night', seed: 1, nightId: 'first-light', mapId: 'headland', rulesVersion: 'test',
  lensId: 'basic', abilityId: null, devices: [], firstWinShards: 20, firstWinPearls: 0 };

class MemoryStore implements SaveStore {
  constructor(public value: string | null = null) {}
  read = vi.fn(() => this.value);
  write = vi.fn((raw: string) => { this.value = raw; });
}

function open(store: SaveStore): CampaignProfileRepository {
  const repository = new CampaignProfileRepository(store);
  repository.load();
  return repository;
}

function prepare(repository: CampaignProfileRepository, id = 'show'): void {
  const offer = campaignRewardOffer(repository.current, request, now);
  repository.updatePreparation(profile => prepareCampaignReward(profile, id, offer, now));
}

function confirm(repository: CampaignProfileRepository, id = 'show', confirmedAt = now): void {
  repository.updatePreparation(profile => confirmCampaignReward(profile, id, confirmedAt));
}

function decode(value: unknown): CampaignProfile {
  return decodeCampaignProfile(JSON.stringify(value));
}

function winsThrough(id: CampaignStoryDraftNightId) {
  const wonNightIds = CAMPAIGN_STORY_DRAFT.slice(0, CAMPAIGN_STORY_DRAFT.findIndex(night => night.id === id) + 1).map(night => night.id);
  return { wonNightIds, completedNights: wonNightIds.length };
}

describe('campaign reward save and callbacks', () => {
  it('loads a campaign v1 profile without a ledger and keeps its progress', () => {
    const profile = { ...emptyCampaignProfile(), shards: 52, selectedNightId: 'broken-shore' as const,
      wonNightIds: ['first-light'], completedNights: 1 };
    const store = new MemoryStore(JSON.stringify(profile));
    const repository = open(store);
    expect(repository.current).toEqual(profile);
    expect(campaignRewardLedger(repository.current)).toEqual({ operations: [], unlockedIds: [], collectionPoints: {}, equipped: {} });
    expect(store.write).not.toHaveBeenCalled();
    prepare(repository);
    expect(open(store).current).toMatchObject({ ...profile, rewards: { operations: [{ id: 'show', status: 'pending' }] } });
  });

  it('retains exact failed preparation and only exposes the intent after a verified write', () => {
    const store = new MemoryStore();
    const repository = open(store);
    store.write.mockImplementationOnce(() => { throw new Error('before provider'); });
    expect(() => prepare(repository)).toThrow('before provider');
    expect(repository.hasPending).toBe(true);
    expect(open(store).current.rewards).toBeUndefined();
    expect(() => confirm(repository)).toThrow('ожидающую запись');

    repository.retryPending();
    expect(store.write.mock.calls).toEqual([[store.value], [store.value]]);
    const restarted = open(store);
    expect(campaignRewardLedger(restarted.current).operations).toEqual([{
      id: 'show', request, amount: 10, status: 'pending', preparedAt: now,
    }]);
    expect(restarted.current.shards).toBe(0);
    confirm(restarted);
    expect(open(store).current.shards).toBe(10);
  });

  it('recovers a failed post-callback write and replays the same confirmation across reload', () => {
    const store = new MemoryStore();
    const repository = open(store);
    prepare(repository);
    store.write.mockImplementationOnce(() => { throw new Error('after callback'); });
    expect(() => confirm(repository)).toThrow('after callback');
    expect(open(store).current).toMatchObject({ shards: 0, rewards: { operations: [{ status: 'pending' }] } });
    expect(() => prepare(repository, 'another')).toThrow('ожидающую запись');

    repository.retryPending();
    const restarted = open(store);
    confirm(restarted, 'show', now + CAMPAIGN_REWARD_WINDOW_MS);
    expect(restarted.current).toMatchObject({ shards: 10, rewards: { operations: [{ status: 'confirmed', confirmedAt: now }] } });
    expect(store.write.mock.calls).toHaveLength(3);
    expect(store.write.mock.calls[1]).toEqual(store.write.mock.calls[2]);
  });

  it('recognizes a committed confirmation after both acknowledgement and readback were lost', () => {
    const store = new MemoryStore();
    const repository = open(store);
    prepare(repository);
    store.write.mockImplementationOnce(raw => { store.value = raw; throw new Error('write acknowledgement'); });
    store.read.mockImplementationOnce(() => store.value).mockImplementationOnce(() => { throw new Error('readback'); });
    expect(() => confirm(repository)).toThrow('readback');
    expect(repository.current.shards).toBe(0);
    expect(repository.hasPending).toBe(true);

    const restarted = open(store);
    confirm(restarted);
    expect(repository.cancelPending()).toBe('committed');
    expect(repository.current).toEqual(restarted.current);
    expect(restarted.current.shards).toBe(10);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('protects concurrent profile changes and reissues after reloading without dropping the external balance', () => {
    const store = new MemoryStore();
    const stale = open(store);
    prepare(stale);
    const fresh = open(store);
    fresh.updatePreparation(profile => ({ ...profile, shards: 13 }));
    const foreign = store.value;
    expect(() => confirm(stale)).toThrow('изменился в хранилище');
    expect(() => stale.retryPending()).toThrow('изменился в хранилище');
    expect(store.value).toBe(foreign);
    expect(stale.cancelPending()).toBe('cancelled');
    stale.load();
    confirm(stale);
    expect(open(store).current.shards).toBe(23);
  });

  it('records a cancellation across reload and ignores a late callback', () => {
    const store = new MemoryStore();
    const repository = open(store);
    prepare(repository);
    const restarted = open(store);
    restarted.updatePreparation(profile => abandonCampaignReward(profile, 'show'));
    const afterDismiss = open(store);
    confirm(afterDismiss);
    expect(afterDismiss.current).toMatchObject({ shards: 0, rewards: { operations: [{ status: 'abandoned' }] } });
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('keeps both an earned reward and an open intent through an interrupted night', () => {
    const store = new MemoryStore();
    const repository = open(store);
    prepare(repository);
    confirm(repository);
    prepare(repository, 'next-show');
    const before = repository.current;
    repository.beginAttempt(attempt);
    const restarted = open(store);
    expect(campaignRewardOffer(restarted.current, request, now).unavailableReason).toBe('active-attempt');
    expect(() => confirm(restarted, 'next-show')).toThrow('активную попытку');
    restarted.settleAttempt(attempt.id, 'interrupted', 999, [], []);
    expect(open(store).current).toMatchObject({ rewards: before.rewards, shards: 10, activeAttempt: null });
    confirm(restarted, 'next-show');
    confirm(restarted, 'show');
    expect(open(store).current.shards).toBe(20);
  });

  it('rejects malformed operations, false unlocks and an invalid equipped slot', () => {
    const initial = emptyCampaignProfile();
    const offered = prepareCampaignReward(initial, 'show', campaignRewardOffer(initial, request, now), now);
    const confirmed = confirmCampaignReward(offered, 'show', now);
    const initialLedger = campaignRewardLedger(initial);
    const confirmedLedger = campaignRewardLedger(confirmed);
    const operation = confirmedLedger.operations[0]!;
    expect(() => decode({ ...initial, rewards: null })).toThrow('журнал наград');
    expect(() => decode({ ...initial, rewards: { ...initialLedger, unlockedIds: ['siege-cannon'] } })).toThrow('открытия');
    expect(() => decode({ ...initial, rewards: { ...initialLedger, equipped: { beam: 'dawn-beacon' } } })).toThrow('оформление');
    expect(() => decode({ ...initial, rewards: { ...initialLedger, collectionPoints: { moonbeam: 1 } } })).toThrow('очки');
    expect(() => decode({ ...confirmed, rewards: { ...confirmedLedger, operations: [operation, operation] } })).toThrow('операция');
    expect(() => decode({ ...confirmed, rewards: { ...confirmedLedger, operations: [{ ...operation, confirmedAt: now - 1 }] } })).toThrow('время');
    expect(() => decode({ ...confirmed, rewards: { ...confirmedLedger, operations: [{ ...operation, amount: 0 }] } })).toThrow('операция');
  });

  it('keeps historical packages, limits and collection progress when current offers differ', () => {
    const operations = [
      ...['old-one', 'old-two', 'old-three'].map(id => ({ id, request, amount: 9, status: 'confirmed' as const, preparedAt: now, confirmedAt: now })),
      { id: 'old-collection', request: { kind: 'collection', rewardId: 'bronze-devices' }, amount: 4, status: 'confirmed',
        preparedAt: now, confirmedAt: now },
    ];
    const historical = { ...emptyCampaignProfile(), ...winsThrough('first-light'), shards: 27, rewards: { operations,
      unlockedIds: ['dawn-beacon', 'bronze-devices'], collectionPoints: { 'bronze-devices': 4 }, equipped: { beacon: 'dawn-beacon' } } };
    const store = new MemoryStore(JSON.stringify(historical));
    const repository = open(store);
    expect(repository.current).toEqual(historical);
    expect(campaignRewardOffer(repository.current, request, now)).toMatchObject({ amount: 10, remainingGlobal: 0,
      remainingCategory: 0, unavailableReason: 'global-limit' });
    expect(campaignRewardOffer(repository.current, request, now + CAMPAIGN_REWARD_WINDOW_MS)).toMatchObject({ unavailableReason: null });
    repository.selectNight('broken-shore');
    expect(open(store).current).toEqual({ ...historical, selectedNightId: 'broken-shore' });
  });

  it('requires a variant of the right unlocked base kind and preserves its identity in the snapshot and result', () => {
    const initial = { ...emptyCampaignProfile(), ...winsThrough('ashen-cliffs-03'), purchasedNodeIds: ['unlock-cannon'],
      nextDeviceId: 2, layouts: { headland: [{ deviceId: 1, x: -165, y: 0 }] },
      inventory: [{ id: 1, kind: 'cannon', variantId: 'siege-cannon', health: 45, consumed: false }] } as const;
    expect(() => decode(initial)).toThrow('вариант экземпляра');
    const valid = claimCampaignReward(decode({ ...initial, inventory: [{ ...initial.inventory[0], variantId: undefined }] }), 'siege-cannon');
    expect(() => decode({ ...valid, inventory: [{ ...initial.inventory[0], variantId: 'invented' }] })).toThrow('вариант экземпляра');
    const both = { ...valid, ...winsThrough('ashen-cliffs-06') };
    expect(() => decode({ ...claimCampaignReward(both, 'long-harpoon'), inventory: [{ ...initial.inventory[0], variantId: 'long-harpoon' }] }))
      .toThrow('вариант экземпляра');

    const store = new MemoryStore(JSON.stringify({ ...valid, inventory: initial.inventory }));
    const repository = open(store);
    const position = { x: -165, y: 0 };
    const original = { ...initial.inventory[0], ...position };
    const baseSnapshot = { ...original, variantId: undefined };
    expect(() => repository.beginAttempt({ ...attempt, devices: [baseSnapshot] })).toThrow('стартового снимка');
    repository.beginAttempt({ ...attempt, devices: [original] });
    const restarted = open(store);
    expect(restarted.current.activeAttempt?.devices).toEqual([original]);
    expect(() => restarted.settleAttempt(attempt.id, 'defeat', 0, [], [baseSnapshot])).toThrow('стартовым снимком');
    restarted.settleAttempt(attempt.id, 'defeat', 0, [], [{ ...original, health: 11 }]);
    expect(open(store).current.inventory).toEqual([{ ...initial.inventory[0], health: 11 }]);
  });

  it('opens the variant without charging or issuing an instance, then charges its purchase only once', () => {
    const cannon = { id: 1, kind: 'cannon', health: 45, consumed: false } as const;
    const cost = DEVICE_RULES.definitions.cannon.cost;
    const initial = { ...emptyCampaignProfile(), ...winsThrough('ashen-cliffs-03'), shards: cost * 2,
      purchasedNodeIds: ['unlock-cannon'], inventory: [cannon], nextDeviceId: 2 };
    const store = new MemoryStore(JSON.stringify(initial));
    const repository = open(store);
    const purchase = (profile: Readonly<CampaignProfile>) => purchaseCampaignDevice(profile, 'cannon', 2, 'siege-cannon',
      campaignRewardLedger(profile).unlockedIds.filter(id => id === 'siege-cannon'));
    expect(() => repository.updatePreparation(purchase)).toThrow('не открыт');

    repository.updatePreparation(profile => claimCampaignReward(profile, 'siege-cannon'));
    expect(repository.current).toMatchObject({ inventory: [cannon], shards: cost * 2, nextDeviceId: 2 });
    repository.updatePreparation(purchase);
    const restarted = open(store);
    restarted.updatePreparation(purchase);
    restarted.updatePreparation(profile => claimCampaignReward(profile, 'siege-cannon'));
    expect(restarted.current).toMatchObject({ inventory: [cannon, { id: 2, kind: 'cannon', variantId: 'siege-cannon' }],
      shards: cost, nextDeviceId: 3 });
    expect(store.write).toHaveBeenCalledTimes(2);
  });
});
