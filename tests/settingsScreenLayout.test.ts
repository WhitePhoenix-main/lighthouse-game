import { describe, expect, it } from 'vitest';
import { settingsLayout, type SettingsRect } from '../src/presentation/settingsLayout';
import { settingsTextWidth } from '../src/presentation/settingsLettering';

const viewports = [[320, 568], [390, 844], [568, 320], [844, 390], [1000, 700], [1280, 720], [1672, 941], [768, 1024], [1024, 768]] as const;

describe('shared settings artwork and native control geometry', () => {
  for (const [width, height] of viewports) for (const size of ['normal', 'large'] as const) {
    it(`${width}×${height}, ${size}: reachable 44px targets without collisions`, () => {
      const layout = settingsLayout(width, height, size);
      const { scale } = layout;
      const controls: Record<string, SettingsRect> = { ...layout.choices };
      // Slider geometry describes its painted rail; native hit area is centred on it.
      for (const [name, rail] of Object.entries(layout.sliders)) controls[name] = {
        x: rail.x, y: rail.y + rail.height / 2 - 22 / scale,
        width: rail.width, height: 44 / scale,
      };
      for (const [name, rect] of Object.entries(controls)) {
        expect(rect.width * scale, `${name}: width`).toBeGreaterThanOrEqual(43.99);
        expect(rect.height * scale, `${name}: height`).toBeGreaterThanOrEqual(43.99);
        expect(rect.x, `${name}: left`).toBeGreaterThanOrEqual(0);
        expect((rect.x + rect.width) * scale, `${name}: right`).toBeLessThanOrEqual(width + .01);
        expect(rect.y, `${name}: top`).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height, `${name}: reachable by vertical scroll`).toBeLessThanOrEqual(layout.height + .01);
      }
      const entries = Object.entries(controls);
      for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
        const [an, a] = entries[i]!, [bn, b] = entries[j]!;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX <= .01 || overlapY <= .01, `${an}/${bn} overlap`).toBe(true);
      }
      expect(layout.height * scale).toBeGreaterThanOrEqual(height - .01);
    });
  }

  it('recomputes both orientations without carrying old geometry', () => {
    const portrait = settingsLayout(390, 844, 'large');
    expect(settingsLayout(844, 390, 'large').orientation).toBe('landscape');
    expect(settingsLayout(390, 844, 'large')).toEqual(portrait);
    expect(portrait.orientation).toBe('portrait');
  });

  it('large text increases visible type without shrinking interaction targets', () => {
    for (const [w, h] of viewports) {
      const normal = settingsLayout(w, h, 'normal'), large = settingsLayout(w, h, 'large');
      expect(large.textScale).toBeGreaterThan(normal.textScale);
      for (const name of Object.keys(normal.choices) as (keyof typeof normal.choices)[]) {
        expect(large.choices[name].width * large.scale).toBeGreaterThanOrEqual(normal.choices[name].width * normal.scale);
      }
    }
  });

  it.each(['normal', 'large'] as const)('fits full EFFECTS and 100%% without shrinking %s text', size => {
    for (const [width, height] of [[1000, 700], [1280, 720], [1672, 941]] as const) {
      const layout = settingsLayout(width, height, size);
      const textScale = 2 * layout.textScale;
      const headingRight = layout.headings.effects.x + settingsTextWidth('EFFECTS', textScale);
      const valueLeft = layout.values.effects.x - settingsTextWidth('100%', textScale);
      expect(valueLeft - headingRight).toBeGreaterThanOrEqual(12);
      expect(layout.values.effects.x).toBeLessThan(layout.sliders.effects.x);
    }
  });
});
