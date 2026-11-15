import type { EnemyDefinition, EnemyKind } from '../contracts';

/** Preliminary playtest values; shards follow the revised night budgets. */
export const ENEMIES: Readonly<Record<EnemyKind, EnemyDefinition>> = {
  ghost: { id: 'ghost', name: 'Призрак', description: 'Проходит сквозь барьеры. Медленно приближается, слабые удары.', radius: 12,
    health: 34, armor: 0, speed: 12, attackDamage: 5, attackInterval: 1.8, reward: 1, movement: 'ethereal', spawnSide: 'both' },
  turtle: { id: 'turtle', name: 'Искажённая черепаха', description: 'Крепкая броня. Повреждения брони сохраняются при смене цели.', radius: 20,
    health: 42, armor: 68, speed: 9, attackDamage: 12, attackInterval: 2.2, reward: 2, movement: 'ground', spawnSide: 'land' },
  minotaur: { id: 'minotaur', name: 'Искажённый минотавр', description: 'Готовит один рывок с усиленным ударом. Затем атакует обычно.', radius: 18,
    health: 66, armor: 0, speed: 19, attackDamage: 12, attackInterval: 1.6, reward: 3, movement: 'ground', spawnSide: 'land',
    // Windup must be inside the baseline light range. 5.5s covers a half-turn
    // (2s), recognition (1s), and 66 / 30 DPS (2.2s), even beside a device.
    // Objects outside the light interception zone can still take normal contact.
    charge: { windup: 5.5, speed: 110, damageMultiplier: 3, triggerDistance: 300 } },
  bat: { id: 'bat', name: 'Искажённая летучая мышь', description: 'Летит к ближайшему устройству, игнорирует барьеры и пушки.', radius: 10,
    health: 25, armor: 0, speed: 26, attackDamage: 9, attackInterval: 1.2, reward: 2, movement: 'flying', spawnSide: 'both' },
};
