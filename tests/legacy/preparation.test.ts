import { describe, expect, it } from 'vitest';
import type { SaveStore } from '../../src/contracts';
import { NIGHT_CONFIG } from '../../src/content/night';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { decodeSave, emptySave } from '../../src/application/saves';

class Store implements SaveStore {
  value: string;
  failWrite = false;
  constructor(resources = 100) { const save = emptySave(); save.profile.resources = resources;
    save.profile.legacyEquipment = true;
    save.profile.devices = [
      { id: 1, kind: 'cannon', health: NIGHT_CONFIG.devices.definitions.cannon.health, consumed: false, position: null },
      { id: 2, kind: 'barrier', health: NIGHT_CONFIG.devices.definitions.barrier.health, consumed: false, position: null },
      { id: 3, kind: 'generator', health: NIGHT_CONFIG.devices.definitions.generator.health, consumed: false, position: null },
      { id: 4, kind: 'light-trap', health: NIGHT_CONFIG.devices.definitions['light-trap'].health, consumed: false, position: null },
    ]; save.profile.nextDeviceId = 5;
    this.value = JSON.stringify(save); }
  read(): string { return this.value; }
  write(value: string): void { if (this.failWrite) throw new Error('write failed'); this.value = value; }
}
let sequence = 0;
const appFor = (store: Store) => new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `placement-${++sequence}`, seed: 42 }));

describe('persistent preparation', () => {
  it('selects a type without buying and saves placed owned instances across reloads', () => {
    const store = new Store(); const app = appFor(store); app.openPreparation();
    const count = app.view.preparation.inventory.length;
    app.selectDevice('cannon'); expect(app.view.preparation.placements).toEqual([]);
    app.placeDevice(100, 0); app.placeDevice(-100, 0);
    expect(app.view.preparation.placements).toHaveLength(1);
    expect(app.view.preparation.inventory).toHaveLength(count);
    expect(app.view.profile.resources).toBe(100);
    expect(appFor(store).view.preparation.placements).toEqual(app.view.preparation.placements);
  });
  it('buys extra instances explicitly and returns placed devices to reserve for free', () => {
    const store = new Store(); const app = appFor(store); app.openPreparation();
    app.purchaseDevice('cannon');
    expect(app.view.profile.resources).toBe(100 - NIGHT_CONFIG.devices.definitions.cannon.cost);
    app.selectDevice('cannon'); app.placeDevice(100, 0); app.placeDevice(-100, 0);
    expect(app.view.preparation.placements).toHaveLength(2);
    const first = app.view.preparation.placements[0]!;
    app.removeDevice(first.id);
    expect(app.view.preparation.inventory.find(d => d.id === first.id)?.position).toBeNull();
    app.clearPlacements();
    expect(appFor(store).view.preparation.placements).toEqual([]);
    expect(app.view.preparation.inventory.filter(d => d.kind === 'cannon')).toHaveLength(2);
  });
  it('starts at zero balance with owned devices and records zero placement cost', () => {
    const store = new Store(0); const app = appFor(store); app.openPreparation();
    app.selectDevice('cannon'); app.placeDevice(100, 0);
    expect(app.view.preparation).toMatchObject({ cost: 0, remaining: 0, canStart: true });
    app.start(); expect(app.view.screen).toBe('battle');
    expect(decodeSave(store.value).activeAttempt?.placementCost).toBe(0);
    expect(app.view.profile.resources).toBe(0);
  });
  it('rejects invalid placement without moving owned objects', () => {
    const app = appFor(new Store()); app.openPreparation(); app.selectDevice('barrier');
    const before = structuredClone(app.view.preparation.inventory);
    app.placeDevice(0, 0);
    expect(app.view.preparation.preview?.valid).toBe(false);
    expect(app.view.preparation.inventory).toEqual(before);
  });
  it('does not expose an unsaved placement and can retry saving it', () => {
    const store = new Store(); const app = appFor(store); app.openPreparation(); app.selectDevice('cannon');
    store.failWrite = true; const before = store.value; app.placeDevice(100, 0);
    expect(store.value).toBe(before); expect(app.view.error).toBeTruthy();
    store.failWrite = false; app.retrySave();
    expect(appFor(store).view.preparation.placements).toHaveLength(1);
  });
  it('keeps pre-night owned placement after interruption without adding a refund', () => {
    const store = new Store(); const app = appFor(store); app.openPreparation();
    app.selectDevice('cannon'); app.placeDevice(100, 0);
    const devices = structuredClone(app.view.preparation.inventory);
    app.start(); app.advance(200);
    const reload = appFor(store);
    expect(reload.view.interrupted).toBe(true);
    expect(reload.view.profile.resources).toBe(100);
    expect(reload.view.preparation.inventory).toEqual(devices);
    expect(appFor(store).view.profile).toEqual(reload.view.profile);
  });
});
