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
const app = new LighthouseApplication({ read: () => saved, write: raw => { saved = raw; } }, NIGHT_CONFIG, () => ({ id: 'stage3-' + ++id, seed: 42 }), { read: () => JSON.stringify({ version: 3, language: 'ru', textSize: 'normal', soundEnabled: false, musicVolume: 0, effectsVolume: 0 }), write: () => {} });
app.openDevelopment();
const advance = app.advance.bind(app); app.advance = () => {};
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
Object.assign(window, { stage3Fixture: { app, saved: () => JSON.parse(saved), scene: () => {
  const battle = app.view.battle as BattleState, config = app.view.config;
  config.enemies = { ...config.enemies, ghost: { ...config.enemies.ghost, health: 1000, armor: 0 }, bat: { ...config.enemies.bat } };
  battle.enemies = [{id:800,kind:'ghost',x:-210,y:40,health:config.enemies.ghost.health,armor:0,attackCooldown:10000,waveIndex:0},{id:801,kind:'bat',x:-210,y:-40,health:config.enemies.bat.health,armor:0,attackCooldown:10000,waveIndex:0}];
  battle.waves.forEach((wave,index)=>{wave.started=true;wave.spawned=config.waves[index]!.enemies.length;}); battle.nextWaveAt=Infinity;
  battle.beamAngle=0;app.command({type:'aim',angle:0});
  return {speed:config.enemies.ghost.speed,multiplier:config.devices.bell.slowMultiplier};
}, resonanceScene: () => {
  const battle=app.view.battle as BattleState,config=app.view.config;
  config.enemies={...config.enemies,ghost:{...config.enemies.ghost,speed:0}};
  battle.enemies=[{id:900,kind:'ghost',x:200,y:30,health:config.enemies.ghost.health,armor:0,attackCooldown:10000,waveIndex:0},{id:901,kind:'ghost',x:200,y:-30,health:config.enemies.ghost.health,armor:0,attackCooldown:10000,waveIndex:0}];
  battle.beamAngle=0;app.command({type:'aim',angle:0});
  return {damage:config.beam.damagePerSecond*config.stepSeconds,paired:config.pairedDamageBonus??0,bonus:config.lens!.resonance!.damageBonus};
}, steps: (count:number)=>{for(let i=0;i<count;i++)advance(app.view.config.stepSeconds*1000);} } });
import.meta.hot?.dispose(()=>game.destroy());
