import { mortarFlight } from './battle/mortar';
import { resonanceStatus, resonanceDescription, focusStatus, focusDescription, burnDescription, burnStatus } from './shared/lenses';
import Phaser from 'phaser';
import type { ApplicationView, BattleState, DeviceState, EnemyState, GameApplication, NightConfig } from '../contracts';
import './style.css';
import './menu/menu.css';
import './menu/menuFog.css';
import './menu/menuTitle.css';
import './settings/settings.css';
import './menu/gameMenu.css';
import './skill-tree/skillTree.css';
import './preparation/preparation.css';
import './battle/battleHud.css';
import { battleHudMarkup, updateBattleHud } from './battle/battleHud';
import { loadBattleArtwork, paintBattleEnemy, paintBattleNight, battleEnemyBounds } from './battle/battleArtwork';
import { BEAM_LIGHT_STOPS, beamLightGeometry, paintBattleBeam, paintBeamGuide } from './battle/battleBeam';
import type { BattleArtwork } from './battle/battleArtwork';
import { battleBarStyle, clampBarFraction, enemyBarRequest } from './battle/battleIndicators';
import { createPreparationUiState } from './preparation/preparationState';
import { mountPreparationControls } from './preparation/preparationControls';
import { loadChapterWorldAssets, paintChapterWorld } from './shared/world/chapterWorld';
import { createWorldCamera, WORLD_PROJECTION_Y, deviceSprite, spriteBounds } from './shared/world/worldGeometry';
import type { ChapterWorldAssets, WorldCamera } from './shared/world/worldTypes';
import { createSkillTreeState } from './skill-tree/skillTree';
import { mountSkillTreeControls } from './skill-tree/skillTreeControls';
import { layoutSkillTreeArtwork } from './skill-tree/skillTreeArtwork';
import { layoutGameMenu } from './menu/gameMenu';
import { mountGameMenuTransition } from './menu/gameMenuTransition';
import { mountMenuAudio } from './menu/menuAudio';
import { mountEffectsAudio } from './battle/effectsAudio';
import { localizeRoot, resolveLanguage, translate } from './shared/localization';
import { layoutReferenceSettings } from './settings/referenceSettings';
import { layoutReferenceMenu, mountMenuMotion } from './menu/referenceMenu';
import { mountMenuWindows } from './menu/menuWindows';
import { mountMenuTitle } from './menu/menuTitle';
import { mountMenuButtons } from './menu/menuButtons';
import { menuScenery, layoutMenuScenery } from './menu/menuScenery';
import { mountSettingsTransition } from './settings/settingsTransition';
import { renderPlacementPreview } from './preparation/preparation';
import { screenContent, nightLabel } from './screens';
import { drawCombatFeedback } from './battle/feedback';
import { battleDevicePanel } from './shared/devices';
import { drawCoast } from './battle/coast';
import { bellSlowStatus, bossStatus, tentacleStatus, enemyThreat, shipStatus, shieldStatus as shieldStatusText } from './battle/nightPresentation';
import { layoutIndicators, type IndicatorRequest } from './battle/indicatorLayout';

const TAU = Math.PI * 2;
const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** The scene projects state only. Every game action goes through GameApplication. */
export function mountGame(root: HTMLElement, application: GameApplication): { destroy(): void } {
  root.innerHTML = `
    <main class="lighthouse-app">
      <header class="masthead"><span class="brand" aria-label="Маяк — ночной дозор"><span class="brand-mark">◈</span><span>МАЯК<small>НОЧНОЙ ДОЗОР</small></span></span><span class="prototype">ЛОКАЛЬНЫЙ ПРОТОТИП</span><div class="bank"><span>Осколки</span><strong data-bank>0</strong><span class="material-bank">Жемчуг глубин <b data-material-bank>0</b></span></div></header>
      <div class="save-error" role="alert" hidden><span data-error></span><button data-action="save">Повторить сохранение</button></div>
      <section class="play-area"><div class="ocean" data-canvas role="img" aria-label="Побережье с маяком: суша слева, море справа. Направляйте свет движением мыши или касанием."></div><div class="map-label">СЕВЕРНЫЙ БЕРЕГ <span>•</span> <span data-night-label></span></div><div class="range-label">Пунктир — дальность света</div><div class="overlay" data-overlay></div></section>
      <div class="battle-rail">
      ${battleHudMarkup()}
      </div>
    </main>`;
  const find = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  };
  const canvasHost = find('[data-canvas]');
  const battleWorld = document.createElement('canvas');
  battleWorld.className = 'chapter-world-underlay';
  battleWorld.setAttribute('aria-hidden', 'true');
  Object.assign(battleWorld.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  canvasHost.prepend(battleWorld);
  const battleWorldContext = battleWorld.getContext('2d');
  let chapterAssets: ChapterWorldAssets | null = null;
  let battleArtwork: BattleArtwork | null = null;
  let destroyed = false;
  void loadChapterWorldAssets().then(assets => { if (!destroyed) chapterAssets = assets; }).catch(() => { /* The geometric renderer remains usable while artwork is unavailable. */ });
  void loadBattleArtwork().then(assets => { if (!destroyed) battleArtwork = assets; }).catch(() => { /* Existing silhouettes keep combat usable if sprites cannot load. */ });
  const shell = find('.lighthouse-app');
  const menuAudio = mountMenuAudio(root, application);
  const effectsAudio = mountEffectsAudio(root, application);
  const overlay = find('[data-overlay]');
  // One connected scene survives menu/settings replacement and retains its timelines.
  const sceneryLayer = document.createElement('div');
  sceneryLayer.className = 'menu-scene-layer';
  sceneryLayer.setAttribute('aria-hidden', 'true');
  sceneryLayer.innerHTML = menuScenery();
  overlay.before(sceneryLayer);
  let sceneryActive = false;
  let lifecyclePaused = false;
  const menuWindows = mountMenuWindows(sceneryLayer);
  const menuTitle = mountMenuTitle(overlay, sceneryLayer);
  const menuButtons = mountMenuButtons(overlay);
  const settingsTransition = mountSettingsTransition(overlay);
  const gameMenuTransition = mountGameMenuTransition(overlay);
  const menuMotion = mountMenuMotion(root, (paused) => {
    lifecyclePaused = paused;
    menuWindows.setPaused(paused || !sceneryActive);
    menuButtons.setPaused(paused);
    settingsTransition.setPaused(paused);
    gameMenuTransition.setPaused(paused);
  });
  const devicePanel = find('[data-battle-devices]');
  const flashButton = find<HTMLButtonElement>('[data-action="flash"]');
  const flashStatus = find('[data-flash-status]');
  const shieldStatus = find('[data-shield-status]');
  let selectedDevice: number | null = null;
  let choosingTarget = false;
  let targetNotice = '';
  let rememberedTarget: number | null = null;
  let pendingTarget: { id: number; tick: number } | null = null;
  let devicePanelKey = '';
  let panelPointerHeld = false;
  let panelReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  const health = find('[data-health]');
  const healthBar = find('[data-health-bar]');
  const bank = find('[data-bank]');
  const phase = find('[data-phase]');
  const timer = find('[data-timer]');
  const pause = find<HTMLButtonElement>('[data-action="pause"]');
  const wave = find<HTMLButtonElement>('[data-action="wave"]');
  const waveButton = find('[data-wave-button]');
  const waveDetail = find('[data-wave-detail]');
  const targets = find('[data-targets]');
  const hint = find('[data-hint]');
  const earnings = find('[data-earnings]');
  const error = find('[data-error]');
  const errorBox = find('.save-error');
  let overlayKey = '';
  let selectedUpgrade = application.view.upgrades[0]?.definition.id;
  const treeState = createSkillTreeState();
  const treeControls = mountSkillTreeControls(overlay, treeState, () => application.view, () => renderHud(application.view));
  const preparationState = createPreparationUiState();
  const preparationControls = mountPreparationControls(overlay, application, preparationState, () => renderHud(application.view));
  let confirmAbandon = false;
  let confirmNewGame = false;
  let previousScreen = '';
  let settingsPointerHeld = false;
  const returnFocus = new Map<string, string>();
  const screenScroll = new Map<string, number>();

  function syncViewport(scale: Phaser.Scale.ScaleManager): void {
    const bounds = canvasHost.getBoundingClientRect();
    const width = Math.floor(bounds.width), height = Math.floor(bounds.height);
    if (width > 0 && height > 0 && (scale.width !== width || scale.height !== height)) scale.resize(width, height);
  }

  function layoutSharedScenery(): void {
    const width = sceneryLayer.clientWidth, height = sceneryLayer.clientHeight;
    layoutMenuScenery(sceneryLayer, width, height);
  }

  function openSettingsWithMotion(): void {
    const origin = application.view.screen;
    settingsTransition.openSettings(() => {
      if (application.view.screen !== origin) return;
      application.openSettings();
      renderHud(application.view);
    });
  }

  function closeSettingsWithMotion(): void {
    settingsPointerHeld = false;
    settingsTransition.closeSettings(() => {
      if (application.view.screen !== 'settings') return;
      application.back();
      renderHud(application.view);
    });
  }

  function renderHud(view: ApplicationView): void {
    const { config, battle } = view;
    shell.classList.toggle('is-main-menu', view.screen === 'menu');
    shell.classList.toggle('is-settings', view.screen === 'settings');
    shell.classList.toggle('is-game-menu', view.screen === 'game-menu');
    shell.classList.toggle('is-development', view.screen === 'development');
    shell.classList.toggle('is-preparation', view.screen === 'preparation');
    shell.classList.toggle('is-battle', view.screen === 'battle');
    shell.classList.toggle('battle-paused', view.screen === 'battle' && view.paused);
    sceneryActive = view.screen === 'development' || view.screen === 'menu' || view.screen === 'settings' || view.screen === 'game-menu';
    shell.classList.toggle('has-menu-scenery', sceneryActive);
    sceneryLayer.classList.toggle('is-inactive', !sceneryActive);
    sceneryLayer.classList.toggle('menu-motion-paused', !sceneryActive);
    menuWindows.setPaused(lifecyclePaused || !sceneryActive);
    menuAudio.sync();
    effectsAudio.sync();
    if (view.screen !== 'battle') { selectedDevice = null; choosingTarget = false; rememberedTarget = null; targetNotice = ''; pendingTarget = null; }
    const selected = battle?.devices.find((entry) => entry.id === selectedDevice);
    if (pendingTarget && battle && battle.tick > pendingTarget.tick) {
      if (selected?.targetId === pendingTarget.id) { rememberedTarget = pendingTarget.id; targetNotice = ''; }
      else { targetNotice = 'Цель недоступна: выбери живого врага.'; choosingTarget = true; }
      pendingTarget = null;
    }
    if (selected && rememberedTarget !== null && selected.targetId === null && !targetNotice) {
      targetNotice = 'Цель уничтожена или сброшена. Устройство снова выбирает автоматически.';
      rememberedTarget = null;
    }
    if (selected?.targetId != null) rememberedTarget = selected.targetId;
    const panelHtml = battleDevicePanel(view, selectedDevice, choosingTarget, targetNotice);
    if (panelHtml !== devicePanelKey && !panelPointerHeld) {
      const active = document.activeElement instanceof HTMLElement && devicePanel.contains(document.activeElement) ? document.activeElement : null;
      const action = active?.dataset.action, priority = active?.dataset.priority, enemyId = active?.dataset.enemyId, deviceId = active?.dataset.deviceId;
      const menuScroll = devicePanel.querySelector('.device-command-panel')?.scrollTop ?? 0;
      const descriptionOpen = devicePanel.dataset.selectedDevice === String(selectedDevice) && (devicePanel.querySelector<HTMLDetailsElement>('.device-description')?.open ?? false);
      devicePanel.innerHTML = panelHtml; devicePanelKey = panelHtml;
      devicePanel.dataset.selectedDevice = String(selectedDevice);
      const description = devicePanel.querySelector<HTMLDetailsElement>('.device-description');
      if (description) description.open = descriptionOpen;
      const menu = devicePanel.querySelector('.device-command-panel');
      if (menu) menu.scrollTop = menuScroll;
      if (active) [...devicePanel.querySelectorAll<HTMLElement>('[data-action]')].find((entry) => entry.dataset.action === action && entry.dataset.priority === priority && entry.dataset.enemyId === enemyId && entry.dataset.deviceId === deviceId)?.focus({ preventScroll: true });
    }
    flashButton.disabled = config.flash.enabled === false || !battle || view.screen !== 'battle' || view.paused || battle.flash.cooldownRemaining > 0;
    flashStatus.textContent = config.flash.enabled === false ? 'Закрыта · открой в развитии' : battle && battle.flash.cooldownRemaining > 0 ? 'Готова через ' + Math.ceil(battle.flash.cooldownRemaining) + ' с' : 'Готова · урон + оглушение';
    flashButton.title = config.flash.enabled === false ? 'Открой вспышку на экране развития маяка' : 'Радиус ' + config.flash.radius + ' · урон ' + config.flash.damage + ' · оглушение ' + config.flash.stunDuration + ' с';
    shieldStatus.textContent = shieldStatusText(battle, config);
    find('[data-night-label]').textContent = nightLabel(view);
    const rescue = find('[data-ship-status]');
    rescue.textContent = battle?.ship ? shipStatus(battle.ship, config) : '';
    rescue.hidden = view.screen !== 'battle' || !battle?.ship;
    bank.textContent = String(view.profile.resources);
    find('[data-material-bank]').textContent = String(view.profile.bossMaterials);
    const bossHud = find('[data-boss-status]');
    bossHud.hidden = view.screen !== 'battle' || !battle?.boss;
    find('[data-boss-text]').textContent = battle ? bossStatus(battle, config, true) + ((battle.boss?.burn?.remainingTicks ?? 0) > 0 ? ' · ТЛЕЕТ' : '') : '';
    bossHud.title = 'У босса общее здоровье. Свет замедляет освещённые щупальца и останавливает их атаки.';
    find('[data-boss-health]').style.width = `${battle?.boss && config.boss ? Math.max(0, battle.boss.health / config.boss.health * 100) : 0}%`;
    const hp = battle?.lighthouseHealth ?? config.lighthouseHealth;
    health.textContent = `${Math.ceil(hp)} / ${config.lighthouseHealth}`;
    healthBar.style.width = `${Math.max(0, hp / config.lighthouseHealth * 100)}%`;
    healthBar.classList.toggle('critical', hp < config.lighthouseHealth * .3);
    healthBar.classList.toggle('under-attack', !!battle?.events.some((event) => event.type === 'lighthouse-hit' && (battle.tick - event.tick) * config.stepSeconds < .35));
    pause.hidden = view.screen !== 'battle' || view.paused;
    pause.setAttribute('aria-label', view.paused ? 'Продолжить' : 'Пауза');
    // Keep the hit target alive between pointerdown and pointerup during live ticks.
    const pauseMarkup = view.paused ? '▶ <span>Продолжить</span>' : 'Ⅱ <span>Пауза</span>';
    if (pause.dataset.state !== String(view.paused)) {
      pause.innerHTML = pauseMarkup;
      pause.dataset.state = String(view.paused);
    }
    errorBox.hidden = !view.error;
    error.textContent = view.error ?? '';
    const started = battle?.waves.filter((entry) => entry.started).length ?? 0;
    const remaining = battle ? Math.max(0, battle.nextWaveAt - battle.elapsed) : 0;
    const completed = battle?.waves.filter((entry) => entry.completed).length ?? 0;
    phase.textContent = view.screen === 'preparation' ? 'ПОДГОТОВКА' : `ВОЛНЫ ${started}/${config.waves.length} · ОТБИТО ${completed}`;
    timer.textContent = view.screen === 'preparation' ? 'Берег ждёт' : view.paused ? 'Ночь приостановлена' : battle ? clock(battle.elapsed) : '';
    const canCall = view.screen === 'battle' && !view.paused && started < config.waves.length;
    wave.disabled = !canCall;
    waveButton.textContent = started >= config.waves.length ? 'Все волны на берегу' : 'Вызвать досрочно →';
    waveDetail.textContent = battle && started < config.waves.length ? `До следующей: ${clock(Math.ceil(remaining))} · бонус после её завершения` : 'Бонус — за завершённую досрочную волну';
    const livingLit = battle?.enemies.filter((enemy) => enemy.health > 0 && battle.litEnemyIds.includes(enemy.id)).length ?? 0;
    targets.textContent = battle ? `В свете: ${livingLit + battle!.litTentacleIds.length + (battle.ship?.lit ? 1 : 0)} / ${config.beam.maxTargets}` : `Базовая линза · до ${config.beam.maxTargets} целей`;
    if (battle && config.lens?.focus) targets.textContent += ' · ' + focusStatus(battle, config);
    if (battle && config.lens?.burn) targets.textContent += ' · ' + burnStatus(battle);
    if (battle && config.lens?.resonance) targets.textContent += ' · ' + resonanceStatus(battle, config);
    targets.title = [resonanceDescription(config), focusDescription(config), burnDescription(config)].filter(Boolean).join(' ');
    hint.textContent = (battle?.blockedEnemyIds.length || battle?.blockedTentacleIds.length) ? '× / «Перекрыт» — цель полностью закрыта другим существом' : 'Мышь — наведение · Касание — удержание и движение';
    find('.range-label').textContent = `Дальность ${Number(config.beam.range.toFixed(1))} · ◇ — наведение · Поворот света ${Math.round(config.beam.turnSpeed * 180 / Math.PI)}°/с`;
    earnings.textContent = battle ? `За ночь: ${battle.earnedResources} ◈ + ${battle.earnedBonus} бонус${battle.ship ? ` + ${battle.earnedRescue} спасение` : ''} · черновик` : '';
    find('[data-victory-reward]').textContent = battle ? `При победе: +${config.victoryReward} ◈` : '';
    document.documentElement.dataset.textSize = view.settings.textSize;
    const isBattle = view.screen === 'battle';
    find('.battle-rail').hidden = !isBattle;
    root.querySelector('.lighthouse-app')?.classList.toggle('screen-page', !isBattle);
    for (const selector of ['.statusbar', '.battle-controls', '.legend', '.map-label', '.range-label', '.battle-devices', '.shield-status']) find(selector).hidden = !isBattle;
    devicePanel.hidden = !isBattle || view.paused;
    devicePanel.dataset.deviceOpen = String(selectedDevice !== null);
    const key = JSON.stringify([view.screen, view.paused, view.error, view.settings, view.settingsError, view.result, view.interrupted, view.hasProgress, view.profile, view.upgrades, config, view.nights, view.selectedNightId, view.lateNightModes, view.selectedLensId, view.lenses, view.preparation.selectedType, view.preparation.placements, view.preparation.cost, view.preparation.remaining, view.preparation.canStart, view.preparation.reason, selectedUpgrade, confirmAbandon, treeState]);
    const keyed = key + '/' + confirmNewGame + '/' + JSON.stringify(preparationState);
    if (keyed === overlayKey || (view.screen === 'settings' && settingsPointerHeld && !view.settingsError)) { renderPlacementPreview(overlay, view); localize(); preparationControls.sync(); return; }
    const scrollSurface = overlay.querySelector<HTMLElement>('.reference-settings') ?? overlay;
    const scrollTop = scrollSurface.scrollTop;
    const focused = (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement) && root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.focusKey;
    const screenChanged = previousScreen !== view.screen;
    const oldScreen = previousScreen;
    if (screenChanged && oldScreen) screenScroll.set(oldScreen, scrollTop);
    previousScreen = view.screen;
    if (screenChanged) { confirmAbandon = false; confirmNewGame = false; }
    overlayKey = keyed;
    const wasHidden = overlay.hidden;
    overlay.hidden = isBattle && !view.paused;
    canvasHost.setAttribute('aria-hidden', String(!isBattle));
    overlay.className = 'overlay screen-' + view.screen + (view.screen === 'preparation' ? ' preparation' : '');
    treeControls.capture();
    preparationControls.capture();
    overlay.innerHTML = screenContent(view, selectedUpgrade, confirmAbandon, confirmNewGame, treeState, preparationState);
    treeControls.restore();
    // Standalone menu markup includes a scene; the game uses its persistent sibling.
    overlay.querySelector('.avalon-menu > .menu-scenery')?.remove();
    layoutReferenceMenu(overlay);
    layoutReferenceSettings(overlay, view);
    layoutGameMenu(overlay, view);
    layoutSharedScenery();
    settingsTransition.sync();
    gameMenuTransition.sync();
    for (const element of root.querySelectorAll<HTMLElement>('[data-action]')) {
      element.dataset.focusKey = [element.dataset.action, element.dataset.upgrade ?? element.dataset.lensUpgrade ?? element.dataset.lens ?? element.dataset.mode ?? element.dataset.night ?? element.dataset.kind ?? element.dataset.deviceId ?? element.dataset.size ?? element.dataset.enabled ?? element.dataset.language ?? ''].join(':');
    }
    if (!overlay.hidden) {
      const restoreKey = screenChanged ? returnFocus.get(view.screen) : focusKey;
      const restore = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-focus-key]')].find((element) => element.dataset.focusKey === restoreKey && !(element instanceof HTMLButtonElement && element.disabled));
      if (restore && (!screenChanged || oldScreen === 'development' || oldScreen === 'settings')) restore.focus({ preventScroll: true });
      else if (screenChanged || wasHidden) overlay.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
      else if (focused && !focused.isConnected) {
        const fallback = overlay.querySelector<HTMLElement>('.skill-node[aria-pressed="true"]') ?? overlay.querySelector<HTMLElement>('[data-action="confirm-abandon"]') ?? overlay.querySelector<HTMLElement>('h1');
        fallback?.focus({ preventScroll: true });
      }
      (overlay.querySelector<HTMLElement>('.reference-settings') ?? overlay).scrollTop = screenChanged ? screenScroll.get(view.screen) ?? 0 : scrollTop;
    } else if (focused && !focused.isConnected) pause.focus({ preventScroll: true });
    if (confirmAbandon && !overlay.querySelector('.abandon-confirm')?.contains(document.activeElement)) overlay.querySelector<HTMLElement>('[data-action="cancel-abandon"]')?.focus({ preventScroll: true });
    if (confirmNewGame) {
      const board = overlay.querySelector<HTMLElement>('.game-menu-board'); if (board) board.inert = true;
      const back = overlay.querySelector<HTMLElement>('.game-menu-back'); if (back) back.inert = true;
      if (!overlay.querySelector('.game-menu-confirm')?.contains(document.activeElement)) overlay.querySelector<HTMLElement>('[data-action="cancel-new-game"]')?.focus({ preventScroll: true });
    }
    renderPlacementPreview(overlay, view);
    localize();
    preparationControls.sync();
  }

  function localize(): void {
    const language = resolveLanguage(application.view.settings.language, undefined, navigator.languages);
    document.documentElement.lang = language;
    document.title = translate('Свет Авалона', language);
    localizeRoot(root, language);
    updateBattleHud(root, application.view);
    layoutSkillTreeArtwork(overlay, language);
  }

  class CoastScene extends Phaser.Scene {
    private ink!: Phaser.GameObjects.Graphics;
    private labels = new Map<number, Phaser.GameObjects.Text>();
    private cx = 0;
    private cy = 0;
    private unit = 1;
    private camera: WorldCamera | null = null;
    create(): void {
      this.ink = this.add.graphics();
      syncViewport(this.scale);
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch && !pointer.isDown) return;
        this.aim(pointer);
      });
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const view = application.view;
        if (view.screen !== 'battle' || view.paused || !(pointer.event.target instanceof HTMLCanvasElement)) return;
        const battle = view.battle;
        if (!battle) return;
        if (choosingTarget && selectedDevice !== null) {
          const enemy = [...battle.enemies].reverse().find((entry) => {
            const body = this.enemyBody(entry, view.config);
            return entry.health > 0 && pointer.x >= body.x - 6 && pointer.x <= body.x + body.width + 6 && pointer.y >= body.y - 6 && pointer.y <= body.y + body.height + 6;
          });
          if (enemy) pinTarget(enemy.id);
          else if (battle.boss && battle.boss.health > 0) {
            const tentacle = battle.boss.tentacles.find(entry => { const p = this.point(entry.x, entry.y); return Math.hypot(pointer.x - p.x, (pointer.y - p.y) / WORLD_PROJECTION_Y) <= Math.max(14, (view.config.boss?.radius ?? 15) * this.unit); });
            if (tentacle) pinTarget(tentacle.id);
          }
          return;
        }
        const device = [...battle.devices].reverse().find((entry) => {
          const p = this.point(entry.x, entry.y);
          const spec = deviceSprite(entry.kind);
          if (spec && chapterAssets) {
            const b = spriteBounds(entry.x, entry.y, spec);
            return pointer.x >= this.cx + b.minX * this.unit - 6 && pointer.x <= this.cx + b.maxX * this.unit + 6 && pointer.y >= this.cy + b.minY * this.unit - 6 && pointer.y <= this.cy + b.maxY * this.unit + 6;
          }
          return Math.hypot(pointer.x - p.x, (pointer.y - p.y) / WORLD_PROJECTION_Y) <= Math.max(14, view.config.devices.definitions[entry.kind].radius * this.unit);
        });
        if (device) { inspectDevice(device.id); renderHud(application.view); return; }
        this.aim(pointer);
      });
      renderHud(application.view);
    }
    private aim(pointer: Phaser.Input.Pointer): void {
      if (application.view.screen !== 'battle' || application.view.paused || selectedDevice !== null ||
        !(pointer.event.target instanceof HTMLCanvasElement) ||
        pointer.x < 0 || pointer.y < 0 || pointer.x > this.scale.width || pointer.y > this.scale.height) return;
      application.command({ type: 'aim', angle: Math.atan2((pointer.y - this.cy) / WORLD_PROJECTION_Y, pointer.x - this.cx) });
    }
    update(_time: number, delta: number): void {
      application.advance(delta);
      const view = application.view;
      renderHud(view);
      // Screen changes alter the flex/grid allocation synchronously. Read the
      // actual host after HUD layout and before projection, including on pause.
      syncViewport(this.scale);
      this.draw(view);
    }
    private point(x: number, y: number): Phaser.Math.Vector2 {
      return new Phaser.Math.Vector2(this.cx + x * this.unit, this.cy + y * this.unit * WORLD_PROJECTION_Y);
    }
    private ring(radius: number, color: number, alpha: number, width = 1): void {
      this.ink.lineStyle(width, color, alpha);
      this.ink.strokeEllipse(this.cx, this.cy, radius * this.unit * 2, radius * this.unit * (WORLD_PROJECTION_Y * 2));
    }
    private draw(view: ApplicationView): void {
      const { config, battle } = view;
      const g = this.ink;
      const w = this.scale.width, h = this.scale.height;
      g.clear();
      if (view.screen !== 'battle') {
        battleWorldContext?.clearRect(0, 0, battleWorld.width, battleWorld.height);
        for (const label of this.labels.values()) label.destroy();
        this.labels.clear();
        return;
      }
      const camera = createWorldCamera(config, w, h, { mode: 'battle', devices: battle?.devices ?? [] });
      this.camera = camera;
      battleWorld.dataset.worldCamera = JSON.stringify(camera);
      battleWorld.dataset.worldReady = String(chapterAssets !== null);
      this.cx = camera.x;
      this.cy = camera.y;
      this.unit = camera.zoom;
      if (chapterAssets && battleWorldContext) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (battleWorld.width !== Math.round(w * dpr) || battleWorld.height !== Math.round(h * dpr)) {
          battleWorld.width = Math.round(w * dpr); battleWorld.height = Math.round(h * dpr);
        }
        battleWorldContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintChapterWorld(battleWorldContext, chapterAssets, config, camera, {
          devices: (battle?.devices ?? []).map(device => ({ ...device, maxHealth: config.devices.definitions[device.kind].health })),
          showRanges: false, showHealthBars: false,
          paintGround: ctx => paintBeamGuide(ctx, camera, config, battle?.desiredBeamAngle ?? -.75),
        });
        if (battle) paintBattleNight(battleWorldContext, camera, config, battle);
        paintBattleBeam(battleWorldContext, camera, config, battle?.beamAngle ?? -.75);
      } else drawCoast(g, w, h, this.cx, this.cy, this.unit, config.terrain, WORLD_PROJECTION_Y);
      this.ring(config.worldRadius * 1.045, 0x547980, .24);
      this.drawBeam(config, battle?.beamAngle ?? -.75);
      if (battle?.shield.maximum) this.ring(config.shield.radius, battle.shield.current > 0 ? 0x80d9f7 : 0x69808a, battle.shield.current > 0 ? .85 : .3, battle.shield.current > 0 ? 2 : 1);
      const selected = battle?.devices.find((entry) => entry.id === selectedDevice);
      if (selected) {
        const p = this.point(selected.x, selected.y);
        g.lineStyle(2, 0xb8edff, .9); g.strokeEllipse(p.x, p.y, 36, 30);
        if (selected.kind === 'cannon' || selected.kind === 'harpoon' || selected.kind === 'mortar' || selected.kind === 'bell' || selected.kind === 'repair-lamp') { g.lineStyle(1, 0xb8edff, .4); g.strokeEllipse(p.x, p.y, config.devices.definitions[selected.kind].range * this.unit * 2, config.devices.definitions[selected.kind].range * this.unit * (WORLD_PROJECTION_Y * 2)); }
      }
      for (const device of battle?.devices ?? []) this.drawDevice(device, config, battle!);
      if (battle?.ship) this.drawShip(config, battle);
      const enemies = battle ? [...battle.enemies].sort((a, b) => a.y - b.y) : [];
      const present = new Set<number>();
      // Restore northern silhouettes immediately after the tower, before southern
      // enemies. A late x-ray pass would incorrectly paint over nearer threats.
      const restoreNorthernThreats = (): void => {
        if (chapterAssets && battleWorldContext) return;
        const towerRadius = Math.max(12, config.lighthouseRadius * this.unit);
        for (const enemy of enemies) {
          const p = this.point(enemy.x, enemy.y);
          const enemyRadius = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
          if (enemy.y <= 0 && Math.abs(p.x - this.cx) < towerRadius * 1.15 + enemyRadius &&
            p.y + enemyRadius > this.cy - towerRadius * 4 && p.y - enemyRadius < this.cy) {
            this.drawEnemy(enemy, config, battle!);
          }
        }
      };
      let lighthouseDrawn = false;
      for (const enemy of enemies) {
        if (enemy.y > 0 && !lighthouseDrawn) {
          this.drawLighthouse(config, battle);
          this.drawDeviceSilhouettes(config, battle);
          restoreNorthernThreats();
          lighthouseDrawn = true;
        }
        this.drawEnemy(enemy, config, battle!); present.add(enemy.id);
      }
      if (!lighthouseDrawn) {
        this.drawLighthouse(config, battle);
        this.drawDeviceSilhouettes(config, battle);
        restoreNorthernThreats();
      }
      if (battle) this.drawBoss(config, battle);
      if (battle) this.drawMortar(config, battle);
      if (battle) drawCombatFeedback(g, battle, config, (x, y) => this.point(x, y), this.unit);
      if (battle) this.drawAim(config, battle.desiredBeamAngle);
      const tower = Math.max(12, config.lighthouseRadius * this.unit);
      const bodies = enemies.map((enemy) => this.enemyBody(enemy, config));
      if (battle?.ship) { const p = this.point(battle.ship.x, battle.ship.y), r = Math.max(10, battle.ship.radius * this.unit); bodies.push({ x: p.x-r*1.4, y:p.y-r*1.2, width:r*2.8, height:r*2.6+10 }); }
      for (const tip of battle?.boss?.health && battle.boss.health > 0 ? battle.boss.tentacles : []) { const p = this.point(tip.x, tip.y), r = Math.max(9, (config.boss?.radius ?? 16) * this.unit); bodies.push({ x: p.x-r*1.3, y: p.y-r*1.2, width: r*2.6, height: r*2.4 }); }
      bodies.push({ x: this.cx - tower * 1.2, y: this.cy - tower * 4.1, width: tower * 2.4, height: tower * 4.8 });
      // Device health strips are reserved before enemy health is laid out.
      const deviceBars = (battle?.devices ?? []).filter((device) => device.health > 0).map((device) => {
        const p = this.point(device.x, device.y), radius = Math.max(5, config.devices.definitions[device.kind].radius * this.unit);
        const style = battleBarStyle(false, view.settings.textSize === 'large', radius * 2, true);
        return { x: p.x - style.width / 2, y: p.y + radius + 3, width: style.width, height: style.height };
      });
      const indicators = layoutIndicators(enemies.map((enemy) => {
        const body = this.enemyBody(enemy, config);
        return enemyBarRequest(enemy.id, body, battleBarStyle(config.enemies[enemy.kind].armor > 0, view.settings.textSize === 'large', body.width));
      }), { width: w, height: h }, bodies, deviceBars);
      const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]));
      battleWorld.dataset.indicators = JSON.stringify(indicators);
      battleWorld.dataset.enemyBodies = JSON.stringify(enemies.map(enemy => ({ id: enemy.id, ...this.enemyBody(enemy, config) })));
      battleWorld.dataset.artworkReady = String(battleArtwork !== null);
      for (const enemy of enemies) {
        const p = this.point(enemy.x, enemy.y), radius = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
        const indicator = indicatorById.get(enemy.id)!;
        if (Math.abs(indicator.x + indicator.width / 2 - p.x) > 1 || Math.abs(indicator.y - (p.y - radius - 14)) > 1) {
          g.lineStyle(1, 0xb4cec7, .6);
          g.lineBetween(p.x, p.y - radius, indicator.x + indicator.width / 2, indicator.y + indicator.height);
        }
      }
      // Health and armor must remain above every world object and feedback mark.
      if (battle) this.drawBlockedLabels(enemies, config, battle, indicators);
      if (battle?.boss && battle.boss.health > 0 && config.boss) {
        const tipRequests: IndicatorRequest[] = [];
        for (const tentacle of battle.boss.tentacles) {
          present.add(tentacle.id);
          let label = this.labels.get(tentacle.id);
          if (!label) { label = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', color: '#e8d9ff', backgroundColor: '#182534', padding: { x: 3, y: 2 } }).setOrigin(.5, 0).setDepth(5); this.labels.set(tentacle.id, label); }
          const p = this.point(tentacle.x, tentacle.y), r = Math.max(9, config.boss.radius * this.unit);
          const status = tentacleStatus(tentacle, battle, config);
          const number = battle.boss.tentacles.indexOf(tentacle) + 1;
          const caption = status.startsWith('ОГЛУШЕНО') ? 'ОГЛУШЕНО' : status.includes('атака остановлена') ? 'СТОП АТАКИ' : status.startsWith('В СВЕТЕ') ? 'ЗАМЕДЛЕНО' : status;
          label.setText(translate(`${number} · ${caption}`, resolveLanguage(view.settings.language, undefined, navigator.languages))).setFontSize(view.settings.textSize === 'large' ? 13 : 10);
          tipRequests.push({ id: tentacle.id, x: p.x - label.width / 2, y: p.y - r - label.height - 3, width: label.width, height: label.height });
        }
        const textBounds = [...this.labels.entries()].filter(([id, label]) => id > 0 && label.visible).map(([, label]) => ({ x: label.x - label.width / 2, y: label.y, width: label.width, height: label.height }));
        const mapCaptions = [{ x: 0, y: 0, width: w, height: 36 }, { x: 0, y: h - 24, width: w, height: 24 }];
        const tipIndicators = layoutIndicators(tipRequests, { width: w, height: h }, bodies, [...indicators, ...deviceBars, ...textBounds, ...mapCaptions]);
        for (const indicator of tipIndicators) {
          const label = this.labels.get(indicator.id)!;
          const tip = battle.boss.tentacles.find(entry => entry.id === indicator.id)!;
          const p = this.point(tip.x, tip.y);
          label.setPosition(indicator.x + indicator.width / 2, indicator.y).setVisible(true);
          g.lineStyle(1, 0xc9b1e5, .6);
          g.lineBetween(p.x, p.y, indicator.x + indicator.width / 2, indicator.y + indicator.height);
        }
      }
      for (const device of battle?.devices ?? []) this.drawDeviceIndicators(device, config);
      for (const enemy of enemies) this.drawEnemyIndicators(enemy, config, indicatorById.get(enemy.id)!);
      for (const [id, label] of this.labels) if (!present.has(id)) { label.destroy(); this.labels.delete(id); }
    }
    private drawMortar(config: NightConfig, battle: Readonly<BattleState>): void {
      const g = this.ink;
      for (const projectile of battle.mortarProjectiles) {
        const destination = this.point(projectile.x, projectile.y), radius = projectile.blastRadius * this.unit;
        // Thin landing zone stays behind health strips; the shell follows simulation ticks.
        g.lineStyle(1.5,0xe8a471,.5); g.strokeEllipse(destination.x,destination.y,radius*2,radius*(WORLD_PROJECTION_Y*2));
        g.lineBetween(destination.x-4,destination.y,destination.x+4,destination.y);
        g.lineBetween(destination.x,destination.y-3,destination.x,destination.y+3);
        const flight = mortarFlight(projectile,battle.tick), p = this.point(flight.x,flight.y);
        g.fillStyle(0x061d25,.6); g.fillEllipse(p.x,p.y,7,3);
        g.lineStyle(1,0xe8a471,.4); g.lineBetween(p.x,p.y,p.x,p.y-flight.lift*this.unit);
        g.fillStyle(0xffd6a0); g.fillCircle(p.x,p.y-flight.lift*this.unit,Math.max(3,5*this.unit));
      }
      for (const event of battle.events) {
        const age = (battle.tick-event.tick)*config.stepSeconds;
        if (event.type === 'device-repaired' && age >= 0 && age <= .65) {
          const source = battle.devices.find(device => device.id === event.sourceId);
          const p = this.point(event.x,event.y);
          if (source) { const from = this.point(source.x,source.y); g.lineStyle(event.emergency ? 2 : 1,0xa9edbb,.6*(1-age/.65)); g.lineBetween(from.x,from.y,p.x,p.y); }
          g.lineStyle(1.5,0xb9f3cb,.8*(1-age/.65)); g.strokeEllipse(p.x,p.y,(18+age*12)*this.unit,(12+age*8)*this.unit);
        }
        if (event.type === 'bell-pulse' && age >= 0 && age <= .65) {
          const p = this.point(event.x,event.y), radius = event.radius*this.unit*Math.min(1,age/.4);
          g.lineStyle(2,0x8fe4ca,.8*(1-age/.65)); g.strokeEllipse(p.x,p.y,radius*2,radius*(WORLD_PROJECTION_Y*2));
        }
        if(event.type !== 'mortar-impact' || age < 0 || age > .45) continue;
        const p = this.point(event.x,event.y), radius = event.radius*this.unit;
        g.fillStyle(0xe49c67,.12*(1-age/.45)); g.fillEllipse(p.x,p.y,radius*2,radius*(WORLD_PROJECTION_Y*2));
        g.lineStyle(2,0xf2bb85,.8*(1-age/.45)); g.strokeEllipse(p.x,p.y,radius*2,radius*(WORLD_PROJECTION_Y*2));
      }
    }
    private drawBoss(config: NightConfig, battle: Readonly<BattleState>): void {
      const boss = battle.boss, rules = config.boss;
      if (!boss || !rules || boss.health <= 0) return;
      const g = this.ink, stunned = boss.stunnedUntilTick > battle.tick;
      // The distant body is decoration; only the outlined tentacle tips are hit zones.
      const body = this.point(config.worldRadius * .75, 0), br = Math.max(18, 38 * this.unit);
      g.fillStyle(0x493e67, .95); g.fillEllipse(body.x, body.y, br * 2, br * 1.5);
      if ((boss.burn?.remainingTicks ?? 0) > 0) { g.lineStyle(2,0xc8865b,.7); g.strokeEllipse(body.x,body.y,br*2.3,br*1.8); }
      g.lineStyle(2, 0xb4a0df, .8); g.strokeEllipse(body.x, body.y, br * 2, br * 1.5);
      g.fillStyle(0xe8c894); g.fillEllipse(body.x - br * .3, body.y - br * .2, br * .18, br * .3); g.fillEllipse(body.x + br * .3, body.y - br * .2, br * .18, br * .3);
      for (const tip of boss.tentacles) {
        const p = this.point(tip.x, tip.y), r = Math.max(9, rules.radius * this.unit), lit = battle.litTentacleIds.includes(tip.id), blocked = battle.blockedTentacleIds.includes(tip.id);
        g.lineStyle(Math.max(4, r * .75), 0x8670ab, .72); g.lineBetween(body.x, body.y, p.x, p.y);
        g.fillStyle(lit ? 0xf4d393 : 0x9e8bbf); g.fillEllipse(p.x, p.y, r * 2, r * 1.65);
        g.lineStyle(2.5, stunned ? 0xd7c2ff : lit ? 0xffda83 : 0xc5b1ed); g.strokeEllipse(p.x, p.y, r * 2.6, r * 2.2);
        g.fillStyle(0x382c51); for (let i = -1; i <= 1; i++) g.fillCircle(p.x + i * r * .45, p.y, Math.max(2, r * .16));
        if (bellSlowStatus(tip, battle.tick, battle.devices)) { g.lineStyle(1.5,0x8fe4ca,.85); g.strokeEllipse(p.x,p.y+r*.7,r*3,r*.8); }
        if (blocked) { g.lineStyle(2, 0xc2d2d5); g.lineBetween(p.x-r*.5,p.y-r*.5,p.x+r*.5,p.y+r*.5); g.lineBetween(p.x+r*.5,p.y-r*.5,p.x-r*.5,p.y+r*.5); }
        if (stunned) { g.lineStyle(2, 0xd7c2ff); g.lineBetween(p.x-4,p.y-r-3,p.x+4,p.y-r-3); }
        if (battle.devices.some(device => device.targetId === tip.id)) { g.lineStyle(2, 0x9feaff); g.strokeRect(p.x-r-4,p.y-r-3,r*2+8,r*2+6); }
      }
    }
    private drawShip(config: NightConfig, battle: Readonly<BattleState>): void {
      const ship = battle.ship;
      if (!ship) return;
      const g = this.ink, p = this.point(ship.x, ship.y), r = Math.max(10, ship.radius * this.unit);
      const color = ship.status === 'rescued' ? 0x8de3ac : ship.status === 'lost' ? 0x7c8588 : ship.lit ? 0xffdd8d : 0xf0a56f;
      g.fillStyle(0x0a202c); g.fillEllipse(p.x, p.y, r * 2.8, r * 2.3);
      g.lineStyle(2, color); g.strokeEllipse(p.x, p.y, r * 2.8, r * 2.3);
      g.fillStyle(color); g.fillTriangle(p.x - r, p.y, p.x + r, p.y, p.x + r * .4, p.y + r * .65);
      g.lineBetween(p.x, p.y, p.x, p.y - r); g.fillTriangle(p.x - 2, p.y - r, p.x - 2, p.y - 2, p.x - r * .8, p.y - 2);
      const width = r * 2.8;
      g.fillStyle(0x071a20); g.fillRect(p.x - width / 2, p.y + r + 4, width, 6);
      g.fillStyle(color); g.fillRect(p.x - width / 2, p.y + r + 4, width * Math.min(1, ship.progress / (config.ship?.rescueSeconds ?? 1)), 6);
    }
    private drawDevice(device: DeviceState, config: NightConfig, battle: Readonly<BattleState>): void {
      const g = this.ink, definition = config.devices.definitions[device.kind];
      const p = this.point(device.x, device.y), r = Math.max(5, definition.radius * this.unit);
      if (chapterAssets && battleWorldContext) {
        if (device.health > 0 && !device.consumed && device.lastShot && (battle.tick - device.lastShot.tick) * config.stepSeconds < .16) {
          const hit = this.point(device.lastShot.x, device.lastShot.y);
          g.lineStyle(2, device.kind === 'harpoon' ? 0x91f2ff : 0xffdf98, .9);
          g.lineBetween(p.x, p.y, hit.x, hit.y);
          g.fillStyle(0xffedb5); g.fillCircle(p.x, p.y, 3);
        }
        return;
      }
      if (device.consumed && device.health > 0) {
        g.lineStyle(1.5, 0xbab3db, .55); g.strokeCircle(p.x, p.y, r * .7);
        g.lineBetween(p.x - r * .5, p.y, p.x + r * .5, p.y);
        return;
      }
      if (device.health <= 0) {
        g.fillStyle(0x7c8173, .65);
        g.fillTriangle(p.x - r, p.y + r * .3, p.x - r * .2, p.y - r * .4, p.x, p.y + r * .5);
        g.fillRect(p.x + r * .25, p.y - r * .1, r * .6, r * .35);
        return;
      }
      g.fillStyle(0x051e22, .5); g.fillEllipse(p.x + 2, p.y + r * .6, r * 2.5, r);
      if (device.kind === 'generator') {
        g.fillStyle(0x7fcfe2); g.fillTriangle(p.x, p.y - r, p.x - r, p.y, p.x, p.y + r);
        g.fillTriangle(p.x, p.y - r, p.x + r, p.y, p.x, p.y + r);
        g.lineStyle(2, 0xe4f7ff); g.strokeCircle(p.x, p.y, r * .45);
      } else if (device.kind === 'light-trap') {
        g.lineStyle(2, 0xd4b4ff); g.strokeCircle(p.x, p.y, r);
        g.lineBetween(p.x - r, p.y, p.x + r, p.y); g.lineBetween(p.x, p.y - r, p.x, p.y + r);
      } else if (device.kind === 'barrier') {
        g.fillStyle(0x9eafa0); g.fillRoundedRect(p.x - r, p.y - r * .45, r * 2, r * .9, 2);
        g.lineStyle(1, 0x395a53); g.lineBetween(p.x, p.y - r * .45, p.x, p.y + r * .45);
      } else if (device.kind === 'repair-lamp') {
        g.fillStyle(0x8fd6b1); g.fillRoundedRect(p.x-r*.65,p.y-r*.8,r*1.3,r*1.6,3);
        g.lineStyle(2,0xe4ffe9); g.lineBetween(p.x-r*.4,p.y,p.x+r*.4,p.y); g.lineBetween(p.x,p.y-r*.4,p.x,p.y+r*.4);
        for (let i=0;i<(device.repairCharges ?? 0);i++) { g.fillStyle(0xb9f3cb); g.fillCircle(p.x+(i-((device.repairCharges ?? 0)-1)/2)*5,p.y-r-5,1.5); }
      } else if (device.kind === 'bell') {
        g.fillStyle(0xd5b887); g.fillTriangle(p.x,p.y-r,p.x-r,p.y+r*.5,p.x+r,p.y+r*.5);
        g.fillEllipse(p.x,p.y+r*.5,r*2.2,r*.6); g.fillCircle(p.x,p.y+r*.9,r*.2);
        g.lineStyle(1.5,0xffe5ad); g.strokeCircle(p.x,p.y-r,r*.2);
      } else if (device.kind === 'mortar') {
        g.fillStyle(0xa56e50); g.fillEllipse(p.x, p.y+r*.35, r*2.1, r*1.2);
        g.lineStyle(Math.max(5,r*.9),0xdcab7c); g.lineBetween(p.x,p.y+r*.2,p.x+r*.35,p.y-r*.9);
        g.fillStyle(0x182b30); g.fillEllipse(p.x+r*.35,p.y-r*.9,r*.85,r*.5);
        g.lineStyle(1,0xf1d4aa); g.strokeEllipse(p.x+r*.35,p.y-r*.9,r*.85,r*.5);
      } else if (device.kind === 'harpoon') {
        // Turquoise fork and thin tether distinguish the harpoon from the cannon.
        g.fillStyle(0x5bbbc9); g.fillRoundedRect(p.x-r*.7, p.y-r*.6, r*1.4, r*1.2, 2);
        const angle = device.lastShot ? Math.atan2(device.lastShot.y-device.y, device.lastShot.x-device.x) : -Math.PI/2;
        const end = this.point(device.x+Math.cos(angle)*definition.radius*1.8, device.y+Math.sin(angle)*definition.radius*1.8);
        const dx = end.x-p.x, dy = end.y-p.y, length = Math.max(1, Math.hypot(dx,dy));
        const nx = -dy/length*r*.45, ny = dx/length*r*.45;
        g.lineStyle(2,0xd4faff); g.lineBetween(p.x,p.y,end.x,end.y);
        g.lineBetween(end.x,end.y,end.x-dx*.35+nx,end.y-dy*.35+ny);
        g.lineBetween(end.x,end.y,end.x-dx*.35-nx,end.y-dy*.35-ny);
        if (device.lastShot && (battle.tick-device.lastShot.tick)*config.stepSeconds < .2) {
          const hit = this.point(device.lastShot.x,device.lastShot.y);
          g.lineStyle(1.5,0x91f2ff,.9); g.lineBetween(end.x,end.y,hit.x,hit.y);
          g.strokeCircle(hit.x,hit.y,4);
        }
      } else {
        g.fillStyle(0xd3b67d); g.fillCircle(p.x, p.y, r * .8);
        const angle = device.lastShot ? Math.atan2(device.lastShot.y - device.y, device.lastShot.x - device.x) : -Math.PI / 2;
        const end = this.point(device.x + Math.cos(angle) * definition.radius * 1.4, device.y + Math.sin(angle) * definition.radius * 1.4);
        g.lineStyle(Math.max(3, r * .65), 0x779c9d); g.lineBetween(p.x, p.y, end.x, end.y);
        if (device.lastShot && (battle.tick - device.lastShot.tick) * config.stepSeconds < .14) {
          const hit = this.point(device.lastShot.x, device.lastShot.y);
          g.lineStyle(2, 0xffdf98, .85); g.lineBetween(end.x, end.y, hit.x, hit.y);
          g.fillStyle(0xffedb5); g.fillCircle(end.x, end.y, 3);
        }
      }
    }
    private drawDeviceSilhouettes(config: NightConfig, battle: Readonly<BattleState> | null): void {
      if (chapterAssets && battleWorldContext) return;
      const g = this.ink, towerRadius = Math.max(12, config.lighthouseRadius * this.unit);
      for (const device of battle?.devices ?? []) {
        const p = this.point(device.x, device.y);
        const r = Math.max(5, config.devices.definitions[device.kind].radius * this.unit);
        if (device.y > 0 || Math.abs(p.x - this.cx) >= towerRadius * 1.15 + r ||
          p.y + r <= this.cy - towerRadius * 4 || p.y - r >= this.cy) continue;
        // Only a compact outline is restored above the tower. Enemies are drawn
        // after this pass, so revealing a device never conceals a threat.
        g.lineStyle(2, device.health <= 0 ? 0xe2a58c : 0xb8f1dc, .95);
        if (device.health <= 0) {
          g.strokeTriangle(p.x - r, p.y + r * .3, p.x - r * .2, p.y - r * .4, p.x, p.y + r * .5);
          g.lineBetween(p.x + r * .15, p.y - r * .15, p.x + r * .85, p.y + r * .3);
        } else if (device.kind === 'barrier') {
          g.strokeRoundedRect(p.x - r, p.y - r * .45, r * 2, r * .9, 2);
          g.lineBetween(p.x, p.y - r * .45, p.x, p.y + r * .45);
        } else {
          g.strokeCircle(p.x, p.y, r * .8);
          g.lineBetween(p.x, p.y, p.x, p.y - r * 1.4);
        }
      }
    }
    private drawDeviceIndicators(device: DeviceState, config: NightConfig): void {
      if (device.health <= 0 || device.consumed) return;
      const g = this.ink, definition = config.devices.definitions[device.kind];
      const p = this.point(device.x, device.y), r = Math.max(5, definition.radius * this.unit);
      const style = battleBarStyle(false, application.view.settings.textSize === 'large', r * 2, true);
      const width = style.width - style.padding * 2, x = p.x - style.width / 2, y = p.y + r + 3;
      g.fillStyle(0x040e15, 1); g.fillRect(x, y, style.width, style.height);
      g.fillStyle(0x284b39); g.fillRect(x + style.padding, y + style.padding, width, style.fillHeight);
      g.fillStyle(device.health < definition.health * .3 ? 0xff9b78 : 0xa1d99d);
      g.fillRect(x + style.padding, y + style.padding, width * clampBarFraction(device.health, definition.health), style.fillHeight);
      const ceiling = (device.startHealth ?? device.health) / definition.health;
      if (ceiling < 1) { g.lineStyle(1,0xe6ddaf,.9); const markX=x+style.padding+width*ceiling; g.lineBetween(markX,y,markX,y+style.height); }
    }
    private drawBeam(config: NightConfig, angle: number): void {
      const g = this.ink;
      // The geometric fallback uses the same soft light, with longitudinal
      // slices in place of Canvas gradients. This is decorative, not a hitbox.
      if (!(chapterAssets && battleWorldContext) && this.camera) {
        const lift = Math.max(12, config.lighthouseRadius * this.unit) * 3.1;
        const { bands } = beamLightGeometry(this.camera, config.beam, angle, { x: this.cx, y: this.cy - lift });
        const lerp = (from: {x:number;y:number}, to: {x:number;y:number}, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
        for (const band of bands) for (let index = 0; index < 24; index++) {
          const start = index / 24, end = (index + 1) / 24, middle = (start + end) / 2;
          const stop = BEAM_LIGHT_STOPS.findIndex(([position]) => position > middle);
          const before = BEAM_LIGHT_STOPS[stop - 1]!, after = BEAM_LIGHT_STOPS[stop]!;
          const strength = before[1] + (after[1] - before[1]) * (middle - before[0]) / (after[0] - before[0]);
          g.fillStyle(0xffd382, band.opacity * strength);
          g.fillPoints([lerp(band.points[0], band.points[1], start), lerp(band.points[0], band.points[1], end), lerp(band.points[3], band.points[2], end), lerp(band.points[3], band.points[2], start)], true);
        }
      }
      for (let i = 0; i < 100; i += 2) {
        const a = i / 100 * TAU, b = (i + .75) / 100 * TAU;
        const p = this.point(Math.cos(a) * config.beam.range, Math.sin(a) * config.beam.range);
        const q = this.point(Math.cos(b) * config.beam.range, Math.sin(b) * config.beam.range);
        g.lineStyle(1.5, 0xe9bf6c, .68); g.lineBetween(p.x, p.y, q.x, q.y);
      }
    }
    /** Cool dashed guide and hollow diamond distinguish intent from the warm damaging beam. */
    private drawAim(config: NightConfig, angle: number): void {
      const g = this.ink, radius = config.beam.range;
      const end = this.point(Math.cos(angle) * radius, Math.sin(angle) * radius);
      g.lineStyle(1, 0x9ce8f4, .6);
      // Start outside the tower. Dashes remain constant in screen pixels on phones.
      const length = Math.hypot(end.x - this.cx, end.y - this.cy);
      if (!(chapterAssets && battleWorldContext)) {
        for (let distance = Math.max(28, config.lighthouseRadius * this.unit * 1.4); distance < length - 10; distance += 14) {
          const from = distance / length, to = Math.min(distance + 6, length - 10) / length;
          g.lineBetween(this.cx + (end.x - this.cx) * from, this.cy + (end.y - this.cy) * from,
            this.cx + (end.x - this.cx) * to, this.cy + (end.y - this.cy) * to);
        }
      }
      const diamond = [{ x: end.x, y: end.y - 7 }, { x: end.x + 6, y: end.y },
        { x: end.x, y: end.y + 7 }, { x: end.x - 6, y: end.y }];
      g.lineStyle(4, 0x071f25, .95); g.strokePoints(diamond, true);
      g.lineStyle(2, 0x9ce8f4, 1); g.strokePoints(diamond, true);
    }
    private drawLighthouse(config: NightConfig, battle: Readonly<BattleState> | null): void {
      if (chapterAssets && battleWorldContext) return;
      const g = this.ink, x = this.cx, y = this.cy, s = this.unit;
      const r = Math.max(12, config.lighthouseRadius * s);
      const damaged = battle && battle.lighthouseHealth < config.lighthouseHealth * .3;
      g.fillStyle(0x071f25, .5); g.fillEllipse(x + r * .6, y + r * .3, r * 3.5, r * 1.3);
      g.fillStyle(0x61746b); g.fillEllipse(x, y + 3 * s, r * 2.3, r * 1.5);
      g.fillStyle(damaged ? 0xb68e7f : 0xded5b7); g.fillPoints([{ x: x - r * .65, y }, { x: x + r * .65, y }, { x: x + r * .42, y: y - r * 2.8 }, { x: x - r * .42, y: y - r * 2.8 }], true);
      g.fillStyle(0xa4a890); g.fillPoints([{ x, y }, { x: x + r * .65, y }, { x: x + r * .42, y: y - r * 2.8 }, { x, y: y - r * 2.8 }], true);
      g.fillStyle(0x344c4c); g.fillRect(x - r * .68, y - r * 2.85, r * 1.36, r * .17);
      g.fillStyle(0xffce73, .15); g.fillCircle(x, y - r * 3.1, r * 1.1);
      g.fillStyle(0xffdc92); g.fillRect(x - r * .4, y - r * 3.4, r * .8, r * .52);
      g.fillStyle(0x263e43); g.fillTriangle(x - r * .7, y - r * 3.45, x + r * .7, y - r * 3.45, x, y - r * 4);
      g.fillStyle(0x243c3b); g.fillRoundedRect(x - r * .17, y - r * .6, r * .34, r * .65, r * .12);
    }
    private enemyBody(enemy: EnemyState, config: NightConfig): { x: number; y: number; width: number; height: number } {
      if (battleArtwork && chapterAssets && battleWorldContext && this.camera) return battleEnemyBounds(enemy, config, this.camera);
      const p = this.point(enemy.x, enemy.y), radius = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
      return { x: p.x - radius * 1.3, y: p.y - radius * 1.2, width: radius * 2.6, height: radius * 2.5 };
    }
    private drawEnemy(enemy: EnemyState, config: NightConfig, battle: Readonly<BattleState>): void {
      const g = this.ink, definition = config.enemies[enemy.kind];
      const p = this.point(enemy.x, enemy.y), r = Math.max(7, definition.radius * this.unit);
      const lit = battle.litEnemyIds.includes(enemy.id);
      if ((enemy.stunnedUntilTick ?? 0) > battle.tick) {
        g.lineStyle(2, 0xc9b4ff, .95); g.strokeEllipse(p.x, p.y, r * 3.2, r * 2.7);
        g.lineBetween(p.x - 4, p.y - r - 4, p.x + 4, p.y - r - 4);
      }
      if (battle.devices.some((device) => device.targetId === enemy.id)) {
        g.lineStyle(2, 0x9feaff); g.strokeRect(p.x - r - 4, p.y - r - 3, r * 2 + 8, r * 2 + 6);
      }
      g.fillStyle(0x04191c, .5); g.fillEllipse(p.x + 2, p.y + r * .6, r * 2.4, r * .8);
      if ((enemy.burn?.remainingTicks ?? 0) > 0) { g.lineStyle(1.5,0xc8865b,.7); g.strokeEllipse(p.x,p.y+r*.5,r*2.5,r*.65); g.fillStyle(0xe5a16b,.8); g.fillCircle(p.x+r,p.y+r*.25,2); }
      if (bellSlowStatus(enemy, battle.tick, battle.devices)) { g.lineStyle(1.5,0x8fe4ca,.85); g.strokeEllipse(p.x,p.y+r*.7,r*3,r*.8); }
      if (lit) {
        const body = this.enemyBody(enemy, config);
        g.lineStyle(1.5, 0xffdf8e, .95);
        const y = body.y + body.height * .6;
        g.lineBetween(body.x - 3, y, body.x - 3, y + 7);
        g.lineBetween(body.x - 3, y + 7, body.x + 3, y + 7);
        g.lineBetween(body.x + body.width + 3, y, body.x + body.width + 3, y + 7);
        g.lineBetween(body.x + body.width + 3, y + 7, body.x + body.width - 3, y + 7);
      }
      if (battleArtwork && chapterAssets && battleWorldContext && this.camera) {
        paintBattleEnemy(battleWorldContext, battleArtwork, enemy, config, battle, this.camera);
        if (enemy.kind === 'minotaur' && (enemy.chargePhase === 'windup' || enemy.chargePhase === 'charging')) {
          const body = this.enemyBody(enemy, config), x = body.x + body.width + 4, y = body.y + body.height * .4;
          g.lineStyle(2, enemy.chargePhase === 'charging' ? 0xff7955 : 0xffb16e, 1);
          for (let i = 0; i < 2; i++) { const dx = i * 5; g.lineBetween(x+dx,y-4,x+dx+4,y); g.lineBetween(x+dx+4,y,x+dx,y+4); }
        }
        return;
      }
      if (enemy.kind === 'ghost') {
        g.lineStyle(3, 0x09212b, 1); g.strokeCircle(p.x, p.y - r * .25, r * .8);
        g.fillStyle(lit ? 0xffedb5 : 0xc3e6de, .92);
        g.fillCircle(p.x, p.y - r * .25, r * .8);
        const hem = [{ x: p.x - r * .8, y: p.y - r * .2 }, { x: p.x + r * .8, y: p.y - r * .2 }, { x: p.x + r, y: p.y + r }, { x: p.x + r * .3, y: p.y + r * .65 }, { x: p.x, y: p.y + r }, { x: p.x - r * .35, y: p.y + r * .65 }, { x: p.x - r, y: p.y + r }];
        g.strokePoints(hem, true); g.fillPoints(hem, true);
        g.fillStyle(0x163d42); g.fillEllipse(p.x - r * .26, p.y - r * .2, r * .2, r * .32); g.fillEllipse(p.x + r * .26, p.y - r * .2, r * .2, r * .32);
      } else if (enemy.kind === 'bat') {
        const flap = Math.sin(battle.tick * config.stepSeconds * 18) * r * .22;
        g.fillStyle(lit ? 0xffdfaa : 0xc6a9e9); g.lineStyle(2, 0x102630);
        const wings = [{x:p.x,y:p.y-r*.3},{x:p.x-r*1.8,y:p.y-r*.8+flap},{x:p.x-r*1.2,y:p.y+r*.5},{x:p.x-r*.5,y:p.y},{x:p.x,y:p.y+r*.4},{x:p.x+r*.5,y:p.y},{x:p.x+r*1.2,y:p.y+r*.5},{x:p.x+r*1.8,y:p.y-r*.8+flap}];
        g.fillPoints(wings,true); g.strokePoints(wings,true); g.fillCircle(p.x,p.y-r*.2,r*.4);
        g.fillTriangle(p.x-r*.4,p.y-r*.2,p.x-r*.35,p.y-r*.9,p.x,p.y-r*.2);
        g.fillTriangle(p.x+r*.4,p.y-r*.2,p.x+r*.35,p.y-r*.9,p.x,p.y-r*.2);
      } else if (enemy.kind === 'minotaur') {
        const charging = enemy.chargePhase === 'charging', windup = enemy.chargePhase === 'windup';
        g.fillStyle(charging ? 0xf4845c : windup ? 0xf4bf6b : 0xb58262);
        g.fillRoundedRect(p.x-r*.7,p.y-r*.4,r*1.4,r*1.5,3); g.fillCircle(p.x,p.y-r*.45,r*.65);
        g.lineStyle(3,0xf0dbb2); g.lineBetween(p.x-r*.5,p.y-r*.5,p.x-r,p.y-r*1.2);g.lineBetween(p.x+r*.5,p.y-r*.5,p.x+r,p.y-r*1.2);
        g.lineStyle(3,0x623e32);g.lineBetween(p.x-r*.4,p.y+r*.7,p.x-r*.5,p.y+r*1.3);g.lineBetween(p.x+r*.4,p.y+r*.7,p.x+r*.5,p.y+r*1.3);
        if(windup || charging) {
          g.lineStyle(2,charging ? 0xff7955 : 0xffd16e);g.strokeEllipse(p.x,p.y,r*3.2,r*2.8);
          const a=Math.atan2(-enemy.y,-enemy.x),tip=this.point(enemy.x+Math.cos(a)*70,enemy.y+Math.sin(a)*70);
          g.lineBetween(p.x,p.y,tip.x,tip.y);g.strokeTriangle(tip.x,tip.y,tip.x-Math.cos(a-.6)*10,tip.y-Math.sin(a-.6)*8,tip.x-Math.cos(a+.6)*10,tip.y-Math.sin(a+.6)*8);
        }
      } else {
        const angle = Math.atan2(-enemy.y, -enemy.x);
        g.fillStyle(0x9c9980);
        for (const dx of [-.65, .65]) for (const dy of [-.55, .55]) g.fillEllipse(p.x + r * dx, p.y + r * dy, r * .65, r * .5);
        g.fillCircle(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r * WORLD_PROJECTION_Y, r * .42);
        g.fillStyle(enemy.armor > 0 ? (lit ? 0xc8b570 : 0x829c8a) : 0x907568); g.fillEllipse(p.x, p.y, r * 1.9, r * 1.5);
        g.lineStyle(2, 0x09212b); g.strokeEllipse(p.x, p.y, r * 1.9, r * 1.5);
        g.strokeTriangle(p.x, p.y - r * .6, p.x - r * .55, p.y + r * .32, p.x + r * .55, p.y + r * .32);
      }
    }
    private drawEnemyIndicators(enemy: EnemyState, config: NightConfig, indicator: IndicatorRequest): void {
      const g = this.ink, definition = config.enemies[enemy.kind];
      const style = battleBarStyle(definition.armor > 0, application.view.settings.textSize === 'large');
      const barWidth = indicator.width - style.padding * 2, barX = indicator.x + style.padding, barY = indicator.y + style.padding;
      g.fillStyle(0x040e15, 1); g.fillRect(indicator.x, indicator.y, indicator.width, indicator.height);
      // Armor sits above health, with a black gap; depletion never removes its track.
      const healthY = barY + (definition.armor > 0 ? style.fillHeight + style.gap : 0);
      g.fillStyle(0x5a272d); g.fillRect(barX, healthY, barWidth, style.fillHeight);
      g.fillStyle(0xf27369); g.fillRect(barX, healthY, barWidth * clampBarFraction(enemy.health, definition.health), style.fillHeight);
      if (definition.armor > 0) {
        g.fillStyle(0x294653); g.fillRect(barX, barY, barWidth, style.fillHeight);
        g.fillStyle(0x9edff2); g.fillRect(barX, barY, barWidth * clampBarFraction(enemy.armor, definition.armor), style.fillHeight);
      }
    }
    private drawBlockedLabels(enemies: readonly EnemyState[], config: NightConfig, battle: Readonly<BattleState>, indicators: readonly IndicatorRequest[]): void {
      type Bounds = { x: number; y: number; width: number; height: number };
      const obstacles: Bounds[] = enemies.map((enemy) => {
        const p = this.point(enemy.x, enemy.y), r = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
        return { x: p.x - r * 1.4, y: p.y - r * 1.2, width: r * 2.8, height: r * 2.5 };
      });
      if (battle.ship) { const p = this.point(battle.ship.x,battle.ship.y), r = Math.max(10,battle.ship.radius*this.unit); obstacles.push({x:p.x-r*1.4,y:p.y-r*1.2,width:r*2.8,height:r*2.6+10}); }
      for (const tip of battle.boss?.health && battle.boss.health > 0 ? battle.boss.tentacles : []) { const p = this.point(tip.x, tip.y), r = Math.max(9, (config.boss?.radius ?? 16) * this.unit); obstacles.push({ x: p.x-r*1.3, y: p.y-r*1.2, width: r*2.6, height: r*2.4 }); }
      obstacles.push(...indicators);
      const tower = Math.max(12, config.lighthouseRadius * this.unit);
      obstacles.push({ x: this.cx - tower * 1.2, y: this.cy - tower * 4.1, width: tower * 2.4, height: tower * 4.8 });
      for (const device of battle.devices) {
        const p = this.point(device.x, device.y), r = Math.max(5, config.devices.definitions[device.kind].radius * this.unit);
        obstacles.push({ x: p.x - r * 1.5 - 3, y: p.y - r * 1.5 - 3, width: r * 3 + 6, height: r * 3 + 14 });
      }
      for (const label of this.labels.values()) label.setVisible(false);
      for (const enemy of enemies) {
        const blocked = battle.blockedEnemyIds.includes(enemy.id);
        const burning = (enemy.burn?.remainingTicks ?? 0) > 0;
        const threat = [enemyThreat(enemy), bellSlowStatus(enemy, battle.tick, battle.devices), burning ? 'ТЛЕЕТ' : ''].filter(Boolean).join(' · ');
        if (!blocked && !threat) continue;
        const p = this.point(enemy.x, enemy.y), r = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
        let label = this.labels.get(enemy.id);
        if (!label) {
          label = this.add.text(0, 0, 'ПЕРЕКРЫТ', { fontFamily: 'Arial, sans-serif', color: '#c2d2d5', backgroundColor: '#10292e', padding: { x: 3, y: 2 } }).setOrigin(.5, 0).setDepth(5);
          this.labels.set(enemy.id, label);
        }
        label.setText(translate([blocked ? 'ПЕРЕКРЫТ' : '', threat].filter(Boolean).join(' · '), resolveLanguage(application.view.settings.language, undefined, navigator.languages)));
        label.setFontSize(application.view.settings.textSize === 'large' ? 13 : 10);
        const width = label.width, height = label.height;
        // Stable ordering and three nearby rows. Reject candidates covering any
        // silhouette, health strip, device, tower or already placed label.
        let placed = false;
        for (let row = 0; row < 3 && !placed; row++) {
          for (const shift of [0, -1, 1]) {
            const x = Math.max(4, Math.min(this.scale.width - width - 4, p.x - width / 2 + shift * (width / 2 + r + 4)));
            const y = p.y + r + 7 + row * (height + 4);
            const candidate = { x, y, width, height };
            if (y + height > this.scale.height - 4 || obstacles.some((o) => x < o.x + o.width + 3 && x + width + 3 > o.x && y < o.y + o.height + 3 && y + height + 3 > o.y)) continue;
            label.setPosition(x + width / 2, y).setVisible(true);
            obstacles.push(candidate); placed = true; break;
          }
        }
        // Dense groups retain a compact reason marker when text has no safe room.
        if (!placed) {
          const markerX = p.x + r + 5, markerY = p.y;
          this.ink.fillStyle(0x081b23); this.ink.fillCircle(markerX, markerY, 4);
          this.ink.lineStyle(1.5, 0xc2d2d5);
          this.ink.lineBetween(markerX - 2, markerY - 2, markerX + 2, markerY + 2);
          this.ink.lineBetween(markerX + 2, markerY - 2, markerX - 2, markerY + 2);
        }
      }
    }
  }

  // Explicit host sizing avoids RESIZE mode overwriting resize() with its
  // cached parent size when a screen transition changes layout within a frame.
  // Before the first HUD layout the hidden coast can have zero height. WebGL
  // allocates render targets during boot and cannot create a 0px framebuffer.
  // Use a valid bootstrap size; syncViewport fits the real field once visible.
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: canvasHost, backgroundColor: '#0a1b26', transparent: true, antialias: false, scale: { mode: Phaser.Scale.NONE, width: Math.max(1, canvasHost.clientWidth), height: Math.max(1, canvasHost.clientHeight) }, scene: CoastScene, input: { activePointers: 2 }, audio: { noAudio: true }, banner: false });
  const resize = new ResizeObserver(() => { treeControls.resize(); if (game.isBooted) syncViewport(game.scale); layoutReferenceMenu(overlay); layoutReferenceSettings(overlay, application.view); layoutGameMenu(overlay, application.view); layoutSharedScenery(); settingsTransition.sync(); gameMenuTransition.sync(); });
  resize.observe(canvasHost);
  resize.observe(shell);
  const placementPoint = (map: SVGSVGElement, x: number, y: number): DOMPoint | null => {
    const matrix = map.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : null;
  };
  const placementMove = (event: PointerEvent): void => {
    if (application.view.screen !== 'preparation' || application.view.error) return;
    const map = (event.target as Element).closest<SVGSVGElement>('[data-placement-map]');
    if (!map) return;
    const point = placementPoint(map, event.clientX, event.clientY);
    if (point) { application.previewPlacement(point.x, point.y); renderPlacementPreview(overlay, application.view); }
  };
  function inspectDevice(id: number): void {
    selectedDevice = id; choosingTarget = false; targetNotice = ''; rememberedTarget = null; pendingTarget = null;
    const access = root.querySelector<HTMLDetailsElement>('.battle-device-access');
    if (access) access.open = false;
  }
  function closeDevice(): void {
    const id = selectedDevice;
    selectedDevice = null; choosingTarget = false; rememberedTarget = null; pendingTarget = null; targetNotice = '';
    const access = root.querySelector<HTMLDetailsElement>('.battle-device-access');
    if (access) access.open = false;
    renderHud(application.view);
    const returnControl = root.querySelector<HTMLElement>('.battle-device-access summary') ?? devicePanel.querySelector<HTMLElement>('[data-action="inspect-device"][data-device-id="' + id + '"]');
    returnControl?.focus({ preventScroll: true });
  }
  function pinTarget(id: number): void {
    if (selectedDevice === null) return;
    const device = application.view.battle?.devices.find(entry => entry.id === selectedDevice);
    const enemy = application.view.battle?.enemies.find(entry => entry.id === id);
    if (enemy?.kind === 'bat' && device?.kind !== 'harpoon') { targetNotice = 'Это устройство не атакует летучих мышей.'; renderHud(application.view); return; }
    application.command({ type: 'cannon-target', deviceId: selectedDevice, enemyId: id });
    pendingTarget = { id, tick: application.view.battle?.tick ?? 0 };
    rememberedTarget = null; targetNotice = 'Команда выбора цели отправлена.'; choosingTarget = false;
    renderHud(application.view);
  }
  const click = (event: MouseEvent): void => {
    if (settingsTransition.isNavigating() || gameMenuTransition.isNavigating()) return;
    panelPointerHeld = false;
    clearTimeout(panelReleaseTimer);
    const target = event.target as Element;
    const map = target.closest<SVGSVGElement>('[data-placement-map]');
    if (map && application.view.screen === 'preparation' && !application.view.error) {
      const point = placementPoint(map, event.clientX, event.clientY);
      if (point) { application.previewPlacement(point.x, point.y); application.placeDevice(point.x, point.y); renderHud(application.view); }
      return;
    }
    const button = target.closest<HTMLElement>('[data-action]');
    if (!button || (button instanceof HTMLButtonElement && button.disabled)) return;
    if (button.dataset.focusKey) returnFocus.set(application.view.screen, button.dataset.focusKey);
    if (application.view.screen === 'menu' && button instanceof HTMLButtonElement && button.matches('.menu-hotspot') &&
      (button.dataset.action === 'game-menu' || button.dataset.action === 'settings')) {
      const action = button.dataset.action;
      menuButtons.activate(button, () => {
        if (application.view.screen !== 'menu' || !overlay.contains(button) || button.disabled) return;
        if (action === 'settings') { openSettingsWithMotion(); return; }
        gameMenuTransition.open(() => { application.openGameMenu(); renderHud(application.view); });
      }, action === 'settings');
      return;
    }
    if (application.view.screen === 'game-menu' && button instanceof HTMLButtonElement && button.matches('.game-menu-control')) {
      const action = button.dataset.action;
      gameMenuTransition.press(button, () => {
        if (application.view.screen !== 'game-menu' || !overlay.contains(button)) return;
        if (action === 'game-menu-back') { gameMenuTransition.close(() => { application.back(); renderHud(application.view); }); return; }
        if (action === 'continue-game') application.continueGame();
        else if (action === 'trials') application.openTrials();
        else if (action === 'new-game') {
          if (application.view.hasProgress) confirmNewGame = true;
          else { application.startNewGame(); if (application.view.error) confirmNewGame = true; }
        }
        renderHud(application.view);
      });
      return;
    }
    switch (button.dataset.action) {
      case 'confirm-new-game': application.startNewGame(true); break;
      case 'cancel-new-game':
        application.cancelNewGame();
        if (!application.view.error) confirmNewGame = false;
        break;
      case 'select-lens': {
        const lens = application.view.lenses.find(entry => entry.definition.id === button.dataset.lens);
        if (application.view.screen === 'preparation' && lens?.unlocked) application.selectLens(lens.definition.id);
        break;
      }
      case 'purchase-lens': {
        const lens = application.view.lenses.find(entry => entry.definition.id === button.dataset.lens);
        if (application.view.screen === 'development' && lens?.canPurchase) application.purchaseLens(lens.definition.id);
        break;
      }
      case 'purchase-lens-upgrade': {
        const node = application.view.lenses.flatMap(lens => lens.upgrades).find(entry => entry.definition.id === button.dataset.lensUpgrade);
        if (application.view.screen === 'development' && node?.status === 'available') application.purchaseLensUpgrade(node.definition.id);
        break;
      }
      case 'select-late-mode': {
        const mode = application.view.lateNightModes?.find(entry => entry.id === button.dataset.mode);
        if (mode && application.view.screen === 'preparation' && !application.view.error) application.selectLateMode(mode.id);
        break;
      }
      case 'select-night': {
        const night = application.view.nights.find((entry) => entry.id === button.dataset.night);
        if (night && night.available && application.view.screen !== 'battle') application.selectNight(night.id);
        break;
      }
      case 'preparation': application.openPreparation(); break;
      case 'menu': application.openMainMenu(); break;
      case 'development': application.openDevelopment(); break;
      case 'settings': openSettingsWithMotion(); return;
      case 'back':
        if (application.view.screen === 'settings') { closeSettingsWithMotion(); return; }
        application.back(); break;
      case 'text-size': if (button.dataset.size === 'normal' || button.dataset.size === 'large') application.setTextSize(button.dataset.size); break;
      case 'sound-toggle': application.setAudioSettings({ soundEnabled: button.dataset.enabled === 'true' }); break;
      case 'language': if (button.dataset.language === 'auto' || button.dataset.language === 'ru' || button.dataset.language === 'en') application.setLanguage(button.dataset.language); break;
      case 'retry-settings': application.retrySettings(); break;
      case 'cancel-settings': application.cancelSettingsChange(); break;
      case 'confirm-abandon': confirmAbandon = true; break;
      case 'cancel-abandon': confirmAbandon = false; break;
      case 'abandon-menu': confirmAbandon = false; application.abandonNight('menu'); break;
      case 'abandon-preparation': confirmAbandon = false; application.abandonNight('preparation'); break;
      case 'select-upgrade': {
        const node = application.view.upgrades.find((entry) => entry.definition.id === button.dataset.upgrade);
        if (node) {
          selectedUpgrade = node.definition.id;
          treeState.selectedId = node.definition.id;
          treeState.inspectorOpen = true;
          renderHud(application.view);
        }
        break;
      }
      case 'start': application.start(); break;
      case 'pause': if (application.view.paused) application.resume(); else application.pause(); break;
      case 'resume': application.resume(); break;
      case 'flash': application.command({ type: 'flash' }); break;
      case 'inspect-device': inspectDevice(Number(button.dataset.deviceId)); break;
      case 'close-device': closeDevice(); break;
      case 'choose-target': choosingTarget = !choosingTarget; break;
      case 'target-enemy': pinTarget(Number(button.dataset.enemyId)); break;
      case 'auto-target': if (selectedDevice !== null) application.command({ type: 'cannon-target', deviceId: selectedDevice, enemyId: null }); rememberedTarget = null; targetNotice = ''; choosingTarget = false; break;
      case 'cannon-priority': {
        const priority = button.dataset.priority;
        if (selectedDevice !== null && (priority === 'nearest' || priority === 'strongest' || priority === 'weakest')) application.command({ type: 'cannon-priority', deviceId: selectedDevice, priority });
        break;
      }
      case 'wave': application.command({ type: 'callWave' }); break;
      case 'save': application.retrySave(); break;
      case 'device-type': {
        const kind = button.dataset.kind;
        if (kind === 'cannon' || kind === 'harpoon' || kind === 'mortar' || kind === 'bell' || kind === 'barrier' || kind === 'generator' || kind === 'light-trap' || kind === 'repair-lamp') application.selectDevice(application.view.preparation.selectedType === kind ? null : kind);
        break;
      }
      case 'remove-device': application.removeDevice(Number(button.dataset.deviceId)); break;
      case 'purchase-device': {
        const kind = button.dataset.kind;
        if (kind === 'cannon' || kind === 'harpoon' || kind === 'mortar' || kind === 'bell' || kind === 'barrier' || kind === 'generator' || kind === 'light-trap' || kind === 'repair-lamp') application.purchaseDevice(kind);
        break;
      }
      case 'repair-device': application.repairDevice(Number(button.dataset.deviceId)); break;
      case 'recharge-device': application.rechargeDevice(Number(button.dataset.deviceId)); break;
      case 'clear-devices': application.clearPlacements(); break;
      case 'upgrade': {
        const node = application.view.upgrades.find((entry) => entry.definition.id === button.dataset.upgrade);
        if (application.view.screen === 'development' && node) application.purchaseUpgrade(node.definition.id);
        break;
      }
    }
    renderHud(application.view);
  };
  const keydown = (event: KeyboardEvent): void => {
    // A held Escape must not close settings and then resume the paused battle.
    if (event.key === 'Escape' && event.repeat) { event.preventDefault(); return; }
    if (settingsTransition.isNavigating() || gameMenuTransition.isNavigating()) {
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    const map = event.target instanceof Element ? event.target.closest('[data-placement-map]') : null;
    if (map && application.view.screen === 'preparation' && !application.view.error) {
      const point = application.view.preparation.preview ?? { x: application.view.config.terrain?.landOnlyPlacement ? -80 : 80, y: 0 };
      const offsets: Record<string, [number, number]> = { ArrowUp: [0, -20], ArrowDown: [0, 20], ArrowLeft: [-20, 0], ArrowRight: [20, 0] };
      const offset = offsets[event.key];
      if (offset || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (offset) application.previewPlacement(point.x + offset[0], point.y + offset[1]);
        else application.placeDevice(point.x, point.y);
        renderHud(application.view); return;
      }
    }
    if (event.key === 'Tab' && (confirmAbandon || confirmNewGame)) {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>(confirmNewGame ? '.game-menu-confirm button:not(:disabled)' : '.abandon-confirm button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (selectedDevice !== null) closeDevice();
    else if (confirmNewGame) { application.cancelNewGame(); if (!application.view.error) confirmNewGame = false; }
    else if (confirmAbandon) confirmAbandon = false;
    else if (application.view.screen === 'settings') { closeSettingsWithMotion(); return; }
    else if (application.view.screen === 'development') application.back();
    else if (application.view.screen === 'trials') application.back();
    else if (application.view.screen === 'game-menu') { gameMenuTransition.close(() => { application.back(); renderHud(application.view); }); return; }
    else if (application.view.screen === 'battle') {
      if (application.view.paused) application.resume(); else application.pause();
    } else if (application.view.screen === 'preparation') application.openGameMenu();
    renderHud(application.view);
  };
  // Preserve the pressed DOM node until its click fires. Live health updates
  // must not remove a touch/mouse target between pointerdown and pointerup.
  const changeVolume = (event: Event): void => {
    if (settingsTransition.isNavigating()) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    const action = event.target.dataset.action;
    if (action !== 'music-volume' && action !== 'effects-volume') return;
    application.setAudioSettings({ [action === 'music-volume' ? 'musicVolume' : 'effectsVolume']: Number(event.target.value) });
    // Keep the native slider mounted during a drag and keyboard adjustment.
    const output = overlay.querySelector<HTMLOutputElement>('[data-music-volume]');
    if (output) output.value = `${application.view.settings.musicVolume}%`;
    menuAudio.sync();
    effectsAudio.sync();
    layoutReferenceSettings(overlay, application.view);
    if (action === 'effects-volume') effectsAudio.preview(event);
    if (application.view.settingsError) { settingsPointerHeld = false; renderHud(application.view); }
  };
  const panelPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof HTMLInputElement && ['music-volume', 'effects-volume'].includes(event.target.dataset.action ?? '')) settingsPointerHeld = true;
    if (event.target instanceof Node && devicePanel.contains(event.target)) {
      clearTimeout(panelReleaseTimer); panelPointerHeld = true;
    }
  };
  const panelPointerUp = (): void => {
    settingsPointerHeld = false;
    clearTimeout(panelReleaseTimer);
    panelReleaseTimer = setTimeout(() => { panelPointerHeld = false; }, 150);
  };
  const panelPointerCancel = (): void => { clearTimeout(panelReleaseTimer); panelPointerHeld = false; settingsPointerHeld = false; };
  root.addEventListener('pointerdown', panelPointerDown);
  window.addEventListener('pointerup', panelPointerUp);
  window.addEventListener('pointercancel', panelPointerCancel);
  root.addEventListener('click', click);
  root.addEventListener('input', changeVolume);
  root.addEventListener('change', changeVolume);
  root.addEventListener('pointermove', placementMove);
  window.addEventListener('keydown', keydown);
  renderHud(application.view);
  return { destroy() { destroyed = true; preparationControls.destroy(); treeControls.destroy(); menuAudio.destroy(); effectsAudio.destroy(); settingsTransition.destroy(); gameMenuTransition.destroy(); menuMotion.destroy(); menuWindows.destroy(); menuTitle.destroy(); menuButtons.destroy(); clearTimeout(panelReleaseTimer); root.removeEventListener('input', changeVolume); root.removeEventListener('change', changeVolume); root.removeEventListener('pointerdown', panelPointerDown); window.removeEventListener('pointerup', panelPointerUp); window.removeEventListener('pointercancel', panelPointerCancel); resize.disconnect(); root.removeEventListener('click', click); root.removeEventListener('pointermove', placementMove); window.removeEventListener('keydown', keydown); game.destroy(true); root.replaceChildren(); } };
}
