import { describe, expect, it } from 'vitest';
import { settleCampaignAttempt } from '../src/application/campaignAttempt';
import { emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import type { CampaignAttempt, CampaignProfile } from '../src/application/campaignProfileTypes';
import type { DeviceDeployment } from '../src/contracts';

const cannon = { id: 1, kind: 'cannon', health: 53, consumed: false } as const;
const trap = { id: 2, kind: 'light-trap', health: 20, consumed: false, trapCharges: 1 } as const;
const reserve = { ...cannon, id: 3 };
const cannonPosition = { x: -140, y: 30 };
const trapPosition = { x: -125, y: -30 };
const deployedCannon = { ...cannon, ...cannonPosition };
const deployedTrap = { ...trap, ...trapPosition };
const destroyedCannon = { ...deployedCannon, health: 0 };
const spentTrap = { ...deployedTrap, health: 6.5, trapCharges: 0, consumed: true };

function activeProfile(): CampaignProfile {
  const attempt: CampaignAttempt = { id: 'battle-1', seed: 7, nightId: 'first-light', mapId: 'headland', rulesVersion: 'test-1',
    lensId: 'basic', abilityId: null, devices: [deployedCannon, deployedTrap], firstWinShards: 45, firstWinPearls: 2 };
  return { ...emptyCampaignProfile(), shards: 15, pearls: 1, encountered: ['ghost'],
    purchasedNodeIds: ['unlock-cannon', 'unlock-trap'], inventory: [cannon, trap, reserve], nextDeviceId: 4,
    layouts: { headland: [{ deviceId: cannon.id, ...cannonPosition }, { deviceId: trap.id, ...trapPosition }],
      sandspit: [{ deviceId: trap.id, x: 100, y: 10 }] }, activeAttempt: attempt };
}

describe('campaign attempt settlement', () => {
  it.each(['victory', 'defeat'] as const)('stores gross shards, discoveries and permanent device state after %s', outcome => {
    const profile = activeProfile();
    const before = structuredClone(profile);
    const after = settleCampaignAttempt(profile, 'battle-1', outcome, 12, ['turtle', 'ghost', 'turtle'], [spentTrap, destroyedCannon]);
    const victory = outcome === 'victory';
    expect(after).toMatchObject({ activeAttempt: null, shards: victory ? 72 : 27, pearls: victory ? 3 : 1,
      encountered: ['ghost', 'turtle'], completedNights: victory ? 1 : 0,
      wonNightIds: victory ? ['first-light'] : [],
      lastSettled: { id: 'battle-1', outcome, shards: victory ? 57 : 12, pearls: victory ? 2 : 0 } });
    expect(after.inventory).toStrictEqual([{ ...cannon, health: 0 },
      { ...trap, health: 6.5, trapCharges: 0, consumed: true }, reserve]);
    expect(after.layouts).toEqual(before.layouts);
    expect(profile).toEqual(before);
  });

  it('pays ordinary shards and counts a replay victory with the first bonus already claimed', () => {
    const profile = activeProfile();
    profile.wonNightIds.push('first-light');
    profile.completedNights = 3;
    const after = settleCampaignAttempt(profile, 'battle-1', 'victory', 13, [], [deployedCannon, deployedTrap]);
    expect(after).toMatchObject({ shards: 28, pearls: 1, wonNightIds: ['first-light'], completedNights: 4,
      lastSettled: { id: 'battle-1', outcome: 'victory', shards: 13, pearls: 0 } });
  });

  it('drops all battle effects when interrupted and keeps the first recorded outcome on a repeat', () => {
    const profile = activeProfile();
    const after = settleCampaignAttempt(profile, 'battle-1', 'interrupted', 99, ['bat'], [destroyedCannon, spentTrap]);
    expect(after).toStrictEqual({ ...profile, activeAttempt: null,
      lastSettled: { id: 'battle-1', outcome: 'interrupted', shards: 0, pearls: 0 } });
    expect(settleCampaignAttempt(after, 'battle-1', 'victory', 1, ['bat'], [])).toBe(after);
  });

  it('rejects results from other attempts', () => {
    expect(() => settleCampaignAttempt(activeProfile(), 'another-id', 'interrupted', 0, [], [])).toThrow('не совпадает');
    expect(() => settleCampaignAttempt(emptyCampaignProfile(), 'battle-1', 'interrupted', 0, [], [])).toThrow('не совпадает');
  });

  it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid gross reward %s on ordinary settlement', reward => {
    expect(() => settleCampaignAttempt(activeProfile(), 'battle-1', 'defeat', reward, [], [deployedCannon, deployedTrap]))
      .toThrow('наград');
  });

  const invalidResults: [string, DeviceDeployment[]][] = [
    ['missing deployed device', [spentTrap]],
    ['duplicate id', [destroyedCannon, destroyedCannon]],
    ['device in reserve', [{ ...reserve, ...cannonPosition }, spentTrap]],
    ['changed type', [{ ...destroyedCannon, kind: 'mortar' }, spentTrap]],
    ['changed location', [{ ...destroyedCannon, x: -160 }, spentTrap]],
    ['repair above starting health', [{ ...deployedCannon, health: cannon.health + 1 }, spentTrap]],
    ['negative health', [{ ...destroyedCannon, health: -1 }, spentTrap]],
    ['non-finite health', [{ ...destroyedCannon, health: NaN }, spentTrap]],
    ['replenished trap charges', [destroyedCannon, { ...deployedTrap, trapCharges: 2 }]],
    ['fractional trap charges', [destroyedCannon, { ...deployedTrap, trapCharges: 0.5 }]],
    ['trap without charges field', [destroyedCannon, { ...spentTrap, trapCharges: undefined }]],
    ['inconsistent trap consumption', [destroyedCannon, { ...spentTrap, consumed: false }]],
    ['charges on non-trap', [{ ...deployedCannon, trapCharges: 0 }, spentTrap]],
    ['consumed non-trap', [{ ...deployedCannon, consumed: true }, spentTrap]],
  ];
  it.each(invalidResults)('rejects %s without mutating the profile', (_name, devices) => {
    const profile = activeProfile();
    const before = structuredClone(profile);
    expect(() => settleCampaignAttempt(profile, 'battle-1', 'victory', 0, [], devices)).toThrow();
    expect(profile).toEqual(before);
  });
});
