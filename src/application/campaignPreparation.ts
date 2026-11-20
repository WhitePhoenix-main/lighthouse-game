import type { DeviceDeployment, DevicePlacement, NightConfig, PlacementCheck } from '../contracts';
import { CAMPAIGN_CHAPTER_DRAFT, CAMPAIGN_STORY_DRAFT, draftStoryNightAccess,
  type CampaignMapDraftId, type CampaignStoryDraftNightId } from '../content/campaignFoundationDraft';
import type { CampaignLayoutEntry, CampaignOwnedDevice, CampaignProfile } from './campaignProfileTypes';
import { checkDraft, checkPlacement } from './placement';

export interface CampaignPreparationRules {
  mapId: CampaignMapDraftId;
  config: NightConfig;
}

export type CampaignLayoutEdit = { type: 'place'; deviceId: number; x: number; y: number }
  | { type: 'store'; deviceId: number };

export interface CampaignPreparation {
  mapId: CampaignMapDraftId;
  field: { deployment: DeviceDeployment; placement: PlacementCheck }[];
  reserve: CampaignOwnedDevice[];
  layoutCheck: PlacementCheck;
}

function storyNight(nightId: CampaignStoryDraftNightId) {
  const night = CAMPAIGN_STORY_DRAFT.find(candidate => candidate.id === nightId);
  if (!night) throw new Error('Неизвестная ночь кампании.');
  return night;
}

export function selectCampaignNight(profile: Readonly<CampaignProfile>, nightId: CampaignStoryDraftNightId): CampaignProfile {
  if (!draftStoryNightAccess(storyNight(nightId), new Set(profile.wonNightIds))) throw new Error('Ночь кампании ещё не открыта.');
  return { ...profile, selectedNightId: nightId };
}

function activeLayout(profile: Readonly<CampaignProfile>, rules: CampaignPreparationRules): readonly CampaignLayoutEntry[] {
  const chapter = CAMPAIGN_CHAPTER_DRAFT.find(candidate => candidate.id === storyNight(profile.selectedNightId).chapterId);
  if (chapter?.mapId !== rules.mapId) throw new Error('Карта в подготовке изменилась.');
  return profile.layouts[rules.mapId] ?? [];
}

function deployments(profile: Readonly<CampaignProfile>, entries: readonly CampaignLayoutEntry[]): DeviceDeployment[] {
  const byId = new Map(profile.inventory.map(device => [device.id, device]));
  return entries.map(({ deviceId, x, y }) => {
    const device = byId.get(deviceId);
    if (!device) throw new Error('Расстановка ссылается на неизвестный экземпляр.');
    return { ...device, x, y };
  });
}

export function readCampaignPreparation(profile: Readonly<CampaignProfile>, rules: CampaignPreparationRules): CampaignPreparation {
  const layout = activeLayout(profile, rules);
  const placed = deployments(profile, layout);
  const placedIds = new Set(layout.map(entry => entry.deviceId));
  const field = placed.map(deployment => ({ deployment, placement: checkPlacement(rules.config,
    placed.filter(item => item.id !== deployment.id), deployment.kind, deployment.x, deployment.y) }));
  return { mapId: rules.mapId, field, reserve: profile.inventory.filter(device => !placedIds.has(device.id)).map(device => ({ ...device })),
    layoutCheck: checkDraft(rules.config, placed) };
}

export function editCampaignLayout(profile: Readonly<CampaignProfile>, rules: CampaignPreparationRules,
  edit: CampaignLayoutEdit): CampaignProfile {
  const layout = activeLayout(profile, rules);
  const device = profile.inventory.find(candidate => candidate.id === edit.deviceId);
  if (!device) throw new Error('Неизвестный экземпляр устройства.');
  const placed = deployments(profile, layout);
  if (edit.type === 'store') {
    if (!placed.some(item => item.id === device.id)) return { ...profile };
    return replaceLayout(profile, rules, layout, placed.filter(item => item.id !== device.id));
  }
  const position = { ...device, x: edit.x, y: edit.y };
  const positions = placed.some(item => item.id === device.id)
    ? placed.map(item => item.id === device.id ? position : item) : [...placed, position];
  return replaceLayout(profile, rules, layout, positions, device.id);
}

export function replaceCampaignLayout(profile: Readonly<CampaignProfile>, rules: CampaignPreparationRules,
  placements: readonly DevicePlacement[]): CampaignProfile {
  return replaceLayout(profile, rules, activeLayout(profile, rules), placements);
}

function replaceLayout(profile: Readonly<CampaignProfile>, rules: CampaignPreparationRules,
  layout: readonly CampaignLayoutEntry[], placements: readonly DevicePlacement[], recheckDeviceId?: number): CampaignProfile {
  const inventory = new Map(profile.inventory.map(device => [device.id, device]));
  const previous = new Map(layout.map(entry => [entry.deviceId, entry]));
  const seen = new Set<number>();
  const changed: DevicePlacement[] = [];
  const updated = placements.map(position => {
    const { id, kind, x, y, variantId } = position;
    const device = inventory.get(id);
    if (!device || device.kind !== kind || device.variantId !== variantId) throw new Error('Неизвестный экземпляр устройства.');
    if (seen.has(id)) throw new Error('Повторный или недопустимый id устройства.');
    seen.add(id);
    const old = previous.get(id);
    if (id === recheckDeviceId || !old || old.x !== x || old.y !== y) {
      if (device.health <= 0 || device.consumed) throw new Error('Восстановите устройство перед размещением.');
      changed.push(position);
    }
    return { deviceId: id, x, y };
  });
  const check = checkDraft(rules.config, placements);
  if (!check.valid) {
    // Stale placements may be removed or corrected individually before the whole layout is valid again.
    if (changed.length > 1) throw new Error(check.reason);
    const edited = changed[0];
    if (edited) {
      const placement = checkPlacement(rules.config, placements.filter(item => item.id !== edited.id), edited.kind, edited.x, edited.y);
      if (!placement.valid) throw new Error(placement.reason);
    }
  }
  return { ...profile, layouts: { ...profile.layouts, [rules.mapId]: updated } };
}
