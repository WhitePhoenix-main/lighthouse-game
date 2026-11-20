import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, NightConfig } from '../src/contracts';
import { getBossRules } from '../src/content/boss';
import { CAMPAIGN_GENERAL_DRAFT, type CampaignGeneralDraftId } from '../src/content/campaignGeneralDraft';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { applyTimedDeviceSuppression, damageWithCappedReduction } from '../src/simulation/campaignGeneralEffects';
import { damageDevice } from '../src/simulation/deviceDamage';
import { fireDirectWeapon } from '../src/simulation/devices';
import { damageLighthouse } from '../src/simulation/lighthouse';
import { hitShield } from '../src/simulation/shield';

function configured(ids: readonly CampaignGeneralDraftId[], enemy: EnemyKind = 'ghost'): NightConfig {
  const config = structuredClone(NIGHT_CONFIG);
  if (ids.length > 0) config.campaignGeneral = {};
  for (const id of ids) {
    const node = CAMPAIGN_GENERAL_DRAFT.find(candidate => candidate.id === id)!;
    config.campaignGeneral![node.family] = node.effect;
  }
  config.waves = [{ id: 'control', enemies: [enemy], spawnInterval: 10 }];
  return config;
}

function start(config: NightConfig, devices: DevicePlacement[] = []) {
  const state = createBattle(config, 42, undefined, devices);
  state.beamAngle = state.desiredBeamAngle = 0;
  Object.assign(state.enemies[0]!, { x: 200, y: 0 });
  return state;
}

describe('campaign control attack sources', () => {
  it('keeps a stronger existing protection when applying the candidate cap', () => {
    expect(damageWithCappedReduction(10, 2, .25, .75)).toBe(2);
  });

  it('applies the area protection to splash, but not to the primary impact', () => {
    const config = configured(['engineering-bombardment'], 'minotaur');
    config.enemies.minotaur.campaignAttack = { impactArea: { radius: 76, damageMultiplier: .5 } };
    const state = start(config, [{ id: 1, kind: 'barrier', x: 160, y: 0 }, { id: 2, kind: 'cannon', x: 200, y: 60 }]);
    state.enemies[0]!.chargePhase = 'charging';
    const [barrier, cannon] = state.devices;
    const barrierHealth = barrier!.health, cannonHealth = cannon!.health;
    stepBattle(state, config, []);
    expect(barrierHealth - barrier!.health).toBeCloseTo(config.enemies.minotaur.attackDamage * 3);
    expect(cannonHealth - cannon!.health).toBeCloseTo(config.enemies.minotaur.attackDamage * .5 * .75);
  });

  it('shortens the first actual suppressor hit without rearming it on a repeat attack', () => {
    const config = configured(['engineering-backup-control'], 'bat');
    config.enemies.bat.campaignAttack = { suppressionSeconds: 3 };
    const state = start(config, [{ id: 1, kind: 'cannon', x: 200, y: 20 }]);
    stepBattle(state, config, []);
    expect(state.devices[0]!.suppressedUntilTick).toBe(63);
    expect(state.enemies[0]!.suppressionUsed).toBe(true);
    state.enemies[0]!.attackCooldown = 0;
    stepBattle(state, config, []);
    expect(state.devices[0]!.suppressedUntilTick).toBe(63);
  });
});

describe('conditional direct beam damage', () => {
  it('boosts the real minotaur windup and leaves the charge itself at normal damage', () => {
    const config = configured(['beam-disruption-1'], 'minotaur');
    const state = start(config);
    const enemy = state.enemies[0]!;
    const initialHealth = enemy.health;

    stepBattle(state, config, []);
    expect(enemy.chargePhase).toBe('windup');
    expect(state.events.some(event => event.type === 'charge-started')).toBe(true);
    expect(initialHealth - enemy.health).toBeCloseTo(1.15);

    enemy.chargeRemaining = 0;
    const healthAfterWindup = enemy.health;
    stepBattle(state, config, []);
    expect(enemy.chargePhase).toBe('charging');
    expect(healthAfterWindup - enemy.health).toBeCloseTo(1);
  });

  it('uses the armor state before the hit and leaves never-armored enemies at base damage', () => {
    const config = configured(['beam-exposed-1'], 'turtle');
    const state = start(config);
    const enemy = state.enemies[0]!;
    enemy.armor = .4;
    const initialHealth = enemy.health;
    const ghost = { ...enemy, id: 2, kind: 'ghost' as const, y: 40, armor: 0 };
    state.enemies.push(ghost);

    stepBattle(state, config, []);
    expect(enemy.armor).toBe(0);
    expect(initialHealth - enemy.health).toBeCloseTo(.6);
    expect(state.events.some(event => event.type === 'armor-broken')).toBe(true);
    expect(initialHealth - ghost.health).toBeCloseTo(1);

    const healthAfterBreak = enemy.health;
    stepBattle(state, config, []);
    expect(healthAfterBreak - enemy.health).toBeCloseTo(1.2);
  });

  it('caps only the sum of the new bonuses and adds it to the existing common bonus', () => {
    const config = configured(['beam-disruption-2', 'beam-exposed-2'], 'minotaur');
    config.enemies.minotaur.armor = 10;
    config.pairedDamageBonus = .2;
    const state = start(config);
    const enemy = state.enemies[0]!;
    enemy.armor = 0;
    state.enemies.push({ ...enemy, id: 2, kind: 'ghost', y: 40 });

    stepBattle(state, config, []);
    expect(state.litEnemyIds).toEqual([1, 2]);
    expect(config.enemies.minotaur.health - enemy.health).toBeCloseTo(1.7);
    expect(config.enemies.minotaur.health - state.enemies[1]!.health).toBeCloseTo(1.2);
  });

  it('leaves projectiles and residual burn unchanged and accepts armor broken by a device', () => {
    const config = configured(['beam-exposed-2'], 'turtle');
    config.lens = { id: 'smoldering', slowMultiplier: 1, armorMultiplier: 1, burn: { seconds: 2, damagePerSecond: 6 } };
    config.devices.cannon.armorMultiplier = 1;
    config.devices.definitions = { ...config.devices.definitions, cannon: { ...config.devices.definitions.cannon, damage: 5 } };
    const state = start(config, [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
    const enemy = state.enemies[0]!;
    const initialHealth = enemy.health;
    enemy.armor = 5;
    const cannon = state.devices[0]!;
    expect(fireDirectWeapon(state, config, cannon, enemy.id, false)).toBe(true);
    expect(enemy.armor).toBe(0);
    expect(enemy.health).toBe(initialHealth);
    expect(fireDirectWeapon(state, config, cannon, enemy.id, false)).toBe(true);
    expect(initialHealth - enemy.health).toBeCloseTo(5);

    cannon.attackCooldown = 100;
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    enemy.burn = { remainingTicks: 2 };
    const beforeBurn = enemy.health;
    stepBattle(state, config, []);
    expect(beforeBurn - enemy.health).toBeCloseTo(.2);

    state.beamAngle = state.desiredBeamAngle = 0;
    const beforeLight = enemy.health;
    stepBattle(state, config, []);
    expect(beforeLight - enemy.health).toBeCloseTo(1.35 + .2);
  });

  it('reads the preparation of each selected boss zone independently, keeping occlusion and target limit', () => {
    const config = configured(['beam-disruption-2', 'beam-exposed-2']);
    config.boss = { ...getBossRules(1), speed: 0 };
    const state = start(config);
    state.enemies = [];
    const boss = state.boss!;
    boss.tentacles = [
      Object.assign({ id: -1001, x: 150, y: -19, attackCooldown: 10 }, { telegraphedPreparationUntilTick: 1 }),
      { id: -1002, x: 150, y: 19, attackCooldown: 10 },
      Object.assign({ id: -1003, x: 225, y: -28.5, attackCooldown: 10 }, { telegraphedPreparationUntilTick: 10 }),
      Object.assign({ id: -1004, x: 150, y: 30, attackCooldown: 10 }, { telegraphedPreparationUntilTick: 10 }),
    ];
    const health = boss.health;
    stepBattle(state, config, []);
    expect(state.litTentacleIds).toEqual([-1002, -1001]);
    expect(state.blockedTentacleIds).toEqual([-1003]);
    expect(health - boss.health).toBeCloseTo(2.25);
    stepBattle(state, config, []);
    expect(health - boss.health).toBeCloseTo(4.25);
  });
});

describe('campaign hull protection', () => {
  it('starts after actual hull damage, refreshes only the deadline and expires on an exclusive tick', () => {
    const config = configured(['hull-onslaught-2']);
    config.stepSeconds = .4;
    config.progression = { lighthouseDamageReduction: .2 };
    const state = start(config, [{ id: 1, kind: 'generator', x: 70, y: 0 }]);
    hitShield(state, config, 100, 0, 0);
    damageLighthouse(state, config, 0);
    expect(state).not.toHaveProperty('onslaughtUntilTick');

    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBe(112);
    expect(state).toHaveProperty('onslaughtUntilTick', 4);
    state.tick = 3;
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBeCloseTo(112 - 8 * .82);
    expect(state).toHaveProperty('onslaughtUntilTick', 7);
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBeCloseTo(112 - 2 * 8 * .82);
    state.tick = 7;
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBeCloseTo(104 - 2 * 8 * .82);
  });

  it('never arms on fully absorbed body damage and caps the active total reduction', () => {
    const config = configured(['hull-onslaught-2']);
    config.progression = { lighthouseDamageReduction: 1 };
    const state = start(config);
    damageLighthouse(state, config, 10);
    expect(state).not.toHaveProperty('onslaughtUntilTick');
    config.progression.lighthouseDamageReduction = .7;
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBeCloseTo(117);
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBeCloseTo(114.5);
  });

  it.each([['hull-emergency-window-1', 5], ['hull-emergency-window-2', 6]] as const)(
    '%s extends the same emergency window once and rounds the total duration', (id, durationSteps) => {
      const config = configured([id]);
      config.stepSeconds = .6;
      config.progression = { lighthouseEmergencyReduction: .25 };
      const state = start(config);
      state.tick = 2;
      state.lighthouseHealth = 33;
      damageLighthouse(state, config, 10);
      expect(state.lighthouseHealth).toBe(25.5);
      expect(state.emergencyUntilTick).toBe(2 + durationSteps);
      state.tick = 1 + durationSteps;
      damageLighthouse(state, config, 4);
      expect(state.lighthouseHealth).toBe(22.5);
      state.tick++;
      damageLighthouse(state, config, 4);
      expect(state.lighthouseHealth).toBe(18.5);
      expect(state.emergencyUntilTick).toBe(state.tick);
      damageLighthouse(state, config, 100);
      expect(state.lighthouseHealth).toBe(0);
    });

  it('requires existing emergency protection, whose base duration stays two seconds without the node', () => {
    const config = configured(['hull-emergency-window-2']);
    const state = start(config);
    state.lighthouseHealth = 33;
    damageLighthouse(state, config, 10);
    expect(state.lighthouseHealth).toBe(23);
    expect(state.emergencyUsed).toBeUndefined();

    delete config.campaignGeneral;
    config.progression = { lighthouseEmergencyReduction: .25 };
    damageLighthouse(state, config, 4);
    expect(state.lighthouseHealth).toBe(20);
    expect(state.emergencyUntilTick).toBe(60);
  });
});

describe('synthetic hostile engineering inputs', () => {
  it('reduces only explicitly tagged area damage to device bodies, after existing layers and with a cap', () => {
    const config = configured(['engineering-bombardment']);
    config.devices.barrier.incomingDamageMultiplier = .6;
    const state = start(config, [{ id: 1, kind: 'barrier', x: 230, y: 0 }, { id: 2, kind: 'generator', x: 70, y: 0 }]);
    const barrier = state.devices[0]!;
    const initialHealth = barrier.health;
    damageDevice(state, config, barrier, 20, false, true);
    expect(initialHealth - barrier.health).toBeCloseTo(12);
    damageDevice(state, config, barrier, 20, false, true, 'area');
    expect(initialHealth - barrier.health).toBeCloseTo(21);
    config.devices.barrier.incomingDamageMultiplier = .3;
    damageDevice(state, config, barrier, 20, false, false, 'area');
    expect(initialHealth - barrier.health).toBeCloseTo(26);

    hitShield(state, config, 20, 0, 0);
    damageLighthouse(state, config, 20);
    expect(state.shield.current).toBe(70);
    expect(state.lighthouseHealth).toBe(100);
  });

  it('shortens finite suppression on the real weapon timer and leaves source-maintained roots separate', () => {
    const config = configured(['engineering-backup-control']);
    config.stepSeconds = .05;
    config.beam.damagePerSecond = 0;
    const state = start(config, [{ id: 1, kind: 'cannon', x: 100, y: 0 }]);
    const cannon = state.devices[0]!;
    applyTimedDeviceSuppression(state, config, cannon, { kind: 'source-maintained-root' });
    expect(cannon.suppressedUntilTick).toBeUndefined();
    applyTimedDeviceSuppression(state, config, cannon, { kind: 'timed', durationSeconds: 3 });
    expect(cannon.suppressedUntilTick).toBe(42);
    applyTimedDeviceSuppression(state, config, cannon, { kind: 'timed', durationSeconds: .01 });
    expect(cannon.suppressedUntilTick).toBe(42);

    for (let i = 0; i < 42; i++) stepBattle(state, config, []);
    expect(cannon.lastShot).toBeNull();
    stepBattle(state, config, []);
    expect(cannon.lastShot?.tick).toBe(42);

    applyTimedDeviceSuppression(state, config, cannon, { kind: 'timed', durationSeconds: .01 });
    expect(cannon.suppressedUntilTick).toBe(state.tick + 1);
    applyTimedDeviceSuppression(state, config, cannon, { kind: 'timed', durationSeconds: .08 });
    expect(cannon.suppressedUntilTick).toBe(state.tick + 2);
    delete config.campaignGeneral;
    applyTimedDeviceSuppression(state, config, cannon, { kind: 'timed', durationSeconds: 3 });
    expect(cannon.suppressedUntilTick).toBe(state.tick + 60);
  });
});
