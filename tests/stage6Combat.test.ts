import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, DevicePlacement, EnemyKind, EnemyState } from '../src/contracts';
import { LighthouseApplication } from '../src/application/gameApplication';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { triggerTraps } from '../src/simulation/abilities';
import { attackTentacles, moveTentacles } from '../src/simulation/boss';
import { damageDevice } from '../src/simulation/deviceDamage';
import { fireCannons, moveEnemies } from '../src/simulation/devices';
import { updateRepairLamps } from '../src/simulation/repair';
import { applyMovementSlow, movementSlowMultiplier } from '../src/simulation/slows';

const trap: DevicePlacement = { id: 10, kind: 'light-trap', x: 180, y: 0 };
const harpoon: DevicePlacement = { id: 11, kind: 'harpoon', x: 100, y: 0 };

function enemy(id = 1, x = 220, kind: EnemyKind = 'ghost'): EnemyState {
  return { id, kind, x, y: 0, health: 1000, armor: 0, waveIndex: 0, attackCooldown: 0 };
}

function setup(placements: readonly (DevicePlacement | DeviceDeployment)[] = [], boss = false) {
  const config = structuredClone(NIGHT_CONFIG);
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'stage6', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 100 }];
  for (const definition of Object.values(config.enemies)) definition.speed = 0;
  config.enemies.minotaur.charge!.speed = 0;
  config.devices.harpoon = { slowMultiplier: 0.8, slowSeconds: 0.6, flyingDamageMultiplier: 1.35 };
  Object.assign(config.devices.definitions.harpoon, { damage: 22, range: 225, attackInterval: 1.05 });
  config.devices.trap = { damage: 90, blastRadius: 105, triggerRadius: 48, armorMultiplier: 1.5, charges: 2, rearmSeconds: 2.5 };
  config.devices.definitions['light-trap'].health = 45;
  if (boss) config.boss = { ...getBossRules(1), health: 1000, speed: 0 };
  const state = createBattle(config, 42, undefined, placements);
  state.enemies = [];
  state.waves[0]!.spawned = 100;
  return { state, config };
}

describe('stage 6 harpoon', () => {
  it.each<EnemyKind>(['ghost', 'turtle', 'minotaur', 'bat'])('applies the flying bonus by movement definition to %s', kind => {
    const { state, config } = setup([harpoon]);
    const target = enemy(1, 200, kind); state.enemies = [target];
    state.devices[0]!.targetId = target.id;
    fireCannons(state, config);
    expect(target.health).toBeCloseTo(1000 - 22 * (config.enemies[kind].movement === 'flying' ? 1.35 : 1));
    expect(state.devices[0]!.manualBonusTargets).toBeUndefined();
    expect(movementSlowMultiplier(target, 1)).toBe(0.8);
  });

  it('uses the full upgraded range and fixed-step attack interval', () => {
    const { state, config } = setup([harpoon]);
    const target = enemy(1, harpoon.x + 225.01); state.enemies = [target];
    stepBattle(state, config, []); expect(target.health).toBe(1000);
    target.x = harpoon.x + 225;
    stepBattle(state, config, []); expect(target.health).toBe(978);
    for (let index = 0; index < 31; index++) stepBattle(state, config, []);
    expect(target.health).toBe(978);
    stepBattle(state, config, []); expect(target.health).toBe(956);
  });

  it('keeps exactly 18 future movement steps of slow after the source dies', () => {
    const { state, config } = setup([harpoon]);
    const target = enemy(); state.enemies = [target];
    fireCannons(state, config);
    damageDevice(state, config, state.devices[0]!, 1000);
    config.enemies.ghost.speed = 30;
    for (let tick = 1; tick <= 18; tick++) {
      state.tick = tick;
      const before = target.x; moveEnemies(state, config);
      expect(target.x).toBeCloseTo(before - 0.8);
    }
    state.tick = 19;
    const before = target.x; moveEnemies(state, config);
    expect(target.x).toBeCloseTo(before - 1);
  });

  it('chooses the strongest slow and leaves longer weaker effects intact', () => {
    const { state, config } = setup([harpoon]);
    const target = enemy(); state.enemies = [target];
    applyMovementSlow(target, 20, 45, 0.9, 0);
    applyMovementSlow(target, 21, 10, 0.65, 0);
    fireCannons(state, config);
    expect(movementSlowMultiplier(target, 1)).toBe(0.65);
    expect(movementSlowMultiplier(target, 10)).toBe(0.8);
    expect(movementSlowMultiplier(target, 19)).toBe(0.9);
    config.enemies.ghost.speed = 30;
    config.lens = { id: 'slowing', slowMultiplier: 0.4, armorMultiplier: 1 };
    state.tick = 1;
    moveEnemies(state, config, [target.id]);
    expect(target.x).toBeCloseTo(219.6);
    expect(movementSlowMultiplier(target, 45)).toBe(1);
  });

  it('slows only the hit tentacle, gives no flying bonus and does not suppress attacks', () => {
    const { state, config } = setup([harpoon], true);
    const zone = state.boss!.tentacles[0]!;
    zone.x = 200; zone.y = 0;
    state.devices[0]!.targetId = zone.id;
    fireCannons(state, config);
    expect(state.boss!.health).toBe(978);
    expect(movementSlowMultiplier(zone, 1)).toBe(0.8);
    expect(movementSlowMultiplier(state.boss!.tentacles[1]!, 1)).toBe(1);
    expect(state.boss!.stunnedUntilTick).toBe(0);
    config.boss!.speed = 30; state.tick = 1;
    moveTentacles(state, config, []); expect(zone.x).toBeCloseTo(199.2);
    const health = state.devices[0]!.health;
    attackTentacles(state, config, new Map([[zone.id, state.devices[0]!]]));
    expect(state.devices[0]!.health).toBe(health - config.boss!.attackDamage);
    state.tick = 19; expect(movementSlowMultiplier(zone, state.tick)).toBe(1);
  });

  it('leaves an ordinary slowed enemy able to attack', () => {
    const { state, config } = setup([harpoon]);
    const target = enemy(1, config.lighthouseRadius + config.enemies.ghost.radius);
    state.enemies = [target];
    stepBattle(state, config, []);
    expect(target.health).toBe(978);
    expect(target.stunnedUntilTick ?? 0).toBe(0);
    expect(state.lighthouseHealth).toBe(120 - config.enemies.ghost.attackDamage);
  });
});

describe('stage 6 trap magazine', () => {
  it('fires one charge per eligible step with exactly 75 ticks before the second blast', () => {
    const { state, config } = setup([trap]);
    const target = enemy(); state.enemies = [target];
    triggerTraps(state, config);
    expect(state.devices[0]).toMatchObject({ trapCharges: 1, consumed: false, trapReadyTick: 75 });
    triggerTraps(state, config); expect(target.health).toBe(910);
    for (let tick = 1; tick < 75; tick++) { state.tick = tick; triggerTraps(state, config); }
    expect(target.health).toBe(910);
    state.tick = 75; triggerTraps(state, config);
    expect(target.health).toBe(820);
    expect(state.devices[0]).toMatchObject({ trapCharges: 0, consumed: true });
    state.tick = 1000; triggerTraps(state, config);
    expect(state.events.filter(event => event.type === 'trap-triggered')).toHaveLength(2);
  });

  it('does not spend the next charge on an empty area or after destruction', () => {
    const { state, config } = setup([trap]);
    const target = enemy(); state.enemies = [target]; triggerTraps(state, config);
    target.x = 350; state.tick = 75; triggerTraps(state, config);
    expect(state.devices[0]!.trapCharges).toBe(1);
    damageDevice(state, config, state.devices[0]!, 1000);
    target.x = 220; state.tick = 76; triggerTraps(state, config);
    expect(target.health).toBe(910);
    expect(state.devices[0]!.trapCharges).toBe(1);
  });

  it('keeps a partial magazine targetable and repairable without refilling it', () => {
    const { state, config } = setup([trap, { id: 20, kind: 'repair-lamp', x: 180, y: 60 }]);
    const target = enemy(); state.enemies = [target]; triggerTraps(state, config);
    target.x = trap.x + config.devices.definitions['light-trap'].radius + config.enemies.ghost.radius;
    const contacts = moveEnemies(state, config);
    expect(contacts.get(target.id)).toBe(state.devices[0]);
    damageDevice(state, config, state.devices[0]!, 20);
    updateRepairLamps(state, config);
    expect(state.devices[0]!.health).toBeGreaterThan(25);
    expect(state.devices[0]!.trapCharges).toBe(1);
    expect(state.devices[0]!.consumed).toBe(false);
  });

  it('preserves explicit and legacy paid counts without granting new charges on deployment', () => {
    const { config } = setup();
    const placements: DeviceDeployment[] = [
      { ...trap, health: 45, consumed: false, trapCharges: 1 },
      { ...trap, id: 11, health: 45, consumed: false },
      { ...trap, id: 12, health: 45, consumed: true },
      { ...trap, id: 13, health: 45, consumed: false, trapCharges: 0 },
    ];
    expect(createBattle(config, 1, undefined, placements).devices.map(device => device.trapCharges)).toEqual([1, 1, 0, 0]);
    expect(createBattle(config, 1, undefined, [trap]).devices[0]!.trapCharges).toBe(2);
  });

  it('uses body intersection, hits all enemies, and damages the boss once per explosion without friendly fire', () => {
    const { state, config } = setup([trap, { id: 20, kind: 'barrier', x: 180, y: 60 }], true);
    const edge = trap.x + config.devices.trap.blastRadius + config.enemies.ghost.radius;
    const trigger = enemy();
    const armored = enemy(2, edge); armored.armor = 30;
    const untouched = enemy(3, edge + 0.01);
    const cluster = Array.from({ length: 5 }, (_, index) => enemy(4 + index));
    state.enemies = [trigger, armored, untouched, ...cluster];
    for (const zone of state.boss!.tentacles) { zone.x = 200; zone.y = 0; }
    const deviceHealth = state.devices.map(device => device.health);
    triggerTraps(state, config);
    expect(trigger.health).toBe(910);
    expect(armored.armor).toBe(0); expect(armored.health).toBe(930);
    expect(untouched.health).toBe(1000);
    expect(cluster.every(target => target.health === 910)).toBe(true);
    expect(state.boss!.health).toBe(910);
    expect(state.devices.map(device => device.health)).toEqual(deviceHealth);
    expect(state.lighthouseHealth).toBe(120);
  });

  it('can trigger on a touching body at the trigger radius', () => {
    const { state, config } = setup([trap]);
    const target = enemy(1, trap.x + 48 + config.enemies.ghost.radius + 0.01);
    state.enemies = [target]; triggerTraps(state, config);
    expect(state.devices[0]!.trapCharges).toBe(2);
    target.x -= 0.01; triggerTraps(state, config);
    expect(state.devices[0]!.trapCharges).toBe(1);
  });

  it('awards each killed enemy once across both explosions and replays rearming state deterministically', () => {
    const { state, config } = setup([trap]);
    const first = enemy(); first.health = 80;
    const second = enemy(2); second.health = 150;
    state.enemies = [first, second];
    stepBattle(state, config, []);
    expect(state.kills).toBe(1);
    expect(state.earnedResources).toBe(config.enemies.ghost.reward);
    const resumed = structuredClone(state);
    for (let index = 0; index < 75; index++) {
      stepBattle(state, config, []); stepBattle(resumed, config, []);
    }
    expect(resumed).toEqual(state);
    expect(state.kills).toBe(2);
    expect(state.earnedResources).toBe(2 * config.enemies.ghost.reward);
    expect(state.events.filter(event => event.type === 'enemy-died')).toHaveLength(2);
  });

  it('freezes magazine rearming and movement slows during application pause without catching up', () => {
    const fixture = setup([trap, harpoon]);
    let raw: string | null = null;
    const app = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, fixture.config,
      () => ({ id: 'stage6-pause', seed: 42 }));
    app.openPreparation(); app.start();
    expect(app.view.screen).toBe('battle');
    const battle = app.view.battle as BattleState;
    // Isolate lifecycle timing from inventory unlock and upgrade prerequisites.
    battle.devices = fixture.state.devices;
    battle.enemies = [enemy()]; battle.waves[0]!.spawned = 100;
    app.view.config.devices.harpoon = fixture.config.devices.harpoon;
    app.view.config.devices.trap = fixture.config.devices.trap;
    triggerTraps(battle, app.view.config); fireCannons(battle, app.view.config);
    const paused = structuredClone(battle);
    app.pause(); app.advance(50_000);
    expect(battle).toEqual(paused);
    app.resume(); app.advance(50_000);
    expect(battle).toEqual(paused);
    app.advance(1000 / 30);
    expect(battle.tick).toBe(1);
    expect(battle.devices[0]).toMatchObject({ trapCharges: 1, trapReadyTick: 75 });
    expect(movementSlowMultiplier(battle.enemies[0]!, battle.tick)).toBe(0.8);
  });
});
