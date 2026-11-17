import { describe, expect, it } from 'vitest';
import type { BattleCommand, BattleState, GameApplication, NightConfig, SaveStore } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { UPGRADES } from '../src/content/upgrades';
import { LighthouseApplication } from '../src/application/gameApplication';
import { decodeSave, emptySave } from '../src/application/saves';
import { selectBeamTargets } from '../src/simulation/beam';
import { grantFixtureDevices } from './helpers/devices';

/** Reproducible input policy for integration checks, not a human playtest. */
function defend(state: BattleState, config: NightConfig): BattleCommand[] {
  const zones = state.boss && state.boss.health > 0 ? state.boss.tentacles : [];
  let angle = state.beamAngle, best = -Infinity;
  for (const candidate of [...state.enemies, ...zones]) {
    const axis = Math.atan2(candidate.y, candidate.x);
    const selection = selectBeamTargets(state.enemies, config, axis, state.ship, state.boss);
    let score = selection.lit.reduce((sum, id) => {
      const enemy = state.enemies.find(entry => entry.id === id)!;
      return sum + 3 + 250 / (30 + Math.hypot(enemy.x, enemy.y)) + (enemy.kind === 'bat' ? 1.5 : 0);
    }, 0);
    for (const id of selection.litTentacles ?? []) {
      const zone = zones.find(entry => entry.id === id)!;
      score += 2 + 150 / (60 + Math.hypot(zone.x, zone.y));
    }
    if (score > best) { best = score; angle = axis; }
  }
  const commands: BattleCommand[] = [{ type: 'aim', angle }];
  if (state.flash.cooldownRemaining <= 1e-9 && [...state.enemies, ...zones].some(body => Math.hypot(body.x, body.y) < config.flash.radius)) commands.push({ type: 'flash' });
  return commands;
}
function play(app: GameApplication): void {
  for (let tick = 0; tick < 9000 && app.view.screen === 'battle'; tick++) {
    for (const command of defend(app.view.battle!, app.view.config)) app.command(command);
    app.advance(1000 / 30);
  }
  expect(app.view.result?.outcome).toBe('victory');
  expect(app.view.result?.saved).toBe(true);
}
function prepareBoss(app: GameApplication): void {
  app.openPreparation();
  app.clearPlacements();
  for (const kind of ['generator', 'cannon'] as const) {
    if (app.view.profile.devices.filter(device => device.kind === kind).length < 2) app.purchaseDevice(kind);
    for (const device of app.view.profile.devices.filter(device => device.kind === kind)) app.repairDevice(device.id);
  }
  app.selectDevice('generator'); app.placeDevice(-75, -50); app.placeDevice(-75, 50);
  app.selectDevice('cannon'); app.placeDevice(-150, -70); app.placeDevice(-150, 70);
  expect(app.view.preparation.placements).toHaveLength(4);
  app.start();
}

describe('stage 5 playable progression loop', () => {
  it('wins a boss night, buys and equips a lens, repeats capped levels and enters chapter two', () => {
    const save = emptySave();
    save.profile.resources = 3000; save.profile.completedNights = 3;
    save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide'];
    save.profile.purchasedUpgrades = UPGRADES.slice(0, 14).map(node => node.id);
    grantFixtureDevices(save.profile);
    let raw = JSON.stringify(save), sequence = 0;
    const store: SaveStore = { read: () => raw, write: value => { raw = value; } };
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `acceptance-${++sequence}`, seed: 42 }), undefined, NIGHT_CATALOG);
    app.selectNight('abyss-warden'); prepareBoss(app); play(app);
    expect(app.view.result).toMatchObject({ bossDefeated: true, bossMaterials: 2 });
    expect(app.view.profile).toMatchObject({ bossMaterials: 2, bossLevel: 2 });
    expect(app.view.nights.find(night => night.id === 'far-shore')?.available).toBe(true);
    app.openDevelopment(); app.purchaseLens('expanded'); app.back();
    expect(app.view.profile.bossMaterials).toBe(0);
    app.openPreparation(); app.selectLens('expanded'); prepareBoss(app); play(app);
    expect(app.view.profile).toMatchObject({ bossMaterials: 3, bossLevel: 3, selectedLensId: 'expanded' });
    prepareBoss(app); play(app);
    expect(app.view.profile).toMatchObject({ bossMaterials: 7, bossLevel: 3 });
    prepareBoss(app); play(app);
    expect(app.view.profile).toMatchObject({ bossMaterials: 11, bossLevel: 3 });
    app.openDevelopment(); app.purchaseLens('slowing'); app.back();
    app.selectNight('far-shore'); app.openPreparation(); app.selectLens('slowing'); app.start(); play(app);
    expect(app.view.profile.bossMaterials).toBe(8);
    const persisted = decodeSave(raw);
    expect(persisted.profile.wonNightIds).toContain('far-shore');
    expect(persisted.activeAttempt).toBeNull();
    expect(new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG).view.profile).toEqual(persisted.profile);
  });
});
