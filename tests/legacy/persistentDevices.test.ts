import { describe, expect, it } from 'vitest';
import type { DeviceDeployment, DeviceKind, OwnedDevice, SaveData, SaveStore } from '../../src/contracts';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { DEVICE_RULES } from '../../src/content/devices';
import { NIGHT_CONFIG } from '../../src/content/night';
import { DEVICE_KINDS, LEGACY_DEVICE_KINDS, deviceDeployments, rechargeCost, repairCost } from '../../src/progression/devices';

class MemoryStore implements SaveStore {
  value: string | null = null;
  failWrite = false;
  ambiguous = false;
  unreadable = false;
  read(): string | null { if (this.unreadable) throw new Error('read unavailable'); return this.value; }
  write(value: string): void {
    if (this.failWrite) throw new Error('write failed');
    this.value = value;
    if (this.ambiguous) { this.unreadable = true; throw new Error('uncertain write'); }
  }
}
function owned(kind: DeviceKind, id = 1): OwnedDevice {
  return { id, kind, health: DEVICE_RULES.definitions[kind].health, consumed: false, position: null };
}
function fixture(legacy = true): { repo: SaveRepository; store: MemoryStore } {
  const save = emptySave(); save.profile.resources = 1000;
  save.profile.legacyEquipment = legacy;
  if (legacy) { save.profile.devices = LEGACY_DEVICE_KINDS.map((kind, i) => owned(kind, i + 1)); save.profile.nextDeviceId = 5; }
  const store = new MemoryStore(); store.value = JSON.stringify(save);
  const repo = new SaveRepository(store); repo.load(); return { repo, store };
}
function legacySave(version: number, legacyEquipment = false): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(emptySave()));
  next.version = version; delete next.profile.devices; delete next.profile.nextDeviceId;
  next.profile.resources = 431;
  next.profile.completedNights = 1;
  next.profile.encountered = ['ghost'];
  next.profile.wonNightIds = ['first-light'];
  next.profile.legacyEquipment = legacyEquipment;
  if (version < 4) for (const key of ['bossMaterials', 'bossLevel', 'unlockedLenses', 'lensUpgrades', 'selectedLensId']) delete next.profile[key];
  if (version < 3) { delete next.profile.wonNightIds; delete next.profile.legacyEquipment; }
  if (version === 1) delete next.profile.purchasedUpgrades;
  return next;
}
function deploy(repo: SaveRepository): DeviceDeployment[] {
  repo.savePlacements([{ id: 1, kind: 'cannon', x: -100, y: 0 }, { id: 4, kind: 'light-trap', x: -180, y: 0 }], NIGHT_CONFIG);
  return deviceDeployments(repo.current.profile);
}
function begin(repo: SaveRepository, id = 'night'): void { repo.begin({ id, seed: 42, placementCost: 0 }); }

describe('persistent devices migrations', () => {
  it.each([1, 2, 3, 4])('migrates v%i, preserves profile and refunds a legacy rental once', version => {
    const old = legacySave(version, true);
    old.activeAttempt = { id: 'old', seed: 7, placementCost: 64, ...(version >= 3 ? { nightId: 'first-light' } : {}) };
    old.lastSettled = { id: 'older', outcome: 'defeat', reward: 13 };
    const store = new MemoryStore(); store.value = JSON.stringify(old);
    const repo = new SaveRepository(store); repo.load();
    expect(repo.current.version).toBe(6);
    expect(repo.current.profile.resources).toBe(431);
    expect(repo.current.profile.completedNights).toBe(1);
    expect(repo.current.profile.encountered).toEqual(['ghost']);
    expect(repo.current.profile.devices).toEqual(LEGACY_DEVICE_KINDS.map((kind, i) => owned(kind, i + 1)));
    expect(repo.current.profile.nextDeviceId).toBe(5);
    expect(repo.current.activeAttempt).toMatchObject({ id: 'old', placementCost: 64, legacyRental: true });
    expect(repo.current.lastSettled).toEqual(old.lastSettled);
    repo.load(); expect(repo.current.profile.devices).toHaveLength(4);
    repo.settle('old', 'interrupted', 999, ['turtle']);
    repo.settle('old', 'interrupted', 999, ['turtle']);
    expect(repo.current.profile.resources).toBe(495);
    expect(repo.current.profile.encountered).toEqual(['ghost']);
    repo.load(); expect(repo.current.profile.devices).toHaveLength(4);
  });
  it('grants exactly the opened types in v3/v4, and preserves lenses/materials and damaged-free baseline', () => {
    for (const version of [3, 4]) {
      const old = legacySave(version);
      const profile = old.profile as Record<string, unknown>;
      profile.purchasedUpgrades = ['unlock-cannon'];
      if (version === 4) { profile.bossMaterials = 9; profile.unlockedLenses = ['basic', 'expanded']; profile.selectedLensId = 'expanded'; }
      const save = decodeSave(JSON.stringify(old));
      expect(save.profile.devices).toEqual([owned('cannon')]);
      expect(save.profile.nextDeviceId).toBe(2);
      expect(save.profile.purchasedUpgrades).toEqual(['unlock-cannon']);
      if (version === 4) { expect(save.profile.bossMaterials).toBe(9); expect(save.profile.selectedLensId).toBe('expanded'); }
    }
  });
  it.each([1, 2, 3, 4])('rejects injected v5 profile and attempt fields in v%i', version => {
    for (const field of ['devices', 'nextDeviceId', 'deviceSnapshot', 'legacyRental']) {
      const old = legacySave(version);
      if (field === 'devices' || field === 'nextDeviceId') (old.profile as Record<string, unknown>)[field] = field === 'devices' ? [] : 1;
      else old.activeAttempt = { id: 'x', seed: 1, placementCost: 0, ...(version >= 3 ? { nightId: 'first-light' } : {}), [field]: field === 'deviceSnapshot' ? [] : true };
      expect(() => decodeSave(JSON.stringify(old))).toThrow(/v5/);
    }
  });
  it('does not report migration success on a failed write and can retry safely', () => {
    const store = new MemoryStore(); store.value = JSON.stringify(legacySave(4, true)); store.failWrite = true;
    const repo = new SaveRepository(store);
    expect(() => repo.load()).toThrow('write failed');
    store.failWrite = false; repo.load();
    expect(repo.current.profile.devices).toHaveLength(4);
  });
  it('recovers migration after storage commits but its acknowledgement and read fail', () => {
    const store = new MemoryStore(); store.value = JSON.stringify(legacySave(4, true)); store.ambiguous = true;
    const repo = new SaveRepository(store);
    expect(() => repo.load()).toThrow('read unavailable');
    store.ambiguous = false; store.unreadable = false; repo.load(); repo.load();
    expect(repo.current.profile.devices).toHaveLength(4);
    expect(repo.current.profile.resources).toBe(431);
  });
});

describe('device ownership operations', () => {
  it('atomically grants the first instance with the unlock, no extra grant on repeated purchase or reload', () => {
    const { repo, store } = fixture(false);
    const save = repo.current; save.profile.wonNightIds = ['first-light']; save.profile.completedNights = 1;
    store.value = JSON.stringify(save); repo.load();
    repo.purchase('unlock-cannon'); repo.purchase('unlock-cannon'); repo.load(); repo.purchase('unlock-cannon');
    expect(repo.current.profile.resources).toBe(965);
    expect(repo.current.profile.devices).toEqual([owned('cannon')]);
    expect(repo.current.profile.nextDeviceId).toBe(2);
    repo.purchaseDevice('cannon', 2); repo.purchaseDevice('cannon', 2);
    expect(repo.current.profile.devices).toEqual([owned('cannon'), owned('cannon', 2)]);
    expect(repo.current.profile.resources).toBe(945);
  });
  it('rejects locked types, forged ids, insufficient resources and operations during battle', () => {
    const { repo } = fixture(false);
    expect(() => repo.purchaseDevice('cannon', 1)).toThrow(/не открыт/);
    const { repo: unlocked, store } = fixture();
    expect(() => unlocked.purchaseDevice('cannon', 7)).toThrow(/идентификатор/);
    expect(() => unlocked.purchaseDevice('barrier', 1)).toThrow(/занят/);
    const save = unlocked.current; save.profile.resources = 0; store.value = JSON.stringify(save); unlocked.load();
    expect(() => unlocked.purchaseDevice('cannon', 5)).toThrow(/ресурсов/);
    begin(unlocked);
    expect(() => unlocked.purchaseDevice('cannon', 5)).toThrow(/между/);
    expect(() => unlocked.repairDevice(1)).toThrow(/между/);
    expect(() => unlocked.rechargeDevice(4)).toThrow(/между/);
    expect(() => unlocked.savePlacements([], NIGHT_CONFIG)).toThrow(/между/);
  });
  it('retains owned objects in reserve, allows destroyed placement and rejects foreign placements', () => {
    const { repo, store } = fixture();
    const save = repo.current; save.profile.devices[0]!.health = 0; store.value = JSON.stringify(save); repo.load();
    repo.savePlacements([{ id: 1, kind: 'cannon', x: -100, y: 0 }], NIGHT_CONFIG);
    repo.load(); expect(repo.current.profile.devices[0]).toMatchObject({ health: 0, position: { x: -100, y: 0 } });
    expect(() => repo.savePlacements([{ id: 999, kind: 'cannon', x: -100, y: 0 }], NIGHT_CONFIG)).toThrow(/чужого/);
    expect(() => repo.savePlacements([{ id: 1, kind: 'barrier', x: -100, y: 0 }], NIGHT_CONFIG)).toThrow(/чужого/);
    expect(() => repo.savePlacements([{ id: 1, kind: 'cannon', x: 0, y: 0 }], NIGHT_CONFIG)).toThrow(/маяком/);
    repo.savePlacements([], NIGHT_CONFIG); repo.load();
    expect(repo.current.profile.devices).toHaveLength(4);
    expect(repo.current.profile.devices.every(device => device.position === null)).toBe(true);
  });
  it('repairs damage for at most 25%, and keeps the trap charge independent', () => {
    const { repo, store } = fixture(); const save = repo.current;
    save.profile.devices[0]!.health = 35; save.profile.devices[3]!.health = 0; save.profile.devices[3]!.consumed = true;
    store.value = JSON.stringify(save); repo.load();
    expect(repairCost(repo.current.profile.devices[0]!)).toBe(3);
    repo.repairDevice(1); repo.repairDevice(1);
    repo.repairDevice(4); repo.repairDevice(4);
    expect(repo.current.profile.resources).toBe(993);
    expect(repo.current.profile.devices[3]).toMatchObject({ health: 30, consumed: true });
    repo.rechargeDevice(4); repo.rechargeDevice(4);
    expect(repo.current.profile.resources).toBe(991);
    expect(repo.current.profile.devices[3]).toMatchObject({ health: 30, consumed: false });
    expect(() => repo.repairDevice(777)).toThrow();
    expect(() => repo.rechargeDevice(1)).toThrow();
    for (const kind of DEVICE_KINDS) for (const fraction of [0, 0.01, 0.5, 0.99, 1]) {
      const device = owned(kind); device.health *= fraction;
      expect(repairCost(device)).toBeLessThanOrEqual(DEVICE_RULES.definitions[kind].cost * 0.25);
      expect(Number.isInteger(repairCost(device))).toBe(true);
    }
  });
  it('can recharge a destroyed consumed trap without repairing it', () => {
    const { repo, store } = fixture(); const save = repo.current;
    save.profile.devices[3]!.health = 0; save.profile.devices[3]!.consumed = true;
    expect(rechargeCost(save.profile.devices[3]!)).toBe(2);
    store.value = JSON.stringify(save); repo.load(); repo.rechargeDevice(4);
    expect(repo.current.profile.devices[3]).toMatchObject({ health: 0, consumed: false });
  });
  it('does not repair or recharge when resources are insufficient', () => {
    const { repo, store } = fixture(); const save = repo.current;
    save.profile.resources = 0; save.profile.devices[3]!.health = 0; save.profile.devices[3]!.consumed = true;
    store.value = JSON.stringify(save); repo.load();
    expect(() => repo.repairDevice(4)).toThrow(/ресурсов/);
    expect(() => repo.rechargeDevice(4)).toThrow(/ресурсов/);
    expect(repo.current).toEqual(save);
  });
  it('reconciles an uncertain unlock without issuing a second free device or charging twice', () => {
    const { repo, store } = fixture(false); const save = repo.current;
    save.profile.wonNightIds = ['first-light']; store.value = JSON.stringify(save); repo.load();
    store.ambiguous = true; expect(() => repo.purchase('unlock-cannon')).toThrow('read unavailable');
    store.ambiguous = false; store.unreadable = false;
    repo.purchase('unlock-cannon'); repo.load(); repo.purchase('unlock-cannon');
    expect(repo.current.profile.resources).toBe(965);
    expect(repo.current.profile.devices).toEqual([owned('cannon')]);
  });
});

describe('persistent outcome transactions', () => {
  it.each(['victory', 'defeat'] as const)('preserves damage, consumed traps and reserve on %s exactly once', outcome => {
    const { repo } = fixture(); const snapshot = deploy(repo); begin(repo);
    expect(repo.current.activeAttempt!.deviceSnapshot).toEqual(snapshot);
    const result = snapshot.map(device => ({ ...device, health: 0, consumed: device.kind === 'light-trap' }));
    expect(() => repo.settle('night', outcome, 13, ['ghost'])).toThrow(/итог/);
    repo.settle('night', outcome, 13, ['ghost'], result);
    repo.settle('night', outcome, 13, ['ghost'], result); repo.load();
    expect(repo.current.profile.resources).toBe(1013);
    expect(repo.current.profile.devices[0]).toMatchObject({ health: 0, position: { x: -100, y: 0 } });
    expect(repo.current.profile.devices[3]).toMatchObject({ health: 0, consumed: true });
    expect(repo.current.profile.devices[1]).toEqual(owned('barrier', 2));
    expect(repo.current.profile.completedNights).toBe(outcome === 'victory' ? 1 : 0);
  });
  it('interruption preserves preparation purchases, repairs and positions, discards combat changes and rewards', () => {
    const { repo } = fixture(); repo.purchaseDevice('cannon', 5); const snapshot = deploy(repo);
    const before = repo.current.profile; begin(repo); repo.load();
    repo.settle('night', 'interrupted', 999, ['bat'], snapshot.map(device => ({ ...device, health: 0 })));
    repo.settle('night', 'interrupted', 999, ['bat']);
    expect(repo.current.profile).toEqual(before);
    expect(repo.current.lastSettled!.reward).toBe(0);
  });
  it('rejects a paid new attempt, forged snapshot, mutated result and missing result objects', () => {
    const { repo } = fixture(); const snapshot = deploy(repo);
    expect(() => repo.begin({ id: 'paid', seed: 1, placementCost: 20 })).toThrow();
    expect(() => repo.begin({ id: 'fake', seed: 1, placementCost: 0, deviceSnapshot: [] })).toThrow(/Снимок/);
    begin(repo);
    const mutate = (fn: (devices: DeviceDeployment[]) => void): void => {
      const result = structuredClone(snapshot); fn(result);
      expect(() => repo.settle('night', 'defeat', 0, [], result)).toThrow();
    };
    mutate(result => { result.pop(); });
    mutate(result => { result[0]!.id = 99; });
    mutate(result => { result[0]!.x++; });
    mutate(result => { result[0]!.health++; });
    mutate(result => { result[0]!.consumed = true; });
    mutate(result => { result.push(result[0]!); });
    expect(repo.current.activeAttempt).not.toBeNull();
  });
  it.each(['purchase', 'repair', 'recharge', 'begin', 'settle', 'placements'] as const)('reconciles an uncertain %s write and repeats safely', operation => {
    const { repo, store } = fixture(); const save = repo.current;
    save.profile.devices[0]!.health = 10; save.profile.devices[3]!.consumed = true;
    store.value = JSON.stringify(save); repo.load();
    if (operation === 'settle') begin(repo);
    const perform = (): void => {
      if (operation === 'purchase') repo.purchaseDevice('cannon', 5);
      else if (operation === 'repair') repo.repairDevice(1);
      else if (operation === 'recharge') repo.rechargeDevice(4);
      else if (operation === 'begin') begin(repo);
      else if (operation === 'settle') repo.settle('night', 'defeat', 7, ['ghost']);
      else repo.savePlacements([{ id: 1, kind: 'cannon', x: -100, y: 0 }], NIGHT_CONFIG);
    };
    store.ambiguous = true; expect(perform).toThrow('read unavailable');
    store.ambiguous = false; store.unreadable = false;
    const persisted = store.value;
    perform(); expect(store.value).toBe(persisted);
    repo.load(); expect(repo.current).toEqual(decodeSave(persisted!));
  });
  it('keeps the previous state on failed purchase and retries with the same id', () => {
    const { repo, store } = fixture(); const before = repo.current;
    store.failWrite = true; expect(() => repo.purchaseDevice('cannon', 5)).toThrow('write failed');
    expect(repo.current).toEqual(before);
    store.failWrite = false; repo.purchaseDevice('cannon', 5);
    expect(repo.current.profile.resources).toBe(980);
    expect(repo.current.profile.devices).toHaveLength(5);
  });
  it('retains damage in the atomic result only after storage accepts settlement', () => {
    const { repo, store } = fixture(); const snapshot = deploy(repo); begin(repo);
    const result = snapshot.map(device => ({ ...device, health: 0 }));
    store.failWrite = true;
    expect(() => repo.settle('night', 'defeat', 5, ['ghost'], result)).toThrow('write failed');
    expect(repo.current.profile.devices[0]!.health).toBe(70);
    expect(repo.current.activeAttempt).not.toBeNull();
    store.failWrite = false; repo.settle('night', 'defeat', 5, ['ghost'], result); repo.load();
    expect(repo.current.profile.devices[0]!.health).toBe(0);
    expect(repo.current.profile.resources).toBe(1005);
    expect(repo.current.activeAttempt).toBeNull();
  });
});

describe('v5 device validation', () => {
  it.each([
    (save: SaveData) => { save.profile.nextDeviceId = 1; },
    (save: SaveData) => { save.profile.devices.push(save.profile.devices[0]!); },
    (save: SaveData) => { save.profile.devices[0]!.health = -1; },
    (save: SaveData) => { save.profile.devices[0]!.health = 71; },
    (save: SaveData) => { save.profile.devices[0]!.health = NaN; },
    (save: SaveData) => { save.profile.devices[0]!.id = 1.1; },
    (save: SaveData) => { save.profile.devices[0]!.consumed = true; },
    (save: SaveData) => { save.profile.devices[0]!.position = { x: Infinity, y: 0 }; },
    (save: SaveData) => { save.profile.legacyEquipment = false; },
    (save: SaveData) => { save.profile.devices.pop(); },
  ])('rejects malformed inventory %#', mutate => {
    const { repo } = fixture(); const save = repo.current; mutate(save);
    expect(() => decodeSave(JSON.stringify(save))).toThrow();
  });
  it('rejects corrupted active snapshots and unmarked positive rental costs', () => {
    const { repo } = fixture(); deploy(repo); begin(repo);
    const base = repo.current;
    for (const mutate of [
      (save: SaveData) => { delete save.activeAttempt!.deviceSnapshot; },
      (save: SaveData) => { save.activeAttempt!.deviceSnapshot![0]!.health--; },
      (save: SaveData) => { save.activeAttempt!.deviceSnapshot![0]!.x++; },
      (save: SaveData) => { save.activeAttempt!.deviceSnapshot!.push(save.activeAttempt!.deviceSnapshot![0]!); },
      (save: SaveData) => { save.activeAttempt!.placementCost = 1; },
      (save: SaveData) => { save.activeAttempt!.legacyRental = true; },
    ]) {
      const save = structuredClone(base); mutate(save); expect(() => decodeSave(JSON.stringify(save))).toThrow();
    }
  });
});
