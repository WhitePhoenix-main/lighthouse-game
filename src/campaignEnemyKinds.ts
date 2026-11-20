export type PrototypeEnemyKind = 'ghost' | 'turtle' | 'minotaur' | 'bat';

export const CAMPAIGN_ENEMY_KINDS_BY_CHAPTER = {
  2: ['shieldbearer', 'scavenger', 'ray'],
  3: ['witch', 'rootweaver', 'brood'],
  4: ['siege-beast', 'golem', 'carrier'],
  5: ['siren', 'boarder', 'bomber'],
  6: ['mirror-knight', 'snuffer'],
} as const;

export type CampaignEnemyKind = (typeof CAMPAIGN_ENEMY_KINDS_BY_CHAPTER)[keyof typeof CAMPAIGN_ENEMY_KINDS_BY_CHAPTER][number];
export type CampaignSummonKind = PrototypeEnemyKind | CampaignEnemyKind;

export type EnemyKind = CampaignSummonKind;
