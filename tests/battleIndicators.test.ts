import { describe, expect, it } from 'vitest';
import { battleBarStyle, clampBarFraction, enemyBarRequest } from '../src/presentation/battle/battleIndicators';
import { layoutIndicators, overlaps } from '../src/presentation/battle/indicatorLayout';

describe('readable battle health at phone zoom', () => {
  it('keeps health and armor readable even when the body is only 12 pixels wide', () => {
    const style = battleBarStyle(true, false, 12);
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.fillHeight).toBeGreaterThanOrEqual(6);
    expect(style.height).toBe(style.padding * 2 + style.fillHeight * 2 + style.gap);
    expect(battleBarStyle(true, true, 12).fillHeight).toBeGreaterThan(style.fillHeight);
  });
  it('keeps enlarged mixed bars separate and inside a 390px phone field', () => {
    const bodies = Array.from({ length: 8 }, (_, index) => ({ x: 170 + index % 2 * 6, y: 280 + index * 2, width: 24, height: 34 }));
    const requests = bodies.map((body, id) => enemyBarRequest(id, body, battleBarStyle(id % 2 === 0, true, body.width)));
    const placed = layoutIndicators(requests, { width: 390, height: 600 }, bodies);
    for (const bar of placed) {
      expect(bar.width).toBe(requests.find(source => source.id === bar.id)!.width);
      expect(bar.x).toBeGreaterThanOrEqual(3);
      expect(bar.x + bar.width).toBeLessThanOrEqual(387);
      expect(bar.y).toBeGreaterThanOrEqual(3);
      expect(placed.filter(other => other.id !== bar.id).some(other => overlaps(bar, other))).toBe(false);
    }
  });
  it('does not draw depleted armor as health or overflow the backing strip', () => {
    expect(clampBarFraction(0, 100)).toBe(0);
    expect(clampBarFraction(-10, 100)).toBe(0);
    expect(clampBarFraction(110, 100)).toBe(1);
    expect(clampBarFraction(40, 0)).toBe(0);
    expect(clampBarFraction(45, 100)).toBe(.45);
  });
});
