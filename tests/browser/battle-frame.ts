import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { mountGame } from '../../src/presentation/game';
import { bindLifecycle } from '../../src/platform/browser';
import { loadBattleArtwork } from '../../src/presentation/battle/battleArtwork';
import { worldToScreen, deviceSprite, spriteBounds } from '../../src/presentation/shared/world/worldGeometry';
import type { EnemyKind, NightId } from '../../src/contracts';
import type { WorldCamera } from '../../src/presentation/shared/world/worldTypes';

const params = new URLSearchParams(location.search), save = emptySave();
save.profile.resources = 500;
save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide'];
save.profile.purchasedUpgrades = ['unlock-cannon', 'unlock-barrier', 'unlock-flash'];
save.profile.devices = [
  { id: 1, kind: 'cannon', health: 70, consumed: false, position: { x: -140, y: -140 } },
  { id: 2, kind: 'cannon', health: 42, consumed: false, position: { x: -140, y: 140 } },
  { id: 3, kind: 'barrier', health: 140, consumed: false, position: { x: -230, y: 0 } },
];
save.profile.nextDeviceId = 4;
let raw: string | null = JSON.stringify(save), identities = 0;
const settings = { version: 3, language: params.has('en') ? 'en' : 'ru', textSize: params.has('large') ? 'large' : 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 };
const nights = params.has('armor') ? NIGHT_CATALOG.map(night => night.id === 'winged-tide' ? { ...night, config: { ...night.config, waves: night.config.waves.map((wave, index) => index === 0 ? { ...wave, enemies: ['turtle', 'turtle', 'turtle', 'ghost', 'minotaur', 'bat'] as EnemyKind[] } : wave) } } : night) : NIGHT_CATALOG;
const app = new LighthouseApplication({ read: () => raw, write(value) { raw = value; } }, NIGHT_CONFIG, () => ({ id: `battle-fixture-${++identities}`, seed: 42 }), { read: () => JSON.stringify(settings), write: () => {} }, nights);
app.openPreparation();
const night = params.get('night') as NightId | null;
app.selectNight(night ?? 'winged-tide');
app.start();
// The fixture advances the real simulation only through the public application.
// A frozen render clock allows repeatable screenshots without a pause overlay.
const advance = app.advance.bind(app);
let frozen = true;
app.advance = (delta: number) => { if (!frozen) advance(delta); };
const step = (seconds: number): void => { for (let index = 0; index < Math.round(seconds / .05); index++) advance(50); };
app.command({ type: 'aim', angle: -2.5 });
if (params.has('armor')) step(8);
else { step(12); app.command({ type: 'callWave' }); step(8); }
const target = app.view.battle?.enemies.find(enemy => enemy.kind === 'turtle') ?? app.view.battle?.enemies.find(enemy => Math.hypot(enemy.x, enemy.y) < app.view.config.beam.range);
if (target) { app.command({ type: 'aim', angle: Math.atan2(target.y, target.x) }); step(.8); }
const fixture = {
  app, step, assetsReady: false, freeze(value: boolean) { frozen = value; }, raw: () => JSON.parse(raw ?? 'null'),
  point(x: number, y: number) {
    const canvas = document.querySelector<HTMLCanvasElement>('.chapter-world-underlay')!, bounds = canvas.getBoundingClientRect();
    const camera = JSON.parse(canvas.dataset.worldCamera!) as WorldCamera;
    const point = worldToScreen(camera, x, y);
    return { x: bounds.x + point.x, y: bounds.y + point.y };
  },
  deviceCenter(id: number) {
    const canvas = document.querySelector<HTMLCanvasElement>('.chapter-world-underlay')!, rect = canvas.getBoundingClientRect(), camera = JSON.parse(canvas.dataset.worldCamera!) as WorldCamera;
    const device = app.view.battle!.devices.find(entry => entry.id === id)!, body = spriteBounds(device.x, device.y, deviceSprite(device.kind)!);
    return { x: rect.x + camera.x + (body.minX + body.maxX) / 2 * camera.zoom, y: rect.y + camera.y + (body.minY + body.maxY) / 2 * camera.zoom };
  },
  enemyCenter(id: number) {
    const canvas = document.querySelector<HTMLCanvasElement>('.chapter-world-underlay')!, rect = canvas.getBoundingClientRect();
    const body = (JSON.parse(canvas.dataset.enemyBodies!) as { id: number; x: number; y: number; width: number; height: number }[]).find(entry => entry.id === id)!;
    return { x: rect.x + body.x + body.width / 2, y: rect.y + body.y + body.height / 2 };
  },
};
Object.assign(window, { battleFixture: fixture });
void loadBattleArtwork().then(() => { fixture.assetsReady = true; });
const unbind = bindLifecycle(app), game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
import.meta.hot?.dispose(() => { unbind(); game.destroy(); });
