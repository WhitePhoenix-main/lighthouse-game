import { describe, expect, it, vi } from 'vitest';
import { emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { CampaignProfileRepository } from '../src/application/campaignProfileRepository';
import type { CampaignAttempt, CampaignProfile } from '../src/application/campaignProfileTypes';
import { CAMPAIGN_CONTROL_MAPS } from '../src/content/campaignControlMaps';
import { NIGHT_CONFIG } from '../src/content/night';
import type { SaveStore } from '../src/contracts';

const headland = { mapId: 'headland', config: { ...NIGHT_CONFIG, terrain: CAMPAIGN_CONTROL_MAPS.headland.terrain } } as const;
const position = { deviceId: 1, x: -165, y: 0 };
const place = { type: 'place', ...position } as const;
const storeDevice = { type: 'store', deviceId: position.deviceId } as const;
const attempt: CampaignAttempt = { id: 'night-1', seed: 31, nightId: 'first-light', mapId: 'headland',
  rulesVersion: 'test-1', lensId: 'basic', abilityId: null, devices: [], firstWinShards: 20, firstWinPearls: 3 };

class MemoryStore implements SaveStore {
  constructor(public value: string | null = null) {}

  read = vi.fn(() => this.value);
  write = vi.fn((value: string) => { this.value = value; });
}

function open(store: SaveStore): CampaignProfileRepository {
  const repository = new CampaignProfileRepository(store);
  repository.load();
  return repository;
}

function setup() {
  const profile = emptyCampaignProfile();
  profile.wonNightIds.push('first-light');
  profile.completedNights = 1;
  profile.purchasedNodeIds.push('unlock-cannon');
  profile.inventory.push({ id: position.deviceId, kind: 'cannon', health: 70, consumed: false });
  profile.nextDeviceId = position.deviceId + 1;
  const original = JSON.stringify(profile, null, 2);
  const store = new MemoryStore(original);
  return { profile, original, store, repository: open(store) };
}

function expectUnloaded(repository: CampaignProfileRepository): void {
  expect(() => repository.current).toThrow('Сначала загрузите');
  expect(() => repository.hasProfile).toThrow('Сначала загрузите');
  expect(repository.hasPending).toBe(false);
  expect(() => repository.selectNight('first-light')).toThrow('Сначала загрузите');
  expect(() => repository.editLayout(headland, place)).toThrow('Сначала загрузите');
  expect(() => repository.retryPending()).toThrow('Сначала загрузите');
  expect(() => repository.cancelPending()).toThrow('Сначала загрузите');
}

describe('CampaignProfileRepository', () => {
  it('requires load and starts from empty storage without writing', () => {
    const store = new MemoryStore();
    const repository = new CampaignProfileRepository(store);
    expectUnloaded(repository);
    expect(store.read).not.toHaveBeenCalled();

    repository.load();
    expect(repository.current).toEqual(emptyCampaignProfile());
    expect(repository.hasProfile).toBe(false);
    repository.selectNight('first-light');
    repository.retryPending();
    expect(repository.cancelPending()).toBe('none');
    expect(store.write).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it.each(['read', 'parse'] as const)('blocks access after a %s failure until a successful load', failure => {
    const { profile, store, repository } = setup();
    if (failure === 'read') {
      store.read.mockImplementationOnce(() => { throw new Error('read failed'); });
      store.read.mockImplementationOnce(() => { throw new Error('read failed'); });
    } else {
      store.value = '{broken';
    }
    const source = store.value;
    const fresh = new CampaignProfileRepository(store);
    expect(() => fresh.load()).toThrow();
    expectUnloaded(fresh);
    expect(() => repository.load()).toThrow();
    expectUnloaded(repository);
    expect(store.write).not.toHaveBeenCalled();
    expect(store.value).toBe(source);

    store.value = JSON.stringify({ ...profile, selectedNightId: 'broken-shore' });
    repository.load();
    expect(repository.current.selectedNightId).toBe('broken-shore');
    repository.selectNight('first-light');
    expect(open(store).current).toEqual(profile);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('saves night selection and layout changes separately and returns deep copies', () => {
    const { profile, store, repository } = setup();
    store.write.mockImplementationOnce(raw => {
      expect(repository.current).toEqual(profile);
      store.value = raw;
    });

    repository.selectNight('broken-shore');
    expect(open(store).current).toEqual({ ...profile, selectedNightId: 'broken-shore' });
    repository.editLayout(headland, place);
    const snapshot = repository.current;
    expect(snapshot.layouts.headland).toEqual([position]);
    snapshot.layouts.headland![0]!.x = 0;
    snapshot.inventory[0]!.health = 1;
    expect(repository.current.layouts.headland).toEqual([position]);
    expect(repository.current.inventory).toEqual(profile.inventory);
    expect(open(store).current).toEqual(repository.current);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('leaves storage alone for no-ops and rejected preparation commands', () => {
    const { original, store, repository } = setup();
    repository.selectNight('first-light');
    repository.editLayout(headland, storeDevice);
    expect(() => repository.selectNight('far-shore')).toThrow('ещё не открыта');
    expect(() => repository.editLayout(headland, { ...place, deviceId: 999 })).toThrow('Неизвестный экземпляр');
    expect(store.value).toBe(original);
    expect(store.write).not.toHaveBeenCalled();
    expect(repository.cancelPending()).toBe('none');

    repository.editLayout(headland, place);
    open(store).editLayout(headland, place);
    expect(store.write).toHaveBeenCalledTimes(1);
    repository.editLayout(headland, storeDevice);
    expect(open(store).current.layouts.headland ?? []).toEqual([]);
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it.each(['night', 'layout'] as const)('does not confirm a no-op on a stale %s snapshot', operation => {
    const { profile, store, repository } = setup();
    const external = operation === 'night' ? { ...profile, selectedNightId: 'broken-shore' }
      : { ...profile, layouts: { headland: [position] } };
    store.value = JSON.stringify(external);
    const localNoOp = () => operation === 'night' ? repository.selectNight('first-light') : repository.editLayout(headland, storeDevice);

    expect(localNoOp).toThrow('изменился в хранилище');
    expect(() => repository.current).toThrow('загрузите профиль');
    repository.load();
    expect(repository.current).toEqual(external);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('retains a failed write for an exact retry and blocks other commands and load', () => {
    const { profile, original, store, repository } = setup();
    const failure = new Error('write failed');
    store.write.mockImplementationOnce(() => { throw failure; });
    expect(() => repository.editLayout(headland, place)).toThrow(failure);
    expect(repository.current).toEqual(profile);
    expect(store.value).toBe(original);
    expect(open(store).current).toEqual(profile);
    expect(() => repository.selectNight('broken-shore')).toThrow('ожидающую запись');
    expect(() => repository.editLayout(headland, storeDevice)).toThrow('ожидающую запись');
    expect(() => repository.load()).toThrow('ожидающую запись');

    repository.retryPending();
    expect(repository.current.layouts.headland).toEqual([position]);
    expect(store.write.mock.calls).toEqual([[store.value], [store.value]]);
  });

  it('retains an intent if the pre-write read fails and cancels it without writing', () => {
    const { profile, original, store, repository } = setup();
    const failure = new Error('read failed');
    store.read.mockImplementationOnce(() => { throw failure; });
    expect(() => repository.editLayout(headland, place)).toThrow(failure);
    expect(store.write).not.toHaveBeenCalled();
    store.read.mockImplementationOnce(() => { throw failure; });
    expect(() => repository.cancelPending()).toThrow(failure);
    expect(repository.cancelPending()).toBe('cancelled');
    expect(repository.current).toEqual(profile);
    expect(store.write).not.toHaveBeenCalled();
    expect(store.value).toBe(original);
    repository.selectNight('broken-shore');
    expect(repository.current.layouts).toEqual(profile.layouts);
  });

  it('confirms a write that throws after storing the expected string', () => {
    const { store, repository } = setup();
    store.write.mockImplementationOnce(raw => {
      store.value = raw;
      throw new Error('lost acknowledgement');
    });
    repository.selectNight('broken-shore');
    expect(repository.current.selectedNightId).toBe('broken-shore');
    expect(repository.cancelPending()).toBe('none');
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('can reissue a transition after restart if the failed write never reached storage', () => {
    const { profile, store, repository } = setup();
    store.write.mockImplementationOnce(() => { throw new Error('write failed'); });
    expect(() => repository.selectNight('broken-shore')).toThrow('write failed');

    const restarted = open(store);
    expect(restarted.current).toEqual(profile);
    expect(restarted.cancelPending()).toBe('none');
    restarted.selectNight('broken-shore');
    expect(open(store).current.selectedNightId).toBe('broken-shore');
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it.each(['retry', 'cancel'] as const)('confirms a stored write with %s after both write and readback throw', action => {
    const { profile, store, repository } = setup();
    const failure = new Error('confirmation read failed');
    store.write.mockImplementationOnce(raw => {
      store.value = raw;
      throw new Error('lost acknowledgement');
    });
    store.read.mockImplementationOnce(() => store.value).mockImplementationOnce(() => { throw failure; });
    expect(() => repository.selectNight('broken-shore')).toThrow(failure);
    expect(repository.current).toEqual(profile);

    const restarted = open(store);
    expect(restarted.current.selectedNightId).toBe('broken-shore');
    restarted.selectNight('broken-shore');
    if (action === 'retry') repository.retryPending();
    else expect(repository.cancelPending()).toBe('committed');
    expect(repository.current).toEqual(restarted.current);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('requires readback even when write returns normally', () => {
    const { profile, original, store, repository } = setup();
    store.write.mockImplementationOnce(() => {});
    expect(() => repository.selectNight('broken-shore')).toThrow('не подтверждена');
    expect(repository.current).toEqual(profile);
    expect(store.value).toBe(original);
    repository.retryPending();
    expect(repository.current.selectedNightId).toBe('broken-shore');
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('preserves a conflicting string found before writing', () => {
    const { profile, store, repository } = setup();
    const conflicting = JSON.stringify(profile);
    store.value = conflicting;
    expect(() => repository.selectNight('broken-shore')).toThrow('изменился в хранилище');
    expect(store.write).not.toHaveBeenCalled();
    expect(store.value).toBe(conflicting);
    expect(repository.current).toEqual(profile);
    expect(repository.cancelPending()).toBe('cancelled');
    expect(() => repository.current).toThrow('загрузите профиль');
    repository.load();
    expect(repository.current).toEqual(profile);
    expect(store.value).toBe(conflicting);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('leaves a third string untouched during an uncertain write, retry and cancellation', () => {
    const { profile, store, repository } = setup();
    const conflicting = JSON.stringify({ ...profile, shards: profile.shards + 5 });
    store.write.mockImplementationOnce(() => {
      store.value = conflicting;
      throw new Error('lost acknowledgement');
    });

    expect(() => repository.selectNight('broken-shore')).toThrow('изменился в хранилище');
    expect(() => repository.retryPending()).toThrow('изменился в хранилище');
    expect(repository.cancelPending()).toBe('cancelled');
    expect(() => repository.current).toThrow('загрузите профиль');
    expect(store.value).toBe(conflicting);
    expect(store.write).toHaveBeenCalledTimes(1);
    repository.load();
    expect(repository.current).toEqual({ ...profile, shards: profile.shards + 5 });
    expect(repository.cancelPending()).toBe('none');
  });

  it('ensures a profile once and resets to a stored empty profile only when explicitly called', () => {
    const store = new MemoryStore();
    const repository = open(store);
    repository.ensureProfile();
    expect(repository.hasProfile).toBe(true);
    repository.ensureProfile();
    repository.resetProfile();
    expect(store.write).toHaveBeenCalledTimes(1);

    repository.updatePreparation(profile => ({ ...profile, purchasedNodeIds: ['beam-power-1'], shards: 47 }));
    repository.resetProfile();
    repository.resetProfile();
    expect(store.write).toHaveBeenCalledTimes(3);
    expect(open(store).hasProfile).toBe(true);
    expect(repository.current).toEqual(emptyCampaignProfile());
    expect(open(store).current).toEqual(repository.current);
  });

  it('publishes creation only after confirmation and can explicitly retry the same record', () => {
    const store = new MemoryStore();
    const repository = open(store);
    store.write.mockImplementationOnce(() => { throw new Error('creation failed'); });
    expect(() => repository.ensureProfile()).toThrow('creation failed');
    expect(repository.hasProfile).toBe(false);
    expect(repository.hasPending).toBe(true);
    expect(() => repository.resetProfile()).toThrow('ожидающую запись');
    repository.retryPending();
    expect(repository.hasProfile).toBe(true);
    expect(repository.hasPending).toBe(false);
    expect(store.write.mock.calls).toEqual([[store.value], [store.value]]);
  });

  it('confirms a reset after restart and retry without writing twice', () => {
    const { profile, store, repository } = setup();
    const failure = new Error('confirmation unavailable');
    store.read.mockImplementationOnce(() => store.value).mockImplementationOnce(() => { throw failure; });
    expect(() => repository.resetProfile()).toThrow(failure);
    expect(repository.hasPending).toBe(true);
    expect(repository.current).toEqual(profile);
    const restarted = open(store);
    expect(restarted.current).toEqual(emptyCampaignProfile());
    restarted.resetProfile();
    repository.retryPending();
    expect(repository.hasPending).toBe(false);
    expect(repository.current).toEqual(restarted.current);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('preserves a foreign record during reset, retry and cancellation', () => {
    const { profile, store, repository } = setup();
    const foreign = JSON.stringify({ ...profile, shards: 54 });
    store.write.mockImplementationOnce(() => {
      store.value = foreign;
      throw new Error('lost acknowledgement');
    });
    expect(() => repository.resetProfile()).toThrow('изменился в хранилище');
    expect(() => repository.retryPending()).toThrow('изменился в хранилище');
    expect(repository.cancelPending()).toBe('cancelled');
    expectUnloaded(repository);
    expect(store.value).toBe(foreign);
    expect(store.write).toHaveBeenCalledTimes(1);
    repository.load();
    expect(repository.current.shards).toBe(54);
  });

  const protectedEdits: [string, (profile: Readonly<CampaignProfile>) => CampaignProfile][] = [
    ['active attempt', profile => ({ ...profile, activeAttempt: attempt })],
    ['last settlement', profile => ({ ...profile, lastSettled: { id: 'fake', outcome: 'defeat', shards: 0, pearls: 0 } })],
    ['victories', profile => ({ ...profile, wonNightIds: ['first-light', 'broken-shore'], completedNights: 2 })],
    ['encounters', profile => { profile.encountered.push('bat'); return { ...profile }; }],
    ['counter', profile => ({ ...profile, completedNights: 2 })],
  ];
  it.each(protectedEdits)('rejects preparation editing %s without contaminating the confirmed profile', (_name, edit) => {
    const { profile, original, store, repository } = setup();
    expect(() => repository.updatePreparation(edit)).toThrow('меняет попытку или результаты');
    expect(repository.current).toEqual(profile);
    expect(repository.hasPending).toBe(false);
    expect(store.value).toBe(original);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('starts for free, saves an isolated snapshot, and blocks competing starts and preparation writes', () => {
    const { profile, store, repository } = setup();
    const submitted = { ...attempt, devices: [] };
    repository.beginAttempt(submitted);
    submitted.seed = 42;
    repository.beginAttempt(attempt);
    expect(repository.current).toEqual({ ...profile, activeAttempt: attempt });
    expect(() => repository.beginAttempt({ ...attempt, seed: 42 })).toThrow('не совпадает');
    expect(() => repository.beginAttempt({ ...attempt, id: 'night-2' })).toThrow('Уже есть активная');
    expect(() => repository.resetProfile()).toThrow('завершите активную');
    expect(() => repository.selectNight('broken-shore')).toThrow('завершите активную');
    expect(() => repository.editLayout(headland, place)).toThrow('завершите активную');
    const edit = vi.fn((value: Readonly<CampaignProfile>) => ({ ...value }));
    expect(() => repository.updatePreparation(edit)).toThrow('завершите активную');
    expect(edit).not.toHaveBeenCalled();
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('accepts the same saved start after an uncertain write without creating another attempt', () => {
    const store = new MemoryStore();
    const repository = open(store);
    const failure = new Error('confirmation unavailable');
    store.read.mockImplementationOnce(() => store.value).mockImplementationOnce(() => { throw failure; });
    expect(() => repository.beginAttempt(attempt)).toThrow(failure);
    expect(repository.hasPending).toBe(true);
    expect(repository.current.activeAttempt).toBeNull();

    const restarted = open(store);
    restarted.beginAttempt(attempt);
    repository.retryPending();
    expect(repository.current).toEqual(restarted.current);
    expect(repository.current.activeAttempt).toEqual(attempt);
    expect(repository.hasPending).toBe(false);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it('reopens a saved attempt and settles an explicit interruption without changing preparation', () => {
    const { store, repository } = setup();
    repository.editLayout(headland, place);
    repository.updatePreparation(profile => ({ ...profile, shards: 90 }));
    const prepared = repository.current;
    const deployed = { ...prepared.inventory[0]!, x: position.x, y: position.y };
    const start = { ...attempt, devices: [deployed] };
    expect(() => repository.beginAttempt(attempt)).toThrow('состав стартового снимка');
    expect(repository.hasPending).toBe(false);
    repository.beginAttempt(start);

    const restarted = open(store);
    expect(restarted.current).toEqual({ ...prepared, activeAttempt: start });
    expect(store.write).toHaveBeenCalledTimes(3);
    restarted.settleAttempt(start.id, 'interrupted', 10, ['bat'], [{ ...deployed, health: 0 }]);
    restarted.settleAttempt(start.id, 'interrupted', 0, [], []);
    expect(() => restarted.beginAttempt(start)).toThrow('уже завершена');
    expect(open(store).current).toEqual({ ...prepared, lastSettled: { id: start.id, outcome: 'interrupted', shards: 0, pearls: 0 } });
    expect(store.write).toHaveBeenCalledTimes(4);
  });

  it('does not double-credit a victory if its write is confirmed only by restart or explicit retry', () => {
    const store = new MemoryStore();
    const repository = open(store);
    repository.beginAttempt(attempt);
    const failure = new Error('confirmation unavailable');
    store.write.mockImplementationOnce(raw => {
      store.value = raw;
      throw new Error('lost acknowledgement');
    });
    store.read.mockImplementationOnce(() => store.value).mockImplementationOnce(() => { throw failure; });
    expect(() => repository.settleAttempt(attempt.id, 'victory', 48, ['ghost'], [])).toThrow(failure);
    expect(repository.hasPending).toBe(true);
    expect(repository.current).toMatchObject({ shards: 0, activeAttempt: attempt });
    expect(() => repository.settleAttempt(attempt.id, 'victory', 48, ['ghost'], [])).toThrow('ожидающую запись');

    const restarted = open(store);
    restarted.settleAttempt(attempt.id, 'victory', 48, ['ghost'], []);
    expect(store.write).toHaveBeenCalledTimes(2);
    repository.retryPending();
    expect(repository.hasPending).toBe(false);
    expect(repository.current).toEqual(restarted.current);
    expect(repository.current).toMatchObject({ shards: 68, pearls: 3, wonNightIds: ['first-light'], completedNights: 1,
      encountered: ['ghost'], activeAttempt: null, lastSettled: { id: attempt.id, outcome: 'victory', shards: 68, pearls: 3 } });
  });

  it('persists battle damage and awards on the first victory, then only ordinary shards on a replay', () => {
    const { store, repository } = setup();
    const trap = { id: 2, kind: 'light-trap', health: 23, consumed: false, trapCharges: 1 } as const;
    const trapPosition = { deviceId: trap.id, x: -145, y: 45 };
    repository.updatePreparation(profile => ({ ...profile, purchasedNodeIds: [...profile.purchasedNodeIds, 'unlock-trap'],
      nextDeviceId: 3, inventory: [...profile.inventory, trap], layouts: { headland: [trapPosition], sandspit: [trapPosition] } }));
    repository.selectNight('broken-shore');
    const { x, y } = trapPosition;
    const first = { ...attempt, nightId: 'broken-shore' as const, devices: [{ ...trap, x, y }] };
    const spent = { ...trap, health: 7.5, consumed: true, trapCharges: 0 };
    repository.beginAttempt(first);
    repository.settleAttempt(first.id, 'victory', 10, ['turtle'], [{ ...spent, x, y }]);

    const reopened = open(store);
    expect(reopened.current).toMatchObject({ inventory: [expect.objectContaining({ id: 1, health: 70 }), spent],
      layouts: { headland: [trapPosition], sandspit: [trapPosition] }, shards: 30, pearls: 3,
      completedNights: 2, wonNightIds: ['first-light', 'broken-shore'], encountered: ['turtle'] });
    const replay = { ...first, id: 'night-2', devices: [{ ...spent, x, y }] };
    reopened.beginAttempt(replay);
    reopened.settleAttempt(first.id, 'victory', 10, ['turtle'], [{ ...spent, x, y }]);
    expect(reopened.current.activeAttempt).toEqual(replay);
    reopened.settleAttempt(replay.id, 'victory', 11, ['bat'], replay.devices);
    expect(open(store).current).toMatchObject({ shards: 41, pearls: 3, completedNights: 3,
      wonNightIds: ['first-light', 'broken-shore'], encountered: ['turtle', 'bat'],
      lastSettled: { id: replay.id, outcome: 'victory', shards: 11, pearls: 0 } });
  });

  it('rejects an unknown encounter and balance overflow before setting a pending settlement', () => {
    const store = new MemoryStore(JSON.stringify({ ...emptyCampaignProfile(), shards: Number.MAX_SAFE_INTEGER }));
    const repository = open(store);
    repository.beginAttempt(attempt);
    expect(() => repository.settleAttempt(attempt.id, 'defeat', 0, ['unknown' as never], [])).toThrow('встреченные враги');
    expect(() => repository.settleAttempt(attempt.id, 'defeat', 1, [], [])).toThrow('баланс');
    expect(repository.hasPending).toBe(false);
    expect(store.write).toHaveBeenCalledTimes(1);
    expect(open(store).current.activeAttempt).toEqual(attempt);
  });
});
