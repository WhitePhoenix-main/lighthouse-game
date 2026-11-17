/** Dedicated test origin and session key: no access to player profile storage. */
import type { BattleState, LensId } from '../../src/contracts';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { UPGRADES } from '../../src/content/upgrades';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { mountGame } from '../../src/presentation/game';
const seed = emptySave(), oldIds = LENS_UPGRADES.slice(0,27).map(n => n.id);
Object.assign(seed.profile, { resources: 10000, bossMaterials: 100, bossLevel: 2, unlockedLenses: LENSES.map(l => l.id), lensUpgrades: oldIds, purchasedUpgrades: UPGRADES.map(n => n.id), wonNightIds: ['first-light','broken-shore','winged-tide','abyss-warden'], completedNights: 4, devices: [{ id: 1, kind: 'cannon', health: 60, consumed: false, position: null }], nextDeviceId: 2 });
for (const kind of ['barrier','generator','harpoon','mortar','bell','light-trap','repair-lamp'] as const) seed.profile.devices.push({ id:seed.profile.nextDeviceId++, kind, health:NIGHT_CONFIG.devices.definitions[kind].health, consumed:false, position:null, ...(kind === 'light-trap' ? {trapCharges:1} : {}) });
const key = 'lighthouse-stage7-fixture-' + location.search;
let id = 0, saved = sessionStorage.getItem(key) ?? JSON.stringify(seed);
const app = new LighthouseApplication({ read: () => saved, write: raw => { saved = raw; sessionStorage.setItem(key, raw); } }, NIGHT_CONFIG, () => ({ id: 'stage7-' + ++id, seed: 42 }), { read: () => JSON.stringify({ version:3, language:'ru', textSize:'normal', soundEnabled:false, musicVolume:0, effectsVolume:0 }), write: () => {} });
app.openDevelopment(); const advance = app.advance.bind(app); app.advance = () => {};
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
function battle() { return app.view.battle as BattleState; }
Object.assign(window, { stage7Fixture: { app, saved: () => JSON.parse(saved), scene: (lensId: LensId) => {
  const b = battle(), config = app.view.config;
  const old = calculateNightConfig(NIGHT_CONFIG, seed.profile.purchasedUpgrades, false, { lensId, upgrades: oldIds });
  config.enemies = { ...config.enemies, ghost: { ...config.enemies.ghost, health:10000, radius:1, speed:10, attackDamage:0 } };
  const radius = lensId === 'slowing' ? old.beam.range + 7 : 180;
  const angle = lensId === 'armor-breaker' ? old.beam.halfAngle + Math.PI / 180 : 0;
  const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
  b.enemies = [{ id:800, kind:'ghost', x,y, health:10000, armor:lensId === 'armor-breaker' ? 10000 : 0, attackCooldown:10000, waveIndex:0 }];
  b.waves.forEach((wave,index) => { wave.started = true; wave.spawned = config.waves[index]!.enemies.length; }); b.nextWaveAt = Infinity;
  b.devices.forEach(d => d.attackCooldown = 10000);
  b.beamAngle = 0; app.command({ type:'aim', angle:0 });
  return { x,y,radius, oldRange:old.beam.range, oldHalfAngle:old.beam.halfAngle, angle, dps:config.beam.damagePerSecond, dt:config.stepSeconds, slow:config.lens!.slowMultiplier, armor:config.lens!.armorMultiplier };
}, finish: () => { battle().outcome = 'defeat'; advance(app.view.config.stepSeconds * 1000); }, steps: (count:number) => { for (let i=0;i<count;i++) advance(app.view.config.stepSeconds * 1000); } } });
import.meta.hot?.dispose(() => game.destroy());
