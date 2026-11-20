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
import './preparation/nightChronicle.css';
import './battle/battleHud.css';
import './shared/avalonWatch.css';
import './outcomes.css';
import { layoutCampaignDevelopment } from './campaignDevelopment';
import { battleHudMarkup, updateBattleHud } from './battle/battleHud';
import { loadBattleArtwork, loadCampaignBattleArtwork, paintBattleEnemy, paintBattleNight, battleEnemyBounds,
  isPrototypeArtwork, paintCampaignEnemy, paintCampaignBossSprite, paintWardenPiece, wardenSpriteBounds, wardenSpriteSize, type CampaignBattleArtwork } from './battle/battleArtwork';
import { BEAM_LIGHT_STOPS, beamLightGeometry, paintBattleBeam, paintBeamGuide } from './battle/battleBeam';
import type { BattleArtwork } from './battle/battleArtwork';
import { battleBarStyle, clampBarFraction, enemyBarDensity, enemyBarRequest, type BattleBarStyle } from './battle/battleIndicators';
import { enemiesInDrawOrder, frontEnemyAt } from './battle/enemyDepth';
import { createPreparationUiState } from './preparation/preparationState';
import { openChronicle } from './preparation/chronicleState';
import { mountPreparationControls } from './preparation/preparationControls';
import { loadChapterWorldAssets, paintChapterWorld } from './shared/world/chapterWorld';
import { createWorldCamera, WATCH_BEACON, WORLD_PROJECTION_Y, deviceSprite, spriteBounds } from './shared/world/worldGeometry';
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
import { mountWatchLettering } from './shared/watchLettering';
import { watchIcon } from './shared/watchArtwork';
import { mountMenuButtons } from './menu/menuButtons';
import { menuScenery, layoutMenuScenery } from './menu/menuScenery';
import { mountSettingsTransition } from './settings/settingsTransition';
import { renderPlacementPreview } from './preparation/preparation';
import { screenContent, nightLabel } from './screens';
import { drawCombatFeedback } from './battle/feedback';
import { battleDevicePanel } from './shared/devices';
import { drawCoast } from './battle/coast';
import { bellSlowStatus, bossStatus, campaignDeviceStatus, tentacleStatus, enemyThreat, shipStatus, shieldStatus as shieldStatusText } from './battle/nightPresentation';
import { layoutIndicators, type IndicatorRect, type IndicatorRequest } from './battle/indicatorLayout';
import { campaignRewardAction } from './campaignCollection';
import { mountCampaignAmbience } from './battle/campaignAmbience';
import { campaignLighthouseStage } from './shared/world/chapterScenery';
import { effectiveWeaponDefinition } from '../content/campaignVariants';

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** The scene projects state only. Every game action goes through GameApplication. */
export function mountGame(root: HTMLElement, application: GameApplication,
  { allowProfileReload = false } = {}): { destroy(): void } {
  root.innerHTML = `
    <main class="lighthouse-app">
      <header class="masthead"><span class="brand" aria-label="Маяк — ночной дозор"><span class="brand-mark">◈</span><span>МАЯК<small>НОЧНОЙ ДОЗОР</small></span></span><span class="prototype">ЛОКАЛЬНЫЙ ПРОТОТИП</span><div class="bank"><span>Осколки</span><strong data-bank>0</strong><span class="material-bank">Жемчуг глубин <b data-material-bank>0</b></span></div></header>
      <div class="save-error" role="alert" aria-labelledby="save-error-message" hidden>
        <div class="save-error-intro" hidden><h2 id="save-error-title" class="save-error-heading">${watchIcon('repair')}Ошибка сохранения</h2><div class="watch-rail"></div><p>Результат ещё не сохранён. Повторите сохранение.</p></div>
        <span data-error id="save-error-message"></span>
        <details class="save-error-details" hidden><summary>Подробности</summary><span data-error-detail></span></details>
        <button data-action="save">Повторить сохранение</button>${allowProfileReload ? '<button data-action="reload-campaign">Перечитать сохранение</button>' : ''}</div>
      <section class="play-area"><div class="ocean" data-canvas role="img" aria-label="Побережье с маяком: суша слева, море справа. Направляйте свет движением мыши или касанием."></div><div class="map-label">СЕВЕРНЫЙ БЕРЕГ <span>•</span> <span data-night-label></span></div><div class="range-label">Пунктир — дальность света</div><div class="overlay" data-overlay></div></section>
      <div class="battle-rail">
      ${battleHudMarkup()}
      </div>
      ${allowProfileReload ? `<dialog class="watch-reload watch-dialog watch-gold" aria-labelledby="reload-title" aria-describedby="reload-warning">
        <h2 id="reload-title">Перечитать сохранение</h2><p id="reload-warning">Перечитать записанный профиль? Незавершённая ночь будет прервана.</p>
        <form method="dialog" class="watch-dialog-actions"><button class="watch-button watch-primary" autofocus value="cancel">Отмена</button><button class="watch-button" value="reload">Перечитать сохранение</button></form></dialog>` : ''}
    </main>`;
  const find = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  };
  const canvasHost = find('[data-canvas]');
  const reloadDialog = root.querySelector<HTMLDialogElement>('.watch-reload');
  reloadDialog?.addEventListener('close', () => {
    if (reloadDialog.returnValue === 'reload') location.reload();
  });
  const battleWorld = document.createElement('canvas');
  battleWorld.className = 'chapter-world-underlay';
  battleWorld.setAttribute('aria-hidden', 'true');
  Object.assign(battleWorld.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  canvasHost.prepend(battleWorld);
  const battleWorldContext = battleWorld.getContext('2d');
  let chapterAssets: ChapterWorldAssets | null = null;
  let battleArtwork: BattleArtwork | null = null;
  let campaignArtwork: CampaignBattleArtwork | null = null;
  let destroyed = false;
  void loadBattleArtwork().then(assets => { if (!destroyed) battleArtwork = assets; }).catch(() => { /* Existing silhouettes keep combat usable if sprites cannot load. */ });
  let campaignArtworkLoad: Promise<void> | undefined;
  let chapterArtworkLoad: Promise<void> | undefined;
  const hasWorldCanvas = (config: NightConfig) => !!battleWorldContext && (!!config.campaignMapId || !!chapterAssets);
  const shell = find('.lighthouse-app');
  const reducedMotion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const menuAudio = mountMenuAudio(root, application);
  const effectsAudio = mountEffectsAudio(root, application);
  const campaignAmbience = mountCampaignAmbience(root, application);
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
  const watchLettering = mountWatchLettering(root);
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
  let abilityAim = false;
  let abilityFeedback = '';
  let abilityCommandTick: number | null = null;
  let campaignFilter = 'all';
  let campaignNode: string | undefined;
  let collectionReward: string | undefined;
  let rewardExpiryTimer = 0;
  let rewardClockView: ApplicationView['campaign'];
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
  let overlayDependencies: readonly unknown[] = [];
  let screenDependencies: readonly unknown[] = [];
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

  function refreshRewardClock(): void {
    if (destroyed || document.hidden) return;
    const view = application.view;
    if (!view.campaign?.rewards.testAvailable || !['collection','preparation','result'].includes(view.screen)) return;
    application.refreshCampaignRewards?.();
    renderHud(view);
  }

  function syncRewardClock(view: ApplicationView): void {
    const current = ['collection','preparation','result'].includes(view.screen) && !view.campaign?.intro &&
      view.campaign?.rewards.testAvailable ? view.campaign : undefined;
    if (rewardClockView === current) return;
    rewardClockView = current;
    window.clearTimeout(rewardExpiryTimer);
    const delay = current?.rewards.refreshInMs;
    if (delay != null) rewardExpiryTimer = window.setTimeout(refreshRewardClock, Math.min(2_147_483_647, Math.max(1, delay)));
  }

  function screenState(view: ApplicationView): readonly unknown[] {
    return [view.screen, view.paused, view.error, view.settings, view.settingsError, view.result, view.campaign, view.config];
  }

  function sameDependencies(before: readonly unknown[], after: readonly unknown[]): boolean {
    return before.length === after.length && before.every((value, index) => value === after[index]);
  }

  function renderHud(view: ApplicationView): void {
    screenDependencies = screenState(view);
    syncRewardClock(view);
    const { config } = view;
    if (view.screen === 'battle' && previousScreen !== 'battle') {
      chapterArtworkLoad ??= loadChapterWorldAssets(!!config.campaignMapId).then(assets => {
        if (!destroyed) chapterAssets = assets;
      }).catch(() => { chapterArtworkLoad = undefined; });
      campaignArtworkLoad ??= loadCampaignBattleArtwork().then(assets => {
        if (!destroyed) campaignArtwork = assets;
      }).catch(() => { campaignArtworkLoad = undefined; });
    }
    if (view.screen !== previousScreen && (view.screen === 'trials' || previousScreen === 'trials')) {
      preparationState.panel = null;
      preparationState.chronicle = view.screen === 'trials' ? openChronicle(view, 'trials') : null;
      preparationState.placementDeviceId = null;
      preparationState.selectedDeviceId = null;
    }
    shell.classList.toggle('is-main-menu', view.screen === 'menu');
    shell.classList.toggle('is-settings', view.screen === 'settings');
    shell.classList.toggle('is-game-menu', view.screen === 'game-menu');
    shell.classList.toggle('is-development', view.screen === 'development');
    shell.classList.toggle('is-collection', view.screen === 'collection');
    shell.classList.toggle('is-result', view.screen === 'result');
    shell.classList.toggle('is-preparation', view.screen === 'preparation' || view.screen === 'trials');
    shell.classList.toggle('is-battle', view.screen === 'battle');
    shell.classList.toggle('is-rift-battle', view.screen === 'battle' && config.campaignMapId === 'rift-coast');
    shell.classList.toggle('battle-paused', view.screen === 'battle' && view.paused);
    sceneryActive = view.screen === 'development' || view.screen === 'menu' || view.screen === 'settings' || view.screen === 'game-menu';
    shell.classList.toggle('has-menu-scenery', sceneryActive);
    sceneryLayer.classList.toggle('is-inactive', !sceneryActive);
    sceneryLayer.classList.toggle('menu-motion-paused', !sceneryActive);
    menuWindows.setPaused(lifecyclePaused || !sceneryActive);
    menuAudio.sync();
    effectsAudio.sync();
    campaignAmbience.sync();
    if (view.screen !== 'battle') { selectedDevice = null; choosingTarget = false; rememberedTarget = null; targetNotice = ''; pendingTarget = null; }
    if (view.screen !== 'battle' || view.paused) { abilityAim = false; abilityFeedback = ''; abilityCommandTick = null; }
    const resultError = view.screen === 'result' && !!view.error;
    errorBox.hidden = !view.error || (view.screen === 'game-menu' && confirmNewGame);
    errorBox.setAttribute('role', resultError ? 'alertdialog' : 'alert');
    find('.save-error-intro').hidden = !resultError;
    const diagnostics = find<HTMLDetailsElement>('.save-error-details');
    diagnostics.hidden = !resultError;
    if (!resultError) diagnostics.open = false;
    find('[data-error-detail]').textContent = resultError ? view.error : '';
    error.hidden = resultError;
    errorBox.setAttribute('aria-labelledby', resultError ? 'save-error-title' : 'save-error-message');
    errorBox.querySelector('[data-action="save"]')?.classList.toggle('watch-primary', resultError);
    if (resultError) errorBox.setAttribute('aria-modal','true'); else errorBox.removeAttribute('aria-modal');
    find('.play-area').inert = resultError;
    errorBox.querySelectorAll('button').forEach(button => button.classList.toggle('watch-button', view.screen !== 'menu'));
    error.textContent = view.error ?? '';
    bank.textContent = String(view.profile.resources);
    find('[data-material-bank]').textContent = String(view.profile.bossMaterials);
    document.documentElement.dataset.textSize = view.settings.textSize;
    const isBattle = view.screen === 'battle';
    find('.battle-rail').hidden = !isBattle;
    find('.battle-rail').inert = view.paused;
    root.querySelector('.lighthouse-app')?.classList.toggle('screen-page', !isBattle);
    for (const selector of ['.statusbar', '.battle-controls', '.legend', '.map-label', '.range-label', '.battle-devices', '.shield-status']) find(selector).hidden = !isBattle;
    if (isBattle) renderBattleStatus(view);
    renderOverlay(view);
    if (resultError && !errorBox.contains(document.activeElement)) errorBox.querySelector('button')?.focus();
  }

  function renderBattleStatus(view: ApplicationView): void {
    const { config, battle } = view;
    if (abilityCommandTick !== null && battle && battle.tick > abilityCommandTick) {
      const accepted = battle.events.some(event => event.type === 'ability-used' && event.tick >= abilityCommandTick!);
      abilityAim = !accepted && (config.ability?.abilityId === 'seal' || config.ability?.abilityId === 'barrage');
      abilityFeedback = accepted ? '' : 'Цель недоступна';
      abilityCommandTick = null;
    }
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
    flashButton.disabled = !battle || view.screen !== 'battle' || view.paused || abilityCommandTick !== null
      || (config.ability ? !battle.ability || battle.tick < battle.ability.readyTick : config.flash.enabled === false || battle.flash.cooldownRemaining > 0);
    flashButton.dataset.abilityAim = String(abilityAim);
    flashButton.dataset.abilityFeedback = abilityFeedback;
    flashButton.setAttribute('aria-pressed', String(abilityAim));
    flashStatus.textContent = config.flash.enabled === false ? 'Закрыта · открой в развитии' : battle && battle.flash.cooldownRemaining > 0 ? 'Готова через ' + Math.ceil(battle.flash.cooldownRemaining) + ' с' : 'Готова · урон + оглушение';
    const enAbility=resolveLanguage(view.settings.language,undefined,navigator.languages)==='en';
    flashButton.title = config.ability ? `${enAbility?'Cooldown':'Перезарядка'}: ${config.ability.cooldownSeconds} ${enAbility?'s':'с'}` : config.flash.enabled === false ? 'Открой вспышку на экране развития маяка' : 'Радиус ' + config.flash.radius + ' · урон ' + config.flash.damage + ' · оглушение ' + config.flash.stunDuration + ' с';
    shieldStatus.textContent = shieldStatusText(battle, config);
    find('[data-night-label]').textContent = nightLabel(view);
    const rescue = find('[data-ship-status]');
    rescue.textContent = battle?.ship ? shipStatus(battle.ship, config) : '';
    rescue.hidden = view.screen !== 'battle' || !battle?.ship;
    const bossHud = find('[data-boss-status]');
    bossHud.hidden = view.screen !== 'battle' || !battle?.boss;
    find('[data-boss-text]').textContent = battle ? bossStatus(battle, config, true) + ((battle.boss?.burn?.remainingTicks ?? 0) > 0 ? ' · ТЛЕЕТ' : '') : '';
    bossHud.title = config.boss?.campaign ? 'Разрушение части босса отменяет её следующую атаку.' : 'У босса общее здоровье. Свет замедляет освещённые щупальца и останавливает их атаки.';
    find('[data-boss-health]').style.width = `${battle?.boss && config.boss ? Math.max(0, battle.boss.health / config.boss.health * 100) : 0}%`;
    const hp = battle?.lighthouseHealth ?? config.lighthouseHealth;
    health.textContent = `${Math.ceil(hp)} / ${config.lighthouseHealth}`;
    healthBar.style.width = `${Math.max(0, hp / config.lighthouseHealth * 100)}%`;
    healthBar.classList.toggle('critical', hp < config.lighthouseHealth * .3);
    healthBar.classList.toggle('under-attack', !!battle?.events.some((event) => event.type === 'lighthouse-hit' && (battle.tick - event.tick) * config.stepSeconds < .35));
    pause.hidden = view.screen !== 'battle';
    pause.setAttribute('aria-label', view.paused ? 'Продолжить' : 'Пауза');
    // Keep the hit target alive between pointerdown and pointerup during live ticks.
    const pauseMarkup = view.paused ? '▶ <span>Продолжить</span>' : 'Ⅱ <span>Пауза</span>';
    if (pause.dataset.state !== String(view.paused)) {
      pause.innerHTML = pauseMarkup;
      pause.dataset.state = String(view.paused);
    }
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
    devicePanel.hidden = view.paused;
    devicePanel.dataset.deviceOpen = String(selectedDevice !== null);
  }

  function renderOverlay(view: ApplicationView): void {
    const isBattle = view.screen === 'battle';
    const screenChanged = previousScreen !== view.screen;
    if (screenChanged) { confirmAbandon = false; confirmNewGame = false; }
    const dependencies = [...screenDependencies, view.interrupted, view.hasProgress, view.profile, view.upgrades,
      view.nights, view.selectedNightId, view.lateNightModes, view.selectedLensId, view.lenses, view.preparation.selectedType,
      view.preparation.placements, view.preparation.cost, view.preparation.remaining, view.preparation.canStart,
      view.preparation.reason, selectedUpgrade, confirmAbandon, confirmNewGame, campaignFilter, campaignNode, collectionReward,
      JSON.stringify(treeState), JSON.stringify(preparationState)];
    if (sameDependencies(overlayDependencies, dependencies) || (view.screen === 'settings' && settingsPointerHeld && !view.settingsError)) {
      renderPlacementPreview(overlay, view); localize(); preparationControls.sync(); return;
    }
    const scrollSurface = overlay.querySelector<HTMLElement>('.reference-settings') ?? overlay;
    const scrollTop = scrollSurface.scrollTop;
    const focused = (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement) && root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.focusKey;
    const oldScreen = previousScreen;
    if (screenChanged && oldScreen) screenScroll.set(oldScreen, scrollTop);
    previousScreen = view.screen;
    overlayDependencies = dependencies;
    const wasHidden = overlay.hidden;
    overlay.hidden = isBattle && !view.paused;
    canvasHost.setAttribute('aria-hidden', String(!isBattle));
    overlay.className = 'overlay screen-' + view.screen + (view.screen === 'preparation' ? ' preparation' : '');
    treeControls.capture();
    preparationControls.capture();
    const previousCircuit = overlay.querySelector<HTMLElement>('.campaign-circuit-viewport');
    const circuitScroll = { left: previousCircuit?.scrollLeft ?? 0, top: previousCircuit?.scrollTop ?? 0 };
    overlay.innerHTML = screenContent(view, selectedUpgrade, confirmAbandon, confirmNewGame, treeState, preparationState, campaignFilter, campaignNode, collectionReward);
    if (!allowProfileReload) overlay.querySelector('.game-menu-confirm [data-action="reload-campaign"]')?.remove();
    const circuit = overlay.querySelector<HTMLElement>('.campaign-circuit-viewport');
    if (circuit && previousCircuit && circuit.dataset.branch === previousCircuit.dataset.branch) {
      circuit.scrollLeft = circuitScroll.left;
      circuit.scrollTop = circuitScroll.top;
    }
    treeControls.restore();
    // Standalone menu markup includes a scene; the game uses its persistent sibling.
    overlay.querySelector('.avalon-menu > .menu-scenery')?.remove();
    layoutReferenceMenu(overlay);
    layoutReferenceSettings(overlay, view);
    layoutGameMenu(overlay);
    layoutSharedScenery();
    settingsTransition.sync();
    gameMenuTransition.sync();
    for (const element of root.querySelectorAll<HTMLElement>('[data-action]:not([data-focus-key])')) {
      element.dataset.focusKey = [element.dataset.action, element.dataset.upgrade ?? element.dataset.lensUpgrade ?? element.dataset.lens ?? element.dataset.mode ?? element.dataset.night ?? element.dataset.kind ?? element.dataset.deviceId ?? element.dataset.size ?? element.dataset.enabled ?? element.dataset.language ?? element.dataset.rewardId ?? element.dataset.rewardResult ?? element.dataset.rewardKind ?? ''].join(':');
    }
    if (!overlay.hidden) {
      const restoreKey = screenChanged ? returnFocus.get(view.screen) : focusKey;
      const restore = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-focus-key]')].find(element =>
        element.dataset.focusKey === restoreKey && element.getClientRects().length && !element.closest('details:not([open])')
        && !(element instanceof HTMLButtonElement && element.disabled));
      if (restore && (!screenChanged || oldScreen === 'development' || oldScreen === 'settings' || oldScreen === 'trials' || oldScreen === 'collection')) restore.focus({ preventScroll: true });
      else if (screenChanged || wasHidden) overlay.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
      else if (focused && !focused.isConnected) {
        const fallback = [...overlay.querySelectorAll<HTMLElement>('[data-purchase-heading]')].find(heading => heading.dataset.purchaseHeading === focused.dataset.node)
          ?? [...overlay.querySelectorAll<HTMLElement>('[data-reward-heading]')].find(heading => heading.dataset.rewardHeading === focused.dataset.rewardId)
          ?? (focused.dataset.node ? overlay.querySelector<HTMLElement>('[data-action="campaign-filter"][aria-pressed="true"]') : null)
          ?? overlay.querySelector<HTMLElement>('.skill-node[aria-pressed="true"]')
          ?? overlay.querySelector<HTMLElement>('[data-action="confirm-abandon"]') ?? overlay.querySelector<HTMLElement>('h1');
        fallback?.focus({ preventScroll: true });
      }
      (overlay.querySelector<HTMLElement>('.reference-settings') ?? overlay).scrollTop = screenChanged ? screenScroll.get(view.screen) ?? 0 : scrollTop;
    } else if (focused && !focused.isConnected) pause.focus({ preventScroll: true });
    if (view.screen === 'development' && view.campaign) layoutCampaignDevelopment(overlay);
    if (view.screen === 'settings' && view.settingsError && !overlay.querySelector('.reference-settings-error')?.contains(document.activeElement)) {
      overlay.querySelector<HTMLElement>('[data-action="retry-settings"]')?.focus({ preventScroll: true });
    }
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
    watchLettering.sync();
  }

  function localizeBattle(view: ApplicationView): void {
    const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
    localizeRoot(find('.battle-rail'), language);
    localizeRoot(find('.map-label'), language);
    localizeRoot(find('.range-label'), language);
    updateBattleHud(root, view);
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
        const pickEnemy = () => frontEnemyAt(battle.enemies, pointer.x, pointer.y, enemy => this.enemyBody(enemy, view.config));
        if (abilityAim || abilityCommandTick !== null) {
          if (!abilityAim || abilityCommandTick !== null) return;
          const target = { x: (pointer.x - this.cx) / this.unit, y: (pointer.y - this.cy) / (this.unit * WORLD_PROJECTION_Y) };
          const enemy = view.config.ability?.abilityId === 'barrage' ? pickEnemy() : undefined;
          const tentacle = view.config.ability?.abilityId === 'barrage' && !enemy && battle.boss && battle.boss.health > 0
            ? battle.boss.tentacles.find(entry => Math.hypot(entry.x - target.x, entry.y - target.y) <= (view.config.boss?.radius ?? 15)) : undefined;
          const enemyId = enemy?.id ?? tentacle?.id;
          application.command({ type: 'use-ability', target: { ...target, ...(enemyId !== undefined ? { enemyId } : {}) } });
          abilityCommandTick = battle.tick;
          return;
        }
        if (choosingTarget && selectedDevice !== null) {
          const enemy = pickEnemy();
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
          if (spec && chapterAssets?.devices[entry.kind]) {
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
      if (application.view.screen !== 'battle' || application.view.paused || selectedDevice !== null || abilityAim || abilityCommandTick !== null ||
        !(pointer.event.target instanceof HTMLCanvasElement) ||
        pointer.x < 0 || pointer.y < 0 || pointer.x > this.scale.width || pointer.y > this.scale.height) return;
      application.command({ type: 'aim', angle: Math.atan2((pointer.y - this.cy) / WORLD_PROJECTION_Y, pointer.x - this.cx) });
    }
    update(_time: number, delta: number): void {
      application.advance(delta);
      const view = application.view;
      if (!sameDependencies(screenDependencies, screenState(view))) renderHud(view);
      else if (view.screen === 'battle' && !view.paused) {
        effectsAudio.sync();
        campaignAmbience.sync();
        renderBattleStatus(view);
        localizeBattle(view);
      }
      if (view.screen === 'battle') {
        syncViewport(this.scale);
        this.draw(view);
      } else if (this.camera) {
        this.draw(view);
        this.camera = null;
      }
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
      const riftCoast = config.campaignMapId === 'rift-coast';
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
      battleWorld.dataset.worldReady = String(hasWorldCanvas(config));
      battleWorld.dataset.headlandReady = String(!!chapterAssets?.headland && (!config.campaignMapId || config.campaignMapId === 'headland'));
      this.cx = camera.x;
      this.cy = camera.y;
      this.unit = camera.zoom;
      if (battleWorldContext && hasWorldCanvas(config)) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (battleWorld.width !== Math.round(w * dpr) || battleWorld.height !== Math.round(h * dpr)) {
          battleWorld.width = Math.round(w * dpr); battleWorld.height = Math.round(h * dpr);
        }
        battleWorldContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintChapterWorld(battleWorldContext, chapterAssets, {...config,lighthouseStage:campaignLighthouseStage(view.profile.wonNightIds??[])}, camera, {
          devices: (battle?.devices ?? []).map(device => ({ ...device, maxHealth: config.devices.definitions[device.kind].health })),
          showRanges: false, showHealthBars: false,
          atmosphereSeconds: battle?.elapsed ?? 0,
          paintGround: ctx => {
            paintBattleNight(ctx, camera);
            paintBeamGuide(ctx, camera, config, battle?.desiredBeamAngle ?? -.75);
          },
        });
        paintBattleBeam(battleWorldContext, camera, config, battle?.beamAngle ?? -.75, battle ? this.beamContact(config, battle) : undefined);
      } else drawCoast(g, w, h, this.cx, this.cy, this.unit, config.terrain, WORLD_PROJECTION_Y);
      if (!hasWorldCanvas(config)) this.ring(config.worldRadius * 1.045, 0x547980, .12);
      if (abilityAim && config.ability && 'targetingRange' in config.ability) this.ring(Math.min(config.worldRadius, config.ability.targetingRange), 0xe7b66d, .8, 2);
      this.drawBeam(config, battle?.beamAngle ?? -.75);
      if (battle?.shield.maximum) this.ring(config.shield.radius, battle.shield.current > 0 ? 0x80d9f7 : 0x69808a, battle.shield.current > 0 ? .85 : .3, battle.shield.current > 0 ? 2 : 1);
      const selected = battle?.devices.find((entry) => entry.id === selectedDevice);
      if (selected) {
        const p = this.point(selected.x, selected.y);
        g.lineStyle(2, 0xb8edff, .9); g.strokeEllipse(p.x, p.y, 36, 30);
        if (selected.kind === 'cannon' || selected.kind === 'harpoon' || selected.kind === 'mortar' || selected.kind === 'bell' || selected.kind === 'repair-lamp') {
          const range = effectiveWeaponDefinition(config,selected).range*this.unit;
          g.lineStyle(1,0xb8edff,.4); g.strokeEllipse(p.x,p.y,2*range,2*range*WORLD_PROJECTION_Y);
        }
      }
      for (const device of battle?.devices ?? []) this.drawDevice(device, config, battle!);
      if (battle?.ship) this.drawShip(config, battle);
      const enemies = battle ? enemiesInDrawOrder(battle.enemies) : [];
      const present = new Set<number>();
      // Restore northern silhouettes immediately after the tower, before southern
      // enemies. A late x-ray pass would incorrectly paint over nearer threats.
      const restoreNorthernThreats = (): void => {
        if (hasWorldCanvas(config)) return;
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
        if (enemy.campaign?.cast) {
          const cast = enemy.campaign.cast;
          this.drawAttackWarning(enemy, cast.target, cast.target.radius ?? 24,
            (battle!.tick - cast.startedTick) / Math.max(1, cast.impactTick - cast.startedTick));
        }
      }
      if (!lighthouseDrawn) {
        this.drawLighthouse(config, battle);
        this.drawDeviceSilhouettes(config, battle);
        restoreNorthernThreats();
      }
      if (battle) this.drawBoss(config, battle);
      if (config.campaignMapId && battle) this.drawCampaignAbility(config, battle);
      if (battle) this.drawMortar(config, battle);
      if (battle) drawCombatFeedback(g, battle, config, (x, y) => this.point(x, y), this.unit);
      if (battle) this.drawAim(config, battle.desiredBeamAngle);
      const bodies = enemies.map((enemy) => this.enemyBody(enemy, config));
      if (battle?.ship) { const p = this.point(battle.ship.x, battle.ship.y), r = Math.max(10, battle.ship.radius * this.unit); bodies.push({ x: p.x-r*1.4, y:p.y-r*1.2, width:r*2.8, height:r*2.6+10 }); }
      const warden = config.boss?.id === 'abyss-warden' && campaignArtwork && hasWorldCanvas(config);
      for (const tip of battle?.boss?.health && battle.boss.health > 0 ? battle.boss.tentacles : []) {
        const p = this.point(tip.x, tip.y), r = Math.max(9, (config.boss?.radius ?? 16) * this.unit);
        const core = battle?.boss?.campaign?.parts.find(part => part.zoneId === tip.id)?.id === 'core';
        bodies.push(warden ? wardenSpriteBounds(p.x, p.y, this.unit, !core) : { x: p.x-r*1.3, y: p.y-r*1.2, width: r*2.6, height: r*2.4 });
      }
      const tower = spriteBounds(0, 0, WATCH_BEACON);
      bodies.push({ x: this.cx + tower.minX * this.unit, y: this.cy + tower.minY * this.unit,
        width: (tower.maxX - tower.minX) * this.unit, height: (tower.maxY - tower.minY) * this.unit });
      // Device health strips are reserved before enemy health is laid out.
      const deviceBars = (battle?.devices ?? []).filter((device) => device.health > 0 && !device.consumed && device.health < config.devices.definitions[device.kind].health).map((device) => {
        const p = this.point(device.x, device.y), radius = Math.max(5, config.devices.definitions[device.kind].radius * this.unit);
        const style = battleBarStyle(false, view.settings.textSize === 'large', radius * 2, true);
        return { x: p.x - style.width / 2, y: p.y + radius + 3, width: style.width, height: style.height };
      });
      const hudBounds: IndicatorRect[] = [];
      if (battle) {
        const field = canvasHost.getBoundingClientRect();
        const hudPanels = '.statusbar .watch-panel, .statusbar button, .battle-controls, .battle-brief summary, [data-boss-status]:not([hidden]), .battle-objectives:not([hidden])';
        const riftPanels = ', .statusbar [data-phase], .battle-brief[open] .battle-brief-body, .battle-devices:not([hidden])';
        for (const panel of root.querySelectorAll<HTMLElement>(hudPanels + (riftCoast ? riftPanels : ''))) {
          const p = panel.getBoundingClientRect();
          const x = p.left - field.left, y = p.top - field.top;
          if (p.width > 0 && p.height > 0 && x < w && y < h && x + p.width > 0 && y + p.height > 0) {
            hudBounds.push({ x, y, width: p.width, height: p.height });
          }
        }
      }
      const enemyStyles = new Map<number, BattleBarStyle>();
      const indicatorRequests = enemies.map((enemy) => {
        const body = this.enemyBody(enemy, config);
        const priority = !!battle?.litEnemyIds.includes(enemy.id) || !!battle?.devices.some(device => device.health > 0 && !device.consumed && device.targetId === enemy.id);
        const style = battleBarStyle(config.enemies[enemy.kind].armor > 0, view.settings.textSize === 'large', body.width, false, enemyBarDensity(w, priority));
        enemyStyles.set(enemy.id, style);
        return enemyBarRequest(enemy.id, body, style);
      });
      const indicators = layoutIndicators(indicatorRequests, { width: w, height: h }, bodies, [...deviceBars, ...hudBounds]);
      const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]));
      battleWorld.dataset.indicators = JSON.stringify(indicators);
      battleWorld.dataset.enemyBodies = JSON.stringify(enemies.map(enemy => ({ id: enemy.id, ...this.enemyBody(enemy, config) })));
      battleWorld.dataset.artworkReady = String(battleArtwork !== null);
      battleWorld.dataset.campaignArtworkReady = String(campaignArtwork !== null);
      for (const request of indicatorRequests) {
        const indicator = indicatorById.get(request.id)!;
        if (Math.abs(indicator.x - request.x) > 1 || Math.abs(indicator.y - request.y) > 1) {
          g.lineStyle(1, 0xb4cec7, .45);
          g.lineBetween(request.x + request.width / 2, request.y + request.height + 3,
            indicator.x + indicator.width / 2, indicator.y + indicator.height);
        }
      }
      // Health and armor must remain above every world object and feedback mark.
      if (battle) this.drawBlockedLabels(enemies, config, battle, [...indicators, ...hudBounds]);
      if (battle?.boss && battle.boss.health > 0 && config.boss) {
        const tipRequests: IndicatorRequest[] = [];
        const telegraph = battle.boss.campaign?.telegraph;
        const tipBars = new Map<number, { health: number; maximum: number; style: BattleBarStyle }>();
        const showCaptions = new Set<number>();
        for (const tentacle of battle.boss.tentacles) {
          present.add(tentacle.id);
          let label = this.labels.get(tentacle.id);
          if (!label) { label = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', color: '#e8d9ff', backgroundColor: '#182534', padding: { x: 3, y: 2 } }).setOrigin(.5, 0).setDepth(5); this.labels.set(tentacle.id, label); }
          const p = this.point(tentacle.x, tentacle.y), r = Math.max(9, config.boss.radius * this.unit);
          const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
          const status = tentacleStatus(tentacle, battle, config, language);
          const number = -1000 - tentacle.id;
          const caption = battle.boss.campaign ? status : status.startsWith('ОГЛУШЕНО') ? 'ОГЛУШЕНО' : status.includes('атака остановлена') ? 'СТОП АТАКИ' : status.startsWith('В СВЕТЕ') ? 'ЗАМЕДЛЕНО' : status;
          const part = battle.boss.campaign?.parts.find(entry => entry.zoneId === tentacle.id);
          const illustrated = warden && part;
          const warningSource = telegraph?.sourceZoneId === tentacle.id;
          const blocked = battle.blockedTentacleIds.includes(tentacle.id);
          const lit = battle.litTentacleIds.includes(tentacle.id);
          const active = riftCoast && telegraph ? warningSource || blocked || lit : !illustrated || warningSource || blocked;
          if (active) showCaptions.add(tentacle.id);
          label.setVisible(false).setText(translate(`${number} · ${caption}`, language)).setFontSize(view.settings.textSize === 'large' ? 13 : 10);
          const color = riftCoast && warningSource ? '#ffab64' : '#e8d9ff';
          if (label.style.color !== color) label.setColor(color);
          const style = battleBarStyle(false, view.settings.textSize === 'large', wardenSpriteSize(this.unit, true), false,
            enemyBarDensity(w, Boolean(active || battle.litTentacleIds.includes(tentacle.id))));
          const bar = illustrated && part.health !== null && part.maxHealth ? { health: part.health, maximum: part.maxHealth, style } : null;
          if (bar) tipBars.set(tentacle.id, bar);
          const width = Math.max(active ? label.width : 0, bar ? style.width : 0);
          const height = (active ? label.height : 0) + (bar ? style.height : 0);
          if (!width || !height) continue;
          const top = illustrated ? wardenSpriteBounds(p.x, p.y, this.unit, part.id !== 'core').y : p.y - r;
          tipRequests.push({ id: tentacle.id, x: p.x - width / 2, y: top - height - 4, width, height });
        }
        const textBounds = [...this.labels.entries()].filter(([id, label]) => id > 0 && label.visible).map(([, label]) => ({ x: label.x - label.width / 2, y: label.y, width: label.width, height: label.height }));
        const mapCaptions = riftCoast ? [] : [{ x: 0, y: 0, width: w, height: 36 }, { x: 0, y: h - 24, width: w, height: 24 }];
        const tipIndicators = layoutIndicators(tipRequests, { width: w, height: h }, bodies, [...indicators, ...deviceBars, ...textBounds, ...mapCaptions, ...hudBounds]);
        for (const indicator of tipIndicators) {
          const label = this.labels.get(indicator.id)!;
          const tip = battle.boss.tentacles.find(entry => entry.id === indicator.id)!;
          const p = this.point(tip.x, tip.y);
          const center = indicator.x + indicator.width / 2;
          if (showCaptions.has(indicator.id)) label.setPosition(center, indicator.y).setVisible(true);
          const bar = tipBars.get(indicator.id);
          if (bar) {
            const { width, height, padding, fillHeight } = bar.style;
            const x = center - width / 2, y = indicator.y + indicator.height - height;
            g.fillStyle(0x101c27, .95); g.fillRect(x, y, width, height);
            g.fillStyle(0x422f36); g.fillRect(x + padding, y + padding, width - padding * 2, fillHeight);
            g.fillStyle(0xd99183); g.fillRect(x + padding, y + padding, (width - padding * 2) * clampBarFraction(bar.health, bar.maximum), fillHeight);
          }
          const original = tipRequests.find(request => request.id === indicator.id)!;
          if (!warden || Math.abs(original.x - indicator.x) > 1 || Math.abs(original.y - indicator.y) > 1) {
            g.lineStyle(1, warden ? 0xb4cec7 : 0xc9b1e5, .48);
            g.lineBetween(p.x, warden ? original.y + original.height + 3 : p.y, center, indicator.y + indicator.height);
          }
        }
      }
      if (battle) for (const device of battle.devices) this.drawDeviceIndicators(device, config, battle);
      for (const enemy of enemies) this.drawEnemyIndicators(enemy, config, indicatorById.get(enemy.id)!, enemyStyles.get(enemy.id)!, battle?.litEnemyIds.includes(enemy.id) ?? false);
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
    private drawBlockedMark(x: number, y: number, radius: number): void {
      this.ink.lineStyle(2, 0xc2d2d5);
      this.ink.lineBetween(x - radius, y - radius, x + radius, y + radius);
      this.ink.lineBetween(x + radius, y - radius, x - radius, y + radius);
    }

    private drawBoss(config: NightConfig, battle: Readonly<BattleState>): void {
      const boss = battle.boss, rules = config.boss;
      if (!boss || !rules || boss.health <= 0) return;
      const g = this.ink, stunned = boss.stunnedUntilTick > battle.tick;
      if (boss.campaign && rules.id !== 'abyss-warden') {
        for (const tip of boss.tentacles) {
          const part = boss.campaign.parts.find(entry => entry.zoneId === tip.id);
          const p = this.point(tip.x, tip.y), r = Math.max(12, rules.radius * this.unit);
          const core = part?.health == null, lit = battle.litTentacleIds.includes(tip.id);
          const warning = boss.campaign.telegraph?.sourceZoneId === tip.id;
          g.fillStyle(lit ? 0xf1ce83 : core ? 0x7c639d : 0x63738f);
          const illustrated = campaignArtwork && battleWorldContext && hasWorldCanvas(config) && part &&
            paintCampaignBossSprite(battleWorldContext, campaignArtwork, boss.id, part.id, p.x, p.y, r, lit);
          if (!illustrated) {
            if (core) g.fillCircle(p.x, p.y, r);
            else g.fillTriangle(p.x, p.y-r, p.x+r, p.y+r*.7, p.x-r, p.y+r*.7);
          }
          g.lineStyle(warning ? 3 : 1.5, warning ? 0xffab64 : core ? 0xe1c7f1 : 0xbbdadf);
          g.strokeCircle(p.x, p.y, r * 1.2);
          if (battle.blockedTentacleIds.includes(tip.id)) this.drawBlockedMark(p.x, p.y, r * .5);
          if (part?.health != null && part.maxHealth) {
            g.fillStyle(0x321d2a); g.fillRect(p.x-r, p.y+r+4, r*2, 4);
            g.fillStyle(0xf28d7e); g.fillRect(p.x-r, p.y+r+4, r*2*part.health/part.maxHealth, 4);
          }
        }
        const warning = boss.campaign.telegraph;
        const source = boss.tentacles.find(zone => zone.id === warning?.sourceZoneId);
        if (warning && source) this.drawAttackWarning(source, warning, warning.radius,
          (battle.tick - warning.startedTick) / Math.max(1, warning.resolveTick - warning.startedTick));
        return;
      }
      const body = this.point(config.worldRadius * .75, 0), br = Math.max(18, 38 * this.unit);
      const wardenCanvas = hasWorldCanvas(config) ? battleWorldContext : null;
      if (!boss.campaign) {
        if (wardenCanvas && campaignArtwork) paintWardenPiece(wardenCanvas, campaignArtwork, false, body.x, body.y, this.unit);
        else {
          g.fillStyle(0x493e67, .95); g.fillEllipse(body.x, body.y, br * 2, br * 1.5);
          g.lineStyle(2, 0xb4a0df, .8); g.strokeEllipse(body.x, body.y, br * 2, br * 1.5);
          g.fillStyle(0xe8c894); g.fillEllipse(body.x - br * .3, body.y - br * .2, br * .18, br * .3); g.fillEllipse(body.x + br * .3, body.y - br * .2, br * .18, br * .3);
        }
      }
      for (const tip of boss.tentacles) {
        const p = this.point(tip.x, tip.y), r = Math.max(9, rules.radius * this.unit), lit = battle.litTentacleIds.includes(tip.id), blocked = battle.blockedTentacleIds.includes(tip.id);
        const core = boss.campaign?.parts.find(part => part.zoneId === tip.id)?.id === 'core';
        if (wardenCanvas && campaignArtwork) paintWardenPiece(wardenCanvas, campaignArtwork, !core, p.x, p.y, this.unit, lit);
        else {
          if (!boss.campaign) { g.lineStyle(Math.max(4, r * .75), 0x8670ab, .72); g.lineBetween(body.x, body.y, p.x, p.y); }
          g.fillStyle(lit ? 0xf4d393 : 0x9e8bbf); g.fillEllipse(p.x, p.y, r * 2, r * 1.65);
          g.fillStyle(0x382c51); for (let i = -1; i <= 1; i++) g.fillCircle(p.x + i * r * .45, p.y, Math.max(2, r * .16));
        }
        if ((boss.burn?.remainingTicks ?? 0) > 0 && core) { g.lineStyle(2,0xc8865b,.7); g.strokeEllipse(p.x,p.y,r*2.3,r*1.35); }
        g.lineStyle(1.5, stunned ? 0xd7c2ff : lit ? 0xffda83 : 0x91adbd, lit || stunned ? .9 : .48);
        g.strokeEllipse(p.x, p.y, r * 2.6, r * 1.28);
        if (bellSlowStatus(tip, battle.tick, battle.devices)) { g.lineStyle(1.5,0x8fe4ca,.85); g.strokeEllipse(p.x,p.y+r*.7,r*3,r*.8); }
        if (blocked) this.drawBlockedMark(p.x, p.y, r * .5);
        if (stunned) { g.lineStyle(2, 0xd7c2ff); g.lineBetween(p.x-4,p.y-r-3,p.x+4,p.y-r-3); }
        if (battle.devices.some(device => device.targetId === tip.id)) { g.lineStyle(2, 0x9feaff); g.strokeRect(p.x-r-4,p.y-r-3,r*2+8,r*2+6); }
      }
      const warning = boss.campaign?.telegraph;
      const source = boss.tentacles.find(zone => zone.id === warning?.sourceZoneId);
      if ((boss.burn?.remainingTicks ?? 0) > 0 && !boss.campaign) { g.lineStyle(2,0xc8865b,.7); g.strokeEllipse(body.x,body.y,br*2.3,br*1.8); }
      if (warning && source) {
        const p = this.point(source.x, source.y), target = this.point(warning.x, warning.y);
        const r = Math.max(14, 32 * this.unit);
        const progress = (battle.tick - warning.startedTick) / Math.max(1, warning.resolveTick - warning.startedTick);
        g.lineStyle(1, 0xf8a260, .43); g.lineBetween(p.x, p.y, target.x, target.y);
        g.strokeEllipse(target.x, target.y, warning.radius * this.unit * 2, warning.radius * this.unit * 2 * WORLD_PROJECTION_Y);
        for (let segment = 0; segment < 16; segment++) {
          const a = segment * Math.PI / 8, b = a + Math.PI / 12;
          g.lineStyle(2, 0xffbd87, segment / 16 < 1 - progress ? .94 : .33);
          g.lineBetween(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * .38, p.x + Math.cos(b) * r, p.y + Math.sin(b) * r * .38);
        }
      }
    }
    private drawAttackWarning(source: { x: number; y: number }, target: { x: number; y: number }, radius: number, progress: number): void {
      const g = this.ink, from = this.point(source.x, source.y), to = this.point(target.x, target.y);
      const r = Math.max(10, radius * this.unit);
      g.lineStyle(1.25, 0xf8a260, .75);
      g.lineBetween(from.x, from.y, to.x, to.y);
      g.strokeEllipse(to.x, to.y, r * 2, r * 2 * WORLD_PROJECTION_Y);
      g.lineStyle(2, 0xffcc83, .95);
      g.beginPath(); g.arc(from.x, from.y, 19, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, Math.max(.01, progress))); g.strokePath();
    }
    private drawCampaignAbility(config: NightConfig, battle: Readonly<BattleState>): void {
      const rules = config.ability, ability = battle.ability;
      if (!rules || !ability) return;
      const g = this.ink;
      if (rules.abilityId === 'seal' && ability.seal && battle.tick < ability.seal.untilTick) {
        const p = this.point(ability.seal.x, ability.seal.y);
        const r = rules.radius * this.unit;
        g.fillStyle(0x65c7b0, .07); g.fillEllipse(p.x,p.y,2*r,2*r*WORLD_PROJECTION_Y);
        g.lineStyle(2,0x90edcc,.75); g.strokeEllipse(p.x,p.y,2*r,2*r*WORLD_PROJECTION_Y);
        for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
          const x = p.x + Math.cos(angle) * r, y = p.y + Math.sin(angle) * r * WORLD_PROJECTION_Y;
          g.lineBetween(x-3,y,x+3,y);
        }
      }
      if (rules.abilityId === 'overload' && battle.tick < ability.activeUntilTick) {
        const r = Math.max(12, config.lighthouseRadius * this.unit);
        const alpha = reducedMotion?.matches ? .75 : .65 + .1 * Math.cos(battle.elapsed * 5);
        g.lineStyle(2,0xffcc73,alpha); g.strokeEllipse(this.cx,this.cy-r*3.1,r*2.6,r*1.5);
      }
      if (rules.abilityId === 'bastion' && battle.tick < ability.fadeUntilTick) {
        const alpha = battle.tick < ability.activeUntilTick ? .8 : .38;
        for (const target of [{ x: 0, y: 0, radius: config.lighthouseRadius }, ...battle.devices
          .filter(device => device.health > 0 && !device.consumed).map(device => ({ ...device, radius: config.devices.definitions[device.kind].radius }))]) {
          const p = this.point(target.x,target.y), r = Math.max(8,(target.radius+8)*this.unit);
          g.lineStyle(2,0x93b2f7,alpha); g.strokeEllipse(p.x,p.y,r*2,r*2*WORLD_PROJECTION_Y);
        }
      }
      if (rules.abilityId === 'barrage') {
        const event = battle.events.find(event => event.type === 'ability-used' && event.abilityId === 'barrage'
          && (battle.tick - event.tick) * config.stepSeconds <= .55);
        if (!event) return;
        const p = this.point(event.x,event.y), r = Math.max(9,18*this.unit);
        g.lineStyle(2,0xffbc79,.85);
        g.strokeEllipse(p.x,p.y,2*r,2*r*WORLD_PROJECTION_Y);
        g.lineBetween(p.x-r-4,p.y,p.x-r+4,p.y); g.lineBetween(p.x+r-4,p.y,p.x+r+4,p.y);
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
      if (hasWorldCanvas(config)) {
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
      if (hasWorldCanvas(config)) return;
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
    private drawDeviceIndicators(device: DeviceState, config: NightConfig, battle: Readonly<BattleState>): void {
      if (device.health <= 0 || device.consumed) return;
      const g = this.ink, definition = config.devices.definitions[device.kind];
      const p = this.point(device.x, device.y), r = Math.max(5, definition.radius * this.unit);
      if (campaignDeviceStatus(device, battle)) {
        g.lineStyle(2, 0xc5a2ef, .96);
        g.strokeEllipse(p.x, p.y, (r + 4) * 2, (r + 4) * 1.45);
        g.lineBetween(p.x - 4, p.y - r - 5, p.x + 4, p.y - r - 5);
      }
      if (device.health >= definition.health) return;
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
      if (!hasWorldCanvas(config) && this.camera) {
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
    }
    /** Cool dashed guide and hollow diamond distinguish intent from the warm damaging beam. */
    private drawAim(config: NightConfig, angle: number): void {
      const g = this.ink, radius = config.beam.range;
      const end = this.point(Math.cos(angle) * radius, Math.sin(angle) * radius);
      g.lineStyle(1, 0x9ce8f4, .6);
      // Start outside the tower. Dashes remain constant in screen pixels on phones.
      const length = Math.hypot(end.x - this.cx, end.y - this.cy);
      if (!hasWorldCanvas(config)) {
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
      if (hasWorldCanvas(config)) return;
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
      if (hasWorldCanvas(config) && this.camera && (battleArtwork || !isPrototypeArtwork(enemy.kind))) return battleEnemyBounds(enemy, config, this.camera);
      const p = this.point(enemy.x, enemy.y), radius = Math.max(7, config.enemies[enemy.kind].radius * this.unit);
      return { x: p.x - radius * 1.3, y: p.y - radius * 1.2, width: radius * 2.6, height: radius * 2.5 };
    }
    private beamContact(config: NightConfig, battle: Readonly<BattleState>): { x: number; y: number } | undefined {
      const enemy = battle.enemies.find(entry => entry.id === battle.litEnemyIds[0]);
      const part = battle.boss?.tentacles.find(entry => entry.id === battle.litTentacleIds[0]);
      const axisDistance = ({ x, y }: { x: number; y: number }) => 1 - Math.cos(Math.atan2(y, x) - battle.beamAngle);
      if (part && (!enemy || axisDistance(part) < axisDistance(enemy))) {
        const p = this.point(part.x, part.y);
        const core = battle.boss?.campaign?.parts.some(entry => entry.zoneId === part.id && entry.id === 'core');
        const rise = config.boss?.id === 'abyss-warden' ? wardenSpriteSize(this.unit, !core) * (core ? .32 : .48) : 12 * this.unit;
        return { x: p.x, y: p.y - rise };
      }
      if (enemy) {
        const body = this.enemyBody(enemy, config);
        return { x: body.x + body.width / 2, y: body.y + body.height * .52 };
      }
      if (battle.ship?.lit) return this.point(battle.ship.x, battle.ship.y);
      return undefined;
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
      if (definition.movement !== 'flying') {
        g.fillStyle(0x071c25, .48); g.fillEllipse(p.x + 1, p.y + 1, r * 1.85, r * .46);
      }
      if ((enemy.burn?.remainingTicks ?? 0) > 0) { g.lineStyle(1.5,0xc8865b,.7); g.strokeEllipse(p.x,p.y+r*.5,r*2.5,r*.65); g.fillStyle(0xe5a16b,.8); g.fillCircle(p.x+r,p.y+r*.25,2); }
      if (bellSlowStatus(enemy, battle.tick, battle.devices)) { g.lineStyle(1.5,0x8fe4ca,.85); g.strokeEllipse(p.x,p.y+r*.7,r*3,r*.8); }
      if (lit) {
        const body = this.enemyBody(enemy, config);
        g.lineStyle(1.5, 0xffdf8e, .95);
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
          const x = dx < 0 ? body.x - 3 : body.x + body.width + 3;
          const y = dy < 0 ? body.y - 3 : body.y + body.height + 3;
          g.lineBetween(x, y, x - 5 * dx, y);
          g.lineBetween(x, y, x, y - 5 * dy);
        }
      }
      if (!isPrototypeArtwork(enemy.kind)) {
        if (battleWorldContext && hasWorldCanvas(config) && this.camera) paintCampaignEnemy(battleWorldContext, enemy, config, battle, this.camera, campaignArtwork);
        else {
          g.fillStyle(lit ? 0xffdfaa : 0x9dc0c1);
          g.fillTriangle(p.x, p.y-r, p.x+r, p.y+r*.7, p.x-r, p.y+r*.7);
        }
        return;
      }
      if (battleArtwork && battleWorldContext && hasWorldCanvas(config) && this.camera) {
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
    private drawEnemyIndicators(enemy: EnemyState, config: NightConfig, indicator: IndicatorRequest, style: BattleBarStyle, lit: boolean): void {
      const g = this.ink, definition = config.enemies[enemy.kind];
      const barWidth = indicator.width - style.padding * 2, barX = indicator.x + style.padding, barY = indicator.y + style.padding;
      g.fillStyle(0x101c27, .95); g.fillRect(indicator.x, indicator.y, indicator.width, indicator.height);
      // Armor sits above health, with a black gap; depletion never removes its track.
      const healthY = barY + (definition.armor > 0 ? style.fillHeight + style.gap : 0);
      g.fillStyle(0x422f36); g.fillRect(barX, healthY, barWidth, style.fillHeight);
      g.fillStyle(lit ? 0xf4aa90 : 0xd1847e); g.fillRect(barX, healthY, barWidth * clampBarFraction(enemy.health, definition.health), style.fillHeight);
      if (definition.armor > 0) {
        g.fillStyle(0x294653); g.fillRect(barX, barY, barWidth, style.fillHeight);
        g.fillStyle(0xa3b9cb); g.fillRect(barX, barY, barWidth * clampBarFraction(enemy.armor, definition.armor), style.fillHeight);
      }
    }
    private drawBlockedLabels(enemies: readonly EnemyState[], config: NightConfig, battle: Readonly<BattleState>, indicators: readonly IndicatorRect[]): void {
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
        const threat = [enemyThreat(enemy, config), bellSlowStatus(enemy, battle.tick, battle.devices), burning ? 'ТЛЕЕТ' : ''].filter(Boolean).join(' · ');
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
  const resize = new ResizeObserver(() => {
    watchLettering.sync();
    treeControls.resize();
    if (game.isBooted) syncViewport(game.scale);
    layoutReferenceMenu(overlay);
    layoutReferenceSettings(overlay, application.view);
    layoutGameMenu(overlay);
    layoutCampaignDevelopment(overlay);
    layoutSharedScenery();
    settingsTransition.sync();
    gameMenuTransition.sync();
  });
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
    abilityAim = false; abilityFeedback = '';
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
    if (enemy && application.view.config.enemies[enemy.kind].movement === 'flying' && device?.kind !== 'harpoon') { targetNotice = 'Это устройство не атакует летающие цели.'; renderHud(application.view); return; }
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
    if (campaignRewardAction(application, button.dataset.action ?? '', button)) { renderHud(application.view); return; }
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
      case 'flash': {
        const selected = application.view.config.ability?.abilityId;
        if (!selected) application.command({ type: 'flash' });
        else if (selected === 'seal' || selected === 'barrage') {
          if (selectedDevice !== null) closeDevice();
          abilityAim = !abilityAim; abilityFeedback = '';
        } else application.command({ type: 'use-ability' });
        break;
      }
      case 'campaign-filter': campaignFilter = button.dataset.filter ?? 'all'; campaignNode = undefined; break;
      case 'campaign-select-node': campaignNode = button.dataset.node; campaignFilter = button.dataset.filter ?? campaignFilter; break;
      case 'campaign-select-reward': collectionReward = button.dataset.rewardId; break;
      case 'campaign-purchase': if (button.dataset.node) application.purchaseCampaignNode?.(button.dataset.node); break;
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
      case 'reload-campaign':
        if (reloadDialog && application.view.error) {
          reloadDialog.returnValue = 'cancel';
          reloadDialog.showModal();
        }
        break;
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
    if (reloadDialog?.open) return;
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
    if (abilityAim) { abilityAim = false; abilityFeedback = ''; }
    else if (selectedDevice !== null) closeDevice();
    else if (confirmNewGame) { application.cancelNewGame(); if (!application.view.error) confirmNewGame = false; }
    else if (confirmAbandon) confirmAbandon = false;
    else if (application.view.screen === 'settings') { closeSettingsWithMotion(); return; }
    else if (application.view.screen === 'development' || application.view.screen === 'collection') application.back();
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
    campaignAmbience.sync();
    layoutReferenceSettings(overlay, application.view);
    if (action === 'effects-volume') effectsAudio.preview(event);
    if (application.view.settingsError) { settingsPointerHeld = false; renderHud(application.view); }
    else if (event.type === 'change') renderHud(application.view);
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
  window.addEventListener('focus', refreshRewardClock);
  document.addEventListener('visibilitychange', refreshRewardClock);
  renderHud(application.view);
  return { destroy() { destroyed = true; preparationControls.destroy(); treeControls.destroy(); menuAudio.destroy(); effectsAudio.destroy(); campaignAmbience.destroy(); settingsTransition.destroy(); gameMenuTransition.destroy(); menuMotion.destroy(); menuWindows.destroy(); menuTitle.destroy(); watchLettering.destroy(); menuButtons.destroy(); clearTimeout(panelReleaseTimer); window.clearTimeout(rewardExpiryTimer); root.removeEventListener('input', changeVolume); root.removeEventListener('change', changeVolume); root.removeEventListener('pointerdown', panelPointerDown); window.removeEventListener('pointerup', panelPointerUp); window.removeEventListener('pointercancel', panelPointerCancel); window.removeEventListener('focus', refreshRewardClock); document.removeEventListener('visibilitychange', refreshRewardClock); resize.disconnect(); root.removeEventListener('click', click); root.removeEventListener('pointermove', placementMove); window.removeEventListener('keydown', keydown); game.destroy(true); root.replaceChildren(); } };
}
