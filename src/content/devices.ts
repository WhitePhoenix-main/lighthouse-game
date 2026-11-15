import type { DeviceRules } from '../contracts';

/** Restoration tariffs, independent of placement and combat rules. */
export const DEVICE_ECONOMY = { repairFraction: 0.25, rechargeFraction: 0.1 } as const;

/** Provisional prices and stats for the first devices playtest. */
export const DEVICE_RULES: DeviceRules = {
  typeSlots: 2, maxObjects: 4, perType: { cannon: 2, harpoon: 2, mortar: 2, bell: 2, 'repair-lamp': 2, barrier: 2, generator: 2, 'light-trap': 2 }, placementRadius: 300,
  cannon: { manualDamageBonus: 0, armorMultiplier: 1 },
  barrier: { incomingDamageMultiplier: 1, chargeDamageMultiplier: 1, breakSlowMultiplier: 1, breakSlowSeconds: 1.5, breakSlowRadius: 70, repairCostMultiplier: 1 },
  generator: { incomingDamageMultiplier: 1, lastStandEnabled: false, residualSeconds: 0 },
  harpoon: { slowMultiplier: 1, slowSeconds: .6, flyingDamageMultiplier: 1 },
  trap: { triggerRadius: 48, blastRadius: 85, damage: 65, armorMultiplier: 1, charges: 1, rearmSeconds: 2.5 },
  mortar: { blastRadius: 55, projectileSpeed: 180, armorMultiplier: 1 },
  bell: { duration: 1.5, slowMultiplier: 0.65, firstPulseSlowMultiplier: 0.65, incomingDamageMultiplier: 1 },
  repairLamp: { healAmount: 10, charges: 3, incomingDamageMultiplier: 1, emergencyEnabled: false, emergencyMultiplier: 2, emergencyThreshold: 0.25 },
  definitions: {
    'repair-lamp': { id: 'repair-lamp', name: 'Ремонтный фонарь', description: 'Ограниченные заряды восстанавливают только потерянную в этой ночи прочность других устройств. Не ремонтирует фонари, маяк и щит.',
      cost: 48, radius: 16, health: 60, range: 140, damage: 0, attackInterval: 6 },
    bell: { id: 'bell', name: 'Колокол сдерживания', description: 'Автоматические импульсы замедляют существ и щупальца, включая летающих. Не наносит урон.',
      cost: 40, radius: 16, health: 70, range: 140, damage: 0, attackInterval: 6 },
    cannon: { id: 'cannon', name: 'Пушка', description: 'Ближайшая цель; одиночный выстрел. Существа на пути могут её разрушить.',
      cost: 20, radius: 16, health: 70, range: 160, damage: 16, attackInterval: 0.8 },
    harpoon: { id: 'harpoon', name: 'Гарпунная башня', description: 'Одиночный выстрел по наземным и летающим целям, включая призраков.',
      cost: 36, radius: 14, health: 60, range: 200, damage: 14, attackInterval: 1.4 },
    mortar: { id: 'mortar', name: 'Мортира', description: 'Снаряд летит в выбранную точку и взрывается по наземным целям. Быстрые враги могут уйти из зоны взрыва.',
      cost: 48, radius: 18, health: 80, range: 230, damage: 24, attackInterval: 3 },
    barrier: { id: 'barrier', name: 'Наземный барьер', description: 'Задерживает черепаху. Призрак проходит насквозь.',
      cost: 12, radius: 26, health: 140, range: 0, damage: 0, attackInterval: 0 },
    generator: { id: 'generator', name: 'Генератор', description: 'Поддерживает общее поле вокруг маяка. Второй увеличивает запас щита.',
      cost: 28, radius: 18, health: 60, range: 0, damage: 0, attackInterval: 0 },
    'light-trap': { id: 'light-trap', name: 'Световая ловушка', description: 'Автоматический взрыв рядом с существом. Остаток зарядов сохраняется между ночами; перезарядка оплачивается отдельно. Не оглушает.',
      cost: 16, radius: 14, health: 30, range: 0, damage: 0, attackInterval: 0 },
  },
};
