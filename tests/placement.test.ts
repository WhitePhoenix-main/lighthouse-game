import { describe, expect, it } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { checkDraft, checkPlacement, placementCost } from '../src/application/placement';
import type { DevicePlacement } from '../src/contracts';

const config = NIGHT_CONFIG;
const cannon: DevicePlacement = { id: 1, kind: 'cannon', x: 100, y: 0 };

describe('world-space placement rules', () => {
  it('accepts separate objects, exact tangency and counts type slots separately', () => {
    const placements: DevicePlacement[] = [cannon, { ...cannon, id: 2, x: -100 },
      { id: 3, kind: 'barrier', x: 0, y: 100 }, { id: 4, kind: 'barrier', x: 0, y: -100 }];
    expect(checkDraft(config, placements).valid).toBe(true);
    expect(placementCost(config, placements)).toBe(64);
    expect(checkPlacement(config, [], 'cannon', 46, 0).valid).toBe(true);
    expect(checkPlacement(config, [], 'cannon', 284, 0).valid).toBe(true);
    expect(checkPlacement(config, [cannon], 'barrier', 142, 0).valid).toBe(true);
  });
  it('explains lighthouse, boundary and object intersections, and rejects nonfinite coordinates', () => {
    expect(checkPlacement(config, [], 'cannon', 45, 0).reason).toContain('маяком');
    expect(checkPlacement(config, [], 'cannon', 285, 0).reason).toContain('границей');
    expect(checkPlacement(config, [cannon], 'barrier', 141, 0).reason).toContain('устройством');
    for (const x of [NaN, Infinity, -Infinity]) expect(checkPlacement(config, [], 'cannon', x, 100).valid).toBe(false);
  });
  it('enforces per-type, total and equipped-type limits from data', () => {
    const two = [cannon, { ...cannon, id: 2, x: -100 }];
    expect(checkPlacement(config, two, 'cannon', 0, 100).reason).toContain('Предел');
    expect(checkPlacement({ ...config, devices: { ...config.devices, maxObjects: 2 } }, two, 'barrier', 0, 100).reason).toContain('Общий предел');
    const oneType = { ...config, devices: { ...config.devices, typeSlots: 1 } };
    expect(checkPlacement(oneType, [cannon], 'cannon', -100, 0).valid).toBe(true);
    expect(checkPlacement(oneType, [cannon], 'barrier', 0, 100).reason).toContain('слоты типов');
  });
  it('validates whole draft again, including duplicate ids, and never changes coordinates', () => {
    const before = structuredClone(cannon);
    expect(checkDraft(config, [cannon, { ...cannon, x: -100 }]).valid).toBe(false);
    expect(checkDraft(config, [{ ...cannon, id: 0 }]).valid).toBe(false);
    expect(checkDraft(config, [cannon, { ...cannon, id: 2, x: 110 }]).valid).toBe(false);
    expect(cannon).toEqual(before);
    expect(placementCost(config, [])).toBe(0);
  });
});
