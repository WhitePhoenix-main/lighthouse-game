import type { DeviceDeployment, EnemyKind } from '../contracts';
import type { CampaignOwnedDevice, CampaignProfile, CampaignSettlement } from './campaignProfileTypes';

function applyDeviceResults(inventory: readonly CampaignOwnedDevice[], snapshot: readonly DeviceDeployment[],
  results: readonly DeviceDeployment[]): CampaignOwnedDevice[] {
  if (results.length !== snapshot.length) throw new Error('Неполный итог устройств кампании.');
  const starting = new Map(snapshot.map(device => [device.id, device]));
  const updated = new Map<number, Pick<CampaignOwnedDevice, 'health' | 'consumed' | 'trapCharges'>>();
  for (const { id, kind, variantId, x, y, health, consumed, trapCharges } of results) {
    const initial = starting.get(id);
    if (!initial || updated.has(id) || initial.kind !== kind || initial.variantId !== variantId || initial.x !== x || initial.y !== y) {
      throw new Error('Итог устройств кампании не совпадает со стартовым снимком.');
    }
    if (!Number.isFinite(health) || health < 0 || health > initial.health) {
      throw new Error('Недопустимая итоговая прочность устройства кампании.');
    }
    if (kind === 'light-trap') {
      if (trapCharges === undefined || initial.trapCharges === undefined || !Number.isSafeInteger(trapCharges)
        || trapCharges < 0 || trapCharges > initial.trapCharges || consumed !== (trapCharges === 0)) {
        throw new Error('Недопустимый итог зарядов ловушки кампании.');
      }
      updated.set(id, { health, consumed, trapCharges });
    } else {
      if (consumed !== false || trapCharges !== undefined) throw new Error('Недопустимое состояние устройства кампании.');
      updated.set(id, { health, consumed });
    }
  }
  return inventory.map(device => {
    const result = updated.get(device.id);
    return result ? { ...device, ...result } : device;
  });
}

export function settleCampaignAttempt(profile: Readonly<CampaignProfile>, id: string, outcome: CampaignSettlement['outcome'],
  reward: number, encountered: readonly EnemyKind[], devices: readonly DeviceDeployment[]): CampaignProfile {
  if (profile.lastSettled?.id === id) return profile;
  const attempt = profile.activeAttempt;
  if (!attempt || attempt.id !== id) throw new Error('Активная попытка кампании не совпадает с результатом.');
  if (outcome === 'interrupted') {
    return { ...profile, activeAttempt: null, lastSettled: { id, outcome, shards: 0, pearls: 0 } };
  }
  if (outcome !== 'victory' && outcome !== 'defeat') throw new Error('Недопустимый исход кампании.');
  if (!Number.isSafeInteger(reward) || reward < 0) throw new Error('Недопустимая награда кампании.');

  const inventory = applyDeviceResults(profile.inventory, attempt.devices, devices);
  const firstWin = outcome === 'victory' && !profile.wonNightIds.includes(attempt.nightId);
  const shards = reward + (firstWin ? attempt.firstWinShards : 0);
  const pearls = firstWin ? attempt.firstWinPearls : 0;
  return { ...profile, activeAttempt: null, lastSettled: { id, outcome, shards, pearls }, inventory,
    shards: profile.shards + shards, pearls: profile.pearls + pearls,
    encountered: [...new Set([...profile.encountered, ...encountered])],
    wonNightIds: firstWin ? [...profile.wonNightIds, attempt.nightId] : profile.wonNightIds,
    completedNights: profile.completedNights + Number(outcome === 'victory') };
}
