import { describe, expect, it } from 'vitest';
import type { BattleState, DeviceDeployment, DevicePlacement, EnemyState } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { getBossRules } from '../src/content/boss';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { updateRepairLamps } from '../src/simulation/repair';
import { incomingDeviceDamage } from '../src/simulation/bell';
import { attackTentacles } from '../src/simulation/boss';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { grantFixtureDevices } from './helpers/devices';

const lamp: DevicePlacement = { id: 8, kind: 'repair-lamp', x: 150, y: 0 };
const cannon: DevicePlacement = { id: 2, kind: 'cannon', x: 200, y: 0 };
const ghost = (x = 500, health = 100): EnemyState => ({ id: 1, kind: 'ghost', x, y: 0, health, armor: 0, waveIndex: 0, attackCooldown: 0 });
function setup(placements: readonly (DevicePlacement | DeviceDeployment)[] = [lamp, cannon]) {
  const config = structuredClone(NIGHT_CONFIG);
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'repair-test', enemies: ['ghost'], spawnInterval: 1 }];
  const state = createBattle(config, 42, undefined, placements);
  state.enemies = [ghost()]; state.waves[0]!.spawned = 1;
  return { state, config, source: state.devices[0]!, target: state.devices[1]! };
}
const repairs = (state: BattleState) => state.events.filter(event => event.type === 'device-repaired');

describe('repair lamp finite restoration budget', () => {
  it('caps repairs at each body starting health, including old damage, and emits the actual amount', () => {
    const { state, config, source, target } = setup([lamp, { ...cannon, health: 35, consumed: false }]);
    expect(target.startHealth).toBe(35);
    updateRepairLamps(state, config);
    expect(source.repairCharges).toBe(3);
    target.health = 31;
    updateRepairLamps(state, config);
    expect(target.health).toBe(35);
    expect(source.repairCharges).toBe(2);
    expect(repairs(state)).toEqual([expect.objectContaining({ deviceId: 2, sourceId: 8, amount: 4, emergency: false, x: 200, y: 0 })]);
    source.attackCooldown = 0;
    updateRepairLamps(state, config);
    expect(target.health).toBe(35);
    expect(source.repairCharges).toBe(2);
    expect(source.attackCooldown).toBe(0);
  });

  it('does not spend charges or start reload while idle or outside center-distance range', () => {
    const { state, config, source, target } = setup();
    for (let step = 0; step < 200; step++) updateRepairLamps(state, config);
    expect(source.repairCharges).toBe(3); expect(source.attackCooldown).toBe(0);
    target.health = 30; target.x = lamp.x + 140.01;
    updateRepairLamps(state, config);
    expect(source.repairCharges).toBe(3); expect(source.attackCooldown).toBe(0);
    target.x = lamp.x + 140;
    updateRepairLamps(state, config);
    expect(target.health).toBe(40); expect(source.repairCharges).toBe(2);
    expect(source.attackCooldown).toBe(6);
  });

  it('decrements normal reload exactly once per battle step, with exactly three repairs', () => {
    const { state, config, source, target } = setup();
    target.health = 1;
    stepBattle(state, config, []);
    expect(source.attackCooldown).toBe(6);
    stepBattle(state, config, []);
    expect(source.attackCooldown).toBeCloseTo(6 - config.stepSeconds);
    for (let i = 0; i < 600; i++) { state.enemies[0]!.x = 500; stepBattle(state, config, []); }
    expect(repairs(state)).toHaveLength(3);
    expect(source.repairCharges).toBe(0);
    expect(target.health).toBe(31);
  });

  it('sorts by missing ratio relative to starting health, then stable target id', () => {
    const { state, config } = setup([lamp, { ...cannon, id: 4, health: 40, consumed: false }, { ...cannon, id: 2 }, { ...cannon, id: 1 }]);
    state.devices[1]!.health = 20;
    state.devices[2]!.health = 35;
    state.devices[3]!.health = 40;
    updateRepairLamps(state, config);
    expect(repairs(state)[0]!.deviceId).toBe(2);
    state.devices[0]!.attackCooldown = 0;
    updateRepairLamps(state, config);
    expect(repairs(state)[1]!.deviceId).toBe(4);
  });

  it('uses stable source order and independent finite budgets for two lamps', () => {
    const { state, config } = setup([{ ...lamp, id: 9 }, { ...lamp, id: 3 }, { ...cannon, kind: 'barrier' }]);
    const target = state.devices[2]!; target.health = 1;
    for (let n = 0; n < 20; n++) {
      state.devices[0]!.attackCooldown = 0; state.devices[1]!.attackCooldown = 0;
      updateRepairLamps(state, config);
    }
    expect(repairs(state).map(event => event.sourceId)).toEqual([3, 9, 3, 9, 3, 9]);
    expect(state.devices.slice(0, 2).map(source => source.repairCharges)).toEqual([0, 0]);
    expect(target.health).toBe(61);
  });

  it('never targets self, another lamp, destroyed or consumed bodies, or recharges a trap', () => {
    const { state, config, source } = setup([lamp, { ...lamp, id: 9 }, cannon, { ...cannon, kind: 'light-trap', id: 4 }]);
    source.health = 5; state.devices[1]!.health = 1;
    state.devices[2]!.health = 0;
    state.devices[3]!.health = 1; state.devices[3]!.consumed = true;
    updateRepairLamps(state, config);
    expect(state.devices.map(target => target.health)).toEqual([5, 1, 0, 1]);
    expect(state.devices[3]!.consumed).toBe(true);
    expect(repairs(state)).toHaveLength(0);
    expect(source.repairCharges).toBe(3);
  });

  it.each(['destroyed', 'consumed', 'lighthouse-destroyed'] as const)('does not repair from an unavailable source: %s', reason => {
    const { state, config, source, target } = setup(); target.health = 1;
    if (reason === 'destroyed') source.health = 0;
    if (reason === 'consumed') source.consumed = true;
    if (reason === 'lighthouse-destroyed') state.lighthouseHealth = 0;
    updateRepairLamps(state, config);
    expect(target.health).toBe(1); expect(repairs(state)).toHaveLength(0);
  });
});

describe('emergency repairs and incoming damage', () => {
  it('uses one shared charge to double repair at the threshold during reload, only once per source', () => {
    const { state, config, source, target } = setup();
    config.devices.repairLamp.emergencyEnabled = true;
    target.health = config.devices.definitions.cannon.health * 0.25;
    source.attackCooldown = 5;
    updateRepairLamps(state, config);
    expect(target.health).toBe(37.5); expect(source.attackCooldown).toBe(6);
    expect(source.repairCharges).toBe(2); expect(source.emergencyRepairUsed).toBe(true);
    expect(repairs(state)[0]).toMatchObject({ emergency: true, amount: 20 });
    target.health = 1;
    updateRepairLamps(state, config);
    expect(target.health).toBe(1); expect(source.repairCharges).toBe(2);
    source.attackCooldown = 0;
    updateRepairLamps(state, config);
    expect(target.health).toBe(11); expect(repairs(state)[1]!.emergency).toBe(false);
  });

  it('still requires a charge and in-range eligible missing health for an emergency', () => {
    const { state, config, source, target } = setup(); config.devices.repairLamp.emergencyEnabled = true;
    source.attackCooldown = 5; target.health = 1; source.repairCharges = 0;
    updateRepairLamps(state, config); expect(target.health).toBe(1);
    source.repairCharges = 1; target.x = 500;
    updateRepairLamps(state, config); expect(target.health).toBe(1);
    target.x = 200; target.health = target.startHealth!;
    updateRepairLamps(state, config); expect(source.repairCharges).toBe(1);
    expect(source.emergencyRepairUsed).toBe(false);
  });

  it('bases the critical threshold on max health while respecting an old-damage ceiling', () => {
    const { state, config, source, target } = setup([lamp, { ...cannon, health: 20, consumed: false }]);
    config.devices.repairLamp.emergencyEnabled = true;
    source.attackCooldown = 5; target.health = 17.5;
    updateRepairLamps(state, config);
    expect(target.health).toBe(20);
    expect(repairs(state)[0]).toMatchObject({ emergency: true, amount: 2.5 });
  });

  it('repairs after nonlethal enemy hits but cannot revive a lethally hit device', () => {
    for (const damage of [5, 70]) {
      const { state, config, target } = setup();
      config.devices.repairLamp.emergencyEnabled = true;
      config.enemies.ghost.attackDamage = damage;
      state.enemies = [ghost(200)];
      stepBattle(state, config, []);
      expect(target.health).toBe(damage === 5 ? 70 : 0);
      expect(repairs(state)).toHaveLength(damage === 5 ? 1 : 0);
      if (damage === 5) expect(state.events.findIndex(event => event.type === 'device-hit')).toBeLessThan(state.events.findIndex(event => event.type === 'device-repaired'));
    }
  });

  it('repairs after tentacle attacks and cannot repair when that same step destroys its source or lighthouse', () => {
    const { state, config, target } = setup();
    config.boss = { ...getBossRules(1), attackDamage: 5 };
    state.boss = { id: 'abyss-warden', health: 500, stunnedUntilTick: 0, tentacles: [{ id: -1, x: 200, y: 0, attackCooldown: 0 }] };
    stepBattle(state, config, []);
    expect(target.health).toBe(70);
    expect(repairs(state)).toHaveLength(1);
    for (const hit of ['source', 'lighthouse'] as const) {
      const fixture = setup(); fixture.target.health = 1;
      fixture.config.enemies.ghost.attackDamage = 1000;
      fixture.state.enemies = [ghost(hit === 'source' ? 150 : fixture.config.lighthouseRadius)];
      stepBattle(fixture.state, fixture.config, []);
      expect(repairs(fixture.state)).toHaveLength(0);
    }
  });

  it('applies lamp guard only to the lamp body for enemy and tentacle hits', () => {
    const { state, config, source, target } = setup();
    config.devices.repairLamp.incomingDamageMultiplier = 0.8;
    config.devices.bell.incomingDamageMultiplier = 0.6;
    expect(incomingDeviceDamage(source, config, 10)).toBe(8);
    expect(incomingDeviceDamage(target, config, 10)).toBe(10);
    expect(incomingDeviceDamage({ kind: 'bell' }, config, 10)).toBe(6);
    config.enemies.ghost.attackDamage = 10; state.enemies = [ghost(150)];
    stepBattle(state, config, []); expect(source.health).toBe(52);
    config.boss = { ...getBossRules(1), attackDamage: 10 };
    state.boss = { id: 'abyss-warden', health: 500, stunnedUntilTick: 0, tentacles: [{ id: -1, x: 150, y: 0, attackCooldown: 0 }] };
    attackTentacles(state, config, new Map([[-1, source]]));
    expect(source.health).toBe(44);
  });
});

describe('repair lifetime and shield isolation', () => {
  it('repairs a generator body without filling the field, healing the lighthouse, or resetting recovery delay', () => {
    const { state, config, target } = setup([lamp, { ...cannon, kind: 'generator', x: 90 }]);
    target.health = 20; state.shield.current = 0; state.shield.recoveryRemaining = 2;
    state.lighthouseHealth = 1;
    updateRepairLamps(state, config);
    expect(target.health).toBe(30);
    expect(state.shield).toEqual({ current: 0, maximum: config.shield.capacityPerGenerator, recoveryRemaining: 2 });
    expect(state.lighthouseHealth).toBe(1);
  });

  it('retains damage-induced shield recovery delay after a protected body is repaired', () => {
    const { state, config, target } = setup([lamp, { ...cannon, kind: 'generator', x: 90 }]);
    state.shield.current = 0; state.shield.recoveryRemaining = 1;
    config.enemies.ghost.attackDamage = 5; state.enemies = [ghost(90)];
    stepBattle(state, config, []);
    expect(target.health).toBe(60); expect(state.shield.current).toBe(0);
    expect(state.shield.recoveryRemaining).toBe(config.shield.regenerationDelay);
  });

  it('reproduces charges, targets and events with the same seed and commands, and resets on a new night', () => {
    const first = setup(); const second = setup();
    for (const fixture of [first, second]) {
      fixture.config.devices.repairLamp.emergencyEnabled = true;
      fixture.target.health = 1;
      for (let tick = 0; tick < 200; tick++) stepBattle(fixture.state, fixture.config, [{ type: 'aim', angle: 0.4 }]);
    }
    expect(first.state).toEqual(second.state);
    const fresh = createBattle(first.config, 42, undefined, [lamp, { ...cannon, health: first.target.health, consumed: false }]);
    expect(fresh.devices[0]).toMatchObject({ repairCharges: 3, emergencyRepairUsed: false, attackCooldown: 0 });
    expect(fresh.devices[1]!.startHealth).toBe(first.target.health);
  });

  it('freezes repair cooldown and charges during application pause and discards paused elapsed time', () => {
    const save = emptySave();
    save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide', 'abyss-warden'];
    save.profile.bossLevel = 2;
    save.profile.purchasedUpgrades = ['unlock-cannon', 'unlock-barrier', 'unlock-generator', 'unlock-repair-lamp'];
    save.profile.devices = [lamp, cannon].map(device => ({ ...device, position: { x: device.x, y: device.y }, health: device.kind === 'cannon' ? 70 : 60, consumed: false }));
    save.profile.nextDeviceId = 9;
    grantFixtureDevices(save.profile);
    let raw = JSON.stringify(save);
    const { config } = setup();
    const app = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } }, config, () => ({ id: 'repair-pause', seed: 42 }));
    app.openPreparation(); app.start();
    expect(app.view.screen).toBe('battle');
    const state = app.view.battle!;
    state.devices[1]!.health = 1;
    app.advance(1000 / 30);
    const before = structuredClone(state);
    app.pause(); app.advance(60000);
    expect(state).toEqual(before);
    app.resume(); app.advance(1000 / 30);
    expect(state.tick).toBe(before.tick + 1);
    expect(state.devices[0]!.attackCooldown).toBeCloseTo(before.devices[0]!.attackCooldown - config.stepSeconds);
    expect(state.devices[0]!.repairCharges).toBe(before.devices[0]!.repairCharges);
  });
});
