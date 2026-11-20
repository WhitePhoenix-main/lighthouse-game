import { describe, expect, it, vi } from 'vitest';
import type { BattleCommand, NightConfig, RandomSource } from '../src/contracts';
import { ABILITY_ECONOMY_CHAPTERS } from '../src/content/campaignAbilityEconomy';
import { CAMPAIGN_CONTROL_MAPS } from '../src/content/campaignControlMaps';
import { CAMPAIGN_CHAPTER_DRAFT, CAMPAIGN_STORY_DRAFT, CAMPAIGN_TRIAL_DRAFT_IDS,
  draftNightWaves, draftStoryNightAccess, type CampaignStoryDraftNightId } from '../src/content/campaignFoundationDraft';
import { NIGHT_CATALOG } from '../src/content/nights';
import { NIGHT_CONFIG } from '../src/content/night';
import { isLandCircle } from '../src/content/terrain';
import { createBattle, stepBattle } from '../src/simulation/battle';

describe('candidate campaign content and new-profile access', () => {
  it('has a stable key per chapter, map, intro and night, with one final boss per chapter', () => {
    expect(CAMPAIGN_CHAPTER_DRAFT).toHaveLength(7);
    for (const key of ['id', 'mapId', 'introId'] as const) {
      expect(new Set(CAMPAIGN_CHAPTER_DRAFT.map(chapter => chapter[key])).size).toBe(7);
    }
    expect(CAMPAIGN_CHAPTER_DRAFT.map(chapter => chapter.nights.length)).toEqual(ABILITY_ECONOMY_CHAPTERS.map(chapter => chapter.nights));
    expect(CAMPAIGN_STORY_DRAFT).toHaveLength(56);
    expect(new Set(CAMPAIGN_STORY_DRAFT.map(night => night.id)).size).toBe(56);
    for (const chapter of CAMPAIGN_CHAPTER_DRAFT) {
      const nights = CAMPAIGN_STORY_DRAFT.filter(night => night.chapterId === chapter.id);
      expect(nights.map(night => night.id)).toEqual(chapter.nights);
      expect(nights.map(night => night.position)).toEqual(nights.map((_, index) => index + 1));
      expect(nights.filter(night => night.bossNight)).toEqual([nights.at(-1)]);
      expect(nights.at(-1)!.id).toBe(chapter.bossId);
    }
  });

  it('retains every live id, but never puts an optional trial on the story path', () => {
    const references = CAMPAIGN_STORY_DRAFT.flatMap(night => night.schedule.type === 'prototype' ? [night.schedule.nightId] : []);
    expect(references).toEqual(NIGHT_CATALOG.filter(night => !night.optional).map(night => night.id));
    expect(CAMPAIGN_TRIAL_DRAFT_IDS).toEqual(['rescue-trial', 'armored-front', 'sky-siege', 'cross-current']);
    for (const trial of CAMPAIGN_TRIAL_DRAFT_IDS) {
      expect(CAMPAIGN_STORY_DRAFT.some(night => night.id === trial || night.requiresVictoryOf === trial)).toBe(false);
    }
    expect(CAMPAIGN_CHAPTER_DRAFT[0].nights).toEqual(['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05', 'abyss-warden']);
  });

  it('opens one next night for a clean profile, including chapter gates after full boss-night victories', () => {
    const won = new Set<CampaignStoryDraftNightId>();
    for (const [index, night] of CAMPAIGN_STORY_DRAFT.entries()) {
      const predecessor = CAMPAIGN_STORY_DRAFT[index - 1];
      const remainingOpen = CAMPAIGN_STORY_DRAFT.filter(candidate => !won.has(candidate.id) && draftStoryNightAccess(candidate, won));
      expect(remainingOpen).toEqual([night]);
      expect(night.requiresVictoryOf).toBe(predecessor?.id ?? null);
      if (night.position === 1 && predecessor) expect(predecessor.bossNight).toBe(true);
      won.add(night.id);
      expect(draftStoryNightAccess(night, won)).toBe(true);
    }
  });

  it('references reusable wave schedules without inventing empty waves or altering live content', () => {
    let inherited = 0;
    for (const night of CAMPAIGN_STORY_DRAFT) {
      const waves = draftNightWaves(night);
      if (night.schedule.type === 'pending') {
        expect(waves).toBeNull();
      } else {
        const live = NIGHT_CATALOG.find(candidate => candidate.id === night.id)!;
        expect(waves).toEqual(live.config.waves);
        expect(waves).not.toBe(live.config.waves);
        expect(waves![0]!.enemies).not.toBe(live.config.waves[0]!.enemies);
        inherited++;
      }
    }
    expect(inherited).toBe(5);
  });
});

const controlMapIds = ['headland', 'ashen-plateau', 'rift-coast'] as const;

function controlConfig(mapId: typeof controlMapIds[number]): NightConfig {
  return { ...structuredClone(NIGHT_CONFIG), id: `control-${mapId}`, rulesVersion: 'stage-b-map-control-v2',
    terrain: structuredClone(CAMPAIGN_CONTROL_MAPS[mapId].terrain), waves: [
      { id: 'ground-start', enemies: ['turtle', 'ghost', 'minotaur'], spawnInterval: 2 },
      { id: 'mixed-next', enemies: ['bat', 'turtle', 'ghost'], spawnInterval: 2 },
    ] };
}

function replayControl(config: NightConfig, seed: number, random?: RandomSource) {
  const state = createBattle(config, seed, random);
  const commands = new Map<number, BattleCommand[]>([
    [0, [{ type: 'aim', angle: Math.PI }]],
    [90, [{ type: 'aim', angle: -Math.PI / 2 }, { type: 'callWave' }]],
    [180, [{ type: 'aim', angle: Math.PI / 4 }]],
  ]);
  for (let tick = 0; tick < 300; tick++) stepBattle(state, config, commands.get(tick) ?? []);
  return state;
}

describe('candidate control maps in the headless simulation', () => {
  it.each(controlMapIds)('spawns a ground body wholly on land and replays %s deterministically', mapId => {
    expect(CAMPAIGN_CHAPTER_DRAFT.some(chapter => chapter.mapId === mapId)).toBe(true);
    const config = controlConfig(mapId);
    const initial = createBattle(config, 42);
    expect(initial.enemies[0]!.kind).toBe('turtle');
    expect(isLandCircle(config.terrain, initial.enemies[0]!, config.enemies.turtle.radius)).toBe(true);
    const result = replayControl(config, 42);
    expect(result.tick).toBe(300);
    expect(result.waves[1]!.startedEarly).toBe(true);
    expect(result.waves.map(wave => wave.spawned)).toEqual([3, 3]);
    expect(result).toEqual(replayControl(controlConfig(mapId), 42));
    const anotherSpawn = createBattle(config, 81).enemies[0]!;
    expect([anotherSpawn.x, anotherSpawn.y]).not.toEqual([initial.enemies[0]!.x, initial.enemies[0]!.y]);
  });

  it('changes the legal spawn arc without consuming extra seed samples', () => {
    const configs = controlMapIds.map(controlConfig);
    const sameSeed = configs.map(config => {
      const draw = vi.fn(() => .6);
      const result = replayControl(config, 42, { next: draw });
      expect(draw).toHaveBeenCalledTimes(6);
      return { result, firstEnemy: createBattle(config, 42).enemies[0]! };
    });
    expect(new Set(sameSeed.map(({ result }) => result.rngState)).size).toBe(1);
    const coordinates = sameSeed.map(({ firstEnemy }) => [firstEnemy.x.toFixed(6), firstEnemy.y.toFixed(6)].join(','));
    expect(new Set(coordinates).size).toBe(3);
  });
});
