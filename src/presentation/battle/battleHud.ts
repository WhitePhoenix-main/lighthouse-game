import type { ApplicationView } from '../../contracts';
import { nightLabel } from '../screens';
import { resolveLanguage, translate } from '../shared/localization';
import { settingsTextWidth } from '../shared/settingsLettering';
import { drawPreparationText, loadPreparationLettering } from '../preparation/preparationArtwork';

const icon = (name: string): string => `<img class="battle-hud-icon" src="${import.meta.env.BASE_URL}images/preparation/ui/${name}.png" alt="" draggable="false">`;
// Keep the accessible source separate: live HUD writes must not discard artwork.
const pixel = (attributes: string, text = '', className = ''): string => `<span class="battle-pixel ${className}"><span ${attributes}>${text}</span><canvas aria-hidden="true"></canvas></span>`;

/** All command selectors are consumed by mountGame; this module never dispatches commands. */
export function battleHudMarkup(): string {
  return `<section class="statusbar" aria-label="Состояние ночи">
    <div class="integrity battle-slate"><img class="battle-beacon" src="${import.meta.env.BASE_URL}images/preparation/world/lighthouse-main.png" alt=""><div class="battle-integrity-body"><div class="battle-health-heading">${pixel('data-battle-health-label', 'МАЯК')}${pixel('data-health', '', 'battle-health-value')}</div><div class="health-track"><i data-health-bar></i></div></div></div>
    <div class="night-state">${pixel('class="battle-night-label"')}${pixel('data-phase', '', 'battle-muted')}</div>
    ${pixel('data-timer', '', 'battle-clock')}
    <button class="quiet battle-slate" data-action="pause" aria-label="Пауза">Ⅱ <span>Пауза</span></button>
  </section>
  <section class="boss-status" data-boss-status hidden aria-label="Общее здоровье босса"><strong data-boss-text></strong><div class="health-track"><i data-boss-health></i></div></section>
  <div class="shield-status battle-objectives"><div data-shield-status></div><div class="ship-status" data-ship-status role="status"></div></div>
  <footer class="battle-controls">
    <div class="light-status battle-slate">${icon('lens')}<div class="battle-lens-copy">${pixel('data-battle-lens')}${pixel('data-targets', '', 'battle-muted')}</div></div>
    <button class="flash-button battle-slate" data-action="flash">${icon('flash')}<span class="battle-action-copy">${pixel('data-battle-flash-label', 'ВСПЫШКА')}${pixel('data-flash-status', '', 'battle-flash-detail')}</span></button>
    <button class="call-wave battle-slate" data-action="wave" disabled>${pixel('data-wave-button', 'ВЫЗВАТЬ ВОЛНУ')}${pixel('data-wave-detail', '', 'battle-muted')}</button>
    ${pixel('data-battle-wave-note', 'БОНУС ПОСЛЕ ЗАВЕРШЕНИЯ', 'battle-wave-note battle-muted')}
  </footer>
  <section class="battle-devices" data-battle-devices data-device-panel></section>
  <details class="battle-device-access"><summary aria-label="Устройства на берегу">${icon('devices')}<span data-battle-devices-label>Устройства</span></summary></details>
  <details class="battle-brief"><summary aria-label="Сведения о бое">i</summary><div class="battle-brief-body battle-slate"><p data-battle-defense-detail></p><p data-battle-lens-detail></p><p data-hint></p><p data-earnings></p><p data-victory-reward></p><div class="legend"><span><i class="legend-hp"></i> здоровье</span><span><i class="legend-armor"></i> броня</span><span><i class="legend-lit"></i> получает урон</span><span><i class="legend-stun"></i> оглушение</span><span class="keyboard-hint">Esc — меню / пауза</span></div></div></details>`;
}

const letteringRoots = new WeakSet<HTMLElement>();
const clock = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function paintLabels(root: HTMLElement): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  for (const label of root.querySelectorAll<HTMLElement>('.battle-pixel')) {
    const source = label.firstElementChild;
    const canvas = label.querySelector('canvas');
    if (!source || !canvas) continue;
    const { width, height } = label.getBoundingClientRect();
    if (width <= 0 || height <= 0) continue;
    const text = (source.textContent ?? '').toUpperCase().replace(/·/g, ' ').replace(/→/g, '').trim();
    const style = getComputedStyle(label);
    const key = [text, width, height, dpr, style.getPropertyValue('--battle-ink'), style.fontSize].join('/');
    if (canvas.dataset.paint === key) continue;
    canvas.dataset.paint = key;
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
    const scale = Math.min(parseFloat(style.fontSize) / 9, (width - 2) / Math.max(1, settingsTextWidth(text, 1)), (height - 4) / 10);
    const left = label.closest('.call-wave, .night-state, .battle-clock, .battle-wave-note') ? (width - settingsTextWidth(text, scale)) / 2 : 0;
    const ink = style.getPropertyValue('--battle-ink').trim() || '#e7cba1';
    const top = (height - 9 * scale) / 2;
    let painted = true;
    for (let index = 0; index < text.length; index++) {
      const character = text[index]!;
      if (character === ':') {
        ctx.fillStyle = ink;
        ctx.fillRect(left + (index * 9 + 3) * scale, top + 2 * scale, 2 * scale, 2 * scale);
        ctx.fillRect(left + (index * 9 + 3) * scale, top + 6 * scale, 2 * scale, 2 * scale);
      } else if (!drawPreparationText(ctx, character, left + index * 9 * scale, top, scale, ink)) painted = false;
    }
    // Missing glyphs fall back without leaving a partly painted duplicate.
    if (!painted) ctx.clearRect(0, 0, width, height);
    label.dataset.painted = String(painted);
    label.classList.toggle('has-pixel-art', painted);
  }
}

/** Call after mountGame writes/localizes its live HUD. Disabled/hidden command state stays with mountGame. */
export function updateBattleHud(root: HTMLElement, view: ApplicationView): void {
  if (view.screen !== 'battle') return;
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  const en = language === 'en';
  const set = (selector: string, value: string): void => {
    const target = root.querySelector(selector);
    if (target && target.textContent !== value) target.textContent = value;
  };
  set('[data-battle-health-label]', en ? 'BEACON' : 'МАЯК');
  set('.battle-night-label', translate(nightLabel(view), language));
  set('[data-battle-lens]', translate(view.lenses.find(lens => lens.definition.id === view.selectedLensId)?.definition.name ?? 'Базовая линза', language));
  // This control dispatches the existing flash command; candidate campaign
  // ability definitions do not change its actual action.
  set('[data-battle-flash-label]', en ? 'FLASH' : 'ВСПЫШКА');
  set('[data-battle-devices-label]', en ? 'Devices' : 'Устройства');
  const { battle, config } = view;
  set('[data-battle-lens-detail]', root.querySelector('[data-targets]')?.textContent ?? '');
  const lit = (battle?.enemies.filter(enemy => enemy.health > 0 && battle.litEnemyIds.includes(enemy.id)).length ?? 0) + (battle?.litTentacleIds.length ?? 0) + (battle?.ship?.lit ? 1 : 0);
  set('[data-targets]', `${en ? 'IN LIGHT' : 'В СВЕТЕ'} ${lit}/${config.beam.maxTargets}`);
  const shield = battle?.shield;
  const ship = battle?.ship;
  const objectivePanel = root.querySelector<HTMLElement>('.battle-objectives');
  const shieldLabel = root.querySelector<HTMLElement>('[data-shield-status]');
  if (shieldLabel) {
    set('[data-battle-defense-detail]', shieldLabel.textContent ?? '');
    shieldLabel.hidden = !shield?.maximum;
  }
  if (objectivePanel) objectivePanel.hidden = !shield?.maximum && !ship;
  if (shield?.maximum) {
    const living = battle?.devices.some(device => device.kind === 'generator' && device.health > 0 && !device.consumed);
    const recovery = !living ? en ? 'NO REGEN' : 'НЕТ РЕГЕН.' : shield.recoveryRemaining > 0 ? `${en ? 'RECOVERY' : 'ВОССТ.'} ${Math.ceil(shield.recoveryRemaining)}${en ? 's' : 'с'}` : shield.current < shield.maximum ? `+${config.shield.regenerationPerSecond}/${en ? 's' : 'с'}` : en ? 'FULL' : 'ПОЛОН';
    set('[data-shield-status]', `${en ? 'SHIELD' : 'ЩИТ'} ${Math.ceil(shield.current)}/${shield.maximum} · ${recovery}`);
  }
  if (ship) set('[data-ship-status]', ship.status === 'rescued' ? en ? 'SHIP RESCUED' : 'КОРАБЛЬ СПАСЁН' : ship.status === 'lost' ? en ? 'SHIP LOST' : 'КОРАБЛЬ УПУЩЕН' : `${en ? 'SHIP' : 'КОРАБЛЬ'} ${ship.progress.toFixed(1)}/${config.ship?.rescueSeconds ?? 0}${en ? 's' : 'с'} · ${en ? 'LEFT' : 'ОСТ.'} ${Math.ceil(ship.remaining)}${en ? 's' : 'с'}`);
  const started = battle?.waves.filter(wave => wave.started).length ?? 0;
  const completed = battle?.waves.filter(wave => wave.completed).length ?? 0;
  set('[data-phase]', `${en ? 'WAVES' : 'ВОЛНЫ'} ${started}/${config.waves.length}  ${en ? 'CLEARED' : 'ОТБИТО'} ${completed}`);
  set('[data-timer]', clock(battle?.elapsed ?? 0));
  // Ability availability and timing are written by mountGame; preserve those facts.
  {
    const cooldown = battle?.flash.cooldownRemaining ?? 0;
    set('[data-flash-status]', config.flash.enabled === false ? en ? 'LOCKED' : 'ЗАКРЫТА' : cooldown > 0 ? `${en ? 'IN' : 'ЧЕРЕЗ'} ${clock(Math.ceil(cooldown))}` : en ? 'READY' : 'ГОТОВА');
  }
  const allStarted = started >= config.waves.length;
  set('[data-wave-button]', allStarted ? en ? 'ALL WAVES CALLED' : 'ВСЕ ВОЛНЫ ВЫЗВАНЫ' : en ? 'CALL WAVE' : 'ВЫЗВАТЬ ВОЛНУ');
  set('[data-wave-detail]', allStarted ? en ? 'HOLD THE SHORE' : 'УДЕРЖИ БЕРЕГ' : `${en ? 'NEXT IN' : 'ЧЕРЕЗ'} ${clock(Math.ceil(Math.max(0, (battle?.nextWaveAt ?? 0) - (battle?.elapsed ?? 0))))}`);
  set('[data-battle-wave-note]', en ? 'BONUS AFTER COMPLETION' : 'БОНУС ПОСЛЕ ЗАВЕРШЕНИЯ');
  root.querySelector('.battle-controls')?.setAttribute('data-text-size', view.settings.textSize);
  paintLabels(root);
  if (!letteringRoots.has(root)) {
    letteringRoots.add(root);
    void loadPreparationLettering().then(() => { if (root.isConnected) { for (const canvas of root.querySelectorAll<HTMLCanvasElement>('.battle-pixel canvas')) delete canvas.dataset.paint; paintLabels(root); } });
  }
}
