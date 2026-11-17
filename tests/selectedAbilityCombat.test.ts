import { describe, expect, it } from 'vitest';
import type { BattleCommand, DevicePlacement, EnemyState } from '../src/contracts';
import type { CampaignAbilityDraftId } from '../src/content/campaignAbilityDraft';
import { CAMPAIGN_ABILITY_DRAFT } from '../src/content/campaignAbilityDraft';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { LENSES } from '../src/content/lenses';
import { calculateNightConfig } from '../src/progression/upgrades';
import { calculateCandidateAbility } from '../src/progression/campaignAbilities';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { damageLighthouse } from '../src/simulation/lighthouse';
import { damageDevice } from '../src/simulation/deviceDamage';
import { hitShield } from '../src/simulation/shield';
import { fireDirectWeapon } from '../src/simulation/devices';
import { useSelectedAbility } from '../src/simulation/selectedAbility';
import { angleDifference } from '../src/simulation/beam';
import { emptySave } from '../src/application/saves';
import { LighthouseApplication } from '../src/application/gameApplication';
import { grantFixtureDevices } from './helpers/devices';

const all = CAMPAIGN_ABILITY_DRAFT.map(node => node.id);
function control(id: CampaignAbilityDraftId = 'overload', full = false, placements: DevicePlacement[] = []) {
  const config = structuredClone(NIGHT_CONFIG);
  config.ability = calculateCandidateAbility(id, full ? all : [`ability-${id}-unlock`])!;
  config.rulesVersion = 'stage-a-ability-combat-1';
  config.waves = [{ id: 'hold', enemies: ['ghost'], spawnInterval: 1 }];
  for (const definition of Object.values(config.enemies)) { definition.speed = 0; definition.health = 100000; }
  const state = createBattle(config, 42, undefined, placements);
  state.beamAngle = state.desiredBeamAngle = 0;
  state.enemies[0]!.x = 200; state.enemies[0]!.y = 0;
  return { state, config };
}
const use: BattleCommand = { type: 'use-ability' };
const advance = (pair: ReturnType<typeof control>, steps: number): void => {
  for (let i = 0; i < steps; i++) stepBattle(pair.state, pair.config, []);
};

describe('selected ability commands and overload in the fixed simulation', () => {
  it('activates once, preserves aim, excludes flash and uses integer deadlines', () => {
    const { state, config } = control();
    const before = state.enemies[0]!.health;
    stepBattle(state, config, [use, use, { type: 'flash' }]);
    expect(before - state.enemies[0]!.health).toBeCloseTo(1.35);
    expect(state.ability).toMatchObject({ readyTick: 720, activeUntilTick: 120 });
    expect(state.events.filter(event => event.type === 'ability-used')).toHaveLength(1);
    expect(state.events.some(event => event.type === 'flash-used')).toBe(false);
    expect(state.desiredBeamAngle).toBe(0);
  });

  it('stops on the first excluded duration tick and permits recast only on readyTick', () => {
    const pair = control();
    stepBattle(pair.state, pair.config, [use]);
    advance(pair, 119);
    expect(pair.state.tick).toBe(120);
    const health = pair.state.enemies[0]!.health;
    stepBattle(pair.state, pair.config, [use]);
    expect(health - pair.state.enemies[0]!.health).toBeCloseTo(1);
    advance(pair, 598);
    expect(pair.state.tick).toBe(719);
    expect(useSelectedAbility(pair.state, pair.config, use as Extract<BattleCommand, { type: 'use-ability' }>)).toBe(false);
    advance(pair, 1);
    expect(useSelectedAbility(pair.state, pair.config, use as Extract<BattleCommand, { type: 'use-ability' }>)).toBe(true);
  });

  it('caps armor damage separately and converts overflow without adding the armor bonus to health', () => {
    const { state, config } = control('overload', true);
    const target = state.enemies[0]!;
    target.armor = 100;
    stepBattle(state, config, [use]);
    expect(target.armor).toBeCloseTo(98.25);
    expect(target.health).toBe(100000);
    target.armor = .5;
    const health = target.health;
    stepBattle(state, config, []);
    expect(target.armor).toBe(0);
    expect(health - target.health).toBeCloseTo(1.55 - .5 / (1.75 / 1.55));
    const after = target.health;
    stepBattle(state, config, []);
    expect(after - target.health).toBeCloseTo(1.55);
  });

  it.each(LENSES.map(lens => lens.id))('preserves %s lens geometry, target limit and the original config', lensId => {
    const pair = control();
    const config = calculateNightConfig(pair.config, [], false, { lensId, upgrades: [] });
    const snapshot = structuredClone(config);
    const state = createBattle(config, 17);
    state.beamAngle = state.desiredBeamAngle = 0;
    const template = state.enemies[0]!;
    state.enemies = [-.1, 0, .1].map((a, i) => ({ ...template, id: i + 1, x: 180 * Math.cos(a), y: 180 * Math.sin(a), armor: 0 }));
    stepBattle(state, config, [use]);
    expect(state.litEnemyIds.length).toBeLessThanOrEqual(config.beam.maxTargets);
    expect(state.litEnemyIds.length).toBeGreaterThan(0);
    expect(config).toEqual(snapshot);
  });

  it('retains full occlusion and sums only the selected boss zones on their shared health', () => {
    const pair = control();
    const template = pair.state.enemies[0]!;
    pair.state.enemies = [110, 220].map((x, i) => ({ ...template, id: i + 1, x }));
    stepBattle(pair.state, pair.config, [use]);
    expect(pair.state.litEnemyIds).toEqual([1]);
    expect(pair.state.blockedEnemyIds).toContain(2);
    expect(pair.state.enemies[1]!.health).toBe(100000);
    pair.config.boss = getBossRules(1); pair.config.boss.speed = 0;
    const boss = createBattle(pair.config, 42);
    boss.beamAngle = boss.desiredBeamAngle = 0; boss.enemies = [];
    boss.boss!.tentacles = [{ id: -1001, x: 100, y: -15, attackCooldown: 99 },
      { id: -1002, x: 100, y: 15, attackCooldown: 99 }, { id: -1003, x: 100, y: 40, attackCooldown: 99 }];
    const before = boss.boss!.health;
    stepBattle(boss, pair.config, [use]);
    expect(boss.litTentacleIds).toHaveLength(2);
    expect(before - boss.boss!.health).toBeCloseTo(2 * 1.35);
  });

  it('leaves residual burning unamplified', () => {
    const a = control(), b = control();
    for (const pair of [a, b]) {
      pair.config.lens = { id: 'smoldering', slowMultiplier: 1, armorMultiplier: 1, burn: { seconds: 2, damagePerSecond: 6 } };
      pair.state.enemies[0]!.burn = { remainingTicks: 30 };
      pair.state.beamAngle = pair.state.desiredBeamAngle = Math.PI;
    }
    stepBattle(a.state, a.config, [use]); stepBattle(b.state, b.config, []);
    expect(a.state.enemies[0]!.health).toBe(b.state.enemies[0]!.health);
    expect(a.state.enemies[0]!.burn).toEqual(b.state.enemies[0]!.burn);
  });

  it('adds new guidance without multiplying it by the existing manual-opening bonus', () => {
    const pair = control('overload', true, [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
    pair.config.devices.cannon.manualDamageBonus = .25;
    pair.config.progression = { litDeviceDamageBonus: .2 };
    useSelectedAbility(pair.state, pair.config, use as Extract<BattleCommand, { type: 'use-ability' }>);
    pair.state.litEnemyIds = [1];
    const target = pair.state.enemies[0]!, before = target.health;
    fireDirectWeapon(pair.state, pair.config, pair.state.devices[0]!, 1, true);
    expect(before - target.health).toBeCloseTo(pair.config.devices.definitions.cannon.damage * (1.25 * 1.2 + .15));
  });

  it('combines quick-turn and overload under the temporary turn cap', () => {
    const pair = control('overload', true);
    pair.config.beam.quickTurn = { speedBonus: .6, normalSpeedAngle: Math.PI / 3, fullBonusAngle: 2 * Math.PI / 3,
      durationSeconds: .9, cooldownSeconds: 3, fadeInSeconds: .15, fadeOutSeconds: .2 };
    pair.state.beamAngle = pair.state.desiredBeamAngle = -Math.PI / 2;
    stepBattle(pair.state, pair.config, [use, { type: 'aim', angle: Math.PI / 2 }]);
    for (let i = 0; i < 8; i++) {
      const before = pair.state.beamAngle;
      stepBattle(pair.state, pair.config, []);
      expect(Math.abs(angleDifference(pair.state.beamAngle, before))).toBeLessThanOrEqual(pair.config.beam.turnSpeed * 1.75 * pair.config.stepSeconds + 1e-9);
    }
  });
});

describe('bastion uses one receiving layer and preserves existing defenses', () => {
  it('protects field separately from a protected body, and respects guarded restoration', () => {
    const pair = control('bastion', true, [{ id: 1, kind: 'generator', x: 70, y: 0 }]);
    stepBattle(pair.state, pair.config, [use]);
    const body = pair.state.devices[0]!.health;
    const field = pair.state.shield.current;
    hitShield(pair.state, pair.config, 10, 0, 0);
    expect(field - pair.state.shield.current).toBeCloseTo(6);
    expect(pair.state.devices[0]!.health).toBe(body);
    pair.config.progression = { shieldRestoreReduction: .5 };
    pair.state.shield.guardUntilTick = pair.state.tick + 30;
    const before = pair.state.shield.current;
    hitShield(pair.state, pair.config, 10, 0, 0, true);
    expect(before - pair.state.shield.current).toBeCloseTo(2.5);
  });

  it('combines body protection with heavy hits, caps total reduction, and never heals', () => {
    const pair = control('bastion', true, [{ id: 1, kind: 'barrier', x: 250, y: 0 }]);
    const device = pair.state.devices[0]!;
    device.health = 80;
    stepBattle(pair.state, pair.config, [use]);
    expect(device.health).toBe(80);
    pair.config.devices.barrier.incomingDamageMultiplier = .5;
    damageDevice(pair.state, pair.config, device, 20, true);
    expect(device.health).toBeCloseTo(75); // .5 existing × .4 bastion is limited to .25 total.
    pair.config.devices.barrier.incomingDamageMultiplier = .1;
    damageDevice(pair.state, pair.config, device, 20);
    expect(device.health).toBeCloseTo(73); // Existing stronger defense is preserved.
  });

  it('uses actual reduced damage for the emergency trigger and then combines emergency once', () => {
    const pair = control('bastion', true);
    pair.config.progression = { lighthouseEmergencyReduction: .4 };
    pair.state.lighthouseHealth = 40;
    stepBattle(pair.state, pair.config, [use]);
    damageLighthouse(pair.state, pair.config, 15);
    expect(pair.state.lighthouseHealth).toBeCloseTo(31);
    expect(pair.state.emergencyUsed).toBeUndefined();
    damageLighthouse(pair.state, pair.config, 15);
    expect(pair.state.emergencyUsed).toBe(true);
    expect(pair.state.lighthouseHealth).toBeCloseTo(31 - 15 * .6 * .6);
  });

  it('expires the full phase and weaker fade at exact exclusive ticks', () => {
    const pair = control('bastion', true);
    stepBattle(pair.state, pair.config, [use]);
    const mainEnd = pair.state.ability!.activeUntilTick, fadeEnd = pair.state.ability!.fadeUntilTick;
    advance(pair, mainEnd - pair.state.tick);
    let before = pair.state.lighthouseHealth;
    damageLighthouse(pair.state, pair.config, 10, true);
    expect(before - pair.state.lighthouseHealth).toBeCloseTo(8.5);
    advance(pair, fadeEnd - pair.state.tick);
    before = pair.state.lighthouseHealth;
    damageLighthouse(pair.state, pair.config, 10);
    expect(before - pair.state.lighthouseHealth).toBe(10);
  });
});

describe('selected ability lifecycle and replay', () => {
  it.each(['overload', 'seal', 'barrage', 'bastion'] as const)('%s freezes on pause and recreates cleanly after interruption', id => {
    const pair = control(id, true);
    const seed = emptySave(); seed.profile.legacyEquipment = true; grantFixtureDevices(seed.profile);
    let raw = JSON.stringify(seed);
    const store = { read: () => raw, write: (value: string) => { raw = value; } };
    const app = new LighthouseApplication(store, pair.config, () => ({ id: `control-${id}`, seed: 42 }));
    app.openPreparation();
    app.selectDevice('cannon'); app.placeDevice(-100, 0); app.start();
    const enemy = app.view.battle!.enemies[0] as EnemyState;
    enemy.x = -220; enemy.y = 0;
    const target = { x: -220, y: 0, enemyId: enemy.id };
    app.command({ type: 'use-ability', target });
    target.x = NaN; // Presentation cannot alter an already queued target by reusing its object.
    app.advance(1000 / 30);
    const before = structuredClone(app.view.battle!);
    expect(before.ability!.readyTick).toBeGreaterThan(before.tick);
    app.pause(); app.advance(10000); app.resume(); app.advance(10000);
    expect(app.view.battle).toEqual(before);
    app.advance(1000 / 30);
    expect(app.view.battle!.tick).toBe(before.tick + 1);
    expect(app.view.battle!.ability!.readyTick).toBe(before.ability!.readyTick);
    expect(raw).not.toContain('activeUntilTick');
    const reopened = new LighthouseApplication(store, pair.config, () => ({ id: `restart-${id}`, seed: 42 }));
    expect(reopened.view.interrupted).toBe(true);
    reopened.openPreparation(); reopened.start();
    expect(reopened.view.battle!.ability!.readyTick).toBe(0);
    expect(reopened.view.battle!.ability!.activeUntilTick).toBe(0);
  });

  it.each(['overload', 'seal', 'barrage', 'bastion'] as const)('%s replays an identical initial state and commands and freezes after result', id => {
    const pair = control(id, true, [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
    const clone = structuredClone(pair.state);
    for (let i = 0; i < 60; i++) {
      const commands: BattleCommand[] = i === 0 ? [{ type: 'use-ability', target: { x: 200, y: 0, enemyId: 1 } }] : [];
      stepBattle(pair.state, pair.config, commands); stepBattle(clone, pair.config, commands);
    }
    expect(clone).toEqual(pair.state);
    pair.state.outcome = 'defeat';
    const before = structuredClone(pair.state);
    stepBattle(pair.state, pair.config, [use]);
    expect(pair.state).toEqual(before);
  });
});
