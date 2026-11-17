import { describe, expect, it } from 'vitest';
import { layoutIndicators, overlaps, type IndicatorRequest } from '../src/presentation/battle/indicatorLayout';

const viewport = { width: 358, height: 400 };
const cluster: IndicatorRequest[] = [
  { id: 1, x: 167, y: 170, width: 32, height: 8 },
  { id: 2, x: 173, y: 172, width: 32, height: 8 },
  { id: 3, x: 169, y: 174, width: 32, height: 8 },
  { id: 4, x: 171, y: 171, width: 40, height: 14 },
];

describe('screen health indicator layout', () => {
  it('keeps clustered health and armor full-sized and separate', () => {
    const placed = layoutIndicators(cluster, viewport, []);
    expect(placed).toHaveLength(cluster.length);
    for (const bar of placed) {
      const source = cluster.find((request) => request.id === bar.id)!;
      expect([bar.width, bar.height]).toEqual([source.width, source.height]);
      expect(placed.filter((other) => other.id !== bar.id).some((other) => overlaps(bar, other))).toBe(false);
    }
  });
  it('produces the same owner positions regardless of input order', () => {
    expect(layoutIndicators([...cluster].reverse(), viewport, [])).toEqual(layoutIndicators(cluster, viewport, []));
  });
  it('reserves existing device health even when enemies surround it', () => {
    const deviceBar = { x: 160, y: 170, width: 40, height: 6 };
    const placed = layoutIndicators(cluster, viewport, [], [deviceBar]);
    expect(placed.some((bar) => overlaps(bar, deviceBar))).toBe(false);
  });
  it('moves away from tower and bodies when a nearby free row exists', () => {
    const tower = { x: 155, y: 160, width: 65, height: 100 };
    const placed = layoutIndicators([cluster[0]!], viewport, [tower]);
    expect(overlaps(placed[0]!, tower, 2)).toBe(false);
  });
  it('keeps coincident near-edge threats inside a short viewport without hiding bars', () => {
    const requests = Array.from({ length: 12 }, (_, id) => ({ id, x: -5, y: 3, width: 32, height: 14 }));
    const placed = layoutIndicators(requests, { width: 300, height: 170 }, []);
    for (const bar of placed) {
      expect(bar.x).toBeGreaterThanOrEqual(3); expect(bar.y).toBeGreaterThanOrEqual(3);
      expect(bar.x + bar.width).toBeLessThanOrEqual(297);
      expect(bar.y + bar.height).toBeLessThanOrEqual(167);
      expect(placed.filter((other) => other.id !== bar.id).some((other) => overlaps(bar, other))).toBe(false);
    }
  });
});
