/** Isolated real application + Phaser input fixture. Never accesses the player's save. */
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';
const seed = emptySave();
seed.profile.resources = 300;
seed.profile.legacyEquipment = true;
const { devices: _devices, nextDeviceId: _nextId, ...profile } = seed.profile;
let saved = JSON.stringify({ ...seed, version: 4, profile });
const app = new LighthouseApplication({ read: () => saved, write: raw => { saved = raw; } },
  structuredClone(NIGHT_CONFIG), () => ({ id: 'turning-fixture', seed: 42 }),
  { read: () => JSON.stringify({ version: 3, language: 'ru', textSize: 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 }), write: () => {} });
app.openPreparation();
app.selectDevice('cannon');
app.placeDevice(-100, 0);
app.start();
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
Object.assign(window, { turningFixture: { app, initialBattle: app.view.battle } });
import.meta.hot?.dispose(() => game.destroy());
