/** Isolated old-profile migration and UI fixture. Never reads player storage. */
import type { BattleState } from '../../src/contracts';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { UPGRADES } from '../../src/content/upgrades';
import { mountGame } from '../../src/presentation/game';
const seed = emptySave();
const { devices: _devices, nextDeviceId: _id, ...profile } = seed.profile;
Object.assign(profile, { resources: 10000, bossMaterials: 100, legacyEquipment: true, purchasedUpgrades: UPGRADES.slice(0, 14).map(n => n.id), wonNightIds: ['first-light', 'broken-shore', 'winged-tide'], completedNights: 3 });
let saved = JSON.stringify({ ...seed, version: 4, profile });
let id = 0;
const app = new LighthouseApplication({ read: () => saved, write: raw => { saved = raw; } }, NIGHT_CONFIG, () => ({ id: 'expansion-' + ++id, seed: 42 }), { read: () => JSON.stringify({ version: 3, language: 'ru', textSize: 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 }), write: () => {} });
app.openDevelopment();
const advance = app.advance.bind(app); app.advance = () => {};
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
Object.assign(window, { expansionFixture: { app, saved: () => JSON.parse(saved), step: (ms = 100) => advance(ms), scene: () => {
  const battle = app.view.battle as BattleState;
  battle.enemies = [{ id: 800, kind: 'bat', x: -145, y: 0, health: app.view.config.enemies.bat.health, armor: 0, attackCooldown: 100, stunnedFor: 0, waveIndex: 0, charge: 'spent' } as unknown as BattleState['enemies'][number]];
  battle.desiredBeamAngle = 0;
}, focusScene: () => {
  const battle = app.view.battle as BattleState;
  const config = app.view.config;
  // Fixture changes the environment; focus itself is written only by stepBattle.
  config.enemies = { ...config.enemies, ghost: { ...config.enemies.ghost, speed: 0, health: 1000, armor: 0 } };
  const angle = battle.beamAngle;
  battle.enemies = [{ id: 900, kind: 'ghost', x: Math.cos(angle) * 150, y: Math.sin(angle) * 150, health: 1000, armor: 0, attackCooldown: 10000, waveIndex: 0 }];
  for (const device of battle.devices) device.attackCooldown = 10000;
  battle.waves.forEach((wave, index) => { wave.started = true; wave.spawned = config.waves[index]!.enemies.length; });
  battle.nextWaveAt = Infinity;
  app.command({ type: 'aim', angle });
  return { angle, health: 1000, damagePerStep: config.beam.damagePerSecond * config.stepSeconds, bonus: config.lens!.focus!.damageBonus };
}, steps: (count: number) => {
  for (let i = 0; i < count; i++) advance(app.view.config.stepSeconds * 1000);
}, moveOutOfRange: () => {
  const battle = app.view.battle as BattleState;
  const enemy = battle.enemies.find(entry => entry.id === 900)!;
  enemy.x = Math.cos(battle.beamAngle) * (app.view.config.beam.range + 100);
  enemy.y = Math.sin(battle.beamAngle) * (app.view.config.beam.range + 100);
} } });
import.meta.hot?.dispose(() => game.destroy());
