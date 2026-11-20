import type { ApplicationView } from '../../contracts';
import { nightLabel } from '../screens';
import { resolveLanguage, translate } from '../shared/localization';

const icon = (name: string): string => `<img class="battle-hud-icon" src="${import.meta.env.BASE_URL}images/avalon-watch/ui/icon-${name}.png" alt="" draggable="false">`;

/** Command selectors are shared with mountGame. The HUD reads live values from the application. */
export function battleHudMarkup(): string {
  return `<div class="battle-header"><section class="statusbar" aria-label="Состояние ночи">
    <div class="integrity watch-panel">
      <div class="battle-health-heading">${icon('light')}<span data-battle-health-label>Маяк</span><span data-health></span></div>
      <div class="health-track"><i data-health-bar></i></div>
    </div>
    <div class="night-state watch-panel"><strong class="battle-night-label"></strong><span data-phase class="watch-inset"></span><span data-timer class="battle-clock watch-panel"></span></div>
    <button class="quiet watch-button" data-action="pause" aria-label="Пауза">Ⅱ <span>Пауза</span></button>
  </section>
  <div class="battle-secondary">
  <div class="shield-status battle-objectives watch-inset">
    <div data-battle-shield>${icon('shield')}<span data-shield-status></span><div class="health-track"><i data-shield-health></i></div></div>
    <div class="ship-status" data-ship-status role="status"></div>
  </div>
  <section class="boss-status watch-inset" data-boss-status hidden aria-label="Общее здоровье босса"><strong data-boss-text></strong><div class="health-track"><i data-boss-health></i></div></section>
  </div></div>
  <footer class="battle-controls watch-panel">
    <div class="light-status">${icon('light')}<div><span data-battle-lens></span><small data-targets></small></div></div>
    <button class="flash-button watch-button watch-primary" data-action="flash">${icon('charge')}<span><span data-battle-flash-label>Вспышка</span><small data-flash-status></small></span></button>
    <button class="call-wave watch-button" data-action="wave" disabled>${icon('wave')}<span><span data-wave-button>Вызвать волну</span><small data-wave-detail></small></span></button>
    <details class="battle-device-access"><summary class="watch-button" aria-label="Устройства на берегу">${icon('cannon')}<span data-battle-devices-label>Устройства</span></summary></details>
  </footer>
  <section class="battle-devices" data-battle-devices data-device-panel></section>
  <details class="battle-brief"><summary class="watch-button" aria-label="Сведения о бое">I</summary>
    <div class="battle-brief-body watch-panel"><p data-battle-defense-detail></p><p data-battle-lens-detail></p><p data-hint></p><p data-earnings></p><p data-victory-reward></p><p data-battle-wave-note></p>
      <div class="legend"><span><i class="legend-hp"></i><span data-battle-legend-health>здоровье</span></span><span><i class="legend-armor"></i><span data-battle-legend-armor>броня</span></span><span><i class="legend-lit"></i><span data-battle-legend-light>получает урон</span></span><span><i class="legend-stun"></i><span data-battle-legend-stun>оглушение</span></span><span class="keyboard-hint" data-battle-legend-keyboard>Esc — меню / пауза</span></div>
    </div>
  </details>`;
}

const clock = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Called after mountGame writes and localizes the controls. Command state stays with mountGame. */
export function updateBattleHud(root: HTMLElement, view: ApplicationView): void {
  if (view.screen !== 'battle') return;
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  const en = language === 'en';
  const set = (selector: string, value: string): void => {
    const target = root.querySelector(selector);
    if (target && target.textContent !== value) target.textContent = value;
  };
  set('[data-battle-health-label]', en ? 'Beacon' : 'Маяк');
  set('.battle-night-label', translate(nightLabel(view), language));
  const lens = view.lenses.find(choice => choice.definition.id === view.selectedLensId);
  set('[data-battle-lens]', !lens || lens.definition.id === 'basic' ? (en ? 'Basic Lens' : 'Базовая линза') : translate(lens.definition.name, language));
  const selected = view.campaign?.abilities.find(choice => choice.id === view.campaign?.selectedAbilityId);
  set('[data-battle-flash-label]', selected ? (en ? selected.en : selected.ru) : view.campaign ? (en ? 'Ability' : 'Способность') : en ? 'Flash' : 'Вспышка');
  set('[data-battle-devices-label]', en ? 'Devices' : 'Устройства');
  const { battle, config } = view;
  set('[data-health]', `${Math.ceil(battle?.lighthouseHealth ?? config.lighthouseHealth)}/${config.lighthouseHealth}`);
  set('[data-battle-lens-detail]', root.querySelector('[data-targets]')?.textContent ?? '');
  const lit = (battle?.enemies.filter(enemy => enemy.health > 0 && battle.litEnemyIds.includes(enemy.id)).length ?? 0) + (battle?.litTentacleIds.length ?? 0) + (battle?.ship?.lit ? 1 : 0);
  set('[data-targets]', `${en ? 'In light' : 'В свете'} ${lit}/${config.beam.maxTargets}`);
  const shield = battle?.shield;
  const ship = battle?.ship;
  const objectivePanel = root.querySelector<HTMLElement>('.battle-objectives');
  const shieldGroup = root.querySelector<HTMLElement>('[data-battle-shield]');
  if (shieldGroup) shieldGroup.hidden = !shield?.maximum;
  if (objectivePanel) objectivePanel.hidden = !shield?.maximum && !ship;
  set('[data-battle-defense-detail]', shield?.maximum ? root.querySelector('[data-shield-status]')?.textContent ?? '' : '');
  if (shield?.maximum) {
    const living = battle?.devices.some(device => device.kind === 'generator' && device.health > 0 && !device.consumed);
    const recovery = !living ? en ? 'No regen' : 'Нет восст.' : shield.recoveryRemaining > 0 ? `${en ? 'Recovery' : 'Восст.'} ${Math.ceil(shield.recoveryRemaining)}${en ? 's' : 'с'}` : shield.current < shield.maximum ? `+${config.shield.regenerationPerSecond}/${en ? 's' : 'с'}` : en ? 'Full' : 'Полон';
    set('[data-shield-status]', `${en ? 'Shield' : 'Щит'} ${Math.ceil(shield.current)}/${shield.maximum} · ${recovery}`);
    const shieldFill = root.querySelector<HTMLElement>('[data-shield-health]');
    if (shieldFill) shieldFill.style.width = `${shield.current / shield.maximum * 100}%`;
  }
  if (ship) set('[data-ship-status]', ship.status === 'rescued' ? en ? 'Ship Rescued' : 'Корабль спасён' : ship.status === 'lost' ? en ? 'Ship Lost' : 'Корабль упущен' : `${en ? 'Ship' : 'Корабль'} ${ship.progress.toFixed(1)}/${config.ship?.rescueSeconds ?? 0}${en ? 's' : 'с'} · ${en ? 'Left' : 'Ост.'} ${Math.ceil(ship.remaining)}${en ? 's' : 'с'}`);
  const started = battle?.waves.filter(wave => wave.started).length ?? 0;
  const completed = battle?.waves.filter(wave => wave.completed).length ?? 0;
  set('[data-phase]', `${en ? 'Waves' : 'Волны'} ${started}/${config.waves.length} · ${en ? 'Cleared' : 'Отбито'} ${completed}`);
  set('[data-timer]', clock(battle?.elapsed ?? 0));
  if (config.ability && battle?.ability) {
    const button = root.querySelector<HTMLButtonElement>('[data-action="flash"]');
    const seconds = Math.ceil(Math.max(0, battle.ability.readyTick - battle.tick) * config.stepSeconds);
    const status = button?.dataset.abilityFeedback
      ? en ? 'Invalid target' : 'Цель недоступна'
      : button?.dataset.abilityAim === 'true'
        ? en ? 'Choose target · Esc cancels' : 'Выберите цель · Esc отмена'
        : seconds > 0 ? `${en ? 'In' : 'Через'} ${clock(seconds)}` : en ? 'Ready' : 'Готова';
    set('[data-flash-status]', status);
  } else {
    const cooldown = battle?.flash.cooldownRemaining ?? 0;
    set('[data-flash-status]', view.campaign && !selected ? (en ? 'Unequipped' : 'Не выбрана') : config.flash.enabled === false ? en ? 'Locked' : 'Закрыта' : cooldown > 0 ? `${en ? 'In' : 'Через'} ${clock(Math.ceil(cooldown))}` : en ? 'Ready' : 'Готова');
  }
  const allStarted = started >= config.waves.length;
  set('[data-wave-button]', allStarted ? en ? 'All waves called' : 'Все волны вызваны' : en ? 'Call wave' : 'Вызвать волну');
  set('[data-wave-detail]', allStarted ? en ? 'Hold the shore' : 'Удержи берег' : `${en ? 'Next in' : 'Через'} ${clock(Math.ceil(Math.max(0, (battle?.nextWaveAt ?? 0) - (battle?.elapsed ?? 0))))}`);
  set('[data-battle-wave-note]', en ? 'Early wave bonus after completion' : 'Бонус после завершения досрочной волны');
  const brief = root.querySelector('.battle-brief summary');
  brief?.setAttribute('aria-label', en ? 'Battle information' : 'Сведения о бое');
  set('[data-battle-legend-health]', en ? 'health' : 'здоровье');
  set('[data-battle-legend-armor]', en ? 'armor' : 'броня');
  set('[data-battle-legend-light]', en ? 'taking damage' : 'получает урон');
  set('[data-battle-legend-stun]', en ? 'stunned' : 'оглушение');
  set('[data-battle-legend-keyboard]', en ? 'Esc — pause menu' : 'Esc — меню / пауза');
}
