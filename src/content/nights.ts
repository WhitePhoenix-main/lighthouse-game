import { createLateNights } from './lateNights';
import type { NightDefinition } from '../contracts';
import { getBossRules } from './boss';
import { NIGHT_CONFIG } from './night';

/** Preliminary turning/pressure playtest schedules, not final campaign balance.
 * Regular streams overlap at wave edges; urgent enemies have explicit gaps.
 * Keep NIGHT_CONFIG.waves unchanged for synthetic regression fixtures. */
const base = () => ({ ...structuredClone(NIGHT_CONFIG), earlyBonusPerSecond: .2, terrain: { shoreX: 0, landOnlyPlacement: true }, availableDevices: [], flash: { ...NIGHT_CONFIG.flash, enabled: false } });
export const NIGHT_CATALOG: readonly NightDefinition[] = [
  { id: 'first-light', name: 'Первый свет', description: 'Удерживайте свет и учитесь переключать угрозы.', chapter: 'Туманный берег', requires: null, optional: false,
    config: { ...base(), victoryReward: 72, waveInterval: 30, waves: [
      { id: 'shore', enemies: ['ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'fog', enemies: ['ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'tide', enemies: ['turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'dawn', enemies: ['ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost'], spawnInterval: 3.4 },
    ] } },
  { id: 'broken-shore', name: 'Разбитый берег', description: 'Быстрые угрозы испытывают прочность защиты.', chapter: 'Туманный берег', requires: 'first-light', optional: false,
    config: { ...base(), id: 'broken-shore', victoryReward: 84, waveInterval: 32, waves: [
      { id: 'charge', enemies: ['ghost', 'ghost', 'minotaur', 'ghost', 'turtle', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'pressure', enemies: ['ghost', 'turtle', 'ghost', 'minotaur', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'breach', enemies: ['ghost', 'turtle', 'ghost', 'ghost', 'minotaur', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 3.4 },
      { id: 'hold', enemies: ['ghost', 'ghost', 'minotaur', 'ghost', 'turtle', 'ghost', 'ghost', 'turtle', 'ghost', 'ghost'], spawnInterval: 3.4 },
    ] } },
  { id: 'winged-tide', name: 'Крылатый прилив', description: 'Защищайте маяк и расстановку от угроз с обеих сторон.', chapter: 'Туманный берег', requires: 'broken-shore', optional: false,
    config: { ...base(), id: 'winged-tide', victoryReward: 96, waveInterval: 34, waves: [
      { id: 'wings', enemies: ['ghost', 'bat', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'bat', 'ghost', 'turtle', 'ghost'], spawnInterval: 3.2 },
      { id: 'crossing', enemies: ['ghost', 'ghost', 'minotaur', 'ghost', 'turtle', 'ghost', 'ghost', 'bat', 'ghost', 'turtle', 'ghost'], spawnInterval: 3.2 },
      { id: 'storm', enemies: ['ghost', 'bat', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'minotaur', 'ghost', 'turtle', 'ghost'], spawnInterval: 3.2 },
      { id: 'ebb', enemies: ['ghost', 'ghost', 'bat', 'ghost', 'turtle', 'ghost', 'ghost', 'bat', 'ghost', 'turtle', 'ghost'], spawnInterval: 3.2 },
    ] } },
  { id: 'rescue-trial', name: 'Сигнал бедствия', description: 'Необязательное испытание: помогите кораблю светом.', chapter: 'Туманный берег', requires: 'first-light', optional: true,
    config: { ...base(), id: 'rescue-trial', victoryReward: 64, earlyBonusPerSecond: .18, waveInterval: 30, ship: { x: 220, y: 90, radius: 18, rescueSeconds: 6, deadline: 24, reward: 12 }, waves: [
      { id: 'distress', enemies: ['ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost'], spawnInterval: 4 },
      { id: 'return', enemies: ['ghost', 'bat', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'ghost'], spawnInterval: 4 },
      { id: 'escort', enemies: ['ghost', 'ghost', 'minotaur', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost'], spawnInterval: 4 },
      { id: 'safe-water', enemies: ['ghost', 'ghost', 'turtle', 'ghost', 'ghost', 'ghost', 'turtle', 'ghost'], spawnInterval: 4 },
    ] } },
  { id: 'abyss-warden', name: 'Страж глубин', description: 'Щупальца и общая угроза: завершите всю ночь.', chapter: 'Туманный берег', requires: 'winged-tide', optional: false,
    config: { ...base(), id:'abyss-warden', victoryReward:66, boss:getBossRules(1), waveInterval:32, waves:[
      {id:'warden-support', enemies:['ghost','ghost','turtle','ghost','bat','ghost','ghost','ghost'],spawnInterval:4},
      {id:'warden-rearguard', enemies:['ghost','minotaur','ghost','turtle','ghost','ghost','bat','ghost'],spawnInterval:4},
      {id:'warden-ebb', enemies:['ghost','ghost','turtle','ghost','bat','ghost','ghost','ghost'],spawnInterval:4},
    ] } },
  { id:'far-shore', name:'Дальний берег', description:'Первая ночь новой главы.',chapter:'Дальний берег',requires:'abyss-warden',optional:false,
    config:{...base(),id:'far-shore',victoryReward:108,waveInterval:36,waves:[
      {id:'new-shore',enemies:['ghost','bat','ghost','turtle','ghost','ghost','ghost','minotaur','ghost','turtle','ghost','ghost'],spawnInterval:3.2},
      {id:'new-tide',enemies:['ghost','bat','ghost','turtle','ghost','ghost','ghost','minotaur','ghost','turtle','ghost','ghost'],spawnInterval:3.2},
      {id:'new-current',enemies:['ghost','bat','ghost','turtle','ghost','ghost','ghost','minotaur','ghost','turtle','ghost','ghost'],spawnInterval:3.2},
      {id:'new-dawn',enemies:['ghost','bat','ghost','turtle','ghost','ghost','ghost','minotaur','ghost','turtle','ghost','ghost'],spawnInterval:3.2},
    ]} },
  ...createLateNights(base),
];
export const NIGHT_IDS = ['first-light', 'broken-shore', 'winged-tide', 'rescue-trial', 'abyss-warden', 'far-shore', 'armored-front', 'sky-siege', 'cross-current'] as const;
export function validateNightDefinitions(nights: readonly NightDefinition[]): void {
  if (nights.length === 0) throw new Error('Пустой каталог ночей.');
  const byId = new Map(nights.map(night => [night.id, night]));
  if (byId.size !== nights.length) throw new Error('Повторный идентификатор ночи.');
  for (const night of nights) {
    if (!NIGHT_IDS.includes(night.id) || !night.name.trim() || !night.chapter.trim() || typeof night.optional !== 'boolean'
      || night.config.id !== night.id || !night.config.rulesVersion.trim() || !night.config.waves.length
      || !Number.isFinite(night.config.stepSeconds) || night.config.stepSeconds <= 0) throw new Error('Неверное определение ночи.');
    const config = night.config;
    const positive = [config.worldRadius, config.spawnRadius, config.lighthouseRadius, config.lighthouseHealth, config.waveInterval,
      config.beam.range, config.beam.halfAngle, config.beam.maxTargets, config.beam.turnSpeed];
    if (positive.some(value => !Number.isFinite(value) || value <= 0)
      || !Number.isFinite(config.beam.damagePerSecond) || config.beam.damagePerSecond < 0
      || !Number.isSafeInteger(config.victoryReward) || config.victoryReward < 0
      || Object.values(config.enemies).some(enemy => !Number.isSafeInteger(enemy.reward) || enemy.reward < 0)
      || !Number.isFinite(config.earlyBonusPerSecond) || config.earlyBonusPerSecond < 0
      || (config.terrain !== undefined && (!Number.isFinite(config.terrain.shoreX) || typeof config.terrain.landOnlyPlacement !== 'boolean'))
      || (config.flash.enabled !== undefined && typeof config.flash.enabled !== 'boolean')
      || (config.availableDevices !== undefined && (new Set(config.availableDevices).size !== config.availableDevices.length || config.availableDevices.some(kind => !['cannon', 'barrier', 'generator', 'light-trap', 'harpoon', 'mortar', 'bell', 'repair-lamp'].includes(kind))))
      || new Set(config.waves.map(wave => wave.id)).size !== config.waves.length) throw new Error('Неверные правила ночи.');
    if (config.ship && ([config.ship.radius, config.ship.rescueSeconds, config.ship.deadline].some(value => !Number.isFinite(value) || value <= 0)
      || !Number.isFinite(config.ship.x) || !Number.isFinite(config.ship.y) || !Number.isSafeInteger(config.ship.reward) || config.ship.reward < 0)) throw new Error('Неверные правила корабля.');
    for (const wave of night.config.waves) {
      if (!wave.id || !wave.enemies.length || !Number.isFinite(wave.spawnInterval) || wave.spawnInterval <= 0
        || wave.enemies.some(kind => !night.config.enemies[kind])) throw new Error('Неверные правила волны.');
    }
    const visited = new Set<string>([night.id]);
    let next = night.requires;
    while (next !== null) {
      const dependency = byId.get(next);
      if (!dependency || (!night.optional && dependency.optional)) throw new Error('Неизвестная или недопустимая зависимость ночи.');
      if (visited.has(next)) throw new Error('Цикл зависимостей ночей.');
      visited.add(next); next = dependency.requires;
    }
  }
}
validateNightDefinitions(NIGHT_CATALOG);




