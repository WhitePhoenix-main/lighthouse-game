import { describe, expect, it } from 'vitest';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { CampaignProfileRepository } from '../src/application/campaignProfileRepository';
import type { CampaignAttempt, CampaignProfile } from '../src/application/campaignProfileTypes';
import { DEVICE_RULES } from '../src/content/devices';

const cannon = { id: 2, kind: 'cannon', health: 0, consumed: false } as const;
const trap = { id: 7, kind: 'light-trap', health: 14.5, consumed: false, trapCharges: 1 } as const;
const entry = { deviceId: trap.id, x: 100_000.25, y: -100_000.5 };

function trapProfile(): CampaignProfile {
  return { ...emptyCampaignProfile(), purchasedNodeIds: ['unlock-cannon', 'unlock-trap'],
    inventory: [cannon, trap], nextDeviceId: 8 };
}

function activeProfile() {
  const attempt: CampaignAttempt = { id: 'try-2', seed: 0xffff_ffff, nightId: 'first-light', mapId: 'headland',
    rulesVersion: '2026.11', lensId: 'basic', abilityId: null, devices: [{ ...trap, x: entry.x, y: entry.y }],
    firstWinShards: 13, firstWinPearls: 2 };
  const profile: CampaignProfile = { ...trapProfile(), layouts: { headland: [entry] }, activeAttempt: attempt,
    encountered: ['turtle', 'ghost'], lastSettled: { id: 'try-1', outcome: 'defeat', shards: 17, pearls: 0 } };
  return { profile, attempt };
}

const decode = (value: unknown) => decodeCampaignProfile(JSON.stringify(value));

describe('campaign profile v1 codec', () => {
  it('creates an independent empty profile and round-trips it', () => {
    const profile = emptyCampaignProfile();
    expect(profile).toStrictEqual({ version: 1, shards: 0, pearls: 0, purchasedNodeIds: [], wonNightIds: [],
      selectedNightId: 'first-light', selectedLensId: 'basic', selectedAbilityId: null, seenIntroIds: [],
      nextDeviceId: 1, inventory: [], layouts: {}, activeAttempt: null, lastSettled: null, encountered: [], completedNights: 0 });
    expect(decode(profile)).toStrictEqual(profile);
    profile.wonNightIds.push('first-light');
    profile.layouts.headland = [];
    expect(emptyCampaignProfile()).toMatchObject({ wonNightIds: [], layouts: {} });
  });

  it('round-trips purchases without price or chapter gates, the next story night, and independent map plans', () => {
    const profile = trapProfile();
    profile.purchasedNodeIds.push('trap-second-charge', 'trap-health', 'trap-radius-2', 'trap-radius-1',
      'lens-unlock-expanded', 'expanded-width', 'ability-bastion-unlock');
    profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05', 'abyss-warden'];
    profile.completedNights = profile.wonNightIds.length + 2;
    profile.selectedNightId = 'far-shore';
    profile.selectedLensId = 'expanded';
    profile.selectedAbilityId = 'bastion';
    profile.seenIntroIds = ['intro-misty-shore', 'intro-far-shore'];
    profile.inventory.push({ ...trap, id: 8, health: 0, trapCharges: 2 }, { ...trap, id: 9, trapCharges: 0, consumed: true });
    profile.nextDeviceId = 10;
    profile.layouts = { headland: [entry], sandspit: [{ ...entry, x: -20, y: 15 }] };
    expect(decode(profile)).toStrictEqual(profile);
  });

  it('accepts a previously won night and an unlocked flash', () => {
    const profile: CampaignProfile = { ...emptyCampaignProfile(), wonNightIds: ['first-light', 'broken-shore'], completedNights: 2,
      selectedAbilityId: 'flash', purchasedNodeIds: ['unlock-flash', 'unlock-barrier'],
      inventory: [{ id: 1, kind: 'barrier', health: DEVICE_RULES.definitions.barrier.health, consumed: false }], nextDeviceId: 2 };
    expect(decode(profile)).toStrictEqual(profile);
  });

  it('uses base health even when the hull upgrade is purchased', () => {
    const profile = trapProfile();
    profile.purchasedNodeIds.push('trap-health');
    expect(decode(profile)).toStrictEqual(profile);
    const aboveBase = { ...trap, health: DEVICE_RULES.definitions['light-trap'].health + 1 };
    expect(() => decode({ ...profile, inventory: [cannon, aboveBase] })).toThrow();
  });

  it('preserves full and damaged hulls after a base-health change and persists the new units once', () => {
    const full = { ...cannon, health: 70 };
    const damaged = { ...cannon, id: 3, health: 69.5 };
    const position = { x: -125, y: 0 };
    const profile: CampaignProfile = { ...trapProfile(), inventory: [full, damaged, trap],
      layouts: { headland: [{ deviceId: damaged.id, ...position }] },
      activeAttempt: { ...activeProfile().attempt, devices: [{ ...damaged, ...position }] } };
    let raw = JSON.stringify(profile);
    const open = () => {
      const repository = new CampaignProfileRepository({ read: () => raw, write: value => { raw = value; } });
      repository.load();
      return repository;
    };
    const definition = DEVICE_RULES.definitions.cannon;
    const original = definition.health;
    try {
      definition.health = 69;
      const first = open();
      const health = damaged.health / full.health * definition.health;
      expect(first.current.inventory).toEqual([{ ...full, health: 69 }, { ...damaged, health }, trap]);
      expect(first.current.activeAttempt?.devices).toEqual([{ ...damaged, ...position, health }]);
      expect(JSON.parse(raw)).not.toHaveProperty('deviceHealthBases');
      expect(() => decode({ ...profile, activeAttempt: { ...profile.activeAttempt,
        devices: [{ ...damaged, ...position, health: 69 }] } })).toThrow('стартового снимка');

      first.settleAttempt(profile.activeAttempt!.id, 'interrupted', 0, [], []);
      expect(JSON.parse(raw)).toHaveProperty('deviceHealthBases.cannon', 69);
      expect(open().current).toEqual(first.current);

      definition.health = 80;
      expect(open().current.inventory).toEqual([{ ...full, health: 80 }, { ...damaged, health: health / 69 * 80 }, trap]);
    } finally { definition.health = original; }
  });

  it.each([{ cannon: 0 }, { cannon: '70' }, { unknown: 70 }])('rejects invalid device base metadata %j', deviceHealthBases => {
    expect(() => decode({ ...trapProfile(), deviceHealthBases })).toThrow('базовая прочность');
  });

  it('rejects malformed JSON and a prototype-shaped record', () => {
    expect(() => decodeCampaignProfile('{')).toThrow();
    expect(() => decode({ version: 1, profile: {} })).toThrow();
    expect(() => decode({ ...emptyCampaignProfile(), profile: {} })).toThrow();
  });

  it.each([
    ['unsupported version', { version: 6 }],
    ['missing ability choice', { selectedAbilityId: undefined }],
    ['negative shards', { shards: -1 }],
    ['fractional pearls', { pearls: 0.5 }],
    ['numeric string', { shards: '10' }],
    ['unsafe balance', { pearls: Number.MAX_SAFE_INTEGER + 1 }],
    ['zero next id', { nextDeviceId: 0 }],
    ['unsafe next id', { nextDeviceId: Number.MAX_SAFE_INTEGER + 1 }],
    ['unknown purchase', { purchasedNodeIds: ['not-a-node'] }],
    ['repeated purchase', { purchasedNodeIds: ['beam-power-1', 'beam-power-1'] }],
    ['missing tree prerequisite', { purchasedNodeIds: ['beam-power-2'] }],
    ['missing lens prerequisite', { purchasedNodeIds: ['expanded-width'] }],
    ['trial as a story victory', { wonNightIds: ['rescue-trial'], completedNights: 1 }],
    ['repeated victory', { wonNightIds: ['first-light', 'first-light'], completedNights: 2 }],
    ['victory with a gap', { wonNightIds: ['first-light', 'winged-tide'], completedNights: 2 }],
    ['trial selected as a story night', { selectedNightId: 'rescue-trial' }],
    ['chapter selected without a boss victory', { selectedNightId: 'far-shore', completedNights: 5,
      wonNightIds: ['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05'] }],
    ['unknown intro', { seenIntroIds: ['intro-unknown'] }],
    ['repeated intro', { seenIntroIds: ['intro-misty-shore', 'intro-misty-shore'] }],
    ['unknown lens', { selectedLensId: 'not-a-lens' }],
    ['unbought lens', { selectedLensId: 'expanded' }],
    ['unknown ability', { selectedAbilityId: 'not-an-ability' }],
    ['unbought ability', { selectedAbilityId: 'overload' }],
    ['unbought flash', { selectedAbilityId: 'flash' }],
  ] as const)('rejects %s', (_name, changes) => {
    expect(() => decode({ ...emptyCampaignProfile(), ...changes })).toThrow();
  });

  it.each([
    ['unknown kind', [{ ...cannon, kind: 'not-a-device' }, trap]],
    ['known but locked kind', [cannon, trap, { ...cannon, id: 3, kind: 'mortar' }]],
    ['missing first instance', [cannon]],
    ['zero instance id', [cannon, { ...trap, id: 0 }]],
    ['repeated instance id', [cannon, { ...trap, id: cannon.id }]],
    ['instance id at the allocation cursor', [cannon, { ...trap, id: 8 }]],
    ['negative health', [cannon, { ...trap, health: -1 }]],
    ['missing charge count', [cannon, { ...trap, trapCharges: undefined }]],
    ['missing consumed flag', [cannon, { ...trap, consumed: undefined }]],
    ['fractional charges', [cannon, { ...trap, trapCharges: 0.5 }]],
    ['charges above unupgraded capacity', [cannon, { ...trap, trapCharges: 2 }]],
    ['zero charges without consumption', [cannon, { ...trap, trapCharges: 0 }]],
    ['charges on a cannon', [{ ...cannon, trapCharges: 0 }, trap]],
    ['consumed cannon', [{ ...cannon, consumed: true }, trap]],
    ['position stored in inventory', [cannon, { ...trap, position: null }]],
  ] as const)('rejects inventory with %s', (_name, inventory) => {
    expect(() => decode({ ...trapProfile(), inventory })).toThrow();
  });

  it.each([
    ['unknown map', { 'not-a-map': [entry] }],
    ['non-array plan', { headland: entry }],
    ['unknown instance', { headland: [{ ...entry, deviceId: 6 }] }],
    ['repeated instance on one map', { headland: [entry, { ...entry, y: 0 }] }],
    ['invalid coordinate', { headland: [{ ...entry, y: '0' }] }],
    ['copied health', { headland: [{ ...entry, health: trap.health }] }],
    ['copied charges', { headland: [{ ...entry, trapCharges: trap.trapCharges }] }],
  ] as const)('rejects layout with %s', (_name, layouts) => {
    expect(() => decode({ ...trapProfile(), layouts })).toThrow();
  });

  it('rejects a JSON coordinate that overflows to infinity', () => {
    const raw = JSON.stringify({ ...trapProfile(), layouts: { headland: [entry] } });
    expect(() => decodeCampaignProfile(raw.replace('100000.25', '1e309'))).toThrow();
  });

  it('round-trips an active attempt and its predecessor with the exact base health and remaining charges', () => {
    const { profile } = activeProfile();
    expect(decode(profile)).toStrictEqual(profile);
  });

  it.each([
    ['blank id', { id: '  ' }],
    ['reused settled id', { id: 'try-1' }],
    ['negative seed', { seed: -1 }],
    ['fractional seed', { seed: 0.1 }],
    ['out of range seed', { seed: 0x1_0000_0000 }],
    ['missing rules version', { rulesVersion: undefined }],
    ['different map', { mapId: 'sandspit' }],
    ['different night', { nightId: 'broken-shore' }],
    ['different lens', { lensId: 'expanded' }],
    ['different ability', { abilityId: 'flash' }],
    ['negative bonus', { firstWinShards: -1 }],
    ['unsafe bonus', { firstWinPearls: Number.MAX_SAFE_INTEGER + 1 }],
    ['unexpected legacy cost', { placementCost: 0 }],
  ])('rejects an active attempt with %s', (_name, changes) => {
    const { profile, attempt } = activeProfile();
    expect(() => decode({ ...profile, activeAttempt: { ...attempt, ...changes } })).toThrow();
  });

  it.each([
    ['a missing device', []],
    ['an undeployed device', [{ ...cannon, x: entry.x, y: entry.y }]],
    ['a different type', [{ ...trap, kind: 'cannon', x: entry.x, y: entry.y }]],
    ['changed coordinates', [{ ...trap, x: 0, y: entry.y }]],
    ['changed health', [{ ...trap, health: 0, x: entry.x, y: entry.y }]],
    ['changed charges', [{ ...trap, trapCharges: 0, consumed: true, x: entry.x, y: entry.y }]],
  ])('rejects a start snapshot with %s', (_name, devices) => {
    const { profile, attempt } = activeProfile();
    expect(() => decode({ ...profile, activeAttempt: { ...attempt, devices } })).toThrow();
  });

  it.each([
    ['absent active attempt field', { activeAttempt: undefined }],
    ['absent settlement field', { lastSettled: undefined }],
    ['absent encountered field', { encountered: undefined }],
    ['absent victory count field', { completedNights: undefined }],
    ['unknown enemy', { encountered: ['crab'] }],
    ['repeated enemy', { encountered: ['bat', 'bat'] }],
    ['too few victories for the unlocked nights', { wonNightIds: ['first-light'], completedNights: 0 }],
    ['negative victory count', { completedNights: -1 }],
    ['unknown outcome', { lastSettled: { id: 'try-1', outcome: 'paused', shards: 0, pearls: 0 } }],
    ['victory without progress', { lastSettled: { id: 'try-1', outcome: 'victory', shards: 5, pearls: 1 } }],
    ['pearls on defeat', { lastSettled: { id: 'try-1', outcome: 'defeat', shards: 1, pearls: 1 } }],
    ['shards on interruption', { lastSettled: { id: 'try-1', outcome: 'interrupted', shards: 1, pearls: 0 } }],
  ])('rejects %s in persisted progress', (_name, changes) => {
    expect(() => decode({ ...emptyCampaignProfile(), ...changes })).toThrow();
  });
});
