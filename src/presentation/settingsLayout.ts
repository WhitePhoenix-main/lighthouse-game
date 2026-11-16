import type { TextSize } from '../contracts';

export type SettingsChoice = 'on' | 'off' | 'auto' | 'ru' | 'en' | 'normal' | 'large' | 'back';
export type SettingsVolume = 'music' | 'effects';
export type SettingsHeading = 'sound' | 'music' | 'effects' | 'language' | 'text';
export interface SettingsPoint { x: number; y: number }
export interface SettingsRect extends SettingsPoint { width: number; height: number }
export interface SettingsLayout {
  orientation: 'portrait' | 'landscape';
  compact: boolean;
  width: number;
  height: number;
  scale: number;
  textScale: number;
  title: SettingsRect;
  headings: Record<SettingsHeading, SettingsPoint>;
  values: Record<SettingsVolume, SettingsPoint>;
  choices: Record<SettingsChoice, SettingsRect>;
  sliders: Record<SettingsVolume, SettingsRect>;
  dividers: readonly SettingsRect[];
  footer: { x: number; ys: readonly number[] };
}

/** Virtual artwork coordinates and native control rectangles share one layout. */
export function settingsLayout(viewportWidth: number, viewportHeight: number, textSize: TextSize): SettingsLayout {
  const orientation = viewportHeight >= viewportWidth ? 'portrait' : 'landscape';
  const compact = orientation === 'landscape' && viewportWidth < 1000;
  const scale = orientation === 'portrait' ? Math.min(viewportWidth / 390, 1.75)
    : compact ? Math.min(viewportWidth / 600, 1)
      : Math.min(viewportWidth / 1280, Math.max(.8, viewportHeight / 720));
  const width = viewportWidth / scale;
  const controlHeight = Math.max(48, 44 / scale);
  const textScale = Math.max(1, 14 / (18 * scale)) * (textSize === 'large' ? 1.12 : 1);
  const rect = (x: number, y: number, w: number, h = controlHeight): SettingsRect => ({ x, y, width: w, height: h });
  if (orientation === 'portrait' || compact) {
    const dx = compact ? 0 : (width - 390) / 2, dy = compact ? -150 : 0;
    const point = (x: number, y: number): SettingsPoint => ({ x: x + dx, y: y + dy });
    const box = (x: number, y: number, w: number, h = controlHeight): SettingsRect => ({ ...point(x, y), width: w, height: h });
    const sound = 266, music = sound + controlHeight + 17, effects = music + 79;
    const auto = effects + 80, language = auto + controlHeight + 12;
    const textHeading = language + controlHeight + 24, text = textHeading + 28;
    const footer = text + controlHeight + 20, back = footer + 56;
    return {
      orientation, compact, width, scale, textScale,
      height: Math.max(viewportHeight / scale, back + dy + controlHeight + 22),
      title: box(33, 186, 324, 48),
      headings: {
        sound: point(24, sound + (controlHeight - 18 * textScale) / 2),
        music: point(24, music), effects: point(24, effects),
        language: point(24, auto + (controlHeight - 18 * textScale) / 2), text: point(24, textHeading)
      },
      values: { music: point(366, music), effects: point(366, effects) },
      choices: {
        on: box(170, sound, 90), off: box(278, sound, 88), auto: box(246, auto, 120),
        ru: box(24, language, 163), en: box(203, language, 163),
        normal: box(24, text, 163), large: box(203, text, 163), back: box(45, back, 300)
      },
      sliders: { music: box(24, music + 42, 342, 10), effects: box(24, effects + 42, 342, 10) },
      dividers: [box(24, 251, 342, 1)],
      footer: { x: 195 + dx, ys: [footer + dy, footer + dy + 24] }
    };
  }
  const sound = 144, music = sound + controlHeight + 45, effects = music + 64;
  const firstDivider = effects + 55, languageHeading = firstDivider + 26, language = languageHeading + 38;
  const text = language + controlHeight + 22, lastDivider = text + controlHeight + 20;
  const footer = lastDivider + 20, back = footer + 38, backHeight = Math.max(64, controlHeight);
  return {
    orientation, compact, width, scale, textScale,
    height: Math.max(viewportHeight / scale, back + backHeight + 40),
    title: rect(158, 48, 324, 48),
    headings: {
      sound: { x: 56, y: sound + (controlHeight - 18 * textScale) / 2 },
      music: { x: 56, y: music }, effects: { x: 56, y: effects },
      language: { x: 56, y: languageHeading }, text: { x: 56, y: text + (controlHeight - 18 * textScale) / 2 }
    },
    values: { music: { x: 290, y: music + 3 }, effects: { x: 290, y: effects + 3 } },
    choices: {
      on: rect(300, sound, 128), off: rect(448, sound, 136), auto: rect(56, language, 160),
      ru: rect(240, language, 164), en: rect(428, language, 156),
      normal: rect(220, text, 174), large: rect(412, text, 172), back: rect(140, back, 360, backHeight)
    },
    sliders: { music: rect(318, music + 14, 266, 10), effects: rect(318, effects + 14, 266, 10) },
    dividers: [rect(56, 118, 528, 1), rect(56, firstDivider, 528, 1), rect(56, lastDivider, 528, 1)],
    footer: { x: 320, ys: [footer] }
  };
}
