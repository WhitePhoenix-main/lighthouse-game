import type { NightId, WaveDefinition } from '../contracts';
import { NIGHT_CATALOG } from './nights';

export const CAMPAIGN_CHAPTER_DRAFT = [
  { id: 'misty-shore', mapId: 'headland', introId: 'intro-misty-shore', title: 'Туманный берег', bossId: 'abyss-warden',
    nights: ['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05', 'abyss-warden'] },
  { id: 'far-shore', mapId: 'sandspit', introId: 'intro-far-shore', title: 'Дальний берег', bossId: 'drowned-captain',
    nights: ['far-shore', 'far-shore-02', 'far-shore-03', 'far-shore-04', 'far-shore-05', 'far-shore-06', 'drowned-captain'] },
  { id: 'thorn-marsh', mapId: 'marsh-islands', introId: 'intro-thorn-marsh', title: 'Терновые топи', bossId: 'marsh-heart',
    nights: ['thorn-marsh-01', 'thorn-marsh-02', 'thorn-marsh-03', 'thorn-marsh-04', 'thorn-marsh-05', 'thorn-marsh-06', 'thorn-marsh-07', 'marsh-heart'] },
  { id: 'ashen-cliffs', mapId: 'ashen-plateau', introId: 'intro-ashen-cliffs', title: 'Пепельные утёсы', bossId: 'ash-colossus',
    nights: ['ashen-cliffs-01', 'ashen-cliffs-02', 'ashen-cliffs-03', 'ashen-cliffs-04', 'ashen-cliffs-05', 'ashen-cliffs-06', 'ashen-cliffs-07', 'ash-colossus'] },
  { id: 'ship-graveyard', mapId: 'wreck-channel', introId: 'intro-ship-graveyard', title: 'Кладбище кораблей', bossId: 'evening-knell',
    nights: ['ship-graveyard-01', 'ship-graveyard-02', 'ship-graveyard-03', 'ship-graveyard-04', 'ship-graveyard-05', 'ship-graveyard-06', 'ship-graveyard-07', 'ship-graveyard-08', 'evening-knell'] },
  { id: 'avalon-eclipse', mapId: 'ruined-towers', introId: 'intro-avalon-eclipse', title: 'Затмение Авалона', bossId: 'fallen-keeper',
    nights: ['avalon-eclipse-01', 'avalon-eclipse-02', 'avalon-eclipse-03', 'avalon-eclipse-04', 'avalon-eclipse-05', 'avalon-eclipse-06', 'avalon-eclipse-07', 'avalon-eclipse-08', 'fallen-keeper'] },
  { id: 'last-dawn', mapId: 'rift-coast', introId: 'intro-last-dawn', title: 'Последний рассвет', bossId: 'fog-heart',
    nights: ['last-dawn-01', 'last-dawn-02', 'last-dawn-03', 'last-dawn-04', 'last-dawn-05', 'last-dawn-06', 'last-dawn-07', 'last-dawn-08', 'fog-heart'] },
] as const;

type ChapterDraft = (typeof CAMPAIGN_CHAPTER_DRAFT)[number];
export type CampaignChapterDraftId = ChapterDraft['id'];
export type CampaignMapDraftId = ChapterDraft['mapId'];
export type CampaignStoryDraftNightId = ChapterDraft['nights'][number];

export type CampaignStoryDraftNight = Readonly<{
  id: CampaignStoryDraftNightId;
  chapterId: CampaignChapterDraftId;
  position: number;
  bossNight: boolean;
  requiresVictoryOf: CampaignStoryDraftNightId | null;
  schedule: { type: 'prototype'; nightId: NightId } | { type: 'pending' };
}>;

const prototypeById = new Map<string, (typeof NIGHT_CATALOG)[number]>(NIGHT_CATALOG.map(night => [night.id, night]));

function buildStoryDraft(): CampaignStoryDraftNight[] {
  const result: CampaignStoryDraftNight[] = [];
  for (const chapter of CAMPAIGN_CHAPTER_DRAFT) {
    for (const [index, id] of chapter.nights.entries()) {
      const bossNight = chapter.bossId === id;
      const prototype = prototypeById.get(id);
      if (prototype && (prototype.optional || Boolean(prototype.config.boss) !== bossNight)) {
        throw new Error(`Несовместимая ночь прототипа в кампании: ${id}`);
      }
      result.push({ id, chapterId: chapter.id, position: index + 1, bossNight,
        requiresVictoryOf: result.at(-1)?.id ?? null,
        schedule: prototype ? { type: 'prototype', nightId: prototype.id } : { type: 'pending' } });
    }
  }
  return result;
}

export const CAMPAIGN_STORY_DRAFT: readonly CampaignStoryDraftNight[] = buildStoryDraft();
export const CAMPAIGN_TRIAL_DRAFT_IDS: readonly NightId[] = NIGHT_CATALOG.filter(night => night.optional).map(night => night.id);

export function draftStoryNightAccess(night: CampaignStoryDraftNight, victories: ReadonlySet<CampaignStoryDraftNightId>): boolean {
  return night.requiresVictoryOf === null || victories.has(night.id) || victories.has(night.requiresVictoryOf);
}

export function draftNightWaves(night: CampaignStoryDraftNight): readonly WaveDefinition[] | null {
  return night.schedule.type === 'pending' ? null : structuredClone(prototypeById.get(night.schedule.nightId)!.config.waves);
}
