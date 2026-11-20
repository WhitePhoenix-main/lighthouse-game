import { watchIcon } from './watchArtwork';
import type { ApplicationView, BattleState, NightConfig, LensDefinition, LensUpgradeDefinition } from '../../contracts';

const escape = (text: string): string => text.replace(/[&<>"']/g, letter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter] ?? letter);
export const materialName = 'Жемчуг глубин';
export function lensProperties(lens: LensDefinition): string {
  return `Урон ×${lens.damageMultiplier} · ширина ×${lens.widthMultiplier} · дальность ×${lens.rangeMultiplier} · до ${lens.maxTargets} целей · скорость цели ×${lens.slowMultiplier} · урон броне ×${lens.armorMultiplier}${lens.focus ? ` · удержание ${lens.focus.seconds} с: +${Math.round(lens.focus.damageBonus * 100)}% урона` : ''}${lens.resonance ? ` · резонанс ≥2 зон ${lens.resonance.seconds} с: +${Math.round(lens.resonance.damageBonus * 100)}% урона` : ''}${lens.burn ? ` · горение ${lens.burn.damagePerSecond} урона/с · ещё ${lens.burn.seconds} с после света` : ''}`;
}
export function lensUpgradeEffect(node: LensUpgradeDefinition): string {
  const labels = { halfAngle: 'полная ширина', damagePerSecond: 'урон/с', range: 'дальность', maxTargets: 'целей', slowMultiplier: 'множитель скорости', armorMultiplier: 'множитель урона броне', pairedDamageBonus: 'урон при освещении ≥2 врагов', focusDamageBonus: 'урон после удержания', burnDamagePerSecond: 'урон горения/с', burnDuration: 'длительность горения', resonanceDamageBonus: 'урон резонанса' };
  const percent = node.effect.stat === 'pairedDamageBonus' || node.effect.stat === 'focusDamageBonus' || node.effect.stat === 'resonanceDamageBonus';
  const amount = node.effect.stat === 'halfAngle' ? node.effect.amount * 360 / Math.PI : percent ? node.effect.amount * 100 : node.effect.amount;
  return `${labels[node.effect.stat]} ${amount > 0 ? '+' : ''}${Number(amount.toFixed(2))}${node.effect.stat === 'halfAngle' ? '°' : percent ? '%' : node.effect.stat === 'burnDuration' ? ' с' : ''}`;
}

/** Selection is equipment only: all purchases live on the development screen. */
export function lensSelection(view: ApplicationView): string {
  if (view.screen !== 'preparation') return '';
  const choices = view.lenses.map(({definition, unlocked}) => `<button class="watch-button" data-action="select-lens" data-lens="${definition.id}" aria-pressed="${view.selectedLensId === definition.id}" ${!unlocked || view.error ? 'disabled' : ''}>${unlocked ? '' : watchIcon('lock')}<strong>${escape(definition.name)}</strong></button>`).join('');
  const specifications = view.lenses.map(({definition, unlocked}) => `<p><strong>${escape(definition.name)}</strong> · <span>${unlocked ? 'Доступна' : `Закрыта · ${definition.materialCost} ${materialName}`}</span><br>${escape(definition.description)}</p>`).join('');
  return `<section class="lens-selection" aria-label="Выбор одной линзы"><div class="lens-options">${choices}</div>
    <details class="lens-notes"><summary>Одна линза на ночь</summary>${specifications}<p>${view.campaign ? 'Выбор бесплатный. Линза сохраняется сразу при выборе. Во время боя линзу менять нельзя. Закрытые линзы открываются в развитии.' : 'Выбор бесплатный. До старта это черновик; выбранная линза сохраняется при начале ночи. Во время боя линзу менять нельзя. Закрытые линзы открываются в развитии.'}</p><p>Текущие эффекты: скорость выбранной цели ×${view.config.lens?.slowMultiplier ?? 1}; урон броне ×${view.config.lens?.armorMultiplier ?? 1}. Противоброневая линза не усиливает урон здоровью.</p><p>${resonanceDescription(view.config)} ${focusDescription(view.config)} ${burnDescription(view.config)} Характеристики выбранного луча с улучшениями показаны ниже. Улучшения линз не меняют перезарядку вспышки.</p></details></section>`;
}

export function lensDevelopment(view: ApplicationView): string {
  return `<section class="lens-development" aria-label="Линзы и их улучшения"><h2>Линзы · собственное развитие</h2><p>Одна линза выбирается в подготовке. Постоянные улучшения маяка действуют с любой линзой. Параметры и цены предварительные.</p><div class="lens-cards">${view.lenses.map(lens => `<article class="lens-card"><h3>${escape(lens.definition.name)}</h3><p>${escape(lens.definition.description)}</p><p>Базовые параметры: ${lensProperties(lens.definition)}</p><p>${escape(lens.reason)}</p>${lens.unlocked ? '<strong>✓ Открыта</strong>' : `<button data-action="purchase-lens" data-lens="${lens.definition.id}" ${!lens.canPurchase || view.error ? 'disabled' : ''}>Открыть · ${lens.definition.materialCost} ${materialName}</button>`}<ol class="lens-upgrades">${lens.upgrades.map(node => `<li><h4>${escape(node.definition.name)}</h4><p>${escape(node.definition.description)} ${lensUpgradeEffect(node.definition)}</p><p>${escape(node.reason)}</p><p>Требования: ${node.definition.requires.length ? node.definition.requires.map(id => escape(lens.upgrades.find(parent => parent.definition.id === id)?.definition.name ?? id)).join(", ") : "открытая линза"}</p><button data-action="purchase-lens-upgrade" data-lens-upgrade="${node.definition.id}" ${node.status !== 'available' || view.error ? 'disabled' : ''}>${node.status === 'purchased' ? '✓ Куплено' : `Купить · ${node.definition.cost} ◈ + ${node.definition.materialCost} ${materialName}`}</button></li>`).join('')}</ol></article>`).join('')}</div><p>Перезарядка вспышки не меняется. Замедление луча действует только на выбранные цели; с замедлением босса применяется сильнейшее.</p></section>`;
}

/** All timing comes from the simulation snapshot, never pointer position or render time. */
export function focusStatus(battle: Readonly<BattleState>, config: NightConfig): string {
  const focus = config.lens?.focus;
  if (!focus) return '';
  if (battle.focus.targetId === null) return 'Фокус сброшен · освети одну враждебную зону';
  const seconds = Math.min(focus.seconds, battle.focus.ticks * config.stepSeconds);
  const bonus = Math.round(focus.damageBonus * 100);
  return seconds + 1e-9 >= focus.seconds
    ? `Фокус готов · цель #${battle.focus.targetId} · +${bonus}% урона`
    : `Фокус · цель #${battle.focus.targetId} · ${seconds.toFixed(1)} / ${focus.seconds} с`;
}
export function focusDescription(config: NightConfig): string {
  const focus = config.lens?.focus;
  return focus ? `Удерживай одну враждебную зону в свете ${focus.seconds} с: затем +${Math.round(focus.damageBonus * 100)}% урона. Смена цели, перекрытие или потеря света сбрасывают фокус. Каждое щупальце считается отдельно. Корабль не накапливает фокус.` : '';
}

export function burnDescription(config: NightConfig): string {
  const burn = config.lens?.burn;
  return burn ? `Горение: ${burn.damagePerSecond} урона/с, ещё ${burn.seconds} с после света. Обновляется без сложения. Не занимает цели луча; у босса одно общее горение.` : '';
}
export function burnStatus(battle: Readonly<BattleState>): string {
  const burning = battle.enemies.filter(enemy => enemy.health > 0 && (enemy.burn?.remainingTicks ?? 0) > 0).length + (battle.boss && battle.boss.health > 0 && (battle.boss.burn?.remainingTicks ?? 0) > 0 ? 1 : 0);
  return `Горят: ${burning}`;
}

export function resonanceStatus(battle: Readonly<BattleState>, config: NightConfig): string {
  const resonance = config.lens?.resonance;
  if (!resonance) return '';
  const ticks = battle.resonance.ticks, seconds = Math.min(resonance.seconds, ticks * config.stepSeconds);
  if (ticks === 0) return 'Резонанс сброшен · освети ≥2 враждебные зоны';
  return seconds + 1e-9 >= resonance.seconds
    ? `Резонанс готов · +${Math.round(resonance.damageBonus * 100)}% урона`
    : `Резонанс · ${seconds.toFixed(1)} / ${resonance.seconds} с`;
}
export function resonanceDescription(config: NightConfig): string {
  const resonance = config.lens?.resonance;
  return resonance ? `Держи любые ≥2 враждебные зоны в свете ${resonance.seconds} с: затем +${Math.round(resonance.damageBonus * 100)}% урона. Щупальца считаются отдельно; корабль не считается. При менее двух зонах резонанс сбрасывается. Бонус складывается со связанным светом.` : '';
}
