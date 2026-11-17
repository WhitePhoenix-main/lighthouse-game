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
  const config = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'resonant', upgrades: [] });
  config.waves = [{ id: 'resonance', enemies: ['ghost', 'ghost', 'ghost'], spawnInterval: 1000 }];
  config.enemies.ghost.speed = 0;
  config.enemies.ghost.health = 10000;
  const state = createBattle(config, 42);
  const target: EnemyState = { id: 1, kind: 'ghost', x: 200, y: -25, health: 10000, armor: 0, attackCooldown: 0, waveIndex: 0 };
  state.enemies = [target, { ...target, id: 2, y: 25 }];
  state.beamAngle = state.desiredBeamAngle = 0;
  return { config, state, target };
}
function advance(state: BattleState, config: ReturnType<typeof setup>['config'], ticks: number): void {
  for (let i = 0; i < ticks; i++) stepBattle(state, config, []);
}

describe('resonant lens', () => {
  it('uses preliminary data and all four upgrade nodes only when selected', () => {
    const { config } = setup();
    expect(config.beam.damagePerSecond).toBeCloseTo(27);
    expect(config.beam.halfAngle).toBeCloseTo(NIGHT_CONFIG.beam.halfAngle * 1.1);
    expect(config.beam.maxTargets).toBe(2);
    expect(config.lens?.resonance).toEqual({ seconds: 2, damageBonus: .25 });
    const ids = LENS_UPGRADES.filter(node => node.lensId === 'resonant').map(node => node.id);
    const upgraded = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'resonant', upgrades: ids });
    expect(upgraded.beam.damagePerSecond).toBeCloseTo(31);
    expect(upgraded.beam.halfAngle).toBeCloseTo(config.beam.halfAngle + Math.PI / 90);
    expect(upgraded.lens?.resonance?.damageBonus).toBeCloseTo(.45);
    const basic = calculateNightConfig(NIGHT_CONFIG, [], false, { lensId: 'basic', upgrades: ids });
    expect(basic.lens?.resonance).toBeUndefined();
    expect(basic.beam.damagePerSecond).toBe(30);
  });

  it('gives normal damage for 60 complete steps and resonance from step 61', () => {
    const { config, state, target } = setup();
    advance(state, config, 60);
    expect(state.resonance.ticks).toBe(60);
    expect(target.health).toBeCloseTo(10000 - 60 * .9);
    const before = target.health;
    stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(before - .9 * 1.25);
  });

  it('resets immediately on losing a pair and requires the entire interval again', () => {
    const { config, state, target } = setup();
    advance(state, config, 61);
    state.enemies[1]!.y = 200;
    const before = target.health;
    stepBattle(state, config, []);
    expect(state.resonance.ticks).toBe(0);
    expect(target.health).toBeCloseTo(before - .9);
    state.enemies[1]!.y = 25;
    advance(state, config, 60);
    const rebuilt = target.health;
    stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(rebuilt - 1.125);
  });

  it('holds the group through a change of target identity', () => {
    const { config, state, target } = setup();
    advance(state, config, 60);
    state.enemies[1] = { ...state.enemies[1]!, id: 3 };
    const before = target.health;
    stepBattle(state, config, []);
    expect(state.resonance.ticks).toBe(61);
    expect(target.health).toBeCloseTo(before - 1.125);
  });

  it('never damages extra targets or builds resonance beyond the target limit', () => {
    const { config, state, target } = setup();
    const extra = { ...target, id: 3, x: 180, y: 0 };
    state.enemies.push(extra);
    advance(state, config, 61);
    expect(state.litEnemyIds).toHaveLength(2);
    const unselected = state.enemies.find(enemy => !state.litEnemyIds.includes(enemy.id))!;
    expect(unselected.health).toBe(10000);
    config.beam.maxTargets = 1;
    stepBattle(state, config, []);
    expect(state.resonance.ticks).toBe(0);
  });

  it('does not count fully occluded, distant, dead or merely burning enemies', () => {
    const { config, state, target } = setup();
    target.y = 0;
    state.enemies[1]!.x = 100; state.enemies[1]!.y = 0;
    state.enemies.push({ ...target, id: 3, x: 500 }, { ...target, id: 4, y: 200, burn: { remainingTicks: 100 } }, { ...target, id: 5, y: -25, health: 0 });
    advance(state, config, 61);
    expect(state.blockedEnemyIds).toContain(1);
    expect(state.litEnemyIds).toEqual([2]);
    expect(state.resonance.ticks).toBe(0);
    expect(target.health).toBe(10000);
  });

  it('excludes a ship from the hostile pair and retains the shared target cap', () => {
    const { config, state, target } = setup();
    state.enemies = [target];
    config.ship = { x: 180, y: 25, radius: 12, rescueSeconds: 100, deadline: 100, reward: 1 };
    state.ship = { ...config.ship, progress: 0, remaining: 100, status: 'waiting', lit: false };
    advance(state, config, 61);
    expect(state.ship.lit).toBe(true);
    expect(state.resonance.ticks).toBe(0);
    state.enemies.push({ ...target, id: 3, x: 200, y: -40 });
    stepBattle(state, config, []);
    expect(state.litEnemyIds).toHaveLength(1);
    expect(state.resonance.ticks).toBe(0);
  });

  it('counts separate boss zones and sums their damage on their owner', () => {
    const { config, state } = setup();
    config.boss = { ...getBossRules(1), speed: 0 };
    state.boss = { id: 'abyss-warden', health: 1000, stunnedUntilTick: 0,
      tentacles: [{ id: -1001, x: 150, y: -20, attackCooldown: 0 }, { id: -1002, x: 150, y: 20, attackCooldown: 0 }] };
    state.enemies = [];
    advance(state, config, 60);
    expect(state.litTentacleIds).toHaveLength(2);
    expect(state.boss.health).toBeCloseTo(1000 - 60 * 1.8);
    const before = state.boss.health;
    stepBattle(state, config, []);
    expect(state.boss.health).toBeCloseTo(before - 2.25);
  });

  it('adds the bonus to paired light before multiplying focused hold', () => {
    const { config, state, target } = setup();
    config.pairedDamageBonus = .2;
    config.lens!.focus = { seconds: 1, damageBonus: .1 };
    advance(state, config, 60);
    const before = target.health;
    stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(before - .9 * 1.45 * 1.1);
  });

  it('does not damage or heal targets after losing the beam', () => {
    const { config, state, target } = setup();
    advance(state, config, 61);
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    const before = target.health;
    advance(state, config, 90);
    expect(target.health).toBe(before);
    expect(state.resonance.ticks).toBe(0);
  });

  it('keeps old lenses and their baseline damage unchanged', () => {
    const { config, state, target } = setup();
    delete config.lens!.resonance;
    config.beam.damagePerSecond = 30;
    advance(state, config, 70);
    expect(state.resonance.ticks).toBe(0);
    expect(target.health).toBeCloseTo(9930);
  });

  it('replays the hold counter and bonus deterministically after a state snapshot', () => {
    const { config, state } = setup();
    advance(state, config, 30);
    const restored: BattleState = structuredClone(state);
    advance(state, config, 60); advance(restored, config, 60);
    expect(restored).toEqual(state);
  });

  it('freezes the hold during pause and resumes without catch-up', () => {
    const base = structuredClone(NIGHT_CONFIG);
    base.beam.halfAngle = Math.PI; base.beam.range = 1000;
    base.enemies.ghost.health = 10000; base.enemies.ghost.speed = 0;
    base.waves = [{ id: 'pause-resonance', enemies: ['ghost', 'ghost'], spawnInterval: .001 }];
    const save = emptySave();
    save.profile.unlockedLenses.push('resonant'); save.profile.selectedLensId = 'resonant';
    let value = JSON.stringify(save);
    const store: SaveStore = { read: () => value, write: next => { value = next; } };
    const app = new LighthouseApplication(store, base, () => ({ id: 'resonance-pause', seed: 42 }));
    app.openPreparation(); app.selectLens('resonant'); app.start(); app.advance(67);
    expect(app.view.battle!.resonance.ticks).toBe(1);
    app.pause(); const frozen = structuredClone(app.view.battle);
    app.advance(60000);
    expect(app.view.battle).toEqual(frozen);
    app.resume(); app.advance(34);
    expect(app.view.battle!.tick).toBe(frozen!.tick + 1);
    expect(app.view.battle!.resonance.ticks).toBe(2);
  });
});

describe('resonance content validation', () => {
  const lens = () => structuredClone(LENSES.find(item => item.id === 'resonant')!);
  it.each([0, -1, NaN, Infinity, 61])('rejects invalid duration %s', seconds => {
    const definition = lens(); definition.resonance!.seconds = seconds;
    expect(() => validateLensDefinitions([definition], [])).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.01])('rejects invalid bonus %s', damageBonus => {
    const definition = lens(); definition.resonance!.damageBonus = damageBonus;
    expect(() => validateLensDefinitions([definition], [])).toThrow();
  });
  it('rejects resonance on another lens, orphan bonuses and excessive aggregate bonuses', () => {
    const definition = lens();
    expect(() => validateLensDefinitions([{ ...definition, id: 'basic' }], [])).toThrow();
    const node: LensUpgradeDefinition = { ...structuredClone(LENS_UPGRADES.find(item => item.id === 'resonant-bonus-1')!), requires: [] };
    const plain = { ...definition }; delete plain.resonance;
    expect(() => validateLensDefinitions([plain], [node])).toThrow();
    node.effect.amount = .8;
    expect(() => validateLensDefinitions([definition], [node])).toThrow();
    expect(() => validateLensDefinitions()).not.toThrow();
  });
});
