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

  it('keeps desktop artwork coordinates and scaling when the window becomes narrow', () => {
    for (const [width, height] of [[844, 390], [1280, 720], [1672, 941]] as const) {
      const layout = settingsLayout(width, height, 'normal', false);
      expect(layout.mobile).toBe(false);
      expect(layout.compact).toBe(false);
      expect(layout.scale).toBe(Math.min(width / 1280, Math.max(.8, height / 720)));
      expect(layout.title).toEqual({ x: 158, y: 48, width: 324, height: 48 });
      expect(layout.choices.on).toEqual({ x: 300, y: 144, width: 128, height: Math.max(48, 44 / layout.scale) });
      expect(layout.sliders.music.x).toBe(318);
      expect(layout.choices.en.x + layout.choices.en.width).toBe(584);
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
    expect(ordinary.headings.effects.y - ordinary.headings.music.y).toBe(64);
  });

  it.each(['normal', 'large'] as const)('fills a tall desktop panel with section spacing while retaining control sizes (%s)', size => {
    for (const [width, height] of [[1280, 1024], [1000, 1000]] as const) {
      const base = settingsLayout(width, 720, size, false);
      const layout = settingsLayout(width, height, size, false);
      expect(layout.scale).toBe(base.scale);
      expect(layout.textScale).toBe(base.textScale);
      expect(layout.title).toEqual(base.title);
      expect(layout.height * layout.scale).toBeCloseTo(height, 5);
      expect(layout.choices.back.y + layout.choices.back.height).toBeCloseTo(height / layout.scale - 40, 5);
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

  it('preserves the full desktop layout at its original 1280×720 size', () => {
    expect(settingsLayout(1280, 720, 'normal', false)).toEqual({
      orientation: 'landscape', compact: false, mobile: false, width: 1280, height: 720, scale: 1, textScale: 1,
      title: { x: 158, y: 48, width: 324, height: 48 },
      headings: { sound: { x: 56, y: 159 }, music: { x: 56, y: 237 }, effects: { x: 56, y: 301 }, language: { x: 56, y: 382 }, text: { x: 56, y: 505 } },
      values: { music: { x: 290, y: 240 }, effects: { x: 290, y: 304 } },
      choices: {
        on: { x: 300, y: 144, width: 128, height: 48 }, off: { x: 448, y: 144, width: 136, height: 48 },
        auto: { x: 56, y: 420, width: 160, height: 48 }, ru: { x: 240, y: 420, width: 164, height: 48 }, en: { x: 428, y: 420, width: 156, height: 48 },
        normal: { x: 220, y: 490, width: 174, height: 48 }, large: { x: 412, y: 490, width: 172, height: 48 }, back: { x: 140, y: 616, width: 360, height: 64 }
      },
      sliders: { music: { x: 318, y: 251, width: 266, height: 10 }, effects: { x: 318, y: 315, width: 266, height: 10 } },
      dividers: [{ x: 56, y: 118, width: 528, height: 1 }, { x: 56, y: 356, width: 528, height: 1 }, { x: 56, y: 558, width: 528, height: 1 }],
      footer: { x: 320, ys: [578] }
    });
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
