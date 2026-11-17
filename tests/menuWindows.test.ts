import { describe, expect, it } from 'vitest';
import { windowLightKeyframes, windowLightSequence } from '../src/presentation/menu/menuWindows';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('random window light order', () => {
  it('uses the former lighthouse profile: a quick rise and long single decay over 4.2 seconds', () => {
    const duration = 4200;
    const { spriteFrames, brightnessFrames } = windowLightKeyframes();
    const indices = spriteFrames.map(frame => Math.round(Number.parseFloat(String(frame.backgroundPositionX)) * 11 / 100));
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11]);
    expect(new Set(indices).size).toBe(12);
    const peak = spriteFrames[6]!;
    const fall = spriteFrames[7]!;
    expect(Number(peak.offset) * duration).toBeCloseTo(504);
    expect(Number(fall.offset) * duration).toBeCloseTo(1260);
    expect((1 - Number(peak.offset)) * duration).toBeCloseTo(3696);
    expect(brightnessFrames.map(frame => frame.opacity)).toEqual([0, .96, .74, .54, .34, .20, 0]);
    expect(brightnessFrames[1]!.offset).toEqual(peak.offset);
    expect(brightnessFrames[2]!.offset).toBeCloseTo(Number(fall.offset));
  });
  it('gives each window one turn per round and avoids a repeat at round boundaries', () => {
    const next = windowLightSequence(5, seededRandom(42));
    let previous = -1;
    const orders = new Set<string>();
    for (let round = 0; round < 12; round++) {
      const cues = Array.from({ length: 5 }, next);
      expect(cues[0]!.index).not.toBe(previous);
      expect(cues.map(cue => cue.index).sort()).toEqual([0, 1, 2, 3, 4]);
      orders.add(cues.map(cue => cue.index).join(','));
      previous = cues[4]!.index;
    }
    expect(orders.size).toBeGreaterThan(1);
  });
  it('keeps the random start interval with the longer lighthouse cue', () => {
    for (const random of [() => 0, () => 1 - Number.EPSILON]) {
      const next = windowLightSequence(5, random);
      for (let i = 0; i < 10; i++) {
        const cue = next();
        expect(cue.durationMs).toBe(4200);
        expect(cue.waitMs).toBeGreaterThanOrEqual(5200);
        expect(cue.waitMs).toBeLessThanOrEqual(7600);
        expect(cue.waitMs - cue.durationMs).toBeGreaterThanOrEqual(1000);
      }
    }
  });
  it('accepts injected randomness and also handles a single window', () => {
    const first = windowLightSequence(5, seededRandom(17));
    const second = windowLightSequence(5, seededRandom(17));
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));
    expect(windowLightSequence(1)().index).toBe(0);
    expect(() => windowLightSequence(0)).toThrow(RangeError);
  });
});
