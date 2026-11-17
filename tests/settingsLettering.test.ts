import { describe, expect, it } from 'vitest';
import { drawSettingsPixelText, settingsTextWidth } from '../src/presentation/shared/settingsLettering';

interface Transform { a: number; b: number; c: number; d: number; e: number; f: number }
interface Rectangle { x: number; y: number; width: number; height: number; ink: string }
const identity: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const foreground = '#dfc7a2';

function recordingCanvas(transform: Transform) {
  let matrix = { ...transform };
  let fillStyle = '#123456';
  const stack: { matrix: Transform; fillStyle: string }[] = [];
  const rectangles: Rectangle[] = [];
  const context = {
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; },
    getTransform: () => ({ ...matrix }),
    save() { stack.push({ matrix: { ...matrix }, fillStyle }); },
    restore() { const state = stack.pop()!; matrix = state.matrix; fillStyle = state.fillStyle; },
    resetTransform() { matrix = { ...identity }; },
    fillRect(x: number, y: number, width: number, height: number) {
      rectangles.push({
        x: matrix.a * x + matrix.e, y: matrix.d * y + matrix.f,
        width: matrix.a * width, height: matrix.d * height, ink: fillStyle
      });
    }
  };
  return { context: context as unknown as CanvasRenderingContext2D, rectangles };
}

function paintedPixels(rectangles: readonly Rectangle[]): Map<string, string> {
  const pixels = new Map<string, string>();
  for (const rect of rectangles) {
    // Native canvas antialiases fractional rectangle edges even with image
    // smoothing disabled. Integer backing edges guarantee opaque shared seams.
    expect([rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)).toBe(true);
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) pixels.set(`${x},${y}`, rect.ink);
    }
  }
  return pixels;
}

describe('settings pixel lettering', () => {
  it('renders the shared skill-tree title and overview with Ш and Ё in the project lettering', () => {
    const { context, rectangles } = recordingCanvas(identity);
    expect(() => drawSettingsPixelText(context, 'ДРЕВО УЛУЧШЕНИЙ ВСЁ ДРЕВО', 1, 8, 2, foreground)).not.toThrow();
    expect(rectangles.some(rect => rect.ink === foreground)).toBe(true);
    expect(rectangles.every(rect => rect.y >= 0)).toBe(true);
  });
  for (const dpr of [1, 1.25, 2]) for (const uiScale of [0.63, 0.87, 1.125]) {
    it(`keeps strokes opaque and joined at UI scale ${uiScale}, DPR ${dpr}`, () => {
      const factor = uiScale * dpr;
      const transform = { ...identity, a: factor, d: factor, e: 0.35, f: 0.625 };
      const { context, rectangles } = recordingCanvas(transform);
      const scale = 2.35, x = 13.4, y = 18.375;
      drawSettingsPixelText(context, 'В', x, y, scale, foreground);
      const pixels = paintedPixels(rectangles);
      const actualInk = new Set([...pixels].filter(([, ink]) => ink === foreground).map(([point]) => point));
      const expectedInk = new Set<string>();
      // Approved В silhouette as whole horizontal strokes: no per-cell seams,
      // counters kept open, and foreground fully covers the underlying shadow.
      const strokes = [
        [[0, 6]], [[1, 3], [5, 7]], [[1, 3], [5, 7]], [[1, 3], [5, 7]],
        [[1, 6]], [[1, 3], [5, 7]], [[1, 3], [5, 7]], [[1, 3], [5, 7]], [[0, 6]]
      ];
      for (const [row, runs] of strokes.entries()) for (const [start, end] of runs) {
        const x0 = Math.round((Math.round(x) + start! * scale) * factor + transform.e);
        const x1 = Math.round((Math.round(x) + end! * scale) * factor + transform.e);
        const y0 = Math.round((y + row * scale) * factor + transform.f);
        const y1 = Math.round((y + (row + 1) * scale) * factor + transform.f);
        for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) expectedInk.add(`${px},${py}`);
      }
      expect(actualInk).toEqual(expectedInk);
      expect(context.getTransform()).toEqual(transform);
      expect(context.fillStyle).toBe('#123456');
    });
  }

  it('preserves shared RU/EN silhouettes and the width/spacing contract', () => {
    const ru = recordingCanvas({ ...identity, a: 1.0375, d: 1.0375 });
    const en = recordingCanvas({ ...identity, a: 1.0375, d: 1.0375 });
    drawSettingsPixelText(ru.context, 'ВКЛ', 90, 11.2, 3.15, foreground, 'center');
    drawSettingsPixelText(en.context, 'BKЛ', 90, 11.2, 3.15, foreground, 'center');
    expect(en.rectangles).toEqual(ru.rectangles);
    expect(settingsTextWidth('ВКЛ', 3.15)).toBe(26 * 3.15);
    expect(settingsTextWidth('', 3.15)).toBe(0);
  });

  it('retains all Й accents above the glyph body with enlarged fractional lettering', () => {
    const factor = 1.25 * 0.87;
    const transform = { ...identity, a: factor, d: factor };
    const { context, rectangles } = recordingCanvas(transform);
    const scale = 3.375, x = 22, y = 17.3;
    drawSettingsPixelText(context, 'Й', x, y, scale, foreground);
    paintedPixels(rectangles);
    const accent = rectangles.filter((rect) => rect.ink === foreground && rect.y < Math.round(y * factor));
    expect(accent).toHaveLength(3);
    expect(Math.min(...accent.map((rect) => rect.y))).toBe(Math.round((y - 3 * scale) * factor));
    expect(accent[2]!.width).toBe(Math.round((x + 5 * scale) * factor) - Math.round((x + 3 * scale) * factor));
    const body = recordingCanvas(transform);
    drawSettingsPixelText(body.context, 'И', x, y, scale, foreground);
    expect(rectangles.filter((rect) => rect.ink === foreground && rect.y >= Math.round(y * factor)))
      .toEqual(body.rectangles.filter((rect) => rect.ink === foreground));
  });

  it.each(['left', 'center', 'right'] as const)('retains %s alignment, advance and spaces', (align) => {
    const factor = 0.87 * 1.25;
    const { context, rectangles } = recordingCanvas({ ...identity, a: factor, d: factor });
    const text = 'E E', scale = 2.35, x = 100.25;
    drawSettingsPixelText(context, text, x, 10.2, scale, foreground, align);
    const ink = rectangles.filter((rect) => rect.ink === foreground);
    const width = settingsTextWidth(text, scale);
    const left = Math.round(x - (align === 'center' ? width / 2 : align === 'right' ? width : 0));
    expect(Math.min(...ink.map((rect) => rect.x))).toBe(Math.round(left * factor));
    expect(Math.max(...ink.map((rect) => rect.x + rect.width))).toBe(Math.round((left + width) * factor));
  });

  it('restores drawing state when a missing glyph is rejected', () => {
    const transform = { ...identity, a: 1.25, d: 1.25 };
    const { context } = recordingCanvas(transform);
    expect(() => drawSettingsPixelText(context, '?', 0, 0, 2, foreground)).toThrow('Missing settings pixel glyph');
    expect(context.getTransform()).toEqual(transform);
    expect(context.fillStyle).toBe('#123456');
  });
});
