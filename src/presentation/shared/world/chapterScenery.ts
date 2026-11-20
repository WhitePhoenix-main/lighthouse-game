import type { NightConfig } from '../../../contracts';
import { CAMPAIGN_CHAPTER_DRAFT } from '../../../content/campaignFoundationDraft';

export type CampaignMap = NonNullable<NightConfig['campaignMapId']>;
export type LighthouseStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CampaignPresentationConfig = NightConfig & {
  lighthouseStage?: LighthouseStage;
};

export function campaignLighthouseStage(wonNightIds: readonly string[]): LighthouseStage {
  let unlocked = 0;
  for (const chapter of CAMPAIGN_CHAPTER_DRAFT.slice(0, -1)) {
    if (!wonNightIds.includes(chapter.bossId)) break;
    unlocked++;
  }
  return (unlocked + 1) as LighthouseStage;
}

type Landmark = readonly [x: number, y: number, size: number];
interface Scenery {
  stage: LighthouseStage;
  // Deep water, surface water, rock shadow, dry ground, ground grain, shoreline, haze.
  palette: readonly [string, string, string, string, string, string, string];
  motif: 'shale' | 'dune' | 'reed' | 'basalt' | 'wreck' | 'ruin' | 'rift';
  landmarks: readonly Landmark[];
}

export const CHAPTER_SCENERY: Record<CampaignMap, Scenery> = {
  headland: { stage: 1, palette: ['#091820', '#152d37', '#14272b', '#303a38', '#3b4643', '#596761', '#779393'],
    motif: 'shale', landmarks: [[-168,-126,36],[-145,106,32],[-226,25,43],[-73,-239,28]] },
  sandspit: { stage: 2, palette: ['#0c1e30', '#1b3647', '#35332e', '#5d4f38', '#6a593c', '#8d7652', '#a38d66'],
    motif: 'dune', landmarks: [[123,-141,56],[-84,137,47],[-162,-96,46],[40,-254,51]] },
  'marsh-islands': { stage: 3, palette: ['#0b1a1a', '#1b332e', '#202b25', '#333b2e', '#444a34', '#626d4d', '#799477'],
    motif: 'reed', landmarks: [[-159,-110,24],[-161,138,26],[190,-185,27],[-32,335,23],[102,73,19],[-255,-208,25],[-218,260,37]] },
  'ashen-plateau': { stage: 4, palette: ['#151b2c', '#28334e', '#342b33', '#544343', '#61494a', '#8a695e', '#ab8c84'],
    motif: 'basalt', landmarks: [[68,-195,42],[92,-136,38],[96,134,53],[-113,188,49],[-197,-118,45]] },
  'wreck-channel': { stage: 5, palette: ['#091b24', '#1b323a', '#242c2b', '#343d37', '#424c43', '#606e60', '#79968d'],
    motif: 'wreck', landmarks: [[199,-124,60],[216,136,63],[277,-202,46],[136,254,39]] },
  'ruined-towers': { stage: 6, palette: ['#131724', '#26283e', '#262533', '#383746', '#494557', '#70677e', '#9085a6'],
    motif: 'ruin', landmarks: [[-198,-154,43],[-201,138,43],[69,-154,33],[92,156,30],[-106,211,31]] },
  'rift-coast': { stage: 7, palette: ['#202341', '#353554', '#332a41', '#564553', '#635266', '#927984', '#bc8e95'],
    motif: 'rift', landmarks: [[186,-142,48],[126,-27,39],[138,47,40],[205,137,50],[-134,-195,33],[-149,168,36]] },
};
