import type { EnemyDefinition } from '../contracts';
import type { CampaignEnemyKind } from '../campaignEnemyKinds';
import type { CampaignEnemyRules } from '../campaignCombatTypes';

export { CAMPAIGN_ENEMY_KINDS_BY_CHAPTER, type CampaignEnemyKind, type CampaignSummonKind } from '../campaignEnemyKinds';

type CampaignEnemyCatalog = { readonly [K in CampaignEnemyKind]: Omit<EnemyDefinition, 'id' | 'campaign'> & {
  id: K; nameEn: string; descriptionEn: string; campaign?: CampaignEnemyRules;
} };

/** Initial playtest values. The parent carries the reward for its entire split. */
export const CAMPAIGN_ENEMIES = {
  shieldbearer: {
    id: 'shieldbearer', name: 'Щитоносец', nameEn: 'Shieldbearer',
    description: 'Широкий щит закрывает врагов за ним. Броню можно разбить.',
    descriptionEn: 'Its broad shield screens enemies behind it. The armor can be broken.',
    radius: 20, health: 46, armor: 46, speed: 13, attackDamage: 10, attackInterval: 1.7, reward: 2,
    movement: 'ground', spawnSide: 'land',
  },
  scavenger: {
    id: 'scavenger', name: 'Падальщик', nameEn: 'Scavenger',
    description: 'Быстро приближается по суше. Уязвим для короткого наведения луча.',
    descriptionEn: 'Rushes in across land. A short burst of light can bring it down.',
    radius: 10, health: 27, armor: 0, speed: 31, attackDamage: 6, attackInterval: 1.1, reward: 1,
    movement: 'ground', spawnSide: 'land',
  },
  ray: {
    id: 'ray', name: 'Скат', nameEn: 'Ray',
    description: 'Перелетает барьеры и идёт к маяку. Уязвим для гарпуна.',
    descriptionEn: 'Flies over barriers and heads for the lighthouse. Vulnerable to harpoons.',
    radius: 15, health: 38, armor: 0, speed: 25, attackDamage: 8, attackInterval: 1.4, reward: 2,
    movement: 'flying', spawnSide: 'both',
  },
  witch: {
    id: 'witch', name: 'Ведьма', nameEn: 'Witch',
    description: 'После короткой подготовки лечит ближайших раненых союзников.',
    descriptionEn: 'After a short windup, heals nearby wounded allies.',
    radius: 13, health: 54, armor: 0, speed: 12, attackDamage: 7, attackInterval: 1.8, reward: 2,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'heal', radius: 84, amount: 18, windup: 1.2, cooldown: 5 },
  },
  rootweaver: {
    id: 'rootweaver', name: 'Корнеплёт', nameEn: 'Rootweaver',
    description: 'Готовит корни, которые связывают орудие. Уничтожьте или оглушите корнеплёта, чтобы освободить его.',
    descriptionEn: 'Prepares roots that bind a weapon. Defeat or stun the Rootweaver to free it.',
    radius: 16, health: 64, armor: 18, speed: 13, attackDamage: 8, attackInterval: 1.7, reward: 2,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'root', range: 118, windup: 5.6, cooldown: 9, duration: 6 },
  },
  brood: {
    id: 'brood', name: 'Выводок', nameEn: 'Brood',
    description: 'Гибель выводка выпускает двух призраков.',
    descriptionEn: 'Releases two ghosts when defeated.',
    radius: 17, health: 52, armor: 0, speed: 17, attackDamage: 9, attackInterval: 1.5, reward: 2,
    movement: 'ethereal', spawnSide: 'both', campaign: { kind: 'split', child: 'ghost', offset: 19 },
  },
  'siege-beast': {
    id: 'siege-beast', name: 'Осадник', nameEn: 'Siege Beast',
    description: 'Останавливается вдали, чтобы подготовить тяжёлый удар по маяку или полю.',
    descriptionEn: 'Stops at long range to prepare a heavy strike against the lighthouse or its shield.',
    radius: 21, health: 92, armor: 28, speed: 12, attackDamage: 19, attackInterval: 2.4, reward: 3,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'siege', range: 265, windup: 6.8, cooldown: 3.5 },
  },
  golem: {
    id: 'golem', name: 'Голем', nameEn: 'Golem',
    description: 'Бронированный великан. После распада остаются два мелких падальщика.',
    descriptionEn: 'An armored giant that breaks apart into two small Scavengers.',
    radius: 24, health: 88, armor: 56, speed: 9, attackDamage: 16, attackInterval: 2.1, reward: 4,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'split', child: 'scavenger', offset: 20 },
  },
  carrier: {
    id: 'carrier', name: 'Носитель', nameEn: 'Carrier',
    description: 'Крупный бронированный летун прикрывает строй и перелетает барьеры.',
    descriptionEn: 'A large armored flier that screens the formation and flies over barriers.',
    radius: 25, health: 78, armor: 30, speed: 15, attackDamage: 13, attackInterval: 1.9, reward: 3,
    movement: 'flying', spawnSide: 'both',
  },
  siren: {
    id: 'siren', name: 'Сирена', nameEn: 'Siren',
    description: 'После предупреждения ускоряет движение ближайших союзников, пока звучит её песня.',
    descriptionEn: 'After a warning, nearby allies move faster while her song lasts.',
    radius: 14, health: 67, armor: 0, speed: 16, attackDamage: 9, attackInterval: 1.5, reward: 2,
    movement: 'ethereal', spawnSide: 'both', campaign: { kind: 'haste', radius: 106, windup: 1.2, cooldown: 6, duration: 3.5, multiplier: 1.35 },
  },
  boarder: {
    id: 'boarder', name: 'Абордажник', nameEn: 'Boarder',
    description: 'Преследует ближайшее устройство. Барьеры могут перехватить его.',
    descriptionEn: 'Hunts the nearest device. Barriers can intercept it.',
    radius: 14, health: 55, armor: 16, speed: 26, attackDamage: 13, attackInterval: 1.3, reward: 2,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'hunt-device' },
  },
  bomber: {
    id: 'bomber', name: 'Бомбардир', nameEn: 'Bombardier',
    description: 'Отмечает область обстрела. Взрыв может задеть несколько устройств.',
    descriptionEn: 'Marks a bombardment area. The blast can hit several devices.',
    radius: 17, health: 74, armor: 10, speed: 16, attackDamage: 17, attackInterval: 2, reward: 3,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'bombard', range: 176, radius: 63, windup: 5.8, cooldown: 4.5 },
  },
  'mirror-knight': {
    id: 'mirror-knight', name: 'Зеркальный рыцарь', nameEn: 'Mirror Knight',
    description: 'Обозначает смену стойки. Пока зеркало поднято, луч слабее, а орудия бьют в полную силу.',
    descriptionEn: 'Signals a change of stance. Its raised mirror weakens the beam while weapons deal full damage.',
    radius: 18, health: 83, armor: 35, speed: 17, attackDamage: 14, attackInterval: 1.5, reward: 3,
    movement: 'ground', spawnSide: 'land', campaign: { kind: 'mirror', windup: 1.2, cooldown: 7, duration: 3, beamMultiplier: .45 },
  },
  snuffer: {
    id: 'snuffer', name: 'Гаситель', nameEn: 'Snuffer',
    description: 'После заметной подготовки временно подавляет незащищённое орудие.',
    descriptionEn: 'After a clear windup, briefly disables an exposed weapon.',
    radius: 16, health: 79, armor: 14, speed: 17, attackDamage: 11, attackInterval: 1.55, reward: 3,
    movement: 'ethereal', spawnSide: 'both', campaign: { kind: 'suppress', range: 184, windup: 6, cooldown: 7, duration: 4 },
  },
} as const satisfies CampaignEnemyCatalog;
