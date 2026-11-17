import type { ApplicationView, LateNightMode, UpgradeStat, UpgradeId, UpgradeNodeView } from '../contracts';
import { preparationScreen } from './preparation/preparationScreen';
import { createPreparationUiState, type PreparationUiState } from './preparation/preparationState';
import { lensSelection, materialName } from './shared/lenses';
import { referenceSettings } from './settings/referenceSettings';
import { referenceMenu } from './menu/referenceMenu';
import { referenceGameMenu } from './menu/gameMenu';
import { createSkillTreeState, skillTree, skillCategories, type SkillTreeState } from './skill-tree/skillTree';
import { buildSkillGraph } from './skill-tree/skillTreeModel';

const escape = (text: string): string => text.replace(/[&<>"']/g, (letter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter] ?? letter);
export const upgradeValue = (stat: UpgradeStat, amount: number): string => {
  if (stat === 'beamArmorBonus') return Number(amount.toFixed(2)) + ' к множителю урона броне';
  const generalUnits: Partial<Record<UpgradeStat, string>> = {"beamExecuteBonus":"урона луча при HP ниже 25%","litDeviceDamageBonus":"урона орудий по освещённой цели","lighthouseDamageReduction":"снижения урона маяку","lighthouseHeavyReduction":"защиты от рывка и босса","lighthouseEmergencyReduction":"аварийного снижения урона","shieldRestoreReduction":"защиты поля после включения"};
  if (generalUnits[stat]) return Math.round(amount * 100) + '% ' + generalUnits[stat];
  if (['cannon', 'harpoon', 'mortar', 'bell', 'barrier', 'generator', 'light-trap', 'repair-lamp', 'flash'].includes(stat)) return amount > 0 ? 'открыто' : 'закрыто';
  if (stat === 'typeSlots') return `${Math.round(amount)} слота типов`;
  if (stat === 'pairedDamageBonus') return `${Math.round(amount * 100)}% при освещении ≥2 врагов`;
  const numeric = (value: number): string => String(Number(value.toFixed(2)));
  if (stat === 'turnSpeed') return `${numeric(amount * 180 / Math.PI)}°/с`;
  if (stat === 'generatorLastStand') return amount > 0 ? 'открыто' : 'закрыто';
  if (stat === 'cannonManualBonus') return `${numeric(amount * 100)}% прицельного залпа`;
  if (stat === 'cannonArmorMultiplier') return `×${numeric(amount)} урона броне`;
  if (stat === 'barrierHealth' || stat === 'generatorHealth') return `${numeric(amount)} прочности корпуса`;
  if (stat === 'barrierDamageReduction' || stat === 'generatorDamageReduction') return `×${numeric(amount)} входящего урона`;
  if (stat === 'barrierChargeReduction') return `×${numeric(amount)} урона рывка`;
  if (stat === 'barrierBreakSlowReduction') return `×${numeric(amount)} скорости после разрушения`;
  if (stat === 'rechargeCostReduction') return '×' + numeric(amount) + ' стоимости перезарядки до округления';
  if (stat === 'flashDamagedArmorBonus') return '+' + numeric(amount * 100) + '% урона повреждённой броне';
  if (stat === 'deviceHealthBonus') return '+' + numeric(amount * 100) + '% исходной прочности корпусов';
  if (stat === 'repairCostReduction') return '×' + numeric(amount) + ' стоимости ремонта до округления';
  if (stat === 'barrierRepairReduction') return `×${numeric(amount)} стоимости ремонта`;
  if (stat === 'generatorResidualSeconds') return `${numeric(amount)} с остаточного поля`;
  if (stat === 'repairEmergency') return amount > 0 ? 'открыто' : 'закрыто';
  if (stat === 'repairDamageReduction') return `×${numeric(amount)} входящего урона`;
  if (stat === 'repairAmount') return `${numeric(amount)} прочности за ремонт`;
  if (stat === 'repairRange') return `${numeric(amount)} радиуса`;
  if (stat === 'repairCharges') return `${numeric(amount)} зарядов на ночь`;
  if (stat === 'bellDamageReduction') return `×${numeric(amount)} входящего урона`;
  if (stat === 'bellFirstPulseReduction') return `×${numeric(amount)} скорости первого импульса`;
  if (stat === 'bellDuration') return `${numeric(amount)} с замедления`;
  if (stat === 'bellRadius') return `${numeric(amount)} радиуса`;
  if (stat === 'harpoonSlowReduction') return `×${numeric(amount)} скорости троса`;
  if (stat === 'harpoonFlyingMultiplier') return `×${numeric(amount)} урона летающим`;
  if (stat === 'trapArmorMultiplier') return `×${numeric(amount)} урона броне`;
  if (stat === 'trapHealth') return `${numeric(amount)} прочности корпуса`;
  if (stat === 'trapCharges') return `${numeric(amount)} зарядов`;
  if (stat.endsWith('Reduction')) return `${numeric(amount)} с`;
  const units: Partial<Record<UpgradeStat, string>> = {
    shieldRadius: 'радиуса поля', lighthouseWaveRepair: 'HP за завершённую волну', flashReloadAssist: 'с ускорения готовности', flashRadius: 'радиуса вспышки', flashStunDuration: 'с оглушения', maxObjects: 'мест устройств',
    lighthouseHealth: 'прочности маяка', shieldCapacity: 'прочности на генератор', shieldRegeneration: 'щита/с',
    trapDamage: 'урона взрыва', trapRadius: 'радиуса взрыва', flashDamage: 'урона вспышки', cannonDamage: 'урона за выстрел', harpoonDamage: 'урона за выстрел', mortarDamage: 'урона за выстрел', mortarBlastRadius: 'радиуса взрыва', mortarProjectileSpeed: 'скорости снаряда', mortarArmorMultiplier: 'множителя урона броне',
    cannonRange: 'дальности', harpoonRange: 'дальности', range: 'дальности', damagePerSecond: 'урона/с',
  };
  return stat === 'halfAngle' ? `${numeric(amount * 360 / Math.PI)}°` : `${numeric(amount)} ${units[stat] ?? 'ед.'}`;
};
export function upgradeExplanation(stat: UpgradeStat): string {
  const tips: Partial<Record<UpgradeStat, string>> = {"beamArmorBonus":"Бонус складывается с множителем брони выбранной линзы. Остаток урона здоровью не усиливается.",
"beamExecuteBonus":"Усиливает прямой урон луча при здоровье цели строго ниже 25%. Не убивает мгновенно; броня и лимит целей сохраняются.",
"litDeviceDamageBonus":"Пушки и гарпуны получают бонус по выбранной светом цели. Для мортиры освещение проверяется при взрыве; ловушки, горение и вспышка бонус не получают.",
"lighthouseDamageReduction":"Снижает входящий урон только маяку. Применяется вместе с защитой от тяжёлых ударов и аварийной защитой.",
"lighthouseHeavyReduction":"Дополнительно снижает урон маяку от рывка и щупалец босса. Не усиливает защиту устройств или поля.",
"lighthouseEmergencyReduction":"Один раз за ночь при ударе, опускающем здоровье до 25%, включает защиту на 2 с, включая этот удар. Не лечит и не гарантирует спасение от смертельного урона.",
"lighthouseWaveRepair":"Восстанавливает живому маяку здоровье за каждую впервые завершённую волну, не выше максимума. Не воскрешает и не ремонтирует устройства.",
"shieldDelayReduction":"Сокращает задержку восстановления. Удары по защищаемым целям при истощённом щите по-прежнему откладывают восстановление.",
"shieldRadius":"Устройство защищено только когда весь его корпус находится внутри поля. Дополнительный генератор не ускоряет восстановление.",
"shieldRestoreReduction":"Снижает входящий урон полю на 1 с после настоящего восстановления из нуля. Не даёт мгновенного заряда и не действует при старте ночи.",
  "flashReloadAssist": "Сокращает текущую перезарядку живых пушек, гарпунов и мортир, центры которых находятся в радиусе вспышки. Не ремонтирует и не пополняет заряды.",
  "flashDamagedArmorBonus": "Бонус действует только на оставшуюся броню, повреждённую до вспышки. Урон здоровью и боссу не усиливается.",
  "deviceHealthBonus": "Добавляет долю исходной прочности каждого корпуса. Доля повреждений, разрушенные корпуса и цена ремонта сохраняются.",
  "rechargeCostReduction": "Скидка применяется к общему счёту за недостающие заряды, затем цена округляется вверх. Заряды покупаются отдельно от ремонта.",
  "cannonManualBonus": "Усиляет первый выстрел пушки по назначенной цели за ночь. Смена цели не обновляет использованный бонус; щупальца считаются одной целью."
};
  return tips[stat] ?? "";
}
const value = upgradeValue;

export function nightSelector(view: ApplicationView, blocked = false): string {
  if (view.screen === 'battle') return '';
  const options = (nights: typeof view.nights): string => nights.map((night) => `<button data-action="select-night" data-night="${night.id}" class="night-option ${night.completed ? 'completed' : ''}" aria-pressed="${night.id === view.selectedNightId}" ${blocked || !night.available ? 'disabled' : ''}><strong>${escape(night.name)}</strong><small>${night.completed ? '✓ Пройдена · можно повторить' : night.available ? 'Доступна' : 'Закрыта'} · ${escape(night.reason)}</small>${night.bossLevel !== undefined ? `<small>Босс · уровень ${night.bossLevel} · награда ${night.materialReward} ${materialName} за победу во всей ночи</small>` : ''}<small>${escape(night.description)}</small></button>`).join('');
  const chapters = [...new Set(view.nights.filter(night => !night.optional).map(night => night.chapter))];
  return `<section class="night-selection" aria-label="Выбор ночи">${chapters.map((chapter, index) => `<h2>Глава ${index + 1} · ${escape(chapter)}</h2><div class="night-options">${options(view.nights.filter(night => !night.optional && night.chapter === chapter))}</div>`).join('')}<h3>Отдельное испытание</h3><p>Необязательное событие. Не продвигает главу.</p><div class="night-options">${options(view.nights.filter(night => night.optional))}</div></section>`;
}

export function lateModeName(mode: LateNightMode): string {
  return mode === 'transition' ? 'Переходный' : 'Штурм';
}

export function nightLabel(view: ApplicationView): string {
  const name = view.nights.find(night => night.id === view.selectedNightId)?.name ?? '';
  return name + (view.config.lateMode ? ' · ' + lateModeName(view.config.lateMode) : '');
}

export function lateModeSelector(view: ApplicationView, blocked = false): string {
  if (!['preparation', 'result'].includes(view.screen) || !view.lateNightModes?.length) return '';
  const disabled = blocked || !!view.error || view.screen === 'result';
  return `<section class="late-mode-selection" aria-label="Режим позднего испытания"><h3>Режим позднего испытания</h3><p>Прохождение ночи общее для обоих режимов.</p><p>Награда включает существ и победу; досрочные бонусы отдельно.</p><div class="night-options">${view.lateNightModes.map(mode => `<button class="night-option" data-action="select-late-mode" data-mode="${mode.id}" aria-pressed="${view.config.lateMode === mode.id}" ${disabled ? 'disabled' : ''}><strong>${escape(mode.name)}</strong><small>${escape(mode.description)}</small><small>Полная зачистка: ${mode.totalReward} ◈</small></button>`).join('')}</div></section>`;
}

export function waveIntelligence(view: ApplicationView): string {
  return view.config.waves.map((entry, index) => {
    const known = (Object.keys(view.config.enemies) as (keyof typeof view.config.enemies)[]).filter((kind) => view.profile.encountered.includes(kind) && entry.enemies.includes(kind));
    const entries = known.map((kind) => `<span class="known-enemy">${escape(view.config.enemies[kind].name)}<small>${escape(view.config.enemies[kind].description)}</small></span>`);
    if (entry.enemies.some((kind) => !view.profile.encountered.includes(kind))) entries.push('<span class="known-enemy">Неизвестное существо</span>');
    return `<li><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${entry.enemies.length} существ</strong>${entries.join('')}</span></li>`;
  }).join('');
}
const statuses = { purchased: 'Куплено', available: 'Доступно', requires: 'Закрыто: см. требования', insufficient: 'Не хватает осколков' };
const heading = (eyebrow: string, title: string): string => `<div class="eyebrow">${eyebrow}</div><h1 tabindex="-1">${title}</h1>`;
const button = (action: string, text: string, blocked = false, primary = false): string => `<button data-action="${action}" ${blocked ? 'disabled' : ''} class="${primary ? 'primary' : 'quiet'}">${text}</button>`;
const nav = (blocked = false): string => `<nav class="page-nav" aria-label="Переходы">${button('menu', '← Главное меню', blocked)}${button('development', 'Развитие маяка', blocked)}${button('settings', 'Настройки', blocked)}</nav>`;

function mainMenu(view: ApplicationView): string {
  return referenceMenu(view);
}

function settings(view: ApplicationView): string {
  return referenceSettings(view);
}

function development(view: ApplicationView, selectedId: UpgradeId | undefined, state?: SkillTreeState): string {
  const treeState = state ?? createSkillTreeState();
  if (!state && selectedId) {
    treeState.selectedId = selectedId;
    treeState.inspectorOpen = true;
    treeState.category = skillCategories.find(c => buildSkillGraph(view, c.id).nodes.some(n => n.id === selectedId))?.id ?? 'lighthouse';
  }
  return skillTree(view, treeState, node => upgradeDetails(node, view));
}

function upgradeDetails(node: UpgradeNodeView, view: ApplicationView): string {
  const { definition, status } = node;
  const { stat, amount } = definition.effect;
  const unlock = ['cannon', 'harpoon', 'mortar', 'bell', 'barrier', 'generator', 'light-trap', 'repair-lamp', 'flash'].includes(stat);
  const requirements = definition.requires.map(id => {
    const parent = view.upgrades.find(n => n.definition.id === id);
    return `<li data-met="${parent?.status === 'purchased'}">${parent?.status === 'purchased' ? '✓' : '◇'} <button class="skill-requirement-link" data-tree-action="reveal" data-skill-target="${id}">${escape(parent?.definition.name ?? id)}</button></li>`;
  });
  if (definition.requiresNight) {
    const night = view.nights.find(n => n.id === definition.requiresNight);
    requirements.push(`<li data-met="${!!night?.completed}">${night?.completed ? '✓' : '◇'} Победа: ${escape(night?.name ?? definition.requiresNight)}</li>`);
  }
  const effect = unlock ? 'закрыто → открыто' : ['repairCostReduction', 'rechargeCostReduction'].includes(stat)
    ? '−' + Math.round(amount * 100) + ' п.п. коэффициента стоимости'
    : ['bellDamageReduction', 'bellFirstPulseReduction'].includes(stat) ? `−${Math.round(amount * 100)}% ${stat === 'bellDamageReduction' ? 'входящего урона' : 'скорости первого импульса'}`
    : `${stat.endsWith('Reduction') && !['lighthouseDamageReduction', 'lighthouseHeavyReduction', 'lighthouseEmergencyReduction', 'shieldRestoreReduction'].includes(stat) ? '−' : ['deviceHealthBonus', 'flashDamagedArmorBonus'].includes(stat) ? '' : '+'}${value(stat, amount)}`;
  return `<h2>${escape(definition.name)}</h2><span class="skill-state" data-status="${status}">${statuses[status]}</span><p class="skill-effect">${effect}</p><div class="skill-comparison"><span class="skill-before">${value(stat, node.currentValue)}</span>${status === 'purchased' ? '' : `<span aria-hidden="true">→</span><strong class="skill-after">${value(stat, node.nextValue)}</strong>`}</div><div class="skill-requirements"><h3>Требования</h3><ul>${requirements.join('') || '<li data-met="true">Без требований</li>'}</ul></div><p class="skill-reason">${escape(node.reason)}</p><p class="skill-reason">${escape(upgradeExplanation(stat))}</p>${view.profile.legacyEquipment && unlock ? '<p class="skill-reason">Повторно покупать прежнее оснащение не требуется</p>' : ''}<button class="skill-purchase-button" data-action="upgrade" data-upgrade="${definition.id}" ${status !== 'available' || view.error ? 'disabled' : ''}>${status === 'purchased' ? '✓ Куплено' : `Изучить · ${definition.cost} ◈`}</button><small class="skill-permanent-note">Постоянное улучшение · сохранится между ночами</small>`;
}

export function screenContent(view: ApplicationView, selectedId: UpgradeId | undefined, confirmAbandon: boolean, confirmNewGame = false, treeState?: SkillTreeState, preparationState?: PreparationUiState): string {
  if (view.screen === 'menu') return mainMenu(view);
  if (view.screen === 'game-menu') return referenceGameMenu(view, confirmNewGame);
  if (view.screen === 'trials') return `<section class="panel trials-panel">${button('back', '← Назад', !!view.error)}${heading('ОТДЕЛЬНЫЕ НОЧИ', 'Испытания')}<p>Необязательные ночи. Условия открытия сохраняются.</p><div class="night-options">${view.nights.filter(night => night.optional).map(night => `<button class="night-option" data-action="select-night" data-night="${night.id}" ${!night.available || view.error ? 'disabled' : ''}><strong>${escape(night.name)}</strong><small>${escape(night.description)}</small><small>${night.available ? night.completed ? 'Пройдена · можно повторить' : 'Доступна' : escape(night.reason)}</small></button>`).join('')}</div></section>`;
  if (view.screen === 'development') return development(view, selectedId, treeState);
  if (view.screen === 'settings') return settings(view);
  if (view.screen === 'preparation') return preparationScreen(view, preparationState ?? createPreparationUiState(), {
    nights: nightSelector(view, !!view.error), lenses: lensSelection(view),
    lateModes: lateModeSelector(view), waves: waveIntelligence(view),
  });
  if (view.screen === 'result' && view.result) {
    const result = view.result;
    const blocked = !result.saved || !!view.error;
    return `<section class="panel result-panel">${heading(escape(view.nights.find((night) => night.id === result.nightId)?.name ?? result.nightId) + (result.lateMode ? ' · ' + lateModeName(result.lateMode) : '') + ' / ИТОГ', result.outcome === 'victory' ? 'До рассвета.' : 'Свет погас.')}<p>${result.outcome === 'victory' ? 'Маяк выстоял. Берег снова принадлежит тебе.' : 'Маяк разрушен. Попробуй раньше переключаться между угрозами.'}</p><dl class="results"><div><dt>Уничтожено</dt><dd>${result.kills}</dd></div><div><dt>За существ</dt><dd>+${result.resources}</dd></div><div><dt>За досрочные волны</dt><dd>+${result.bonus}</dd></div><div><dt>За спасение корабля</dt><dd>+${result.rescue} ◈</dd></div><div><dt>За победу</dt><dd>+${result.victoryReward} ◈</dd></div><div class="result-total"><dt>Итого</dt><dd>+${result.totalResources} ◈</dd></div></dl><p class="boss-result">${result.bossDefeated && result.outcome === 'defeat' ? 'Босс уничтожен, но ночь проиграна: материал не выдан, следующая глава не открыта, уровень босса не повышен.' : result.bossMaterials > 0 ? `Жемчуг глубин: +${result.bossMaterials} · ${result.saved ? 'материал сохранён за победу во всей ночи' : 'ожидает сохранения результата'}` : ''}</p><p class="save-state">${result.saved ? '✓ Результат сохранён на этом устройстве' : 'Результат ещё не сохранён. Повторите сохранение выше.'}</p>${button('start', 'К новой подготовке →', blocked, true)}${nightSelector(view, blocked)}${lateModeSelector(view, blocked)}${nav(blocked)}</section>`;
  }
  if (view.screen === 'battle' && view.paused) return `<section class="panel pause-panel">${heading('ДЕЖУРСТВО ПРИОСТАНОВЛЕНО', 'Тихая минута.')}<p>Ночь ждёт. Направление света сохранено.</p>${confirmAbandon ? `<section class="abandon-confirm" role="alertdialog" aria-labelledby="abandon-title" aria-describedby="abandon-description"><h2 id="abandon-title">Прервать эту ночь?</h2><p id="abandon-description">Все награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию перед началом ночи. Покупки и ремонт подготовки сохраняются.</p>${button('cancel-abandon', 'Остаться в паузе', false, true)}${button('abandon-preparation', 'Прервать → подготовка', !!view.error)}${button('abandon-menu', 'Прервать → главное меню', !!view.error)}</section>` : `<div class="menu-actions">${button('resume', 'Продолжить ночь →', !!view.error, true)}${button('settings', 'Настройки', !!view.error)}${button('confirm-abandon', 'Прервать ночь…', !!view.error)}</div>`}</section>`;
  return '';
}
