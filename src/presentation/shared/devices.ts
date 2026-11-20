import type { ApplicationView, DeviceState, NightConfig } from '../../contracts';
import { effectiveWeaponDefinition } from '../../content/campaignVariants';
import { CAMPAIGN_REWARD_CATALOG } from '../../content/campaignRewards';
import { resolveLanguage } from './localization';
import { WATCH_DEVICE_SPRITES } from './world/worldGeometry';

export const deviceSymbols = { 'repair-lamp': '✚', bell: '♧', cannon: '⊙', mortar: '◉', harpoon: '↟', barrier: '▰', generator: '◇', 'light-trap': '✧' };
export function campaignDeviceTitle(config: NightConfig, device: Pick<DeviceState, 'kind' | 'variantId'>): string {
  return device.variantId ? CAMPAIGN_REWARD_CATALOG[device.variantId].title.ru : config.devices.definitions[device.kind].name;
}
export function deviceCondition(device: DeviceState): string {
  return device.health <= 0 ? 'Разрушено' : device.consumed ? 'Израсходована' : `${Math.ceil(device.health)} прочности${device.kind === 'repair-lamp' ? ` · заряды ${device.repairCharges ?? 0}` : ''}`;
}

export function trapChargeStatus(view: ApplicationView, device: DeviceState): string {
  const charges = device.trapCharges ?? (device.consumed ? 0 : 1);
  const delay = Math.max(0, (device.trapReadyTick ?? 0) - (view.battle?.tick ?? 0)) * view.config.stepSeconds;
  return `Заряды ${charges}/${view.config.devices.trap.charges} · ${device.health <= 0 ? 'Разрушено' : charges <= 0 ? 'Израсходована' : delay > 0 ? `Следующий взрыв через ${delay.toFixed(1)} с` : 'Готова к срабатыванию'}`;
}

export function repairLampDescription(view: ApplicationView): string {
  const rules = view.config.devices.repairLamp, body = view.config.devices.definitions['repair-lamp'];
  return `Автоматический ремонт: +${rules.healAmount} прочности · радиус ${body.range} · интервал ${body.attackInterval} с · ${rules.charges} зарядов на ночь · входящий урон ×${rules.incomingDamageMultiplier}. Заряды бесплатно обновляются при начале ночи. Сначала ремонтируется наиболее повреждённое устройство по доле прочности. Только повреждения текущей ночи, не выше прочности на старте. Не ремонтирует себя, другие фонари, разрушенные или израсходованные устройства, маяк и поле.${rules.emergencyEnabled ? ` Аварийный ремонт: один раз за ночь при прочности цели ≤${rules.emergencyThreshold * 100}% от максимума, объём ×${rules.emergencyMultiplier}, один заряд, без ожидания интервала.` : ''}`;
}

/** Effective values come from application configuration. */
export function defenseDeviceDescription(view: ApplicationView, kind: DeviceState['kind'], device?: DeviceState): string {
  const { devices } = view.config, definition = effectiveWeaponDefinition(view.config, device ?? { kind });
  if (kind === 'cannon') {
    const rule = devices.cannon;
    return `Урон ${definition.damage} · интервал ${Number(definition.attackInterval.toFixed(2))} с · дальность ${definition.range} · урон броне ×${rule.armorMultiplier}.${rule.manualDamageBonus > 0 ? ` Прицельный залп: +${Math.round(rule.manualDamageBonus * 100)}% к первому выстрелу по вручную закреплённому врагу, один раз на врага для каждой пушки за ночь. Смена цели не обновляет бонус; все щупальца — один босс.${device ? ` Бонус использован по целям: ${device.manualBonusTargets?.length ?? 0}.` : ''}` : ''}`;
  }
  if (kind === 'harpoon') {
    const rule = devices.harpoon;
    return `Урон ${definition.damage} · интервал ${Number(definition.attackInterval.toFixed(2))} с · дальность ${definition.range} · урон летающим ×${rule.flyingDamageMultiplier}.${rule.slowMultiplier < 1 ? ` Трос: скорость ×${rule.slowMultiplier} на ${rule.slowSeconds} с после попадания. Только движение; атаки продолжаются. Со светом, колоколом и обломками применяется сильнейшее замедление.` : ''}`;
  }
  if (kind === 'light-trap') {
    const rule = devices.trap;
    return `Автоматическая ловушка: ${rule.damage} урона · радиус взрыва ${rule.blastRadius} · радиус срабатывания ${rule.triggerRadius} · урон броне ×${rule.armorMultiplier} · зарядов ${rule.charges} · задержка между взрывами ${rule.rearmSeconds} с. Без оглушения. Расходует один заряд за взрыв. Ремонт корпуса и платное пополнение зарядов независимы.${device ? ` ${trapChargeStatus(view, device)}.` : ''}`;
  }
  if (kind === 'barrier') {
    const rule = devices.barrier;
    return `Входящий урон ×${rule.incomingDamageMultiplier} · урон рывка ×${Math.min(rule.incomingDamageMultiplier, rule.chargeDamageMultiplier)}. Прочность между волнами не восстанавливается.${rule.breakSlowMultiplier < 1 ? ` При разрушении: радиус ${rule.breakSlowRadius} · скорость врагов ×${rule.breakSlowMultiplier} на ${rule.breakSlowSeconds} с. Со светом и колоколом применяется сильнейшее замедление.` : ''}${rule.repairCostMultiplier < 1 ? ` Стоимость ремонта ×${rule.repairCostMultiplier}. Точная цена ремонта показана в подготовке.` : ''}`;
  }
  if (kind === 'generator') {
    const rule = devices.generator;
    const remaining = device && view.battle ? Math.max(0, (device.residualUntilTick ?? 0) - view.battle.tick) * view.config.stepSeconds : 0;
    return `Входящий урон корпуса ×${rule.incomingDamageMultiplier}. Каждый генератор добавляет ${view.config.shield.capacityPerGenerator} к максимуму общего поля; скорость восстановления общая.${rule.lastStandEnabled ? ` Аварийный предохранитель: один раз за ночь переживает смертельный удар с не более 1 HP, без лечения.${device ? device.lastStandUsed ? ' Предохранитель использован.' : ' Предохранитель готов.' : ''}` : ''}${rule.residualSeconds > 0 ? ` Остаточное поле: после разрушения сохраняет вклад в максимум на ${rule.residualSeconds} с. Не добавляет заряд. Без живых генераторов поле не восстанавливается.${remaining > 0 ? ` Остаточное поле активно: ${remaining.toFixed(1)} с.` : ''}` : ''}`;
  }
  return '';
}

/** Only projects the application snapshot; commands are dispatched by mountGame. */
export function battleDevicePanel(view: ApplicationView, selectedId: number | null, choosingTarget: boolean, targetNotice: string): string {
  const battle = view.battle;
  if (!battle) return '';
  const device = battle.devices.find((entry) => entry.id === selectedId);
  const inactive = view.paused ? 'disabled' : '';
  const en = resolveLanguage(view.settings.language, undefined, globalThis.navigator?.languages) === 'en';
  const icon = (entry: DeviceState): string => `<img class="battle-hud-icon" src="${import.meta.env.BASE_URL}images/avalon-watch/world/${WATCH_DEVICE_SPRITES[entry.kind].image}.png" alt="" draggable="false">`;
  const list = `<div class="battle-device-list watch-panel" aria-label="Устройства на берегу">${battle.devices.map((entry) => `<button class="watch-button" data-action="inspect-device" data-device-id="${entry.id}" aria-pressed="${entry.id === selectedId}" ${inactive}>${icon(entry)} <span>${campaignDeviceTitle(view.config, entry)} #${entry.id}</span><small>${deviceCondition(entry)}${entry.kind === 'light-trap' ? ` · ${trapChargeStatus(view, entry)}` : ''}</small></button>`).join('') || '<small>Устройства не установлены</small>'}</div>`;
  if (!device) return list;
  const definition = { ...effectiveWeaponDefinition(view.config, device), name: campaignDeviceTitle(view.config, device) };
  const health = device.health <= 0 || device.consumed ? deviceCondition(device) : `${Math.ceil(device.health)}/${definition.health} HP`;
  const header = `<header><div>${icon(device)} <strong>${definition.name} #${device.id}</strong><small>${en ? 'Battle live' : 'Бой идёт'} · ${health}</small></div><button class="watch-button" data-action="close-device" aria-label="Закрыть">×</button></header>`;
  if (device.kind === 'repair-lamp') return `${list}<section class="device-command-panel watch-panel" aria-label="Меню устройства">${header}<p>${repairLampDescription(view)}</p><p>Прочность на старте: ${device.startHealth ?? device.health}. ${view.config.devices.repairLamp.emergencyEnabled ? (device.emergencyRepairUsed ? 'Аварийный ремонт использован.' : 'Аварийный ремонт готов.') : ''} Бой продолжается. Направление наведения сохраняется до закрытия меню.</p></section>`;
  const pinned = battle.enemies.find((enemy) => enemy.id === device.targetId) ?? (battle.boss && battle.boss.health > 0 ? battle.boss.tentacles.find(tip => tip.id === device.targetId) : undefined);
  const awaitingRange = pinned && Math.hypot(pinned.x - device.x, pinned.y - device.y) > definition.range;
  const tipIndex = battle.boss?.tentacles.findIndex(tip => tip.id === device.targetId) ?? -1;
  const targetName = tipIndex >= 0 ? 'Закреплено щупальце ' + (tipIndex + 1) : 'Закреплена цель #' + device.targetId;
  const targetStatus = device.targetId !== null ? targetName + (awaitingRange ? '. Вне дальности — устройство ждёт её приближения.' : '. Устройство атакует её в пределах дальности.') : targetNotice || 'Автоматический выбор цели.';
  const activeCannon = (device.kind === 'cannon' || device.kind === 'harpoon' || device.kind === 'mortar') && device.health > 0 && !device.consumed;
  const description = `<details class="device-description"><summary class="watch-button">Характеристики</summary><p>${device.kind === 'bell' ? 'Колокол автоматически замедляет наземных и летающих врагов и щупальца. Не наносит урон и не останавливает атаки.' : device.kind === 'mortar' ? 'Мортира бьёт по наземным целям и щупальцам. Снаряд летит в точку выстрела: быстрый враг может выйти из взрыва. Союзники не получают урон.' : device.kind === 'harpoon' ? 'Гарпун атакует наземные и летающие цели, а также щупальца.' : device.kind === 'cannon' ? 'Пушки не атакуют летучих мышей: их останавливает луч.' : definition.description} Бой продолжается. Направление наведения сохраняется до закрытия меню.</p>
  ${defenseDeviceDescription(view, device.kind, device) ? `<p class="device-abilities">${defenseDeviceDescription(view, device.kind, device)}</p>` : ''}
  </details>`;
  return `${list}<section class="device-command-panel watch-panel" aria-label="Меню устройства">${header}
  ${activeCannon ? `<p>Автоматический приоритет</p><div class="cannon-priorities" aria-label="Автоматический приоритет">${(['nearest', 'strongest', 'weakest'] as const).map((priority) => `<button class="watch-button" data-action="cannon-priority" data-priority="${priority}" aria-pressed="${device.priority === priority}" ${inactive}>${(en ? { nearest: 'Nearest', strongest: 'Strongest', weakest: 'Weakest' } : { nearest: 'Ближе', strongest: 'Сильнее', weakest: 'Слабее' })[priority]}</button>`).join('')}</div><p class="target-notice" role="status">${targetStatus}</p><div class="cannon-priorities"><button class="watch-button" data-action="choose-target" aria-pressed="${choosingTarget}" ${inactive}>Указать врага</button><button class="watch-button" data-action="auto-target" ${inactive}>Сбросить в авто</button></div>${description}${choosingTarget ? `<p>Нажми на врага на поле или выбери из списка. Можно закрепить живую цель вне дальности (${definition.range}): устройство ждёт её приближения. После смерти цели или сброса возвращается автоматический выбор.</p><div class="enemy-target-list">${battle.enemies.filter((enemy) => enemy.health > 0 && (device.kind === 'harpoon' || view.config.enemies[enemy.kind].movement !== 'flying')).map((enemy) => `<button class="watch-button" data-action="target-enemy" data-enemy-id="${enemy.id}" ${inactive}>${view.config.enemies[enemy.kind].name} #${enemy.id} · ${Math.ceil(enemy.health)} HP</button>`).join('') + (battle.boss && battle.boss.health > 0 ? battle.boss.tentacles.map((tip, index) => `<button class="watch-button" data-action="target-enemy" data-enemy-id="${tip.id}" ${inactive}>Щупальце ${index + 1} · общее здоровье босса ${Math.ceil(battle.boss!.health)}</button>`).join('') : '') || '<small>Сейчас врагов нет</small>'}</div>` : ''}` : `${description}<p>${defenseDeviceDescription(view, device.kind, device) ? '' : definition.description}</p>${device.kind === 'bell' ? `<p>Радиус ${definition.range} · импульс каждые ${Number(definition.attackInterval.toFixed(2))} с при наличии врага · замедление ${view.config.devices.bell.duration} с · скорость ×${view.config.devices.bell.slowMultiplier} · первый импульс ×${view.config.devices.bell.firstPulseSlowMultiplier} · входящий урон ×${view.config.devices.bell.incomingDamageMultiplier}. Применяется сильнейшее замедление.</p>` : device.kind === 'light-trap' ? '' : device.kind === 'generator' || device.kind === 'barrier' ? '' : '<p>Устройство разрушено и больше не принимает команды.</p>'}`}</section>`;
}
