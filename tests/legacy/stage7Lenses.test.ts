import { describe, expect, it } from 'vitest';
import type { EnemyState, LensId, LensUpgradeId, SaveStore } from '../../src/contracts';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { getLensUpgradeAvailability, validateLensDefinitions } from '../../src/progression/lenses';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { applyMovementSlow } from '../../src/simulation/slows';
import { grantFixtureDevices } from '../helpers/devices';

const newIds: readonly LensUpgradeId[] = ['expanded-power-1', 'expanded-power-2', 'slowing-range',
  'slowing-power-2', 'armor-breaker-width', 'armor-breaker-power-2'];
const oldNodes = LENS_UPGRADES.filter(node => !newIds.includes(node.id));
class Store implements SaveStore {
  raw: string | null = null;
  fail: 'before' | 'after' | null = null;
  read() { return this.raw; }
  write(raw: string) {
    if (this.fail === 'before') throw new Error('quota');
    this.raw = raw;
    if (this.fail === 'after') throw new Error('lost reply');
  }
}
function priorSave() {
  const save = emptySave(), profile = save.profile;
  Object.assign(profile, { resources: 12000, completedNights: 6, bossLevel: 3, bossMaterials: 100,
    wonNightIds: NIGHT_CATALOG.map(night => night.id), encountered: ['ghost', 'turtle', 'minotaur', 'bat'],
    purchasedUpgrades: UPGRADES.map(node => node.id), unlockedLenses: LENSES.map(lens => lens.id),
    lensUpgrades: oldNodes.map(node => node.id), selectedLensId: 'slowing' });
  grantFixtureDevices(profile);
  const trap = profile.devices.find(device => device.kind === 'light-trap')!;
  Object.assign(trap, { health: 15.25, trapCharges: 1, position: { x: -90, y: 0 } });
  const cannon = profile.devices.find(device => device.kind === 'cannon')!;
  cannon.health = 17.125;
  return save;
}
function repository(save = priorSave()) {
  const store = new Store(); store.raw = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load();
  return { store, repo };
}
function rules(lensId: LensId, expanded = true) {
  return calculateNightConfig(NIGHT_CONFIG, [], false, {
    lensId, upgrades: LENS_UPGRADES.filter(node => expanded || !newIds.includes(node.id)).map(node => node.id),
  });
}
function enemy(id: number, distance: number, angle = 0): EnemyState {
  return { id, kind: 'ghost', x: distance * Math.cos(angle), y: distance * Math.sin(angle),
    health: 100, armor: 0, waveIndex: 0, attackCooldown: 0 };
}
function battle(lensId: LensId, expanded = true) {
  const config = rules(lensId, expanded);
  config.waves = [{ id: 'lens-test', enemies: ['ghost', 'ghost'], spawnInterval: 100 }];
  config.enemies.ghost.speed = 0;
  const state = createBattle(config, 42);
  state.waves[0]!.spawned = 2;
  state.enemies = []; state.beamAngle = state.desiredBeamAngle = 0;
  return { state, config };
}

describe('seventh expansion catalogue compatibility', () => {
  it('completes exactly the three old branches and keeps the 122-purchase budget', () => {
    expect(UPGRADES).toHaveLength(82); expect(oldNodes).toHaveLength(27);
    expect(LENS_UPGRADES).toHaveLength(33);
    expect(LENSES.filter(lens => lens.materialCost > 0)).toHaveLength(7);
    expect(UPGRADES.length + LENS_UPGRADES.length + LENSES.length - 1).toBe(122);
    for (const lensId of ['expanded', 'slowing', 'armor-breaker'] as const)
      expect(LENS_UPGRADES.filter(node => node.lensId === lensId)).toHaveLength(4);
    expect(LENS_UPGRADES.filter(node => newIds.includes(node.id)).map(node =>
      [node.id, node.cost, node.materialCost, node.requires, node.effect])).toEqual([
      ['expanded-power-1', 70, 1, ['expanded-targets'], { stat: 'damagePerSecond', amount: 2 }],
      ['expanded-power-2', 95, 2, ['expanded-power-1'], { stat: 'damagePerSecond', amount: 2 }],
      ['slowing-range', 70, 1, ['slowing-power'], { stat: 'range', amount: 15 }],
      ['slowing-power-2', 95, 2, ['slowing-range'], { stat: 'damagePerSecond', amount: 3 }],
      ['armor-breaker-width', 70, 1, ['armor-breaker-power'], { stat: 'halfAngle', amount: Math.PI / 90 }],
      ['armor-breaker-power-2', 100, 2, ['armor-breaker-width'], { stat: 'damagePerSecond', amount: 8 }],
    ]);
    expect(LENS_UPGRADES.filter(node => newIds.includes(node.id)).reduce((sum, node) => sum + node.cost, 0)).toBe(500);
    expect(LENS_UPGRADES.filter(node => newIds.includes(node.id)).reduce((sum, node) => sum + node.materialCost, 0)).toBe(9);
    expect(UPGRADES.reduce((sum, node) => sum + node.cost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.cost, 0)).toBe(8945);
    expect(LENSES.reduce((sum, lens) => sum + lens.materialCost, 0) + LENS_UPGRADES.reduce((sum, node) => sum + node.materialCost, 0)).toBe(59);
    expect(() => validateLensDefinitions()).not.toThrow();
  });

  it('preserves all eight lens definitions and the prices, dependencies and effects of all old 27 nodes', () => {
    expect(LENSES.map(lens => [lens.id, lens.materialCost, lens.damageMultiplier, lens.widthMultiplier,
      lens.rangeMultiplier, lens.maxTargets, lens.slowMultiplier, lens.armorMultiplier, lens.focus, lens.burn, lens.resonance])).toEqual([
      ['basic', 0, 1, 1, 1, 2, 1, 1, undefined, undefined, undefined],
      ['expanded', 2, .85, 1.6, 1, 3, 1, 1, undefined, undefined, undefined],
      ['slowing', 3, .8, 1, 1, 2, .6, 1, undefined, undefined, undefined],
      ['armor-breaker', 3, .8, .7, 1, 1, 1, 2, undefined, undefined, undefined],
      ['focused', 3, 1.5, .75, 1, 1, 1, 1, { seconds: 1.5, damageBonus: .1 }, undefined, undefined],
      ['smoldering', 3, .7, 1, 1, 2, 1, 1, undefined, { seconds: 2, damagePerSecond: 6 }, undefined],
      ['resonant', 3, .9, 1.1, 1, 2, 1, 1, undefined, undefined, { seconds: 2, damageBonus: .25 }],
      ['long-range', 3, .8, .8, 1.15, 2, 1, 1, undefined, undefined, undefined],
    ]);
    expect(oldNodes.map(node => [node.id, node.lensId, node.cost, node.materialCost, node.requires, node.effect.stat, node.effect.amount])).toEqual([
      ['expanded-width', 'expanded', 45, 1, [], 'halfAngle', Math.PI / 45],
      ['expanded-targets', 'expanded', 70, 2, ['expanded-width'], 'maxTargets', 1],
      ['slowing-control', 'slowing', 45, 1, [], 'slowMultiplier', -.15],
      ['slowing-power', 'slowing', 70, 2, ['slowing-control'], 'damagePerSecond', 6],
      ['armor-breaker-armor', 'armor-breaker', 45, 1, [], 'armorMultiplier', .5],
      ['armor-breaker-power', 'armor-breaker', 70, 2, ['armor-breaker-armor'], 'damagePerSecond', 6],
      ['basic-power-1', 'basic', 40, 0, [], 'damagePerSecond', 3],
      ['basic-power-2', 'basic', 65, 0, ['basic-power-1'], 'damagePerSecond', 3],
      ['basic-width', 'basic', 45, 0, ['basic-power-1'], 'halfAngle', Math.PI / 180],
      ['basic-range', 'basic', 55, 0, ['basic-power-1'], 'range', 10],
      ['basic-paired', 'basic', 75, 1, ['basic-power-2', 'basic-width'], 'pairedDamageBonus', .1],
      ['focused-power', 'focused', 60, 1, [], 'damagePerSecond', 4],
      ['focused-range', 'focused', 65, 1, ['focused-power'], 'range', 15],
      ['focused-hold-1', 'focused', 75, 1, ['focused-power'], 'focusDamageBonus', .05],
      ['focused-hold-2', 'focused', 100, 2, ['focused-hold-1'], 'focusDamageBonus', .05],
      ['smoldering-power', 'smoldering', 65, 1, [], 'damagePerSecond', 3],
      ['smoldering-burn-1', 'smoldering', 75, 1, ['smoldering-power'], 'burnDamagePerSecond', 2],
      ['smoldering-duration', 'smoldering', 80, 1, ['smoldering-power'], 'burnDuration', 1],
      ['smoldering-burn-2', 'smoldering', 105, 2, ['smoldering-burn-1', 'smoldering-duration'], 'burnDamagePerSecond', 2],
      ['resonant-power', 'resonant', 65, 1, [], 'damagePerSecond', 4],
      ['resonant-width', 'resonant', 70, 1, ['resonant-power'], 'halfAngle', Math.PI / 90],
      ['resonant-bonus-1', 'resonant', 75, 1, ['resonant-power'], 'resonanceDamageBonus', .1],
      ['resonant-bonus-2', 'resonant', 100, 2, ['resonant-bonus-1', 'resonant-width'], 'resonanceDamageBonus', .1],
      ['long-range-power-1', 'long-range', 65, 1, [], 'damagePerSecond', 4],
      ['long-range-power-2', 'long-range', 95, 2, ['long-range-power-1'], 'damagePerSecond', 4],
      ['long-range-width-1', 'long-range', 60, 1, ['long-range-power-1'], 'halfAngle', Math.PI / 180],
      ['long-range-width-2', 'long-range', 90, 1, ['long-range-width-1', 'long-range-power-2'], 'halfAngle', Math.PI / 180],
    ]);
  });
});

describe('seventh expansion purchases and saves', () => {
  it('loads all previous 116 purchases as v6 without granting new nodes or changing fractional HP/charges', () => {
    const save = priorSave(), before = structuredClone(save);
    expect(save.profile.purchasedUpgrades.length + save.profile.lensUpgrades.length + save.profile.unlockedLenses.length - 1).toBe(116);
    expect(decodeSave(JSON.stringify(save))).toEqual(before);
    const { repo, store } = repository(save);
    repo.load(); repo.load();
    expect(repo.current).toEqual(before);
    expect(decodeSave(store.raw!)).toEqual(before);
    expect(repo.current.version).toBe(6);
    expect(repo.current.profile.lensUpgrades.some(id => newIds.includes(id))).toBe(false);
  });

  it.each(newIds)('requires lens ownership and every predecessor for %s', id => {
    const node = LENS_UPGRADES.find(item => item.id === id)!;
    const save = priorSave();
    // Descendants must be removed with their prerequisite to keep the saved graph valid.
    save.profile.lensUpgrades = save.profile.lensUpgrades.filter(item => oldNodes.find(old => old.id === item)?.lensId !== node.lensId);
    const { repo } = repository(save);
    const before = repo.current;
    expect(getLensUpgradeAvailability(repo.current.profile, id).status).toBe('requires');
    expect(() => repo.purchaseLensUpgrade(id)).toThrow(); expect(repo.current).toEqual(before);
    for (const previous of LENS_UPGRADES.filter(item => item.lensId === node.lensId)) {
      if (previous.id === id) break;
      repo.purchaseLensUpgrade(previous.id);
    }
    expect(getLensUpgradeAvailability(repo.current.profile, id).status).toBe('available');
    const locked = emptySave(); locked.profile.resources = 12000; locked.profile.bossMaterials = 100;
    expect(() => repository(locked).repo.purchaseLensUpgrade(id)).toThrow();
  });

  it.each(['resources', 'bossMaterials'] as const)('refuses a purchase when only %s is insufficient', currency => {
    const save = priorSave(); save.profile[currency] = 0;
    const { repo } = repository(save), before = repo.current;
    expect(getLensUpgradeAvailability(repo.current.profile, 'slowing-range').status).toBe('insufficient');
    expect(() => repo.purchaseLensUpgrade('slowing-range')).toThrow();
    expect(repo.current).toEqual(before);
  });

  it.each(['before', 'after'] as const)('spends both currencies exactly once across each %s-write failure', failure => {
    const { repo, store } = repository(), before = repo.current.profile;
    for (const id of newIds) {
      const prior = repo.current;
      store.fail = failure;
      if (failure === 'before') {
        expect(() => repo.purchaseLensUpgrade(id)).toThrow(); expect(repo.current).toEqual(prior);
      } else repo.purchaseLensUpgrade(id);
      store.fail = null;
      repo.purchaseLensUpgrade(id); repo.purchaseLensUpgrade(id); repo.load();
    }
    expect(repo.current.profile).toEqual({ ...before, resources: before.resources - 500,
      bossMaterials: before.bossMaterials - 9, lensUpgrades: [...before.lensUpgrades, ...newIds] });
    expect(decodeSave(store.raw!).profile).toEqual(repo.current.profile);
  });
});

describe('seventh expansion effects in the actual fixed-step battle', () => {
  it.each<LensId>(['basic', 'focused', 'smoldering', 'resonant', 'long-range'])('leaves %s unchanged when other lenses buy the six nodes', lensId => {
    expect(rules(lensId)).toEqual(rules(lensId, false));
  });

  it('adds expanded damage to every selected target while retaining four targets and full occlusion', () => {
    const { state, config } = battle('expanded');
    const targets = [enemy(1, 180, 0), enemy(2, 180, -.16), enemy(3, 180, .16), enemy(4, 180, -.32),
      enemy(5, 180, .32), enemy(6, 270, 0)];
    state.enemies = targets;
    stepBattle(state, config, []);
    expect(config.beam.damagePerSecond).toBeCloseTo(29.5);
    expect(config.beam.damagePerSecond - rules('expanded', false).beam.damagePerSecond).toBeCloseTo(4);
    expect(config.beam.maxTargets).toBe(4);
    expect(state.litEnemyIds).toHaveLength(4); expect(state.blockedEnemyIds).toContain(6);
    for (const target of targets) expect(target.health).toBeCloseTo(state.litEnemyIds.includes(target.id)
      ? 100 - 29.5 * config.stepSeconds : 100);
  });

  it('extends slowing reach by 15 and adds three damage without extending the old two-target limit', () => {
    const previous = battle('slowing', false), next = battle('slowing');
    const distance = previous.config.beam.range + next.config.enemies.ghost.radius + 7;
    const oldTarget = enemy(1, distance), newTarget = enemy(1, distance);
    previous.state.enemies = [oldTarget]; next.state.enemies = [newTarget];
    stepBattle(previous.state, previous.config, []); stepBattle(next.state, next.config, []);
    expect(oldTarget.health).toBe(100); expect(newTarget.health).toBeCloseTo(100 - 33 * next.config.stepSeconds);
    expect(next.config.beam.range).toBe(315); expect(next.config.beam.maxTargets).toBe(2);
    const outside = enemy(2, next.config.beam.range + next.config.enemies.ghost.radius + .01);
    next.state.enemies = [outside]; stepBattle(next.state, next.config, []); expect(outside.health).toBe(100);
    next.state.enemies = [enemy(3, 180, -.15), enemy(4, 180, 0), enemy(5, 180, .15), enemy(6, 270, 0)];
    stepBattle(next.state, next.config, []);
    expect(next.state.litEnemyIds).toHaveLength(2); expect(next.state.blockedEnemyIds).toContain(6);
    expect(next.state.enemies.filter(target => target.health < 100)).toHaveLength(2);
  });

  it('chooses the strongest slow without multiplying light and other effects or strengthening the old .45', () => {
    const { state, config } = battle('slowing'); config.enemies.ghost.speed = 30;
    const selected = enemy(1, 180), blocked = enemy(2, 270), other = enemy(3, 180, .15);
    state.enemies = [selected, blocked, other];
    applyMovementSlow(selected, 30, 100, .65, 0);
    applyMovementSlow(other, 31, 100, .3, 0);
    stepBattle(state, config, []);
    expect(config.lens!.slowMultiplier).toBeCloseTo(.45);
    expect(config.lens!.slowMultiplier).toBe(rules('slowing', false).lens!.slowMultiplier);
    expect(selected.x).toBeCloseTo(179.55); expect(blocked.x).toBeCloseTo(269);
    expect(Math.hypot(other.x, other.y)).toBeCloseTo(179.7);
    state.desiredBeamAngle = Math.PI; config.beam.turnSpeed = Math.PI / config.stepSeconds;
    const before = selected.x; stepBattle(state, config, []);
    expect(selected.x).toBeCloseTo(before - .65);
  });

  it('widens armor-breaker by four full degrees and still selects one available target', () => {
    const previous = battle('armor-breaker', false), next = battle('armor-breaker');
    const angle = previous.config.beam.halfAngle + Math.asin(previous.config.enemies.ghost.radius / 240) + Math.PI / 180;
    const oldTarget = enemy(1, 240, angle), newTarget = enemy(1, 240, angle);
    previous.state.enemies = [oldTarget]; next.state.enemies = [newTarget];
    stepBattle(previous.state, previous.config, []); stepBattle(next.state, next.config, []);
    expect(oldTarget.health).toBe(100); expect(newTarget.health).toBeCloseTo(100 - 38 * next.config.stepSeconds);
    expect(next.config.beam.halfAngle - previous.config.beam.halfAngle).toBeCloseTo(2 * Math.PI / 180);
    expect(next.config.lens!.armorMultiplier).toBe(2.5); expect(next.config.beam.maxTargets).toBe(1);
    next.state.enemies = [enemy(2, 180, 0), enemy(3, 270, 0), enemy(4, 180, .15)];
    stepBattle(next.state, next.config, []);
    expect(next.state.litEnemyIds).toEqual([2]); expect(next.state.blockedEnemyIds).toContain(3);
    expect(next.state.enemies[2]!.health).toBe(100);
  });

  it('converts only the remaining base damage to health after upgraded armor damage and preserves chip damage', () => {
    const { state, config } = battle('armor-breaker');
    const target = enemy(1, 180); state.enemies = [target];
    const damage = 38 * config.stepSeconds;
    target.armor = damage * 2.5 + .5;
    stepBattle(state, config, []);
    expect(target.armor).toBeCloseTo(.5); expect(target.health).toBe(100);
    stepBattle(state, config, []);
    expect(target.armor).toBe(0); expect(target.health).toBeCloseTo(100 - (damage - .5 / 2.5));
    const before = target.health; stepBattle(state, config, []);
    expect(target.health).toBeCloseTo(before - damage);
  });
});
