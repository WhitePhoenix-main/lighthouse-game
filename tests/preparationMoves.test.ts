import { describe, expect, it } from 'vitest';
import type { NightConfig, SaveStore } from '../src/contracts';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave, SaveRepository } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';

function fixture(invalid = false) {
  const save = emptySave();
  save.profile.resources = 136;
  save.profile.purchasedUpgrades = ['unlock-cannon'];
  save.profile.wonNightIds = ['first-light'];
  save.profile.devices = [
    { id: 1, kind: 'cannon', health: NIGHT_CONFIG.devices.definitions.cannon.health, consumed: false, position: invalid ? { x: -50, y: -100 } : null },
    { id: 2, kind: 'cannon', health: NIGHT_CONFIG.devices.definitions.cannon.health / 2, consumed: false, position: { x: invalid ? -60 : -160, y: 100 } },
  ];
  save.profile.nextDeviceId = 3;
  let raw = JSON.stringify(save), writes = 0, fail = false;
  const store: SaveStore = { read: () => raw, write(value) { if (fail) throw new Error('quota'); raw = value; writes++; } };
  const config: NightConfig = structuredClone(NIGHT_CONFIG);
  config.terrain = { shoreX: invalid ? -100 : 0, landOnlyPlacement: true };
  const app = new LighthouseApplication(store, config, () => ({ id: 'move', seed: 42 }));
  app.openPreparation();
  app.selectDevice('cannon');
  return { app, store, config, writes: () => writes, raw: () => raw, fail: (value: boolean) => { fail = value; } };
}

describe('exact owned body placement and recovery', () => {
  it('moves the chosen body in one write, preserving its identity, damage and the spare body', () => {
    const f = fixture(), before = f.writes();
    expect(f.app.previewPlacement(-160, 100, 2).valid).toBe(true);
    f.app.placeDevice(-200, -80, 2);
    expect(f.writes() - before).toBe(1);
    expect(f.app.view.profile.devices[0]!.position).toBeNull();
    expect(f.app.view.profile.devices[1]).toMatchObject({ id: 2, health: NIGHT_CONFIG.devices.definitions.cannon.health / 2, position: { x: -200, y: -80 } });
    expect(f.app.view.profile.resources).toBe(136);
    const reloaded = new LighthouseApplication(f.store, f.config, () => ({ id: 'reload', seed: 1 }));
    expect(reloaded.view.profile.devices[1]!.position).toEqual({ x: -200, y: -80 });
  });

  it('rejects unavailable IDs and invalid targets without removing the old placement', () => {
    const f = fixture(), before = f.raw();
    expect(f.app.previewPlacement(-200, -80, 999).valid).toBe(false);
    f.app.placeDevice(5000, 0, 2);
    expect(f.raw()).toBe(before);
    expect(f.app.view.profile.devices[1]!.position).toEqual({ x: -160, y: 100 });
  });

  it('does not publish a failed move; retry saves the same body exactly once', () => {
    const f = fixture();
    f.fail(true);
    f.app.placeDevice(-200, -80, 2);
    expect(f.app.view.error).toContain('quota');
    expect(f.app.view.profile.devices[1]!.position).toEqual({ x: -160, y: 100 });
    f.fail(false);
    f.app.retrySave();
    expect(f.app.view.error).toBeNull();
    expect(f.app.view.profile.devices[1]!.position).toEqual({ x: -200, y: -80 });
    expect(f.app.view.profile.devices).toHaveLength(2);
    expect(f.app.view.profile.resources).toBe(136);
  });

  it('keeps old invalid positions and permits fixing them one at a time', () => {
    const f = fixture(true);
    expect(f.app.view.preparation.canStart).toBe(false);
    expect(f.app.view.profile.devices.map(d => d.position)).toEqual([{ x: -50, y: -100 }, { x: -60, y: 100 }]);
    f.app.placeDevice(-200, -100, 1);
    expect(f.app.view.error).toBeNull();
    expect(f.app.view.preparation.canStart).toBe(false);
    expect(f.app.view.profile.devices[1]!.position).toEqual({ x: -60, y: 100 });
    f.app.placeDevice(-200, 100, 2);
    expect(f.app.view.preparation.canStart).toBe(true);
    expect(f.app.view.profile.devices.map(d => d.position)).toEqual([{ x: -200, y: -100 }, { x: -200, y: 100 }]);
  });

  it('can return one invalid body to stock while another invalid body remains', () => {
    const f = fixture(true);
    f.app.removeDevice(1);
    expect(f.app.view.error).toBeNull();
    expect(f.app.view.profile.devices[0]!.position).toBeNull();
    expect(f.app.view.profile.devices[1]!.position).toEqual({ x: -60, y: 100 });
    expect(f.app.view.preparation.canStart).toBe(false);
  });

  it('does not let recovery bypass unique IDs or the rules for changed positions', () => {
    const f = fixture(true), repo = new SaveRepository(f.store);
    repo.load();
    const prior = f.raw();
    expect(() => repo.savePlacements([{ id: 1, kind: 'cannon', x: -50, y: -100 }, { id: 1, kind: 'cannon', x: -50, y: -100 }], f.config)).toThrow();
    expect(() => repo.savePlacements([{ id: 1, kind: 'cannon', x: 100, y: -100 }, { id: 2, kind: 'cannon', x: -60, y: 100 }], f.config)).toThrow();
    expect(f.raw()).toBe(prior);
  });
});
