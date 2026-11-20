import type { BossRules } from '../contracts';
import type { CampaignBossRules } from '../campaignCombatTypes';
import { getBossRules } from './boss';

type CampaignBoss = BossRules & { campaign: CampaignBossRules };

// Provisional greybox balance. Each action can occur once per entry in the
// current phase. Parts persist across phases, with a permanent shared-health target.
const colossus: CampaignBoss = {
  ...getBossRules(1), id: 'ash-colossus', name: 'Пепельный колосс',
  health: 1040, materialReward: 0, tentacleCount: 3, radius: 23, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: -258, y: 0 },
      { id: 'hammer', x: -194, y: -144, health: 190 },
      { id: 'furnace', x: -187, y: 153, health: 154 },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'strike', source: 'hammer', waitSeconds: 8, warningSeconds: 6.5, damage: 31 },
        { kind: 'salvo', source: 'furnace', waitSeconds: 8, warningSeconds: 6, radius: 68, damage: 21 },
      ] },
      { healthFraction: .52, actions: [
        { kind: 'salvo', source: 'furnace', waitSeconds: 4, warningSeconds: 6, radius: 84, damage: 27 },
        { kind: 'strike', source: 'hammer', waitSeconds: 7, warningSeconds: 6, damage: 39 },
        { kind: 'strike', source: 'core', waitSeconds: 8, warningSeconds: 6, damage: 23 },
      ] },
    ],
  },
};

const fogHeart: CampaignBoss = {
  ...getBossRules(1), id: 'fog-heart', name: 'Сердце тумана',
  health: 1740, materialReward: 0, tentacleCount: 4, radius: 22, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: 276, y: 0 },
      { id: 'rift', x: 128, y: -184, health: 190 },
      { id: 'root', x: -186, y: -132, health: 178 },
      { id: 'cannon', x: 154, y: 177, health: 205 },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'summon', source: 'rift', waitSeconds: 6, warningSeconds: 6, center: { x: 239, y: -158 }, radius: 42,
          enemies: [{ kind: 'ray', x: 223, y: -170 }, { kind: 'bat', x: 255, y: -146 }] },
        { kind: 'root', source: 'root', waitSeconds: 7, warningSeconds: 6, durationSeconds: 6 },
      ] },
      { healthFraction: .66, actions: [
        { kind: 'salvo', source: 'cannon', waitSeconds: 4, warningSeconds: 6, radius: 88, damage: 31 },
        { kind: 'summon', source: 'rift', waitSeconds: 7, warningSeconds: 6, center: { x: -274, y: 158 }, radius: 48,
          enemies: [{ kind: 'mirror-knight', x: -294, y: 173 }, { kind: 'scavenger', x: -254, y: 143 }] },
        { kind: 'root', source: 'root', waitSeconds: 7, warningSeconds: 6, durationSeconds: 7 },
      ] },
      { healthFraction: .3, actions: [
        { kind: 'strike', source: 'core', waitSeconds: 3, warningSeconds: 6.5, damage: 44 },
        { kind: 'salvo', source: 'cannon', waitSeconds: 7, warningSeconds: 6, radius: 100, damage: 37 },
        { kind: 'strike', source: 'core', waitSeconds: 8, warningSeconds: 6, damage: 36 },
      ] },
    ],
  },
};

const wardenBase = getBossRules(1);
const warden: CampaignBoss = {
  ...wardenBase, materialReward: 0, spawnRadius: 280,
  campaign: {
    parts: [
      { id: 'core', x: 279, y: 0, moves: true },
      { id: 'north-tentacle', x: 211, y: -151, health: 76, moves: true },
      { id: 'south-tentacle', x: 211, y: 151, health: 76, moves: true },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'strike', source: 'north-tentacle', waitSeconds: 9, warningSeconds: 5.7, damage: 12 },
        { kind: 'strike', source: 'south-tentacle', waitSeconds: 7, warningSeconds: 5.7, damage: 12 },
        { kind: 'strike', source: 'north-tentacle', waitSeconds: 8, warningSeconds: 5.7, damage: 14 },
      ] },
      { healthFraction: .48, actions: [
        { kind: 'strike', source: 'south-tentacle', waitSeconds: 4, warningSeconds: 5.7, damage: 15 },
        { kind: 'strike', source: 'north-tentacle', waitSeconds: 7, warningSeconds: 5.7, damage: 15 },
        { kind: 'strike', source: 'core', waitSeconds: 9, warningSeconds: 6, damage: 14 },
      ] },
    ],
  },
};

const captain: CampaignBoss = {
  ...wardenBase, id: 'drowned-captain', name: 'Затонувший капитан',
  health: 660, materialReward: 0, tentacleCount: 3, radius: 18, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: 245, y: 95 },
      { id: 'standard', x: 194, y: 190, health: 105 },
      { id: 'signal', x: 208, y: -137, health: 95 },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'summon', source: 'standard', waitSeconds: 7, warningSeconds: 6, center: { x: -253, y: 157 }, radius: 45,
          enemies: [{ kind: 'shieldbearer', x: -235, y: 174 }, { kind: 'scavenger', x: -271, y: 140 }] },
        { kind: 'summon', source: 'signal', waitSeconds: 9, warningSeconds: 6, center: { x: 247, y: -114 }, radius: 33,
          enemies: [{ kind: 'ray', x: 247, y: -114 }] },
      ] },
      { healthFraction: .5, actions: [
        { kind: 'summon', source: 'signal', waitSeconds: 3, warningSeconds: 6, center: { x: 261, y: -134 }, radius: 45,
          enemies: [{ kind: 'ray', x: 246, y: -151 }, { kind: 'bat', x: 276, y: -117 }] },
        { kind: 'summon', source: 'standard', waitSeconds: 9, warningSeconds: 6, center: { x: -230, y: 187 }, radius: 45,
          enemies: [{ kind: 'shieldbearer', x: -216, y: 201 }, { kind: 'scavenger', x: -244, y: 173 }] },
        { kind: 'strike', source: 'core', waitSeconds: 8, warningSeconds: 6, damage: 16 },
      ] },
    ],
  },
};

const marshHeart: CampaignBoss = {
  ...wardenBase, id: 'marsh-heart', name: 'Сердце топи',
  health: 820, materialReward: 0, tentacleCount: 3, radius: 19, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: -261, y: -16 },
      { id: 'north-root', x: -155, y: -139, health: 130 },
      { id: 'south-root', x: -187, y: 115, health: 126 },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'root', source: 'north-root', waitSeconds: 7, warningSeconds: 6, durationSeconds: 5 },
        { kind: 'root', source: 'south-root', waitSeconds: 8, warningSeconds: 6, durationSeconds: 5 },
      ] },
      { healthFraction: .55, actions: [
        { kind: 'root', source: 'south-root', waitSeconds: 4, warningSeconds: 6, durationSeconds: 8 },
        { kind: 'root', source: 'north-root', waitSeconds: 9, warningSeconds: 6, durationSeconds: 8 },
        { kind: 'strike', source: 'core', waitSeconds: 8, warningSeconds: 6, damage: 22 },
      ] },
    ],
  },
};

const eveningKnell: CampaignBoss = {
  ...wardenBase, id: 'evening-knell', name: 'Вечерний звон',
  health: 1240, materialReward: 0, tentacleCount: 3, radius: 20, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: 256, y: 0 },
      { id: 'fore-gun', x: 207, y: -134, health: 160 },
      { id: 'aft-gun', x: 207, y: 134, health: 168 },
    ],
    phases: [
      { healthFraction: 1, actions: [
        { kind: 'salvo', source: 'fore-gun', waitSeconds: 7, warningSeconds: 6, radius: 76, damage: 27 },
        { kind: 'salvo', source: 'aft-gun', waitSeconds: 8, warningSeconds: 6, radius: 82, damage: 24 },
      ] },
      { healthFraction: .55, actions: [
        { kind: 'salvo', source: 'aft-gun', waitSeconds: 4, warningSeconds: 6, radius: 107, damage: 30 },
        { kind: 'salvo', source: 'fore-gun', waitSeconds: 8, warningSeconds: 6, radius: 84, damage: 34 },
        { kind: 'strike', source: 'core', waitSeconds: 9, warningSeconds: 6, damage: 21 },
      ] },
    ],
  },
};

const keeper: CampaignBoss = {
  ...wardenBase, id: 'fallen-keeper', name: 'Падший хранитель',
  health: 1410, materialReward: 0, tentacleCount: 3, radius: 21, speed: 0,
  campaign: {
    parts: [
      { id: 'core', x: 236, y: 8 },
      { id: 'north-blade', x: -167, y: -154, health: 176 },
      { id: 'south-blade', x: -165, y: 167, health: 174 },
    ],
    phases: [
      { healthFraction: 1, stance: 'guarded', coreDamageMultiplier: .65, actions: [
        { kind: 'strike', source: 'north-blade', waitSeconds: 7, warningSeconds: 6, damage: 27 },
        { kind: 'root', source: 'south-blade', waitSeconds: 8, warningSeconds: 6, durationSeconds: 5 },
      ] },
      { healthFraction: .7, stance: 'exposed', coreDamageMultiplier: 1.15, actions: [
        { kind: 'salvo', source: 'south-blade', waitSeconds: 4, warningSeconds: 6, radius: 70, damage: 30 },
        { kind: 'strike', source: 'north-blade', waitSeconds: 8, warningSeconds: 6, damage: 30 },
      ] },
      { healthFraction: .35, stance: 'guarded', coreDamageMultiplier: .8, actions: [
        { kind: 'strike', source: 'south-blade', waitSeconds: 4, warningSeconds: 6, damage: 34 },
        { kind: 'salvo', source: 'north-blade', waitSeconds: 8, warningSeconds: 6, radius: 78, damage: 30 },
        { kind: 'strike', source: 'core', waitSeconds: 8, warningSeconds: 6, damage: 26 },
      ] },
    ],
  },
};

const bosses = [warden, captain, marshHeart, colossus, eveningKnell, keeper, fogHeart];

export function getCampaignBoss(chapterNumber: number): CampaignBoss | undefined {
  return Number.isInteger(chapterNumber) ? bosses[chapterNumber - 1] : undefined;
}
