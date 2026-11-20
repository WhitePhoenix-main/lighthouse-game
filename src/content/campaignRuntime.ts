import type { NightDefinition } from '../contracts';
import { getCampaignBoss } from './campaignBosses';
import { draftFirstWinPearls } from './campaignPurchaseDraft';
import { CAMPAIGN_CHAPTER_DRAFT, CAMPAIGN_STORY_DRAFT } from './campaignFoundationDraft';
import { CAMPAIGN_TERRAIN } from './campaignTerrain';
import { campaignNightPlan } from './campaignWaves';
import { campaignChapterIntro } from './campaignIntros';
import { ENEMIES } from './enemies';
import { NIGHT_CONFIG } from './night';
export { CAMPAIGN_TERRAIN } from './campaignTerrain';

const regularRewards = [45, 65, 95, 130, 175, 225, 295];
const firstRewards = [20, 35, 50, 70, 90, 120, 160];

export function campaignChapterFor(nightId: string) {
  const night = CAMPAIGN_STORY_DRAFT.find(item => item.id === nightId);
  if (!night) throw new Error('Неизвестная ночь кампании.');
  const chapterIndex = CAMPAIGN_CHAPTER_DRAFT.findIndex(chapter => chapter.id === night.chapterId);
  return { night, chapter: CAMPAIGN_CHAPTER_DRAFT[chapterIndex]!, chapterIndex };
}

export function campaignFirstRewards(nightId: string) {
  const { night, chapterIndex } = campaignChapterFor(nightId);
  return { firstWinShards: firstRewards[chapterIndex]!, firstWinPearls: draftFirstWinPearls(chapterIndex + 1, night.position) };
}

export function campaignIntro(nightId: string) {
  return campaignChapterIntro(campaignChapterFor(nightId).chapterIndex)!;
}

export const CAMPAIGN_NIGHT_CATALOG: readonly NightDefinition[] = CAMPAIGN_STORY_DRAFT.map(draft => {
  const { chapter, chapterIndex } = campaignChapterFor(draft.id);
  const { name, briefing, waves, waveInterval } = campaignNightPlan(chapterIndex, draft.position, draft.bossNight);
  const boss = draft.bossNight ? getCampaignBoss(chapterIndex + 1) : undefined;
  return { id: draft.id, name, description: briefing, chapter: chapter.title,
    requires: draft.requiresVictoryOf, optional: false,
    config: { ...NIGHT_CONFIG, id: draft.id, rulesVersion: 'campaign-story-1',
      terrain: CAMPAIGN_TERRAIN[chapter.mapId], campaignMapId: chapter.mapId, waves, waveInterval, enemies: ENEMIES,
      availableDevices: [], flash: { ...NIGHT_CONFIG.flash, enabled: false }, earlyBonusPerSecond: .16,
      ...(boss ? { boss } : {}), victoryReward: regularRewards[chapterIndex]! },
  };
});
