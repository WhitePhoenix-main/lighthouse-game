import { describe, expect, it } from 'vitest';
import type { NightConfig, SaveStore } from '../../src/contracts';
import { NIGHT_CONFIG } from '../../src/content/night';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { checkPlacement } from '../../src/application/placement';
import { decodeSave, emptySave } from '../../src/application/saves';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { grantFixtureDevices } from '../helpers/devices';

class Store implements SaveStore {
  value: string;
  fail = false;
  lostReply = false;
  constructor() { const save = emptySave(); save.profile.resources = 500; save.profile.legacyEquipment = true; grantFixtureDevices(save.profile); this.value = JSON.stringify(save); }
  read(): string { return this.value; }
  write(value: string): void {
    if (this.fail) throw new Error('storage unavailable');
    this.value = value;
    if (this.lostReply) throw new Error('reply lost');
  }
}
let sequence = 0;
const identity = () => ({ id: `defense-${++sequence}`, seed: 42 });
const tick = (app: LighthouseApplication) => app.advance(1000 / 30);
function rules(): NightConfig {
  const config = structuredClone(NIGHT_CONFIG);
  config.beam.damagePerSecond = 0;
  config.waves = [{ id: 'long', enemies: ['ghost', 'ghost'], spawnInterval: 100 }];
  return config;
}
function setup(store = new Store(), config = rules()) {
  const app = new LighthouseApplication(store, config, identity);
  app.openPreparation();
  app.selectDevice('generator'); app.placeDevice(-100, 0);
  app.selectDevice('light-trap'); app.placeDevice(150, 0);
  return { app, store };
}

describe('permanent defense devices and local saves', () => {
  it.each(['cannon', 'light-trap'] as const)('replays shield, flash and %s commands identically after a serialized snapshot', kind => {
    const config = structuredClone(NIGHT_CONFIG);
    const first = createBattle(config, 42, undefined, [
      { id: 1, kind: 'generator', x: -80, y: 0 }, { id: 2, kind, x: 90, y: 0 },
    ]);
    const second = JSON.parse(JSON.stringify(first)) as typeof first;
    for (let tick = 0; tick < 1500; tick++) {
      const commands = tick % 540 === 0 ? [{ type: 'flash' as const }]
        : tick === 150 ? [{ type: 'cannon-priority' as const, deviceId: 2, priority: 'strongest' as const }]
        : [{ type: 'aim' as const, angle: Math.sin(tick / 50) * Math.PI }];
      stepBattle(first, config, commands); stepBattle(second, config, commands);
    }
    expect(first).toEqual(second);
  });
  it('uses type slots separately from objects and rejects a third type', () => {
    const { app, store } = setup();
    app.purchaseDevice('generator'); app.purchaseDevice('light-trap');
    app.selectDevice('generator'); app.placeDevice(0, 100);
    app.selectDevice('light-trap'); app.placeDevice(0, -150);
    expect(app.view.preparation.placements).toHaveLength(4);
    const two = app.view.preparation.placements.slice(0, 2);
    expect(checkPlacement(app.view.config, two, 'cannon', 0, -100).reason).toContain('слоты');
    expect(checkPlacement(app.view.config, app.view.preparation.placements, 'generator', -200, 0).reason).toContain('Общий предел');
    const cost = app.view.config.devices.definitions.generator.cost + app.view.config.devices.definitions['light-trap'].cost;
    expect(app.view.preparation.cost).toBe(0);
    app.start();
    expect(app.view.battle?.shield.maximum).toBe(2 * app.view.config.shield.capacityPerGenerator);
    expect(decodeSave(store.value)).toMatchObject({ version: 6, profile: { resources: 500 - cost }, activeAttempt: { placementCost: 0 } });
  });

  it('starts only after saving the free attempt and retains it when a start write fails', () => {
    const { app, store } = setup();
    const cost = app.view.preparation.cost;
    expect(decodeSave(store.value).profile.resources).toBe(500);
    store.fail = true; app.start();
    expect(app.view.battle).toBeNull();
    expect(app.view.error).toContain('storage unavailable');
    store.fail = false; store.lostReply = true; app.retrySave();
    expect(app.view.screen).toBe('battle');
    expect(decodeSave(store.value)).toMatchObject({ version: 5, profile: { resources: 500 - cost }, activeAttempt: { placementCost: cost } });
    app.start(); app.retrySave();
    expect(decodeSave(store.value).profile.resources).toBe(500 - cost);
  });

  it('restores the starting trap charge on interruption without a refund or temporary kills', () => {
    const config = rules();
    config.devices.trap.triggerRadius = 1000; config.devices.trap.blastRadius = 1000; config.devices.trap.damage = 1000;
    const { app, store } = setup(new Store(), config);
    app.start(); tick(app);
    expect(app.view.battle?.devices.find(d => d.kind === 'light-trap')?.consumed).toBe(true);
    expect(app.view.battle?.earnedResources).toBeGreaterThan(0);
    const reload = new LighthouseApplication(store, config, identity);
    expect(reload.view.interrupted).toBe(true);
    expect(reload.view.profile.resources).toBe(500);
    expect(reload.view.profile.encountered).toEqual([]);
    expect(reload.view.profile.devices.find(device => device.kind === 'light-trap')?.consumed).toBe(false);
    expect(decodeSave(store.value).lastSettled?.reward).toBe(0);
    expect(new LighthouseApplication(store, config, identity).view.profile.resources).toBe(500);
  });

  it('keeps shield, flash cooldown and consumed devices through pause without charging or refunding', () => {
    const { app, store } = setup(); app.start();
    app.command({ type: 'flash' }); tick(app);
    const before = structuredClone(app.view.battle);
    const raw = store.value;
    app.pause(); app.command({ type: 'flash' }); app.advance(60_000);
    expect(app.view.battle).toEqual(before); expect(store.value).toBe(raw);
    app.resume(); app.advance(60_000);
    expect(app.view.battle).toEqual(before);
    tick(app); expect(app.view.battle?.tick).toBe(before!.tick + 1);
    expect(app.view.battle!.flash.cooldownRemaining).toBeLessThan(before!.flash.cooldownRemaining);
  });

  it('settles flash victory once and retains devices without saving transient cooldowns', () => {
    const config = rules(); config.waves = [{ id: 'one', enemies: ['ghost'], spawnInterval: 1 }];
    config.flash.radius = 1000; config.flash.damage = 1000;
    const { app, store } = setup(new Store(), config); const cost = app.view.preparation.cost;
    app.start(); store.fail = true;
    app.command({ type: 'flash' }); app.command({ type: 'flash' }); tick(app);
    expect(app.view.result).toMatchObject({ outcome: 'victory', saved: false });
    expect(app.view.battle?.events.filter(e => e.type === 'flash-used')).toHaveLength(1);
    store.fail = false; app.retrySave(); app.retrySave();
    const saved = decodeSave(store.value);
    expect(saved.profile.resources).toBe(500 - cost + config.enemies.ghost.reward);
    expect(saved.profile.completedNights).toBe(1); expect(saved.activeAttempt).toBeNull();
    expect(store.value).not.toContain('cooldownRemaining'); expect(store.value).toContain('consumed');
    app.openPreparation(); expect(app.view.preparation.placements).toHaveLength(2);
  });

  it('ordinary defeat keeps earned trap rewards and does not refund spent devices', () => {
    const config = rules(); config.lighthouseHealth = 1; config.spawnRadius = 42;
    config.shield.capacityPerGenerator = 1; config.shield.regenerationDelay = 100;
    config.enemies.ghost.speed = 1000;
    config.devices.trap.triggerRadius = 1000; config.devices.trap.blastRadius = 1000; config.devices.trap.damage = 1000;
    config.waves = [{ id: 'two', enemies: ['ghost', 'ghost'], spawnInterval: 1 }];
    const { app, store } = setup(new Store(), config); const cost = app.view.preparation.cost; app.start();
    for (let i = 0; i < 500 && app.view.screen === 'battle'; i++) tick(app);
    expect(app.view.result).toMatchObject({ outcome: 'defeat', saved: true, kills: 1 });
    expect(decodeSave(store.value).profile.resources).toBe(500 - cost + config.enemies.ghost.reward);
    expect(new LighthouseApplication(store, config, identity).view.profile.resources).toBe(500 - cost + config.enemies.ghost.reward);
    expect(decodeSave(store.value).profile.devices.find(device => device.kind === 'light-trap')?.consumed).toBe(true);
  });
});
