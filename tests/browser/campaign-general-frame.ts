/** Stage A control maps. Disposable in-memory profile; never imported by the production entry. */
import type { GameApplication } from '../../src/contracts';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { QUICK_TURN_DRAFT_RANKS, SHIELD_STABILIZATION_DRAFT_RANKS } from '../../src/content/campaignGeneralDraft';
import { mountGame } from '../../src/presentation/game';
import { hitShield } from '../../src/simulation/shield';
import { bindLifecycle } from '../../src/platform/browser';
import { grantFixtureDevices } from '../helpers/devices';

const style = document.createElement('style');
style.textContent = `
  body { margin: 0; }
  #campaign-controls { box-sizing: border-box; min-height: 96px; display: flex; flex-wrap: wrap; gap: 6px 12px;
    align-items: center; padding: 10px; background: #12252c; color: #e7eee8; font: 13px system-ui; }
  #campaign-controls strong { width: 100%; } #campaign-controls select, #campaign-controls button { font: inherit; padding: 6px; }
  #campaign-controls output { width: 100%; font: 12px monospace; overflow-wrap: anywhere; }
  #app { height: calc(100dvh - var(--control-height, 130px)); }
  #app .lighthouse-app { height: 100%; min-height: 0; }
`;
document.head.append(style);
const toolbar = document.querySelector<HTMLElement>('#campaign-controls')!;
const root = document.querySelector<HTMLElement>('#app')!;
const scenario = document.querySelector<HTMLSelectElement>('#control-scenario')!;
const rank = document.querySelector<HTMLSelectElement>('#control-rank')!;
const status = document.querySelector<HTMLOutputElement>('#control-status')!;
const turnButton = document.querySelector<HTMLButtonElement>('#control-turn')!;
const hitButton = document.querySelector<HTMLButtonElement>('#control-hit')!;
let mounted: { destroy(): void } | undefined;
let unbind: (() => void) | undefined;
let app: LighthouseApplication;
let saved = '';

function renderStatus(): void {
  const state = app.view.battle;
  if (!state) { status.textContent = 'Для нового контрольного боя нажмите «Начать заново».'; return; }
  const burst = !!state.quickTurn && state.tick < state.quickTurn.untilTick;
  const stability = state.tick < (state.shield.stabilizationUntilTick ?? 0);
  status.textContent = `t=${state.elapsed.toFixed(2)}с · угол=${(state.beamAngle * 180 / Math.PI).toFixed(1)}° · разворот=${burst ? 'ускорен' : 'обычный'} · поле=${state.shield.current.toFixed(2)}/${state.shield.maximum} · задержка=${state.shield.recoveryRemaining.toFixed(2)}с · стабилизация=${stability ? 'активна' : 'нет'}`;
}

function reset(): void {
  unbind?.(); mounted?.destroy();
  const config = structuredClone(NIGHT_CONFIG);
  const value = Number(rank.value);
  config.rulesVersion = 'stage-a-general-control-draft-1';
  if (value && scenario.value === 'turn') config.beam.quickTurn = structuredClone(QUICK_TURN_DRAFT_RANKS[value - 1]!);
  if (value && scenario.value === 'shield') config.shield.stabilization = structuredClone(SHIELD_STABILIZATION_DRAFT_RANKS[value - 1]!);
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 100000;
  config.waves = [{ id: 'control', enemies: ['ghost'], spawnInterval: 1 }];
  const seed = emptySave(); seed.profile.legacyEquipment = true;
  grantFixtureDevices(seed.profile);
  saved = JSON.stringify(seed);
  app = new LighthouseApplication({ read: () => saved, write: value => { saved = value; } }, config,
    () => ({ id: 'stage-a-control', seed: 42 }),
    { read: () => JSON.stringify({ version: 3, language: 'ru', textSize: 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 }), write: () => {} });
  app.openPreparation();
  if (scenario.value === 'shield') { app.selectDevice('generator'); app.placeDevice(-70, 0); }
  app.start();
  // Synthetic placement of the invulnerable marker is confined to this fixture.
  app.view.battle!.enemies[0]!.x = 0; app.view.battle!.enemies[0]!.y = 220;
  const observed = new Proxy(app, {
    get(target, key) {
      if (key === 'advance') return (delta: number) => { target.advance(delta); renderStatus(); };
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as GameApplication;
  mounted = mountGame(root, observed);
  unbind = bindLifecycle(app);
  turnButton.hidden = scenario.value !== 'turn'; hitButton.hidden = scenario.value !== 'shield';
  Object.assign(window, { campaignGeneralFixture: { app, readSaved: () => saved } });
  renderStatus();
}

turnButton.addEventListener('click', () => {
  if (app.view.battle) app.command({ type: 'aim', angle: app.view.battle.beamAngle + Math.PI });
});
hitButton.addEventListener('click', () => {
  if (!app.view.paused && app.view.battle) hitShield(app.view.battle, app.view.config, app.view.battle.shield.current, 0, 0);
  renderStatus();
});
scenario.addEventListener('change', reset); rank.addEventListener('change', reset);
document.querySelector('#control-reset')!.addEventListener('click', reset);
const resizeObserver = new ResizeObserver(() => root.style.setProperty('--control-height', `${toolbar.getBoundingClientRect().height}px`));
resizeObserver.observe(toolbar);
reset();
import.meta.hot?.dispose(() => { unbind?.(); mounted?.destroy(); resizeObserver.disconnect(); style.remove(); });
