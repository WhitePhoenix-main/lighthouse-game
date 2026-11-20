import { describe, expect, it } from 'vitest';
import { CampaignGameStore } from '../src/application/campaignGameStore';
import { editCampaignLayout, readCampaignPreparation, selectCampaignNight } from '../src/application/campaignPreparation';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { CampaignProfileRepository } from '../src/application/campaignProfileRepository';
import { LighthouseApplication } from '../src/application/gameApplication';
import { memorySettingsStore } from '../src/application/settings';
import { CAMPAIGN_CONTROL_MAPS } from '../src/content/campaignControlMaps';
import { CAMPAIGN_STORY_DRAFT } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { NIGHT_CONFIG } from '../src/content/night';

const headland = { mapId: 'headland', config: { ...NIGHT_CONFIG, terrain: CAMPAIGN_CONTROL_MAPS.headland.terrain } } as const;
const plateau = { mapId: 'ashen-plateau', config: { ...NIGHT_CONFIG, terrain: CAMPAIGN_CONTROL_MAPS['ashen-plateau'].terrain } } as const;
const trapId = 7;

function preparedProfile() {
  const profile = emptyCampaignProfile();
  const beforePlateau = CAMPAIGN_STORY_DRAFT.findIndex(night => night.id === 'ashen-cliffs-01');
  profile.wonNightIds = CAMPAIGN_STORY_DRAFT.slice(0, beforePlateau).map(night => night.id);
  profile.completedNights = profile.wonNightIds.length;
  profile.purchasedNodeIds = ['unlock-cannon', 'unlock-trap', 'trap-radius-1', 'trap-radius-2', 'trap-health', 'trap-second-charge'];
  profile.inventory.push({ id: trapId, kind: 'light-trap', health: 14, consumed: false, trapCharges: 1 },
    { id: 8, kind: 'cannon', health: 70, consumed: false });
  profile.nextDeviceId = 9;
  profile.shards = 80;
  return profile;
}

describe('campaign preparation on independent maps', () => {
  it('starts a new profile with an empty field and does not open the next chapter early', () => {
    const profile = emptyCampaignProfile();
    expect(readCampaignPreparation(profile, headland)).toEqual({ mapId: 'headland', field: [], reserve: [], layoutCheck: { valid: true, reason: '' } });
    expect(() => selectCampaignNight(profile, 'far-shore')).toThrow('ещё не открыта');
    expect(profile.selectedNightId).toBe('first-light');
  });

  it('keeps separate plans A → B → A but reads health and charges from the same instance', () => {
    const profile = preparedProfile();
    let raw = JSON.stringify(profile);
    const store = { read: () => raw, write: (next: string) => { raw = next; } };
    const repository = new CampaignProfileRepository(store);
    repository.load();
    repository.editLayout(headland, { type: 'place', deviceId: trapId, x: -125, y: 0 });
    repository.selectNight('ashen-cliffs-01');
    expect(readCampaignPreparation(repository.current, plateau)).toMatchObject({ field: [],
      reserve: [{ id: trapId, health: 14, trapCharges: 1 }, { id: 8 }] });
    repository.editLayout(plateau, { type: 'place', deviceId: trapId, x: 115, y: 0 });
    const both = repository.current;
    expect(both.layouts).toEqual({ headland: [{ deviceId: trapId, x: -125, y: 0 }], 'ashen-plateau': [{ deviceId: trapId, x: 115, y: 0 }] });
    expect(both.shards).toBe(80);
    expect(both.inventory).toEqual(profile.inventory);
    expect(profile.layouts).toEqual({});

    raw = JSON.stringify({ ...both, inventory: both.inventory.map(device => device.id === trapId
      ? { ...device, health: 5, consumed: true, trapCharges: 0 } : device) });
    const reopened = new CampaignProfileRepository(store);
    reopened.load();
    expect(reopened.current.selectedNightId).toBe('ashen-cliffs-01');
    reopened.selectNight('first-light');
    expect(readCampaignPreparation(reopened.current, headland)).toMatchObject({ field: [{ deployment: { id: trapId, x: -125, y: 0,
      health: 5, trapCharges: 0, consumed: true } }], reserve: [{ id: 8 }] });
    reopened.editLayout(headland, { type: 'store', deviceId: trapId });
    const removed = reopened.current;
    expect(removed.layouts['ashen-plateau']).toEqual(both.layouts['ashen-plateau']);
    expect(readCampaignPreparation(removed, headland)).toMatchObject({ field: [], reserve: [{ id: trapId, health: 5, trapCharges: 0 }, { id: 8 }] });
  });

  it('shows stale positions and permits separate explicit repairs to a broken layout', () => {
    const profile = preparedProfile();
    profile.layouts.headland = [{ deviceId: trapId, x: -100, y: 120 }, { deviceId: 8, x: -100, y: -120 }];
    const changed = { ...headland, config: { ...headland.config, terrain: { shoreX: -150, landOnlyPlacement: true } } };
    const before = readCampaignPreparation(profile, changed);
    expect(before.layoutCheck.valid).toBe(false);
    expect(before.field.map(entry => entry.placement.valid)).toEqual([false, false]);
    expect(before.field.map(entry => entry.placement.reason)).toEqual(Array(2).fill('Устройство должно целиком находиться на суше.'));
    expect(profile.layouts.headland).toHaveLength(2);
    const moved = editCampaignLayout(profile, changed, { type: 'place', deviceId: 8, x: -195, y: -120 });
    expect(readCampaignPreparation(moved, changed).field.map(entry => entry.placement.valid)).toEqual([false, true]);
    const stored = editCampaignLayout(moved, changed, { type: 'store', deviceId: trapId });
    expect(readCampaignPreparation(stored, changed).layoutCheck.valid).toBe(true);
    expect(stored.inventory).toEqual(profile.inventory);
    expect(stored.shards).toBe(profile.shards);
  });

  it('rejects stale map commands, mismatched placements, and unknown instances', () => {
    const profile = preparedProfile();
    const onPlateau = selectCampaignNight(profile, 'ashen-cliffs-01');
    const place = { type: 'place', deviceId: trapId, x: 115, y: 0 } as const;
    expect(() => editCampaignLayout(onPlateau, headland, place)).toThrow('Карта в подготовке изменилась');
    expect(() => editCampaignLayout(profile, headland, place)).toThrow('на суше');
    expect(() => editCampaignLayout(onPlateau, plateau, { ...place, deviceId: 100 })).toThrow('Неизвестный экземпляр');
    expect(profile.layouts).toEqual({});
  });

  it('checks type slots for the whole plan even when every type has multiple placed instances', () => {
    const profile = preparedProfile();
    profile.inventory.push({ ...profile.inventory[0]!, id: 9 }, { ...profile.inventory[1]!, id: 10 });
    profile.nextDeviceId = 11;
    profile.layouts.headland = [{ deviceId: 7, x: -150, y: -90 }, { deviceId: 8, x: -150, y: -30 },
      { deviceId: 9, x: -150, y: 30 }, { deviceId: 10, x: -150, y: 90 }];
    const restricted = { ...headland, config: { ...headland.config, devices: { ...headland.config.devices, typeSlots: 1 } } };
    expect(readCampaignPreparation(profile, restricted).layoutCheck).toEqual({ valid: false, reason: 'Заняты все слоты типов: 1.' });
  });

  it('repairs an old layout one position at a time through the application without dropping its inventory', () => {
    const profile = preparedProfile();
    profile.seenIntroIds = ['intro-misty-shore'];
    const stale = { deviceId: trapId, x: 210, y: 75 };
    const oldCannon = { deviceId: 8, x: 210, y: -75 };
    profile.layouts = { headland: [stale, oldCannon], 'ashen-plateau': [{ deviceId: trapId, x: 115, y: 0 }] };
    let raw = JSON.stringify(profile);
    const store = { read: () => raw, write: (next: string) => { raw = next; } };
    const game = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }),
      memorySettingsStore(), CAMPAIGN_NIGHT_CATALOG, new CampaignGameStore(store));
    game.openGameMenu();
    game.continueGame();
    expect(game.view.preparation.canStart).toBe(false);
    expect(game.view.preparation.placements).toMatchObject([{ id: trapId, x: stale.x }, { id: 8, x: oldCannon.x }]);

    game.selectDevice('cannon');
    game.placeDevice(-195, -120, 8);
    expect(game.view.error).toBeNull();
    expect(game.view.preparation.canStart).toBe(false);
    expect(decodeCampaignProfile(raw).layouts.headland).toEqual([stale, { deviceId: 8, x: -195, y: -120 }]);

    game.removeDevice(trapId);
    expect(game.view.preparation.canStart).toBe(true);
    expect(decodeCampaignProfile(raw)).toMatchObject({ shards: profile.shards, inventory: profile.inventory,
      layouts: { headland: [{ deviceId: 8, x: -195, y: -120 }], 'ashen-plateau': profile.layouts['ashen-plateau'] } });
  });

  it('validates a full replacement as one plan and keeps the previous plan if the replacement is invalid', () => {
    const profile = preparedProfile();
    profile.layouts.headland = [{ deviceId: trapId, x: -125, y: 0 }, { deviceId: 8, x: -195, y: -120 }];
    let raw = JSON.stringify(profile);
    const store = new CampaignGameStore({ read: () => raw, write: next => { raw = next; } });
    store.load();
    const config = store.calculateConfig(CAMPAIGN_NIGHT_CATALOG[0]!.config);
    const swapped = [{ id: trapId, kind: 'light-trap', x: -195, y: -120 }, { id: 8, kind: 'cannon', x: -125, y: 0 }] as const;
    store.savePlacements(swapped, config);
    expect(decodeCampaignProfile(raw).layouts.headland).toEqual([{ deviceId: trapId, x: -195, y: -120 }, { deviceId: 8, x: -125, y: 0 }]);

    const saved = raw;
    expect(() => store.savePlacements([{ ...swapped[0], x: -180 }, { ...swapped[1], x: 210 }], config)).toThrow('на суше');
    expect(() => store.savePlacements([...swapped, swapped[0]], config)).toThrow('Повторный');
    expect(raw).toBe(saved);
    store.savePlacements([], config);
    expect(decodeCampaignProfile(raw).layouts.headland).toEqual([]);
  });
});
