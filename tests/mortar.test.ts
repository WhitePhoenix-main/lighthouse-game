import { describe, expect, it } from 'vitest';
import type { CannonPriority, DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { getBossRules } from '../src/content/boss';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { updateMortars } from '../src/simulation/mortar';

const mortar: DevicePlacement = { id: 1, kind: 'mortar', x: 100, y: 0 };
function enemy(id: number, x: number, y = 80, kind: EnemyKind = 'ghost'): EnemyState {
  return { id, kind, x, y, health: 100, armor: 0, attackCooldown: 0, waveIndex: 0 };
}
function setup(enemies: EnemyState[], placements: DevicePlacement[] = [mortar]) {
  const rules: NightConfig = structuredClone(NIGHT_CONFIG);
  rules.beam.damagePerSecond = 0;
  for (const definition of Object.values(rules.enemies)) definition.speed = 0;
  rules.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  const state = createBattle(rules, 42, undefined, placements);
  state.enemies = enemies;
  state.waves[0]!.spawned = 100;
  return { state, rules };
}
function impact(fixture: ReturnType<typeof setup>) {
  fixture.state.tick = fixture.state.mortarProjectiles[0]!.impactTick;
  updateMortars(fixture.state, fixture.rules);
}

describe('mortar aimed projectiles', () => {
  it('launches without damage and impacts only on its quantized flight tick', () => {
    const target = enemy(1, 200, 0);
    const fixture = setup([target]);
    updateMortars(fixture.state, fixture.rules);
    const shot = fixture.state.mortarProjectiles[0]!;
    expect(shot).toMatchObject({ fromX: 100, fromY: 0, x: 200, y: 0, launchTick: 0,
      impactTick: Math.ceil(100 / 180 / fixture.rules.stepSeconds), damage: 24, blastRadius: 55, armorMultiplier: 1 });
    expect(target.health).toBe(100);
    fixture.state.tick = shot.impactTick - 1;
    updateMortars(fixture.state, fixture.rules);
    expect(target.health).toBe(100);
    fixture.state.tick++;
    updateMortars(fixture.state, fixture.rules);
    expect(target.health).toBe(76);
    expect(fixture.state.mortarProjectiles).toHaveLength(0);
    expect(fixture.state.events.filter(event => event.type === 'mortar-impact')).toHaveLength(1);
  });

  it('waits at least one tick even at zero distance', () => {
    const fixture = setup([enemy(1, mortar.x, mortar.y)]);
    updateMortars(fixture.state, fixture.rules);
    expect(fixture.state.mortarProjectiles[0]!.impactTick).toBe(1);
    expect(fixture.state.enemies[0]!.health).toBe(100);
  });

  it('misses a moving target, keeps the launch point and emits an impact on empty ground', () => {
    const target = enemy(1, 200);
    const fixture = setup([target]);
    updateMortars(fixture.state, fixture.rules);
    target.y += 100;
    impact(fixture);
    expect(target.health).toBe(100);
    expect(fixture.state.events.find(event => event.type === 'mortar-impact')).toMatchObject({ x: 200, y: 80, radius: 55 });
  });

  it('hits ground bodies touching the circle, including ghosts, while excluding bats', () => {
    const target = enemy(1, 200), edge = enemy(2, 267), outside = enemy(3, 267.01), bat = enemy(4, 200, 80, 'bat');
    const fixture = setup([target, edge, outside, bat]);
    updateMortars(fixture.state, fixture.rules);
    impact(fixture);
    expect([target.health, edge.health, outside.health, bat.health]).toEqual([76, 76, 100, 100]);
    expect(fixture.state.devices[0]!.health).toBe(80);
    expect(fixture.state.lighthouseHealth).toBe(fixture.rules.lighthouseHealth);
  });

  it('never automatically targets bats and clears an invalid air lock', () => {
    const fixture = setup([enemy(1, 160, 80, 'bat')]);
    fixture.state.devices[0]!.targetId = 1;
    updateMortars(fixture.state, fixture.rules);
    expect(fixture.state.mortarProjectiles).toHaveLength(0);
    expect(fixture.state.devices[0]!.targetId).toBe(null);
  });

  it.each([1, 2])('uses only its armor multiplier %s and keeps health overflow unmultiplied', multiplier => {
    const target = enemy(1, 200, 80, 'turtle'); target.armor = 30;
    const fixture = setup([target]);
    fixture.rules.lens = { id: 'armor-breaker', slowMultiplier: 1, armorMultiplier: 10 };
    fixture.rules.devices.mortar.armorMultiplier = multiplier;
    updateMortars(fixture.state, fixture.rules);
    impact(fixture);
    expect(target.armor).toBe(multiplier === 1 ? 6 : 0);
    expect(target.health).toBe(multiplier === 1 ? 100 : 91);
  });

  it('preserves launch stats and resolves a projectile after the launcher is destroyed', () => {
    const target = enemy(1, 200);
    const fixture = setup([target]);
    updateMortars(fixture.state, fixture.rules);
    fixture.state.devices[0]!.health = 0;
    fixture.rules.devices.definitions.mortar.damage = 999;
    fixture.rules.devices.mortar.blastRadius = 1;
    fixture.rules.devices.mortar.armorMultiplier = 10;
    impact(fixture);
    expect(target.health).toBe(76);
    expect(fixture.state.mortarProjectiles).toHaveLength(0);
  });

  it.each<[CannonPriority, number]>([['nearest', 1], ['strongest', 3], ['weakest', 2]])('uses %s and stable id ties', (priority, targetId) => {
    const nearest = enemy(1, 110), weak = enemy(2, 200), armored = enemy(3, 210), tied = enemy(4, 210);
    weak.health = 50; armored.armor = 50; tied.armor = 50;
    const fixture = setup([tied, armored, weak, nearest]);
    stepBattle(fixture.state, fixture.rules, [{ type: 'cannon-priority', deviceId: 1, priority }]);
    expect(fixture.state.devices[0]!.lastShot).toMatchObject({ x: fixture.state.enemies.find(target => target.id === targetId)!.x });
  });

  it('retains a manual target outside range and rejects bat/invalid commands without clearing it', () => {
    const near = enemy(1, 140), manual = enemy(2, 331, 0), bat = enemy(3, 140, 80, 'bat');
    const fixture = setup([near, manual, bat]);
    stepBattle(fixture.state, fixture.rules, [
      { type: 'cannon-target', deviceId: 1, enemyId: manual.id },
      { type: 'cannon-priority', deviceId: 1, priority: 'weakest' },
      { type: 'cannon-target', deviceId: 1, enemyId: bat.id },
      { type: 'cannon-target', deviceId: 1, enemyId: 999 },
    ]);
    expect(fixture.state.devices[0]!.targetId).toBe(2);
    expect(fixture.state.mortarProjectiles).toHaveLength(0);
    manual.x = 330;
    stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.mortarProjectiles[0]).toMatchObject({ x: 330, y: 0 });
    manual.health = 0;
    fixture.state.devices[0]!.attackCooldown = 0;
    stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.devices[0]!.targetId).toBe(null);
    expect(fixture.state.devices[0]!.lastShot).toMatchObject({ x: near.x, y: near.y });
  });

  it('hits shared boss health once even when multiple tentacles overlap the explosion', () => {
    const fixture = setup([]);
    fixture.rules.boss = { ...getBossRules(1), speed: 0 };
    fixture.state.boss = { id: fixture.rules.boss.id, health: 100, stunnedUntilTick: 0, tentacles: [
      { id: -1001, x: 200, y: 80, attackCooldown: 0 },
      { id: -1002, x: 210, y: 80, attackCooldown: 0 },
    ] };
    stepBattle(fixture.state, fixture.rules, [{ type: 'cannon-target', deviceId: 1, enemyId: -1001 }]);
    impact(fixture);
    expect(fixture.state.boss.health).toBe(76);
    expect(fixture.state.events.filter(event => event.type === 'boss-hit')).toHaveLength(1);
  });

  it('launches in device id order, skips consumed/destroyed devices and rewards deaths only once', () => {
    const victim = enemy(1, 200); victim.health = 10;
    const fixture = setup([victim], [{ ...mortar, id: 4 }, { ...mortar, id: 2 }, { ...mortar, id: 3 }, mortar]);
    fixture.state.devices.find(device => device.id === 3)!.health = 0;
    fixture.state.devices.find(device => device.id === 4)!.consumed = true;
    stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.mortarProjectiles.map(shot => [shot.id, shot.deviceId])).toEqual([[1, 1], [2, 2]]);
    const endTick = fixture.state.mortarProjectiles[0]!.impactTick;
    while (fixture.state.tick <= endTick) stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.kills).toBe(1);
    expect(fixture.state.earnedResources).toBe(fixture.rules.enemies.ghost.reward);
    expect(fixture.state.events.filter(event => event.type === 'enemy-died')).toHaveLength(1);
    for (let index = 0; index < 100; index++) stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.kills).toBe(1);
    expect(fixture.state.earnedResources).toBe(fixture.rules.enemies.ghost.reward);
  });

  it('resolves lethal impacts before choosing fresh automatic targets', () => {
    const victim = enemy(1, 160); victim.health = 10;
    const survivor = enemy(2, 250);
    const fixture = setup([victim, survivor]);
    updateMortars(fixture.state, fixture.rules);
    fixture.state.devices[0]!.attackCooldown = 0;
    impact(fixture);
    expect(fixture.state.mortarProjectiles).toHaveLength(1);
    expect(fixture.state.mortarProjectiles[0]).toMatchObject({ x: survivor.x, y: survivor.y });
  });

  it('uses upgraded speed and fixed-step reload independently of flight duration', () => {
    const fixture = setup([enemy(1, 200)]);
    fixture.rules.devices.definitions.mortar.attackInterval = fixture.rules.stepSeconds * 3;
    fixture.rules.devices.mortar.projectileSpeed = 360;
    stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.mortarProjectiles[0]!.impactTick).toBe(Math.ceil(Math.hypot(100, 80) / 360 / fixture.rules.stepSeconds));
    stepBattle(fixture.state, fixture.rules, []); stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.nextProjectileId).toBe(2);
    stepBattle(fixture.state, fixture.rules, []);
    expect(fixture.state.nextProjectileId).toBe(3);
    expect(fixture.state.devices[0]!.lastShot!.tick).toBe(3);
  });

  it('replays a seeded battle and targeting commands identically', () => {
    const first = createBattle(NIGHT_CONFIG, 81, undefined, [mortar]);
    const second = createBattle(NIGHT_CONFIG, 81, undefined, [mortar]);
    for (let tick = 0; tick < 1500; tick++) {
      const commands = [{ type: 'cannon-priority' as const, deviceId: 1, priority: 'weakest' as const }];
      stepBattle(first, NIGHT_CONFIG, commands); stepBattle(second, NIGHT_CONFIG, commands);
    }
    expect(first).toEqual(second);
  });
});
