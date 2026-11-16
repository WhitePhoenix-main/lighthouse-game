import type { LateNightMode, LateNightModeOption, NightConfig } from '../contracts';

export function isLateNight(id: string): boolean {
  return ['armored-front', 'sky-siege', 'cross-current'].includes(id);
}

/** Explicit choice, never scaled by purchased nodes. Catalog remains the assault baseline. */
export function resolveLateNight(config: NightConfig, mode: LateNightMode): NightConfig {
  const result = structuredClone(config);
  if (!isLateNight(result.id)) return result;
  result.lateMode = mode;
  if (mode === 'assault') return result;
  result.enemies = Object.fromEntries(Object.entries(result.enemies).map(([kind, enemy]) => [
    kind, { ...enemy, health: Math.round(enemy.health * .5), armor: Math.round(enemy.armor * .5) },
  ])) as NightConfig['enemies'];
  result.enemies = {
    ...result.enemies,
    ghost: { ...result.enemies.ghost, speed: 18, attackDamage: 12 },
    turtle: { ...result.enemies.turtle, speed: 12, attackDamage: 20 },
    bat: { ...result.enemies.bat, speed: 28, attackDamage: 12 },
  };
  const killReward = result.waves.reduce((sum, wave) => sum + wave.enemies.reduce((s, kind) => s + result.enemies[kind].reward, 0), 0);
  result.victoryReward = 190 - killReward;
  return result;
}

export function lateNightModeOptions(config: NightConfig): readonly LateNightModeOption[] {
  if (!isLateNight(config.id)) return [];
  const assaultReward = config.victoryReward + config.waves.reduce((sum, wave) => sum + wave.enemies.reduce((s, kind) => s + config.enemies[kind].reward, 0), 0);
  return [
    { id: 'transition', name: 'Переходный', description: 'Более слабые враги для частично прокачанного маяка. Ремонт и перезарядка остаются платными.', totalReward: 190 },
    { id: 'assault', name: 'Штурм', description: 'Усиленные враги для развитого маяка. Требуются сильная защита и своевременная реакция.', totalReward: assaultReward },
  ];
}
