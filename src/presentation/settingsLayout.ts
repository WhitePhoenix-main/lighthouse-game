import type { TextSize } from '../contracts';

export type SettingsChoice = 'on' | 'off' | 'auto' | 'ru' | 'en' | 'normal' | 'large' | 'back';
export type SettingsVolume = 'music' | 'effects';
export type SettingsHeading = 'sound' | 'music' | 'effects' | 'language' | 'text';
export interface SettingsPoint { x: number; y: number }
export interface SettingsRect extends SettingsPoint { width: number; height: number }
export interface SettingsLayout {
  orientation: 'portrait' | 'landscape';
  compact: boolean;
  mobile: boolean;
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
export function settingsLayout(viewportWidth: number, viewportHeight: number, textSize: TextSize, mobileViewport?: boolean): SettingsLayout {
  const orientation = viewportHeight >= viewportWidth ? 'portrait' : 'landscape';
  const mobile = mobileViewport ?? (orientation === 'portrait' || viewportWidth < 1000);
  const compact = mobile && orientation === 'landscape';
  const scale = mobile && orientation === 'portrait' ? Math.min(viewportWidth / 390, 1.75)
    : compact ? Math.min(viewportWidth / 600, 1)
      : Math.min(viewportWidth / 1120, Math.max(.8, viewportHeight / 630));
  const width = viewportWidth / scale;
  const controlHeight = Math.max(48, 44 / scale);
  const textScale = Math.max(1, 14 / (18 * scale)) * (textSize === 'large' ? 1.12 : 1);
  const rect = (x: number, y: number, w: number, h = controlHeight): SettingsRect => ({ x, y, width: w, height: h });
  if (mobile && !compact) {
    const dx = (width - 390) / 2;
    const point = (x: number, y: number): SettingsPoint => ({ x: x + dx, y });
    const box = (x: number, y: number, w: number, h = controlHeight): SettingsRect => ({ ...point(x, y), width: w, height: h });
    // Flexible section gaps fill tall phones; short screens retain readable controls.
    const minimumHeight = 414 + 5 * controlHeight;
    const gap = Math.max(0, (viewportHeight / scale - minimumHeight) / 7);
    const sound = 90, music = sound + controlHeight + 18 + gap, effects = music + 76 + gap;
    const auto = effects + 76 + gap, language = auto + controlHeight + 12 + gap;
    const textHeading = language + controlHeight + 16 + gap, text = textHeading + 28;
    const footer = text + controlHeight + 18 + gap, back = footer + 56 + gap;
    return {
      orientation, compact, mobile, width, scale, textScale,
      height: Math.max(viewportHeight / scale, back + controlHeight + 24),
      title: box(33, 24, 324, 48),
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
      sliders: { music: box(24, music + 36, 342, 10), effects: box(24, effects + 36, 342, 10) },
      dividers: [box(24, 80, 342, 1)],
      footer: { x: 195 + dx, ys: [footer, footer + 24] }
    };
  }
  if (compact) {
    const margin = Math.min(24, 12 + Math.max(0, width - 600) / 20);
    const columnGap = 24, columnWidth = (width - 2 * margin - columnGap) / 2;
    const right = margin + columnWidth + columnGap;
    const rowGap = Math.max(0, controlHeight - 48);
    const gap = Math.max(0, (viewportHeight / scale - (390 + rowGap)) / 3);
    const sound = 86, music = 150 + rowGap + gap, effects = 230 + rowGap + 2 * gap;
    const language = sound + controlHeight + 12 + gap;
    const textHeading = Math.max(214 + rowGap + 2 * gap, language + controlHeight + 20);
    const text = textHeading + 28;
    const footer = Math.max(effects + 66, text + controlHeight + 16) + gap;
    const back = Math.max(footer + 28, viewportHeight / scale - controlHeight - 8);
    const pairWidth = (columnWidth - 12) / 2;
    const headingY = (row: number): number => row + (controlHeight - 18 * textScale) / 2;
    return {
      orientation, compact, mobile, width, scale, textScale,
      height: Math.max(viewportHeight / scale, back + controlHeight + 8),
      title: rect((width - 324) / 2, 14, 324, 48),
      headings: {
        sound: { x: margin, y: headingY(sound) },
        music: { x: margin, y: music }, effects: { x: margin, y: effects },
        language: { x: right, y: headingY(sound) }, text: { x: right, y: textHeading }
      },
      values: { music: { x: margin + columnWidth, y: music }, effects: { x: margin + columnWidth, y: effects } },
      choices: {
        on: rect(margin + columnWidth - 174, sound, 74), off: rect(margin + columnWidth - 88, sound, 88),
        auto: rect(right + columnWidth - 90, sound, 90),
        ru: rect(right, language, pairWidth), en: rect(right + pairWidth + 12, language, pairWidth),
        normal: rect(right, text, pairWidth), large: rect(right + pairWidth + 12, text, pairWidth),
        back: rect((width - 300) / 2, back, 300)
      },
      sliders: { music: rect(margin, music + 36, columnWidth, 10), effects: rect(margin, effects + 36, columnWidth, 10) },
      dividers: [rect(margin, 74, width - 2 * margin, 1)],
      footer: { x: width / 2, ys: [footer] }
    };
  }
  const backHeight = Math.max(64, controlHeight);
  const desktopRows = (gap: number) => {
    const sound = 118 + gap, music = sound + controlHeight + 32 + gap;
    const effects = music + Math.max(60, 48 / scale);
    const firstDivider = effects + 46 + gap, languageHeading = firstDivider + 20, language = languageHeading + 30;
    const text = language + controlHeight + 18 + gap, lastDivider = text + controlHeight + 12 + gap;
    const footer = lastDivider + 16, back = footer + 30 + gap;
    return { sound, music, effects, firstDivider, languageHeading, language, text, lastDivider, footer, back };
  };
  const minimumHeight = desktopRows(0).back + backHeight + 40;
  const extraHeight = Math.max(0, viewportHeight / scale - minimumHeight);
  // Ignore subpixel aspect-ratio rounding at the reference ratio.
  const gap = extraHeight >= 1 ? extraHeight / 6 : 0;
  const { sound, music, effects, firstDivider, languageHeading, language, text, lastDivider, footer, back } = desktopRows(gap);
  return {
    orientation, compact, mobile, width, scale, textScale,
    height: Math.max(viewportHeight / scale, back + backHeight + 40),
    title: rect(158, 32, 324, 48),
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
    dividers: [rect(56, 98, 528, 1), rect(56, firstDivider, 528, 1), rect(56, lastDivider, 528, 1)],
    footer: { x: 320, ys: [footer] }
  };
}
