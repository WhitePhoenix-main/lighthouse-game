import type { NightConfig } from '../contracts';
import { DEVICE_RULES } from './devices';
import { ENEMIES } from './enemies';

/** Combat baseline for synthetic fixtures. Production nights add coast and
 * equipment gates and victory economy in nights.ts. This fixture baseline has
 * no victory payout. All balance remains provisional. */
export const NIGHT_CONFIG: NightConfig = {
  id: 'first-light', rulesVersion: 'prototype-14-lens-completion', stepSeconds: 1 / 30,
  devices: DEVICE_RULES,
  shield: { radius: 155, capacityPerGenerator: 90, regenerationDelay: 4, regenerationPerSecond: 15 },
  flash: { radius: 210, damage: 22, stunDuration: 2, cooldown: 18 },
  worldRadius: 400, spawnRadius: 365, lighthouseRadius: 30, lighthouseHealth: 120,
  beam: { range: 300, halfAngle: Math.PI / 15, damagePerSecond: 30, maxTargets: 2, turnSpeed: Math.PI / 2 },
  waveInterval: 27, earlyBonusPerSecond: 1, victoryReward: 0,
  enemies: ENEMIES,
  waves: [
    { id: 'shore', enemies: ['ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 2.6 },
    { id: 'fog', enemies: ['ghost', 'turtle', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 2.6 },
    { id: 'tide', enemies: ['turtle', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 2.6 },
  ],
};

