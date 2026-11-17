import { describe, expect, it } from 'vitest';
import type { BattleState, EnemyState, LensUpgradeDefinition, SaveStore } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { getBossRules } from '../src/content/boss';
import { calculateNightConfig } from '../src/progression/upgrades';
import { validateLensDefinitions } from '../src/progression/lenses';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';

function setup() {
  const config = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'smoldering', upgrades: [] });
  config.waves = [{ id: 'burn', enemies: ['ghost', 'ghost'], spawnInterval: 1000 }];
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 10000;
  const state = createBattle(config, 42);
  const target: EnemyState = { id: 1, kind: 'ghost', x: 200, y: 0, health: 10000, armor: 0, attackCooldown: 0, waveIndex: 0 };
  state.enemies = [target];
  state.beamAngle = state.desiredBeamAngle = 0;
  return { config, state, target };
}
function away(state: BattleState): void { state.beamAngle = state.desiredBeamAngle = Math.PI; }

describe('smoldering lens', () => {
  it('uses preliminary balance and computes all four branches only for the selected lens', () => {
    const { config } = setup();
    expect(config.beam.damagePerSecond).toBeCloseTo(21);
    expect(config.beam.maxTargets).toBe(2);
    expect(config.lens).toMatchObject({ slowMultiplier: 1, armorMultiplier: 1, burn: { seconds: 2, damagePerSecond: 6 } });
    const ids = LENS_UPGRADES.filter(node => node.lensId === 'smoldering').map(node => node.id);
    const upgraded = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'smoldering', upgrades: ids });
    expect(upgraded.beam.damagePerSecond).toBeCloseTo(24);
    expect(upgraded.lens?.burn).toEqual({ seconds: 3, damagePerSecond: 10 });
    const basic = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'basic', upgrades: ids });
    expect(basic.lens?.burn).toBeUndefined();
    expect(basic.beam.damagePerSecond).toBe(30);
  });

  it('ticks while lit, refreshes without stacking and lasts 60 complete residual steps', () => {
    const { config, state, target } = setup();
    for (let i = 0; i < 10; i++) stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(10000 - 10 * .9);
    expect(target.burn).toEqual({ remainingTicks: 60 });
    away(state);
    for (let i = 0; i < 59; i++) stepBattle(state, config, []);
    expect(target.burn).toEqual({ remainingTicks: 1 });
    stepBattle(state, config, []);
    expect(target.burn).toBeUndefined();
    expect(target.health).toBeCloseTo(10000 - 9 - 12);
    const before = target.health;
    stepBattle(state, config, []);
    expect(target.health).toBe(before);
  });

  it('refreshes a partially elapsed effect and rounds partial durations up to full ticks', () => {
    const { config, state, target } = setup();
    config.lens!.burn!.seconds = .05;
    stepBattle(state, config, []);
    away(state); stepBattle(state, config, []);
    expect(target.burn?.remainingTicks).toBe(1);
    state.beamAngle = state.desiredBeamAngle = 0;
    stepBattle(state, config, []);
    expect(target.burn?.remainingTicks).toBe(2);
    away(state); stepBattle(state, config, []); stepBattle(state, config, []);
    expect(target.burn).toBeUndefined();
  });

  it('spends residual damage on armor first without inheriting the beam armor multiplier', () => {
    const { config, state, target } = setup();
    config.beam.damagePerSecond = 0;
    config.lens!.armorMultiplier = 3;
    target.armor = .3;
    stepBattle(state, config, []);
    expect(target.armor).toBeCloseTo(.1);
    expect(target.health).toBe(10000);
    away(state); stepBattle(state, config, []);
    expect(target.armor).toBe(0);
    expect(target.health).toBeCloseTo(9999.9);
  });

  it('ignites only actual selected living targets after range, occlusion and target limits', () => {
    const { config, state, target } = setup();
    state.enemies.push({ ...target, id: 2, x: 100 }, { ...target, id: 3, x: 500 });
    stepBattle(state, config, []);
    expect(state.blockedEnemyIds).toContain(1);
    expect(target.burn).toBeUndefined();
    expect(state.enemies.find(enemy => enemy.id === 2)!.burn).toBeDefined();
    expect(state.enemies.find(enemy => enemy.id === 3)!.burn).toBeUndefined();
    state.enemies = [target, { ...target, id: 4, x: 180, y: 30 }];
    config.beam.maxTargets = 1;
    stepBattle(state, config, []);
    expect(target.burn).toBeDefined();
    expect(state.enemies[1]!.burn).toBeUndefined();
  });

  it('never applies burn bonuses from paired illumination or focused hold', () => {
    const { config, state, target } = setup();
    config.pairedDamageBonus = 1;
    config.lens!.focus = { seconds: .01, damageBonus: 1 };
    config.beam.damagePerSecond = 0;
    state.enemies.push({ ...target, id: 2, x: 200, y: 35 });
    for (let i = 0; i < 5; i++) stepBattle(state, config, []);
    expect(state.litEnemyIds).toHaveLength(2);
    expect(target.health).toBeCloseTo(9999);
    expect(state.enemies[1]!.health).toBeCloseTo(9999);
  });

  it('burning targets count as unlit for movement and paired damage', () => {
    const { config, state, target } = setup();
    stepBattle(state, config, []);
    target.y = 150;
    state.enemies.push({ ...target, id: 2, x: 200, y: 0, burn: undefined });
    config.enemies.ghost.speed = 30;
    config.lens!.slowMultiplier = .1;
    config.pairedDamageBonus = 1;
    const distance = Math.hypot(target.x, target.y), health = state.enemies[1]!.health;
    stepBattle(state, config, []);
    expect(state.litEnemyIds).toEqual([2]);
    expect(Math.hypot(target.x, target.y)).toBeCloseTo(distance - 1);
    expect(state.enemies[1]!.health).toBeCloseTo(health - .9);
    expect(state.focus.targetId).toBeNull();
  });

  it('stores one effect on a boss owner even when two tentacles receive direct damage', () => {
    const { config, state } = setup();
    config.boss = { ...getBossRules(1), speed: 0 };
    state.boss = { id: 'abyss-warden', health: 1000, stunnedUntilTick: 0,
      tentacles: [{ id: -1001, x: 150, y: -20, attackCooldown: 0 }, { id: -1002, x: 150, y: 20, attackCooldown: 0 }] };
    state.enemies = [];
    stepBattle(state, config, []);
    expect(state.litTentacleIds).toHaveLength(2);
    expect(state.boss.health).toBeCloseTo(1000 - 1.4 - .2);
    expect(state.boss.burn?.remainingTicks).toBe(60);
    away(state); stepBattle(state, config, []);
    expect(state.boss.health).toBeCloseTo(998.2);
    expect(state.boss.burn?.remainingTicks).toBe(59);
    expect(state.litTentacleIds).toEqual([]);
  });

  it('residual boss burn does not suppress attacks or slow tentacles', () => {
    const { config, state } = setup();
    config.boss = { ...getBossRules(1), speed: 30 };
    const radius = config.lighthouseRadius + config.boss.radius;
    state.boss = { id: 'abyss-warden', health: 1000, stunnedUntilTick: 0, burn: { remainingTicks: 5 },
      tentacles: [{ id: -1001, x: radius + .5, y: 0, attackCooldown: 0 }] };
    away(state);
    const before = state.lighthouseHealth;
    stepBattle(state, config, []);
    expect(state.boss.tentacles[0]!.x).toBeCloseTo(radius);
    expect(state.lighthouseHealth).toBe(before - config.boss.attackDamage);
    expect(state.boss.stunnedUntilTick).toBe(0);
  });

  it('does not ignite ships or enemies killed by direct light', () => {
    const { config, state, target } = setup();
    target.health = .1;
    stepBattle(state, config, []);
    expect(target.burn).toBeUndefined();
    expect(state.events.filter(event => event.type === 'enemy-died')).toHaveLength(1);
    config.ship = { x: 150, y: 0, radius: 18, rescueSeconds: 6, deadline: 24, reward: 12 };
    state.ship = { ...config.ship, progress: 0, remaining: 24, status: 'waiting', lit: false };
    stepBattle(state, config, []);
    expect(state.ship.lit).toBe(true);
    expect('burn' in state.ship).toBe(false);
  });

  it('settles a residual kill once and ends the night normally', () => {
    const { config, state, target } = setup();
    config.waves = [{ id: 'one', enemies: ['ghost'], spawnInterval: 1 }];
    target.health = 1.1;
    stepBattle(state, config, []);
    away(state);
    for (let i = 0; i < 4; i++) stepBattle(state, config, []);
    expect(state.outcome).toBe('victory');
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(config.enemies.ghost.reward);
    expect(state.events.filter(event => event.type === 'enemy-died')).toHaveLength(1);
    expect(target.burn).toBeUndefined();
  });

  it('replays deterministically from a burning state snapshot', () => {
    const { config, state } = setup();
    stepBattle(state, config, []);
    const restored: BattleState = structuredClone(state);
    for (let i = 0; i < 80; i++) {
      const commands = [{ type: 'aim' as const, angle: i < 40 ? Math.PI : 0 }];
      stepBattle(state, config, commands); stepBattle(restored, config, commands);
    }
    expect(restored).toEqual(state);
  });

  it('freezes burn during application pause and resumes without catch-up damage', () => {
    const base = structuredClone(NIGHT_CONFIG);
    base.beam.halfAngle = Math.PI;
    base.beam.range = 1000;
    base.enemies.ghost.health = 10000;
    base.enemies.ghost.speed = 0;
    base.waves = [{ id: 'pause-burn', enemies: ['ghost'], spawnInterval: 1 }];
    const save = emptySave();
    save.profile.unlockedLenses.push('smoldering'); save.profile.selectedLensId = 'smoldering';
    let value = JSON.stringify(save);
    const store: SaveStore = { read: () => value, write: next => { value = next; } };
    const app = new LighthouseApplication(store, base, () => ({ id: 'burn-pause', seed: 42 }));
    app.openPreparation(); app.selectLens('smoldering'); app.start(); app.advance(34);
    expect(app.view.battle!.enemies[0]!.burn?.remainingTicks).toBe(60);
    app.pause(); const frozen = structuredClone(app.view.battle);
    app.advance(60000);
    expect(app.view.battle).toEqual(frozen);
    app.resume(); app.advance(34);
    expect(app.view.battle!.tick).toBe(frozen!.tick + 1);
    expect(app.view.battle!.enemies[0]!.health).toBeCloseTo(frozen!.enemies[0]!.health - .9);
  });
});

describe('burn content validation', () => {
  const lens = () => structuredClone(LENSES.find(item => item.id === 'smoldering')!);
  it.each([0, -1, NaN, Infinity, 61])('rejects invalid duration %s', seconds => {
    const definition = lens(); definition.burn!.seconds = seconds;
    expect(() => validateLensDefinitions([definition], [])).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 10001])('rejects invalid damage %s', damagePerSecond => {
    const definition = lens(); definition.burn!.damagePerSecond = damagePerSecond;
    expect(() => validateLensDefinitions([definition], [])).toThrow();
  });
  it('rejects burn on another lens, upgrades without burn and excessive combined effects', () => {
    const definition = lens();
    expect(() => validateLensDefinitions([{ ...definition, id: 'basic' }], [])).toThrow();
    const node: LensUpgradeDefinition = { ...structuredClone(LENS_UPGRADES.find(item => item.id === 'smoldering-duration')!), requires: [] };
    const plain = { ...definition }; delete plain.burn;
    expect(() => validateLensDefinitions([plain], [node])).toThrow();
    node.effect.amount = 60;
    expect(() => validateLensDefinitions([definition], [node])).toThrow();
    node.effect = { stat: 'burnDamagePerSecond', amount: 10000 };
    expect(() => validateLensDefinitions([definition], [node])).toThrow();
    expect(() => validateLensDefinitions()).not.toThrow();
  });
});
