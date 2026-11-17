import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, DevicePlacement, EnemyKind, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { attackTentacles, moveTentacles } from '../src/simulation/boss';
import { damageDevice } from '../src/simulation/deviceDamage';
import { fireCannons, moveEnemies } from '../src/simulation/devices';
import { updateRepairLamps } from '../src/simulation/repair';
import { updateShield } from '../src/simulation/shield';
import { applyMovementSlow, movementSlowMultiplier } from '../src/simulation/slows';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { grantFixtureDevices } from './helpers/devices';

function enemy(id = 1, x = 150, kind: EnemyKind = 'ghost'): EnemyState {
  return { id, kind, x, y: 0, health: 1000, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

function setup(placements: readonly (DevicePlacement | DeviceDeployment)[] = [], boss = false) {
  const config = structuredClone(NIGHT_CONFIG);
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'stage5-combat', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 100 }];
  for (const definition of Object.values(config.enemies)) definition.speed = 0;
  config.enemies.minotaur.charge!.speed = 0;
  config.devices.cannon = { manualDamageBonus: 0.25, armorMultiplier: 1.5 };
  Object.assign(config.devices.definitions.cannon, { damage: 24, attackInterval: 0.6 });
  config.devices.barrier = { incomingDamageMultiplier: 0.85, chargeDamageMultiplier: 0.65,
    breakSlowMultiplier: 0.65, breakSlowSeconds: 1.5, breakSlowRadius: 70, repairCostMultiplier: 0.75 };
  config.devices.definitions.barrier.health = 230;
  config.devices.generator = { incomingDamageMultiplier: 0.8, lastStandEnabled: true, residualSeconds: 3 };
  config.devices.definitions.generator.health = 105;
  if (boss) config.boss = { ...getBossRules(1), health: 1000, speed: 0, attackDamage: 100 };
  const state = createBattle(config, 42, undefined, placements);
  state.enemies = [];
  state.waves[0]!.spawned = 100;
  return { state, config };
}

describe('stage 5 cannon specialization', () => {
  const cannon: DevicePlacement = { id: 10, kind: 'cannon', x: 100, y: 0 };

  it('spends a manual bonus only on an actual shot, once per target despite reset and reassignment', () => {
    const { state, config } = setup([cannon]);
    const target = enemy(1, 400); state.enemies = [target];
    stepBattle(state, config, [{ type: 'cannon-target', deviceId: 10, enemyId: 1 }]);
    expect(target.health).toBe(1000);
    expect(state.devices[0]!.manualBonusTargets).toBeUndefined();
    target.x = 150;
    stepBattle(state, config, []);
    expect(target.health).toBe(970);
    state.devices[0]!.attackCooldown = 0;
    stepBattle(state, config, [{ type: 'cannon-target', deviceId: 10, enemyId: null }]);
    expect(target.health).toBe(946);
    state.devices[0]!.attackCooldown = 0;
    stepBattle(state, config, [{ type: 'cannon-target', deviceId: 10, enemyId: 1 }]);
    expect(target.health).toBe(922);
    expect(state.devices[0]!.manualBonusTargets).toEqual([1]);
  });

  it('allows an automatic hit before the first manual hit and keeps budgets per cannon and per night', () => {
    const { state, config } = setup([cannon, { ...cannon, id: 11 }]);
    const target = enemy(); state.enemies = [target];
    fireCannons(state, config);
    expect(target.health).toBe(952);
    for (const gun of state.devices) { gun.attackCooldown = 0; gun.targetId = 1; }
    fireCannons(state, config);
    expect(target.health).toBe(892);
    expect(state.devices.map(gun => gun.manualBonusTargets)).toEqual([[1], [1]]);
    const next = createBattle(config, 42, undefined, [cannon]);
    expect(next.devices[0]!.manualBonusTargets).toBeUndefined();
  });

  it('does not farm the first-shot bonus by switching boss tentacles', () => {
    const { state, config } = setup([cannon], true);
    for (const zone of state.boss!.tentacles) { zone.x = 150; zone.y = 0; }
    const gun = state.devices[0]!;
    gun.targetId = state.boss!.tentacles[0]!.id;
    fireCannons(state, config);
    expect(state.boss!.health).toBe(970);
    gun.targetId = state.boss!.tentacles[1]!.id; gun.attackCooldown = 0;
    fireCannons(state, config);
    expect(state.boss!.health).toBe(946);
    expect(gun.manualBonusTargets).toEqual([0]);
  });

  it('multiplies armor damage alone, including overflow from an empowered shot', () => {
    const { state, config } = setup([cannon]);
    const target = enemy(); target.health = 100; target.armor = 12;
    state.enemies = [target]; state.devices[0]!.targetId = 1;
    fireCannons(state, config);
    expect(target.armor).toBe(0);
    expect(target.health).toBe(78); // 30 base damage - 12 / 1.5 used on armor.
    expect(state.events.find(event => event.type === 'enemy-hit')).toMatchObject({ armorDamage: 12, healthDamage: 22 });
  });

  it('keeps harpoon damage and its manual targeting outside cannon bonuses', () => {
    const { state, config } = setup([{ ...cannon, kind: 'harpoon' }]);
    const target = enemy(1, 150, 'bat'); target.armor = 100;
    state.enemies = [target]; state.devices[0]!.targetId = 1;
    fireCannons(state, config);
    expect(target.armor).toBe(100 - config.devices.definitions.harpoon.damage);
    expect(state.devices[0]!.manualBonusTargets).toBeUndefined();
  });

  it('fires at the full upgraded interval of eighteen fixed steps', () => {
    const { state, config } = setup([cannon]);
    const target = enemy(); state.enemies = [target];
    stepBattle(state, config, []);
    for (let i = 0; i < 17; i++) stepBattle(state, config, []);
    expect(target.health).toBe(976);
    stepBattle(state, config, []);
    expect(target.health).toBe(952);
  });
});

describe('stage 5 barrier protection and destruction', () => {
  const barrier: DevicePlacement = { id: 2, kind: 'barrier', x: 200, y: 0 };

  it.each([false, true])('uses the strongest relevant protection for a minotaur hit (charging=%s)', charging => {
    const { state, config } = setup([barrier]);
    const attacker = enemy(1, 200 + config.devices.definitions.barrier.radius + config.enemies.minotaur.radius, 'minotaur');
    attacker.chargePhase = charging ? 'charging' : 'spent'; state.enemies = [attacker];
    stepBattle(state, config, []);
    const raw = config.enemies.minotaur.attackDamage * (charging ? config.enemies.minotaur.charge!.damageMultiplier : 1);
    expect(state.devices[0]!.health).toBeCloseTo(230 - raw * (charging ? 0.65 : 0.85));
    if (charging) expect(attacker.chargePhase).toBe('spent');
  });

  it('applies ordinary body protection to a boss strike and emits only one destruction pulse', () => {
    const { state, config } = setup([barrier], true);
    const target = state.devices[0]!;
    const zone = state.boss!.tentacles[0]!;
    for (const other of state.boss!.tentacles) other.attackCooldown = other === zone ? 0 : 100;
    attackTentacles(state, config, new Map([[zone.id, target]]));
    expect(target.health).toBe(145);
    target.health = 1; zone.attackCooldown = 0;
    attackTentacles(state, config, new Map([[zone.id, target]]));
    damageDevice(state, config, target, 1000);
    expect(state.events.filter(event => event.type === 'barrier-slow')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'device-destroyed')).toHaveLength(1);
  });

  it('covers intersecting enemy and tentacle bodies and slows exactly the next 45 movement steps', () => {
    const { state, config } = setup([barrier], true);
    const touching = enemy(1, 200 + 70 + config.enemies.ghost.radius);
    const outside = enemy(2, touching.x + 0.01);
    state.enemies = [touching, outside];
    const zone = state.boss!.tentacles[0]!;
    zone.x = 200 + 70 + config.boss!.radius; zone.y = 0;
    damageDevice(state, config, state.devices[0]!, 1000);
    expect(movementSlowMultiplier(outside, 1)).toBe(1);
    for (let tick = 1; tick <= 45; tick++) {
      expect(movementSlowMultiplier(touching, tick)).toBe(0.65);
      expect(movementSlowMultiplier(zone, tick)).toBe(0.65);
    }
    expect(movementSlowMultiplier(touching, 46)).toBe(1);
    expect(movementSlowMultiplier(zone, 46)).toBe(1);
    config.enemies.ghost.speed = 30; config.boss!.speed = 30;
    state.tick = 1;
    const beforeEnemy = touching.x, beforeZone = zone.x;
    moveEnemies(state, config); moveTentacles(state, config, []);
    expect(touching.x).toBeCloseTo(beforeEnemy - 0.65);
    expect(zone.x).toBeCloseTo(beforeZone - 0.65);
  });

  it('preserves a longer weak bell slow and chooses the strongest barrier, bell or light effect', () => {
    const { state, config } = setup([barrier]);
    const target = enemy(1, 250); state.enemies = [target];
    applyMovementSlow(target, 3, 90, 0.8, 0);
    damageDevice(state, config, state.devices[0]!, 1000);
    expect(movementSlowMultiplier(target, 45)).toBe(0.65);
    expect(movementSlowMultiplier(target, 46)).toBe(0.8);
    config.enemies.ghost.speed = 30;
    config.lens = { id: 'slowing', slowMultiplier: 0.4, armorMultiplier: 1 };
    state.tick = 1;
    moveEnemies(state, config, [1]);
    expect(target.x).toBeCloseTo(249.6);
    applyMovementSlow(target, 4, 30, 0.5, 1);
    const before = target.x;
    moveEnemies(state, config);
    expect(target.x).toBeCloseTo(before - 0.5);
    expect(movementSlowMultiplier(target, 90)).toBe(1);
  });

  it('does not reduce hits to the shared shield or lighthouse', () => {
    const { state, config } = setup([{ id: 1, kind: 'generator', x: 70, y: 0 }, { ...barrier, x: 100 }]);
    const attacker = enemy(1, config.shield.radius + config.enemies.minotaur.radius, 'minotaur');
    attacker.chargePhase = 'charging'; state.enemies = [attacker];
    stepBattle(state, config, []);
    expect(state.shield.current).toBe(90 - config.enemies.minotaur.attackDamage * config.enemies.minotaur.charge!.damageMultiplier);
    expect(state.devices[1]!.health).toBe(230);
    const unshielded = setup([barrier]);
    unshielded.state.enemies = [enemy(1, unshielded.config.lighthouseRadius + unshielded.config.enemies.ghost.radius)];
    stepBattle(unshielded.state, unshielded.config, []);
    expect(unshielded.state.lighthouseHealth).toBe(120 - unshielded.config.enemies.ghost.attackDamage);
  });
});

describe('stage 5 generator survival and residual field', () => {
  const generator: DevicePlacement = { id: 1, kind: 'generator', x: 230, y: 0 };

  it('reduces body damage and survives one lethal attack, including a second attack in the same step', () => {
    const { state, config } = setup([generator]);
    const device = state.devices[0]!;
    damageDevice(state, config, device, 10);
    expect(device.health).toBe(97);
    device.health = 2;
    state.enemies = [enemy(1, 260), enemy(2, 260)];
    stepBattle(state, config, []);
    expect(device.health).toBe(0);
    expect(device.lastStandUsed).toBe(true);
    expect(state.events.filter(event => event.type === 'generator-saved')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'device-destroyed')).toHaveLength(1);
    expect(device.residualUntilTick).toBe(90);
  });

  it('never heals fractional pre-existing health when consuming its last stand', () => {
    const { state, config } = setup([{ ...generator, health: 0.4, consumed: false }]);
    const device = state.devices[0]!;
    damageDevice(state, config, device, 1000);
    expect(device.health).toBe(0.4);
    expect(device.lastStandUsed).toBe(true);
    expect(state.events.filter(event => event.type === 'device-hit')).toHaveLength(0);
    damageDevice(state, config, device, 1000);
    expect(device.health).toBe(0);
  });

  it('uses the same last-stand path for boss strikes and keeps the body protection local', () => {
    const { state, config } = setup([generator], true);
    const device = state.devices[0]!, zone = state.boss!.tentacles[0]!;
    for (const other of state.boss!.tentacles) other.attackCooldown = other === zone ? 0 : 100;
    attackTentacles(state, config, new Map([[zone.id, device]]));
    expect(device.health).toBe(25);
    zone.attackCooldown = 0;
    attackTentacles(state, config, new Map([[zone.id, device]]));
    expect(device.health).toBe(1);
    expect(device.lastStandUsed).toBe(true);
  });

  it('retains existing charge for 90 ticks, never creates or regenerates charge from the dead body', () => {
    const { state, config } = setup([generator]);
    config.devices.generator.lastStandEnabled = false;
    state.shield.current = 27;
    damageDevice(state, config, state.devices[0]!, 1000);
    expect(state.shield).toMatchObject({ current: 27, maximum: 90 });
    for (let tick = 1; tick < 90; tick++) { state.tick = tick; updateShield(state, config); }
    expect(state.shield).toMatchObject({ current: 27, maximum: 90 });
    state.tick = 90; updateShield(state, config);
    expect(state.shield).toMatchObject({ current: 0, maximum: 0 });
    expect(state.events.filter(event => event.type === 'shield-broken')).toHaveLength(1);

    const empty = setup([generator]);
    empty.config.devices.generator.lastStandEnabled = false; empty.state.shield.current = 0;
    damageDevice(empty.state, empty.config, empty.state.devices[0]!, 1000);
    for (let i = 0; i < 10; i++) { empty.state.tick++; updateShield(empty.state, empty.config); }
    expect(empty.state.shield.current).toBe(0);
    expect(empty.state.events.some(event => event.type === 'shield-restored')).toBe(false);
  });

  it('keeps one shared regeneration rate with live generators, and clamps immediately at each residual expiry', () => {
    const { state, config } = setup([generator, { ...generator, id: 2, x: 70 }, { ...generator, id: 3, y: 70 }]);
    config.devices.generator.lastStandEnabled = false;
    state.shield.current = 30;
    damageDevice(state, config, state.devices[0]!, 1000);
    updateShield(state, config);
    expect(state.shield.current).toBe(30.5);
    state.tick = 30;
    damageDevice(state, config, state.devices[2]!, 1000);
    state.shield.current = 250;
    state.tick = 90; updateShield(state, config);
    expect(state.shield).toMatchObject({ current: 180, maximum: 180 });
    state.tick = 120; updateShield(state, config);
    expect(state.shield).toMatchObject({ current: 90, maximum: 90 });
  });

  it('resets exhausted-field recovery after actual protected body damage and excludes dead deployments', () => {
    const { state, config } = setup([{ ...generator, x: 70 }]);
    state.shield.current = 0; state.shield.recoveryRemaining = 1;
    state.enemies = [enemy(1, 100)];
    stepBattle(state, config, []);
    expect(state.devices[0]!.health).toBe(101);
    expect(state.shield.recoveryRemaining).toBe(4);
    const dead = setup([{ ...generator, health: 0, consumed: false }]);
    expect(dead.state.devices[0]!.residualUntilTick).toBeUndefined();
    expect(dead.state.shield.current).toBe(0);
    updateShield(dead.state, dead.config);
    expect(dead.state.shield.maximum).toBe(0);
  });

  it('allows finite repair after last stand without rearming it, and never repairs a destroyed body', () => {
    const { state, config } = setup([{ ...generator, health: 40, consumed: false }, { id: 2, kind: 'repair-lamp', x: 230, y: 50 }]);
    const device = state.devices[0]!, lamp = state.devices[1]!;
    config.devices.repairLamp.emergencyEnabled = true;
    damageDevice(state, config, device, 1000);
    updateRepairLamps(state, config);
    expect(device.health).toBeGreaterThan(1);
    expect(device.health).toBeLessThanOrEqual(40);
    expect(device.lastStandUsed).toBe(true);
    const charges = lamp.repairCharges;
    damageDevice(state, config, device, 1000);
    lamp.attackCooldown = 0;
    updateRepairLamps(state, config);
    expect(device.health).toBe(0);
    expect(lamp.repairCharges).toBe(charges);
    expect(state.events.filter(event => event.type === 'generator-saved')).toHaveLength(1);
  });

  it('replays new effects deterministically from a cloned battle state', () => {
    const placements: DevicePlacement[] = [generator, { id: 2, kind: 'barrier', x: -200, y: 0 }, { id: 3, kind: 'cannon', x: 100, y: 100 }];
    const { state, config } = setup(placements);
    state.enemies = [enemy(1, -240, 'turtle'), enemy(2, 260), enemy(3, 130)];
    state.devices[0]!.health = 1;
    damageDevice(state, config, state.devices[0]!, 1000);
    damageDevice(state, config, state.devices[0]!, 1000);
    damageDevice(state, config, state.devices[1]!, 1000);
    state.devices[2]!.targetId = 3;
    const resumed = structuredClone(state);
    for (let i = 0; i < 100; i++) {
      stepBattle(state, config, []);
      stepBattle(resumed, config, []);
    }
    expect(resumed).toEqual(state);
    expect(state.devices[0]!.lastStandUsed).toBe(true);
    expect(state.shield.maximum).toBe(0);
    expect(state.devices[2]!.manualBonusTargets).toEqual([3]);
  });

  it('freezes residual capacity and barrier slows during application pause and resumes by fixed steps', () => {
    const { config } = setup();
    const saved = emptySave();
    saved.profile.legacyEquipment = true;
    saved.profile.devices = [
      { id: 1, kind: 'generator', health: 60, consumed: false, position: { x: 230, y: 0 } },
      { id: 2, kind: 'barrier', health: 140, consumed: false, position: { x: -200, y: 0 } },
    ];
    saved.profile.nextDeviceId = 3;
    grantFixtureDevices(saved.profile);
    let raw: string | null = JSON.stringify(saved);
    const app = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, config,
      () => ({ id: 'stage5-pause', seed: 42 }));
    app.openPreparation(); app.start();
    expect(app.view.screen).toBe('battle');
    const battle = app.view.battle as BattleState;
    battle.enemies = [enemy(1, -240, 'turtle')];
    battle.waves[0]!.spawned = 100;
    damageDevice(battle, app.view.config, battle.devices[0]!, 1000);
    damageDevice(battle, app.view.config, battle.devices[0]!, 1000);
    damageDevice(battle, app.view.config, battle.devices[1]!, 1000);
    const paused = structuredClone(battle);
    app.pause(); app.advance(50_000);
    expect(battle).toEqual(paused);
    app.resume(); app.advance(50_000);
    expect(battle).toEqual(paused);
    app.advance(1000 / 30);
    expect(battle.tick).toBe(1);
    expect(battle.devices[0]!.residualUntilTick).toBe(90);
    expect(battle.shield.maximum).toBe(90);
    expect(movementSlowMultiplier(battle.enemies[0]!, battle.tick)).toBe(0.65);
    for (let i = 0; i < 45; i++) app.advance(1000 / 30);
    expect(movementSlowMultiplier(battle.enemies[0]!, battle.tick)).toBe(1);
    expect(battle.shield.maximum).toBe(90);
    for (let i = 0; i < 45; i++) app.advance(1000 / 30);
    expect(battle.shield.maximum).toBe(0);
  });
});
