import type { BossRules } from '../contracts';

/** Provisional prototype balance; repeated full-night wins raise the level, capped at 3. */
export const BOSS_LEVELS: readonly BossRules[] = [1, 2, 3].map(level => ({
  id: 'abyss-warden', name: 'Страж глубин', level, materialReward: level + 1,
  health: 420 + (level - 1) * 180, tentacleCount: level + 2,
  spawnRadius: 320, radius: 16, speed: 12 + (level - 1) * 2,
  attackDamage: 8 + (level - 1) * 2, attackInterval: 1.5, litSpeedMultiplier: 0.45,
}));
export function getBossRules(level: number): BossRules {
  return { ...BOSS_LEVELS[Math.max(0, Math.min(2, (Number.isFinite(level) ? Math.floor(level) : 1) - 1))]! };
}
