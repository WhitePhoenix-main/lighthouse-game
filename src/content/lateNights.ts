import type { EnemyKind, NightConfig, NightDefinition } from '../contracts';

/** Optional post-shore trials. Enemy variants are local to a night, never global changes.
 * Four escalating phases; durable groups pressure the field without bypassing it. */
export function createLateNights(base: () => NightConfig): NightDefinition[] {
  const wave = (id: string, enemies: EnemyKind[], spawnInterval = 1.6) => ({ id, enemies, spawnInterval });
  const veterans = (): NightConfig => {
    const config = base();
    return { ...config, enemies: {
      ...config.enemies,
      ghost: { ...config.enemies.ghost, name: 'Штурмовой призрак', health: 450, speed: 24, attackDamage: 18,
        description: 'Стойкий и быстрый призрак. Группа способна удержать общее поле истощённым.' },
      turtle: { ...config.enemies.turtle, health: 250, speed: 18, attackDamage: 30 },
      bat: { ...config.enemies.bat, name: 'Налётчик', health: 250, speed: 32, attackDamage: 18,
        description: 'Более стойкая летучая мышь. Обходит барьеры и атакует устройства.' },
      // An isolated charge can still be stopped after a turn with the full basic beam.
      minotaur: { ...config.enemies.minotaur, health: 180 },
    } };
  };
  const armored = veterans();
  armored.enemies = { ...armored.enemies, ghost: { ...armored.enemies.ghost, health: 270 } };
  armored.enemies = { ...armored.enemies, turtle: { ...armored.enemies.turtle, name: 'Панцирная черепаха', health: 225, armor: 840, speed: 18,
    description: 'Усиленный панцирь задерживает луч. Бронебойность помогает освободить свет для других угроз.' } };
  const sky = veterans();
  sky.enemies = { ...sky.enemies, turtle: { ...sky.enemies.turtle, armor: 170 } };
  const mixed = veterans();
  mixed.enemies = { ...mixed.enemies, turtle: { ...mixed.enemies.turtle, armor: 425 } };
  return [
    { id: 'armored-front', name: 'Броневой фронт', chapter: 'Поздние испытания', requires: 'far-shore', optional: true,
      description: 'Испытание развитого маяка: черепахи с 840 брони. Темп растёт по волнам; используйте бронебойность и готовьте защиту от рывков.',
      config: { ...armored, id: 'armored-front', victoryReward: 180, waveInterval: 44, waves: [
        wave('shell-line', ['turtle','ghost','turtle','ghost','turtle','ghost','minotaur','turtle','ghost','turtle','ghost','turtle'], 3.2),
        wave('shell-flank', ['ghost','turtle','turtle','ghost','turtle','ghost','minotaur','turtle','ghost','turtle','ghost','turtle'], 2.4),
        wave('shell-pressure', ['turtle','ghost','turtle','ghost','turtle','ghost','minotaur','turtle','ghost','turtle','ghost','turtle']),
        wave('shell-last', ['ghost','turtle','ghost','turtle','turtle','ghost','minotaur','turtle','ghost','turtle','ghost','turtle']),
      ] } },
    { id: 'sky-siege', name: 'Воздушный налёт', chapter: 'Поздние испытания', requires: 'far-shore', optional: true,
      description: 'Испытание развитого маяка: стойкие налётчики и штурмовые призраки. Темп растёт по волнам; защищайте устройства и общее поле.',
      config: { ...sky, id: 'sky-siege', victoryReward: 188, waveInterval: 44, waves: [
        wave('sky-scouts', ['bat','ghost','bat','ghost','turtle','ghost','bat','ghost','bat','ghost','bat','ghost'], 3.2),
        wave('sky-divers', ['ghost','bat','ghost','bat','turtle','ghost','bat','ghost','bat','ghost','bat','ghost'], 2.4),
        wave('sky-crossing', ['bat','ghost','bat','ghost','turtle','ghost','bat','ghost','bat','ghost','bat','ghost']),
        wave('sky-return', ['ghost','bat','ghost','bat','turtle','ghost','bat','ghost','bat','ghost','bat','ghost']),
      ] } },
    { id: 'cross-current', name: 'Смешанный штурм', chapter: 'Поздние испытания', requires: 'far-shore', optional: true,
      description: 'Испытание развитого маяка: броня, налётчики и рывки с предупреждением 5,5 с. Темп растёт по волнам; вовремя переключайте цели.',
      config: { ...mixed, id: 'cross-current', victoryReward: 185, waveInterval: 44, waves: [
        wave('cross-shells', ['turtle','ghost','turtle','bat','ghost','minotaur','ghost','turtle','ghost','bat','ghost','ghost'], 3.2),
        wave('cross-air', ['bat','ghost','bat','turtle','ghost','minotaur','ghost','bat','ghost','turtle','ghost','ghost'], 2.4),
        wave('cross-charge', ['ghost','minotaur','ghost','turtle','bat','ghost','ghost','minotaur','ghost','turtle','ghost','ghost']),
        wave('cross-last', ['turtle','bat','ghost','ghost','ghost','minotaur','ghost','bat','turtle','ghost','ghost','ghost']),
      ] } },
  ];
}
