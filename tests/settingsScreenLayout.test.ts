import { describe, expect, it } from 'vitest';
import { settingsLayout, usesMobileSettingsLayout, type SettingsRect } from '../src/presentation/settingsLayout';
import { settingsTextWidth } from '../src/presentation/settingsLettering';

const viewports = [[320, 568], [390, 844], [568, 320], [844, 390], [1000, 700], [1280, 720], [1672, 941], [768, 1024], [1024, 768]] as const;

describe('shared settings artwork and native control geometry', () => {
  it.each([
    [390, 844, false, 0, true], [795, 1543, false, 0, true], [933, 1051, false, 0, true],
    [568, 320, false, 0, true], [844, 390, false, 0, false],
    [844, 390, false, 5, true], [844, 390, true, 0, true],
    [1024, 768, false, 0, false], [1024, 768, false, 10, true], [1920, 1080, true, 10, false],
    [1280, 720, false, 5, false], [1366, 768, true, 10, false],
  ] as const)('chooses responsive layout for %i×%i, coarse=%s, touchPoints=%i', (width, height, coarse, touchPoints, mobile) => {
    expect(usesMobileSettingsLayout(width, height, coarse, touchPoints)).toBe(mobile);
    if (!coarse && !touchPoints) expect(settingsLayout(width, height, 'normal').mobile).toBe(mobile);
  });

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

  it.each(['normal', 'large'] as const)('uses phone portrait height without a reserved desktop top area (%s)', size => {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]] as const) {
      const layout = settingsLayout(width, height, size, true);
      expect(layout.mobile).toBe(true);
      expect(layout.title.y * layout.scale).toBeLessThan(30);
      expect(layout.choices.on.y * layout.scale).toBeLessThan(110);
      expect(layout.height * layout.scale).toBeCloseTo(height, 5);
      const backBottom = (layout.choices.back.y + layout.choices.back.height) * layout.scale;
      expect(height - backBottom).toBeGreaterThanOrEqual(16);
      expect(height - backBottom).toBeLessThan(30);
    }
  });

  it.each(['normal', 'large'] as const)('fits tablet portrait controls and Back within the viewport (%s)', size => {
    for (const [width, height] of [[933, 1051], [768, 1024]] as const) {
      const layout = settingsLayout(width, height, size);
      expect(layout.mobile).toBe(true);
      expect(layout.orientation).toBe('portrait');
      expect(layout.scale).toBeLessThan(1.75);
      expect(layout.height * layout.scale).toBeCloseTo(height, 5);
      expect(layout.width * layout.scale).toBeCloseTo(width, 5);
      for (const control of Object.values(layout.choices)) {
        expect((control.y + control.height) * layout.scale).toBeLessThan(height);
        expect(control.height * layout.scale).toBeGreaterThanOrEqual(44);
      }
      const back = layout.choices.back;
      expect(height - (back.y + back.height) * layout.scale).toBeCloseTo(24 * layout.scale, 5);
    }
  });

  it.each(['normal', 'large'] as const)('uses both phone landscape columns and keeps back visible (%s)', size => {
    for (const [width, height] of [[844, 390], [1024, 768]] as const) {
      const layout = settingsLayout(width, height, size, true);
      expect(layout.compact).toBe(true);
      expect(layout.height * layout.scale).toBeCloseTo(height, 5);
      expect((layout.sliders.effects.x + layout.sliders.effects.width) * layout.scale).toBeLessThan(width / 2);
      expect(layout.choices.ru.x * layout.scale).toBeGreaterThan(width / 2);
      expect((layout.choices.en.x + layout.choices.en.width) * layout.scale).toBeGreaterThan(width * .9);
      expect((layout.choices.back.x + layout.choices.back.width / 2) * layout.scale).toBeCloseTo(width / 2);
      expect((layout.choices.back.y + layout.choices.back.height) * layout.scale).toBeLessThan(height);
    }
    const short = settingsLayout(568, 320, size, true);
    expect(short.height * short.scale).toBeGreaterThan(320);
    expect(short.choices.back.height * short.scale).toBeGreaterThanOrEqual(44);
  });

  it('keeps the enlarged desktop panel on the left when the window becomes narrow', () => {
    for (const [width, height] of [[844, 390], [1280, 720], [1672, 941]] as const) {
      const layout = settingsLayout(width, height, 'normal', false);
      expect(layout.mobile).toBe(false);
      expect(layout.compact).toBe(false);
      expect(layout.scale).toBe(Math.min(width / 1120, Math.max(.8, height / 630)));
      expect(layout.title).toEqual({ x: 158, y: 32, width: 324, height: 48 });
      expect(layout.choices.on).toEqual({ x: 300, y: 118, width: 128, height: Math.max(48, 44 / layout.scale) });
      expect(layout.sliders.music.x).toBe(318);
      expect(layout.choices.en.x + layout.choices.en.width).toBe(584);
      expect(layout.width).toBe(640);
      for (const control of [...Object.values(layout.choices), ...Object.values(layout.sliders)]) {
        expect(control.x + control.width).toBeLessThanOrEqual(layout.width);
      }
    }
  });

  it.each(['normal', 'large'] as const)('separates native slider hit areas in a narrow desktop window (%s)', size => {
    for (const width of [844, 829]) {
      const layout = settingsLayout(width, 390, size, false);
      const musicCenter = (layout.sliders.music.y + layout.sliders.music.height / 2) * layout.scale;
      const effectsCenter = (layout.sliders.effects.y + layout.sliders.effects.height / 2) * layout.scale;
      expect(effectsCenter - musicCenter).toBeGreaterThanOrEqual(47.99);
      expect(layout.mobile).toBe(false);
      expect(layout.choices.on.x).toBe(300);
      expect(layout.sliders.music.x).toBe(318);
    }
    const ordinary = settingsLayout(1000, 700, size, false);
    expect(ordinary.headings.effects.y - ordinary.headings.music.y).toBeCloseTo(60, 8);
  });

  it.each(['normal', 'large'] as const)('fills desktop height while retaining control sizes (%s)', size => {
    for (const [width, height] of [[1280, 1024], [1000, 1000], [2048, 1548]] as const) {
      const base = settingsLayout(width, width * 630 / 1120, size, false);
      const layout = settingsLayout(width, height, size, false);
      expect(layout.scale).toBe(base.scale);
      expect(layout.textScale).toBe(base.textScale);
      expect(layout.title).toEqual(base.title);
      expect(layout.height * layout.scale).toBeCloseTo(height, 5);
      expect(layout.width).toBe(640);
      const extraGap = layout.choices.on.y - base.choices.on.y;
      expect(extraGap * layout.scale).toBeGreaterThan(0);
      expect((layout.choices.back.y + layout.choices.back.height) * layout.scale).toBeCloseTo(height - 40 * layout.scale, 5);
      expect(layout.choices.back.y).toBeLessThan(settingsLayout(width, height * 2, size, false).choices.back.y);
      for (const name of Object.keys(base.choices) as (keyof typeof base.choices)[]) {
        expect(layout.choices[name].x).toBe(base.choices[name].x);
        expect(layout.choices[name].width).toBe(base.choices[name].width);
        expect(layout.choices[name].height).toBe(base.choices[name].height);
      }
      expect(layout.choices.on.y).toBeGreaterThan(base.choices.on.y);
      expect(layout.choices.ru.y - layout.headings.effects.y).toBeGreaterThan(base.choices.ru.y - base.headings.effects.y);
      expect(layout.choices.normal.y - layout.choices.ru.y).toBeGreaterThan(base.choices.normal.y - base.choices.ru.y);
      const controls = Object.values(layout.choices);
      for (const rail of Object.values(layout.sliders)) controls.push({ ...rail, y: rail.y + 5 - 22 / layout.scale, height: 44 / layout.scale });
      for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!, b = controls[j]!;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX <= .01 || overlapY <= .01).toBe(true);
      }
    }
  });

  it.each(['normal', 'large'] as const)('leaves readable RU/EN lettering in compact phone controls (%s)', size => {
    const labels = { on: ['ВКЛ', 'ON'], off: ['ВЫКЛ', 'OFF'], auto: ['АВТО', 'AUTO'], ru: ['РУССКИЙ', 'RUSSIAN'], en: ['ENGLISH'], normal: ['ОБЫЧНЫЙ', 'NORMAL'], large: ['КРУПНЫЙ', 'LARGE'] } as const;
    for (const [width, height] of [[568, 320], [844, 390]] as const) {
      const layout = settingsLayout(width, height, size, true);
      for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
        for (const label of labels[key]) {
          // Nine glyph rows must fit at 14 CSS pixels, retaining the frame's 22-unit inset.
          expect((layout.choices[key].width - 22) * layout.scale, label).toBeGreaterThanOrEqual(settingsTextWidth(label, 14 / 9));
        }
      }
      expect(layout.headings.sound.x + settingsTextWidth('SOUND', 2 * layout.textScale)).toBeLessThan(layout.choices.on.x);
      expect(layout.headings.language.x + settingsTextWidth('LANGUAGE', 2 * layout.textScale)).toBeLessThan(layout.choices.auto.x);
    }
  });

  it.each([[1280, 720], [1672, 941], [1920, 1080]])('enlarges desktop controls and type while fitting %i×%i', (width, height) => {
    const layout = settingsLayout(width, height, 'normal', false);
    const previousScale = Math.min(width / 1280, Math.max(.8, height / 720));
    expect(layout.scale / previousScale).toBeCloseTo(8 / 7, 2);
    expect(layout.choices.on.width * layout.scale).toBeGreaterThan(128 * previousScale * 1.13);
    expect(18 * layout.textScale * layout.scale).toBeGreaterThan(18 * previousScale * 1.13);
    expect((layout.choices.en.x + layout.choices.en.width) * layout.scale).toBeLessThan(width * .53);
    expect(layout.height * layout.scale).toBeCloseTo(height, 4);
    expect((layout.choices.back.y + layout.choices.back.height) * layout.scale).toBeLessThan(height);
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
