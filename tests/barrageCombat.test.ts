import { describe, expect, it } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { ABILITY_BASE_RULES } from '../src/content/campaignAbilityBalance';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { castBarrage } from '../src/simulation/barrage';
import { fireCannons, moveEnemies } from '../src/simulation/devices';
import { updateMortars } from '../src/simulation/mortar';

function enemy(id: number, x = 160, y = 0, kind: EnemyKind = 'ghost'): EnemyState {
  return { id, kind, x, y, health: 1000, armor: 0, attackCooldown: 0, waveIndex: 0 };
}
function setup(kinds: DevicePlacement['kind'][] = ['cannon'], enemies = [enemy(1)]) {
  const config: NightConfig = structuredClone(NIGHT_CONFIG);
  config.ability = { ...ABILITY_BASE_RULES.barrage };
  config.beam.damagePerSecond = 0;
  config.devices.cannon.manualDamageBonus = 0;
  config.waves = [{ id: 'test', enemies: Array<EnemyKind>(100).fill('ghost'), spawnInterval: 1 }];
  for (const definition of Object.values(config.enemies)) definition.speed = 0;
  const state = createBattle(config, 42, undefined, kinds.map((kind, index) => ({ id: index + 1, kind, x: 100, y: 0 })));
  state.enemies = enemies;
  state.waves[0]!.spawned = 100;
  return { state, config };
}
function impact(f: ReturnType<typeof setup>): void {
  f.state.tick = f.state.mortarProjectiles[0]!.impactTick;
  f.state.devices.forEach(device => { device.health = 0; });
  updateMortars(f.state, f.config);
}
const aim = { x: 160, y: 0, enemyId: 1 };

describe('barrage real combat', () => {
  it('adds one attack per eligible stable-id weapon regardless of ordinary readiness and starts full reload', () => {
    const f = setup(['mortar', 'cannon', 'harpoon']);
    f.state.devices.reverse();
    f.state.devices.forEach(device => { device.attackCooldown = 99; });
    expect(castBarrage(f.state, f.config, aim)).toBe(true);
    expect(f.state.mortarProjectiles.map(shot => shot.deviceId)).toEqual([1]);
    expect(f.state.devices.every(device => device.lastShot?.tick === 0)).toBe(true);
    for (const device of f.state.devices) expect(device.attackCooldown).toBe(f.config.devices.definitions[device.kind].attackInterval);
    const health = f.state.enemies[0]!.health;
    fireCannons(f.state, f.config); updateMortars(f.state, f.config);
    expect(f.state.enemies[0]!.health).toBe(health);
    expect(f.state.mortarProjectiles).toHaveLength(1);
  });

  it('a command starts a full reload and cannot fire normally again in its activation step, even for interval=dt', () => {
    const f = setup(['cannon', 'mortar']);
    f.config.devices.definitions.cannon.attackInterval = f.config.stepSeconds;
    f.config.devices.definitions.mortar.attackInterval = f.config.stepSeconds;
    stepBattle(f.state, f.config, [{ type: 'use-ability', target: aim }]);
    expect(f.state.enemies[0]!.health).toBe(1000 - f.config.devices.definitions.cannon.damage);
    expect(f.state.nextProjectileId).toBe(2);
    expect(f.state.devices.map(device => device.attackCooldown)).toEqual([f.config.stepSeconds, f.config.stepSeconds]);
    stepBattle(f.state, f.config, []);
    expect(f.state.nextProjectileId).toBe(3);
  });

  it('respects weapon targeting: cannons exclude air, harpoons keep flying bonuses and slow', () => {
    const f = setup(['cannon', 'harpoon', 'mortar'], [enemy(1, 160, 0, 'bat')]);
    f.config.devices.harpoon.slowMultiplier = .8;
    f.config.devices.harpoon.slowSeconds = 2;
    expect(castBarrage(f.state, f.config, aim)).toBe(true);
    expect(f.state.devices[0]!.lastShot).toBeNull();
    const harpoon = f.config.devices.definitions.harpoon;
    expect(f.state.enemies[0]!.health).toBeCloseTo(1000 - harpoon.damage * f.config.devices.harpoon.flyingDamageMultiplier);
    expect(f.state.enemies[0]!.bellSlows?.[0]?.multiplier).toBe(f.config.devices.harpoon.slowMultiplier);
    impact(f);
    expect(f.state.enemies[0]!.health).toBeCloseTo(1000 - harpoon.damage * f.config.devices.harpoon.flyingDamageMultiplier);
  });

  it('allows an empty land area for mortars only and never silently targets a nearby enemy', () => {
    const f = setup(['cannon', 'harpoon', 'mortar']);
    expect(castBarrage(f.state, f.config, { x: 160, y: 20 })).toBe(true);
    expect(f.state.devices.slice(0, 2).every(device => device.lastShot === null)).toBe(true);
    expect(f.state.mortarProjectiles[0]).toMatchObject({ x: 160, y: 20 });
    expect(castBarrage(setup().state, f.config, { x: 160, y: 20 })).toBe(false);
  });

  it.each([{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: 301, y: 0 }, { x: 0, y: 0, enemyId: 999 }])('rejects invalid aim without side effects: %o', target => {
    const f = setup(['cannon', 'mortar']); const before = structuredClone(f.state);
    expect(castBarrage(f.state, f.config, target)).toBe(false);
    expect(f.state).toEqual(before);
  });

  it('rejects dead target ids, world bounds and own weapon range; binds valid ids to current positions', () => {
    const f = setup(['cannon', 'mortar']);
    f.state.enemies[0]!.health = 0;
    expect(castBarrage(f.state, f.config, aim)).toBe(false);
    f.state.enemies[0]!.health = 1000;
    f.config.worldRadius = 150;
    expect(castBarrage(f.state, f.config, aim)).toBe(false);
    f.config.worldRadius = 400;
    f.config.devices.definitions.cannon.range = 10; f.config.devices.definitions.mortar.range = 10;
    expect(castBarrage(f.state, f.config, aim)).toBe(false);
    f.config.devices.definitions.cannon.range = 200;
    expect(castBarrage(f.state, f.config, { ...aim, x: -10, y: 20 })).toBe(true);
    expect(f.state.devices[0]!.lastShot).toMatchObject({ x: 160, y: 0 });
  });

  it('skips destroyed, consumed, nonweapon and suppressed devices while their reload timers continue', () => {
    const f = setup(['cannon', 'harpoon', 'mortar', 'generator']);
    f.state.devices[0]!.health = 0; f.state.devices[1]!.consumed = true;
    f.state.devices[2]!.suppressedUntilTick = 3;
    f.state.devices.forEach(device => { device.attackCooldown = f.config.stepSeconds; });
    expect(castBarrage(f.state, f.config, aim)).toBe(false);
    moveEnemies(f.state, f.config); fireCannons(f.state, f.config); updateMortars(f.state, f.config);
    expect(f.state.devices.map(device => device.attackCooldown)).toEqual([0, 0, 0, 0]);
    expect(f.state.mortarProjectiles).toHaveLength(0);
    f.state.tick = 3;
    expect(castBarrage(f.state, f.config, aim)).toBe(true);
  });

  it('suppresses ordinary direct shots until the suppression boundary', () => {
    const f = setup(['cannon', 'harpoon']);
    f.state.devices.forEach(device => { device.suppressedUntilTick = 2; });
    fireCannons(f.state, f.config); expect(f.state.enemies[0]!.health).toBe(1000);
    f.state.tick = 2; fireCannons(f.state, f.config);
    expect(f.state.devices.every(device => device.lastShot?.tick === 2)).toBe(true);
  });

  it('adds strength/air/light up to 70% HP and caps the armored part at 75%, preserving armor overflow', () => {
    const f = setup(['harpoon'], [enemy(1, 160, 0, 'bat')]);
    Object.assign(f.config.ability!, { damageBonus: .3, airDamageBonus: .25, litDamageBonus: .15, armorDamageBonus: .25 });
    f.config.devices.definitions.harpoon.damage = 100;
    f.config.devices.harpoon.flyingDamageMultiplier = 1;
    f.state.litEnemyIds = [1]; f.state.enemies[0]!.armor = 100;
    castBarrage(f.state, f.config, aim);
    expect(f.state.enemies[0]!.armor).toBe(0);
    expect(f.state.enemies[0]!.health).toBeCloseTo(1000 - 170 * (1 - 100 / 175));
  });

  it('shares manual opening-shot owner keys and adds light guidance without multiplying barrage bonuses', () => {
    const f = setup(); f.config.devices.cannon.manualDamageBonus = .25;
    f.config.devices.definitions.cannon.damage = 100;
    f.config.progression = { litDeviceDamageBonus: .2 };
    Object.assign(f.config.ability!, { damageBonus: .3, litDamageBonus: .15 });
    f.state.litEnemyIds = [1];
    castBarrage(f.state, f.config, aim);
    expect(f.state.enemies[0]!.health).toBeCloseTo(810);
    castBarrage(f.state, f.config, aim);
    expect(f.state.enemies[0]!.health).toBeCloseTo(645);
    expect(f.state.devices[0]!.manualBonusTargets).toEqual([1]);
  });

  it('snapshots mortar radius/speed/strength and checks illumination at impact after launcher destruction', () => {
    const f = setup(['mortar']);
    Object.assign(f.config.ability!, { damageBonus: .3, litDamageBonus: .15, blastRadiusBonus: .2, projectileSpeedBonus: .25 });
    f.state.litEnemyIds = [];
    castBarrage(f.state, f.config, aim);
    const shot = f.state.mortarProjectiles[0]!;
    expect(shot.blastRadius).toBe(f.config.devices.mortar.blastRadius * 1.2);
    expect(shot.impactTick).toBe(Math.ceil(60 / (f.config.devices.mortar.projectileSpeed * 1.25) / f.config.stepSeconds - 1e-9));
    f.state.litEnemyIds = [1]; Object.assign(f.config.ability!, { damageBonus: 0, litDamageBonus: 0 });
    impact(f);
    expect(f.state.enemies[0]!.health).toBeCloseTo(1000 - shot.damage * 1.45);
  });

  it('loses light correction when the enemy leaves actual illumination before mortar impact', () => {
    const f = setup(['mortar']); Object.assign(f.config.ability!, { litDamageBonus: .15 });
    f.state.litEnemyIds = [1]; castBarrage(f.state, f.config, aim); f.state.litEnemyIds = [];
    impact(f);
    expect(f.state.enemies[0]!.health).toBe(1000 - f.config.devices.definitions.mortar.damage);
  });

  it('rejects water aim for mortar and excludes airborne/water victims at a shoreline explosion', () => {
    const f = setup(['mortar'], [enemy(1, 160), enemy(2, 181), enemy(3, 160, 0, 'bat')]);
    f.config.terrain = { shoreX: 180, landOnlyPlacement: true };
    expect(castBarrage(f.state, f.config, { x: 181, y: 0 })).toBe(false);
    expect(castBarrage(f.state, f.config, aim)).toBe(true);
    impact(f);
    expect(f.state.enemies.map(enemy => enemy.health)).toEqual([976, 1000, 1000]);
  });

  it('hits a shared boss once per direct weapon and once per explosion, and excludes sea zones for barrage mortar', () => {
    const f = setup(['cannon', 'mortar'], []);
    f.config.boss = { ...getBossRules(1), speed: 0 };
    f.config.terrain = { shoreX: 170, landOnlyPlacement: true };
    f.state.boss = { id: f.config.boss.id, health: 1000, stunnedUntilTick: 0, tentacles: [
      { id: -1001, x: 160, y: 0, attackCooldown: 0 }, { id: -1002, x: 165, y: 0, attackCooldown: 0 },
    ] };
    expect(castBarrage(f.state, f.config, { x: 160, y: 0, enemyId: -1001 })).toBe(true);
    expect(f.state.boss.health).toBe(1000 - f.config.devices.definitions.cannon.damage);
    impact(f);
    expect(f.state.boss.health).toBe(1000 - f.config.devices.definitions.cannon.damage - f.config.devices.definitions.mortar.damage);
    f.state.devices[1]!.health = 100;
    castBarrage(f.state, f.config, { x: 160, y: 0 });
    f.state.boss.tentacles.forEach(zone => { zone.x = 180; });
    const health = f.state.boss.health;
    impact(f); expect(f.state.boss.health).toBe(health);
  });
});
