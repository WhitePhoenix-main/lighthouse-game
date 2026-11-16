import type { UserSettings } from '../contracts';
import type { Language } from './localization';
import type { SettingsChoice, SettingsLayout, SettingsRect } from './settingsLayout';
import { drawSettingsPixelText, settingsTextWidth } from './settingsLettering';

export interface SettingsAssets {
  frame: HTMLImageElement;
  labelsRu: HTMLImageElement;
  labelsEn: HTMLImageElement;
}
let assetsPromise: Promise<SettingsAssets> | undefined;
function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load settings artwork: ${path}`));
    image.src = `${import.meta.env.BASE_URL}images/${path}`;
  });
}
export function loadSettingsAssets(): Promise<SettingsAssets> {
  assetsPromise ??= Promise.all([
    loadImage('menu-buttons-v2/frame-states.png'), loadImage('menu-buttons-v2/labels-ru.png'),
    loadImage('menu-buttons-v2/labels-en.png')
  ]).then(([frame, labelsRu, labelsEn]) => {
    if (!frame || !labelsRu || !labelsEn) throw new Error('Incomplete settings artwork');
    return { frame, labelsRu, labelsEn };
  }).catch((error: unknown) => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}

function frame(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, rect: SettingsRect, opacity: number): void {
  const { x, y, width, height } = rect;
  const corner = Math.min(10, width / 2, height / 2);
  const sourceX = [0, 10, 230], sourceY = [0, 10, 38];
  const sourceW = [10, 220, 10], sourceH = [10, 28, 10];
  const targetX = [x, x + corner, x + width - corner], targetY = [y, y + corner, y + height - corner];
  const targetW = [corner, width - 2 * corner, corner], targetH = [corner, height - 2 * corner, corner];
  ctx.save(); ctx.globalAlpha = opacity;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    ctx.drawImage(atlas, sourceX[col]!, sourceY[row]!, sourceW[col]!, sourceH[row]!, targetX[col]!, targetY[row]!, targetW[col]!, targetH[row]!);
  }
  ctx.restore();
}
function pixelDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, step = 1): void {
  ctx.fillStyle = color;
  for (let y = -radius; y < radius; y += step) for (let x = -radius; x < radius; x += step) {
    if ((x + step / 2) ** 2 + (y + step / 2) ** 2 <= radius ** 2) ctx.fillRect(cx + x, cy + y, step, step);
  }
}
function capsule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  if (width <= 0) return;
  const radius = Math.min(height / 2, width / 2);
  ctx.fillStyle = color; ctx.fillRect(x + radius, y, Math.max(0, width - 2 * radius), height);
  pixelDisc(ctx, x + radius, y + height / 2, radius, color);
  pixelDisc(ctx, x + width - radius, y + height / 2, radius, color);
}
function slider(ctx: CanvasRenderingContext2D, rect: SettingsRect, volume: number, enabled: boolean): void {
  const { x, y, width, height } = rect;
  const level = Math.max(0, Math.min(100, volume)) / 100;
  const cx = x + 12 + Math.round((width - 24) * level), cy = y + height / 2;
  ctx.save(); ctx.globalAlpha = enabled ? 1 : .7;
  capsule(ctx, x, cy - 5, width, 10, '#19395d');
  capsule(ctx, x + 2, cy - 3, width - 4, 6, '#142d4c');
  capsule(ctx, x + 3, cy - 2, cx - x, 4, '#ed783c');
  ctx.restore();
  // Keep the bright circular thumb legible even while the master sound is muted.
  pixelDisc(ctx, cx, cy + 2, 14, '#07101a', 2);
  pixelDisc(ctx, cx, cy, 12, '#ffe3ad', 2);
  pixelDisc(ctx, cx, cy + 1, 10, '#ed783c', 2);
  pixelDisc(ctx, cx, cy - 1, 9, '#ffc671', 2);
  pixelDisc(ctx, cx - 3, cy - 4, 3, '#ffe3ad');
}
const copy = {
  ru: { sound: 'ЗВУК', music: 'МУЗЫКА', effects: 'ЗВУКИ', language: 'ЯЗЫК', text: 'ТЕКСТ', on: 'ВКЛ', off: 'ВЫКЛ', auto: 'АВТО', ru: 'РУССКИЙ', en: 'ENGLISH', normal: 'ОБЫЧНЫЙ', large: 'КРУПНЫЙ', back: 'НАЗАД', footer: ['СОХРАНЯЕТСЯ', 'АВТОМАТИЧЕСКИ'] },
  en: { sound: 'SOUND', music: 'MUSIC', effects: 'EFFECTS', language: 'LANGUAGE', text: 'TEXT', on: 'ON', off: 'OFF', auto: 'AUTO', ru: 'RUSSIAN', en: 'ENGLISH', normal: 'NORMAL', large: 'LARGE', back: 'BACK', footer: ['SAVED', 'AUTOMATICALLY'] }
} as const;

export function paintSettingsArtwork(
  ctx: CanvasRenderingContext2D, layout: SettingsLayout, settings: Readonly<UserSettings>,
  language: Language, assets: SettingsAssets, saved: boolean
): void {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const words = copy[language], textScale = 2 * layout.textScale;
  const title = layout.title;
  ctx.save(); ctx.globalAlpha = .9;
  if (language === 'ru') ctx.drawImage(assets.labelsRu, 280, 10, 162, 24, title.x, title.y, title.width, title.height);
  else {
    const scale = Math.min(title.width / 144, title.height / 21);
    ctx.drawImage(assets.labelsEn, 289, 13, 144, 21, title.x + (title.width - 144 * scale) / 2, title.y + (title.height - 21 * scale) / 2, 144 * scale, 21 * scale);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(139,112,79,.42)';
  for (const rect of layout.dividers) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  for (const key of ['sound', 'music', 'effects', 'language', 'text'] as const) {
    const point = layout.headings[key];
    const volumeHeading = key === 'music' || key === 'effects';
    const muted = !settings.soundEnabled && volumeHeading;
    let headingScale = textScale;
    if (volumeHeading) {
      const volume = key === 'music' ? settings.musicVolume : settings.effectsVolume;
      const available = layout.values[key].x - point.x - settingsTextWidth(`${Math.round(volume)}%`, textScale) - 12;
      headingScale = Math.min(textScale, available / settingsTextWidth(words[key], 1));
    }
    drawSettingsPixelText(ctx, words[key], point.x, point.y, headingScale, muted ? '#aab7be' : '#cfc3ac');
  }
  const selected: Record<SettingsChoice, boolean> = {
    on: settings.soundEnabled, off: !settings.soundEnabled, auto: settings.language === 'auto',
    ru: settings.language === 'ru', en: settings.language === 'en', normal: settings.textSize === 'normal', large: settings.textSize === 'large', back: false
  };
  for (const key of ['on', 'off', 'auto', 'ru', 'en', 'normal', 'large', 'back'] as const) {
    const rect = layout.choices[key], active = selected[key], back = key === 'back';
    frame(ctx, assets.frame, rect, back ? 1 : active ? .88 : .36);
    const text = words[key];
    const preferred = (back ? 3 : 2) * layout.textScale;
    const scale = Math.min(preferred, (rect.width - 22) / settingsTextWidth(text, 1), (rect.height - 15) / 12);
    drawSettingsPixelText(ctx, text, rect.x + rect.width / 2, rect.y + (rect.height - 9 * scale) / 2 - (text.includes('Й') ? -scale : 0), scale, back ? '#dfc7a2' : active ? '#ddc8a4' : '#aebac1', 'center');
    if (active) { ctx.fillStyle = '#c5a276'; ctx.fillRect(rect.x + rect.width / 2 - 17, rect.y + rect.height - 8, 34, 2); }
  }
  for (const key of ['music', 'effects'] as const) {
    const volume = key === 'music' ? settings.musicVolume : settings.effectsVolume;
    const point = layout.values[key];
    drawSettingsPixelText(ctx, `${Math.round(volume)}%`, point.x, point.y, textScale, '#aab7be', 'right');
    slider(ctx, layout.sliders[key], volume, settings.soundEnabled);
  }
  if (saved) {
    const lines: readonly string[] = layout.footer.ys.length > 1 ? words.footer : [words.footer.join(' ')];
    for (let index = 0; index < lines.length; index++) {
      const y = layout.footer.ys[index], line = lines[index];
      if (y !== undefined && line !== undefined) drawSettingsPixelText(ctx, line, layout.footer.x, y, textScale, '#93a2ac', 'center');
    }
  }
  ctx.restore();
}
