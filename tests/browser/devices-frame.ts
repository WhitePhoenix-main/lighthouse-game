/** Isolated browser fixture: synthetic damage feeds the real application settlement. */
import type { BattleState } from '../../src/contracts';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';
const key = 'devices-browser-fixture';
if (!localStorage.getItem(key)) {
  const seed = emptySave();
  const { devices: _devices, nextDeviceId: _nextId, ...profile } = seed.profile;
  profile.resources = 300; profile.legacyEquipment = true;
  localStorage.setItem(key, JSON.stringify({ ...seed, version: 4, profile }));
}
const config = structuredClone(NIGHT_CONFIG); config.devices.typeSlots = 3;
const app = new LighthouseApplication({ read: () => localStorage.getItem(key), write: raw => localStorage.setItem(key, raw) },
  config, () => ({ id: crypto.randomUUID(), seed: 42 }),
  { read: () => JSON.stringify({ version: 3, language: 'ru', textSize: 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 }), write: () => {} });
app.openPreparation();
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
Object.assign(window, { deviceFixture: { app, saved: () => JSON.parse(localStorage.getItem(key)!), defeat: () => {
  const battle = app.view.battle as BattleState;
  for (const device of battle.devices) { device.health = device.kind === 'generator' ? 0 : device.health / 2; device.consumed = device.kind === 'light-trap'; }
  battle.outcome = 'defeat'; app.advance(0);
} } });
import.meta.hot?.dispose(() => game.destroy());
