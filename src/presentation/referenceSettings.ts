import type { ApplicationView } from '../contracts';
import { resolveLanguage, translate } from './localization';

type Rect = readonly [number, number, number, number];
type Label = 'title' | 'sound' | 'on' | 'off' | 'music' | 'effects' | 'language' | 'auto' | 'ru' | 'en' | 'text' | 'normal' | 'large' | 'saved' | 'back';
const words: Record<Label, string> = { title: 'НАСТРОЙКИ', sound: 'ЗВУК', on: 'ВКЛ', off: 'ВЫКЛ', music: 'МУЗЫКА', effects: 'ЗВУКИ', language: 'ЯЗЫК', auto: 'АВТОМАТИЧЕСКИ', ru: 'РУССКИЙ', en: 'ENGLISH', text: 'ТЕКСТ', normal: 'ОБЫЧНЫЙ', large: 'КРУПНЫЙ', saved: 'СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ', back: 'НАЗАД' };
const landscape: Record<Label, Rect> = {
  title: [298, 52, 540, 78], sound: [117, 210, 124, 36], on: [465, 210, 99, 36], off: [709, 210, 135, 36],
  music: [115, 313, 191, 36], effects: [118, 385, 159, 36], language: [116, 479, 128, 37],
  auto: [310, 480, 246, 30], ru: [588, 479, 157, 35], en: [787, 480, 144, 31], text: [116, 571, 146, 40],
  normal: [388, 571, 199, 39], large: [673, 571, 197, 39], saved: [195, 676, 635, 37], back: [367, 798, 287, 49],
};
const portrait: Record<Label, Rect> = {
  title: [221, 333, 585, 87], sound: [442, 460, 150, 39], on: [249, 548, 155, 36], off: [608, 548, 193, 36],
  music: [90, 663, 215, 38], effects: [90, 735, 215, 38], language: [418, 816, 188, 41],
  auto: [76, 907, 293, 36], ru: [432, 902, 214, 42], en: [731, 907, 204, 36], text: [430, 1002, 170, 41],
  normal: [159, 1088, 305, 40], large: [602, 1088, 242, 40], saved: [181, 1226, 666, 37], back: [335, 1374, 355, 52],
};
const portraitButtons: Partial<Record<Label, Rect>> = { on: [171,530,313,82], off: [538,530,313,82], auto: [55,889,329,77], ru: [403,889,280,77], en: [709,889,263,77], normal: [137,1073,359,78], large: [539,1073,345,78], back: [224,1350,580,104] };
const assets = new Map<string, HTMLImageElement>();
const glyphs = new Map<string, HTMLCanvasElement>();
function source(orientation: string): HTMLImageElement {
  const url = `${import.meta.env.BASE_URL}images/settings-${orientation}.webp`;
  let image = assets.get(url);
  if (!image) { image = new Image(); image.src = url; assets.set(url, image); }
  return image;
}
const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The canvas paints reference sprites; native controls retain keyboard / touch semantics. */
export function referenceSettings(view: ApplicationView): string {
  const disabled = view.settingsError ? 'disabled' : '';
  const choice = (label: Label, action: string, data: string, selected: boolean): string => `<button class="settings-control" data-setting="${label}" data-action="${action}" ${data} aria-pressed="${selected}" ${disabled}><span class="settings-accessible-label">${words[label]}</span></button>`;
  return `<section class="reference-settings" aria-labelledby="settings-title"><picture class="settings-scenery" aria-hidden="true"><source media="(orientation: portrait)" srcset="${import.meta.env.BASE_URL}images/menu-layers/portrait-background-v2.webp"><img src="${import.meta.env.BASE_URL}images/menu-layers/landscape-background-v2.webp" alt=""></picture><div class="settings-board"><canvas class="settings-art" aria-hidden="true"></canvas><h1 id="settings-title" class="settings-accessible-label" tabindex="-1">Настройки</h1>${choice('on', 'sound-toggle', 'data-enabled="true"', view.settings.soundEnabled)}${choice('off', 'sound-toggle', 'data-enabled="false"', !view.settings.soundEnabled)}<label class="settings-control settings-slider" data-setting="music"><span class="settings-accessible-label">Музыка</span><input aria-label="Музыка" data-action="music-volume" type="range" min="0" max="100" step="1" value="${view.settings.musicVolume}" ${disabled}></label><label class="settings-control settings-slider" data-setting="effects"><span class="settings-accessible-label">Звуки</span><input aria-label="Звуки" data-action="effects-volume" type="range" min="0" max="100" step="1" value="${view.settings.effectsVolume}" ${disabled}></label>${choice('auto', 'language', 'data-language="auto"', view.settings.language === 'auto')}${choice('ru', 'language', 'data-language="ru"', view.settings.language === 'ru')}${choice('en', 'language', 'data-language="en"', view.settings.language === 'en')}${choice('normal', 'text-size', 'data-size="normal"', view.settings.textSize === 'normal')}${choice('large', 'text-size', 'data-size="large"', view.settings.textSize === 'large')}<button class="settings-control" data-setting="back" data-action="back"><span class="settings-accessible-label">Назад</span></button></div>${view.settingsError ? `<div class="reference-settings-error" role="alert"><p>${escape(view.settingsError)}</p><button data-action="retry-settings">Повторить сохранение</button><button data-action="cancel-settings">Вернуться к сохранённому</button></div>` : ''}</section>`;
}

/** Extract the warm letter pixels at render time, keeping the actual reference letterforms. */
function lettering(image: HTMLImageElement, label: Label, p: boolean): HTMLCanvasElement {
  const key = `${p}/${label}`;
  const found = glyphs.get(key);
  if (found) return found;
  const [x, y, w, h] = (p ? portrait : landscape)[label];
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, x, y, w, h, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i]!, g = pixels.data[i + 1]!, b = pixels.data[i + 2]!;
    if (r < 157 || g < 135 || b < 100 || r < b * 1.08) pixels.data[i + 3] = 0;
  }
  context.putImageData(pixels, 0, 0); glyphs.set(key, canvas); return canvas;
}

function pixelText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): void {
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width / 2); canvas.height = Math.ceil(height / 2);
  const c = canvas.getContext('2d')!;
  c.font = `bold ${Math.floor(height * .49)}px Georgia, serif`; c.fillStyle = '#f0cfa4'; c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 2);
  context.imageSmoothingEnabled = false; context.drawImage(canvas, x, y, width, height);
}

export function layoutReferenceSettings(root: HTMLElement, view: ApplicationView): void {
  const page = root.querySelector<HTMLElement>('.reference-settings');
  const board = page?.querySelector<HTMLElement>('.settings-board');
  const canvas = page?.querySelector<HTMLCanvasElement>('.settings-art');
  if (!page || !board || !canvas) return;
  const width = page.clientWidth, height = page.clientHeight;
  if (!width || !height) return;
  page.dataset.ready = 'loading';
  const p = height >= width, original = p ? portrait : landscape;
  const virtualWidth = p ? 1024 : 1672;
  // Short landscape scrolls instead of shrinking neighboring slider targets below 44px.
  const scale = p ? width / 1024 : Math.max(.62, Math.min(width / 1672, height / 941));
  const baseHeight = p ? Math.max(1536, height / scale) : 941;
  const panelTop = p ? Math.max(300, baseHeight * .2) : 0;
  const stretch = p ? (baseHeight - panelTop) / 1236 : 1;
  const soundGap = p ? Math.max(0, 48 / scale - (146 * stretch - 41)) / stretch : 0;
  const sliderGap = p ? Math.max(0, 48 / (scale * stretch) - 72) : 0;
  const mapY = (y: number): number => p ? panelTop + (y - 300 + (y >= 650 ? soundGap : 0) + (y >= 735 ? sliderGap : 0)) * stretch : y;
  const virtualHeight = p ? Math.max(baseHeight, mapY(1350) + 144) : baseHeight;
  board.style.width = `${virtualWidth * scale}px`; board.style.height = `${Math.floor(virtualHeight * scale)}px`;
  board.style.setProperty('--reference-scale', String(scale));
  page.dataset.orientation = p ? 'portrait' : 'landscape';
  page.style.setProperty('--panel-width', `${990 * scale}px`);
  page.style.setProperty('--scene-height', `${panelTop * scale}px`);
  const image = source(p ? 'portrait' : 'landscape');
  if (!image.complete || !image.naturalWidth) {
    image.addEventListener('load', () => { if (canvas.isConnected) layoutReferenceSettings(root, view); }, { once: true }); return;
  }
  canvas.width = virtualWidth; canvas.height = Math.ceil(virtualHeight);
  const c = canvas.getContext('2d')!; c.imageSmoothingEnabled = false;
  if (p) c.drawImage(image, 0, 300, 1024, 1236, 0, panelTop, 1024, virtualHeight - panelTop);
  else c.drawImage(image, 0, 0, 990, 941, 0, 0, 990, 941);
  // Sample real unlettered stone instead of approximating the material with CSS.
  const tile = document.createElement('canvas'); tile.width = 96; tile.height = 32;
  tile.getContext('2d')!.drawImage(image, p ? 610 : 100, p ? 423 : 167, 96, 32, 0, 0, 96, 32);
  const texture = c.createPattern(tile, 'repeat')!;
  const clear = (x: number, y: number, w: number, h: number): void => { c.fillStyle = texture; c.fillRect(x, y, w, h); };
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  const textScale = view.settings.textSize === 'large' ? 1.12 : 1;
  const drawLabel = (label: Label, centerY?: number): void => {
    const [sx, sy, sw, sh] = original[label];
    const w = sw * (label === 'title' ? 1 : textScale), h = sh * (label === 'title' ? 1 : textScale);
    const x = sx + (sw - w) / 2, y = centerY === undefined ? mapY(sy) + (sh - h) / 2 : centerY - h / 2;
    if (language === 'ru' || label === 'en') c.drawImage(lettering(image, label, p), x, y, w, h);
    else pixelText(c, translate(words[label], language), x - 5, y, w + 10, h);
  };
  // Replace content independently, so no selected value or volume is baked into the artwork.
  if (p) clear(35, mapY(329) - 8, 952, virtualHeight - mapY(329) - 105);
  else clear(77, 47, 852, 828);
  const slice = (rect: Rect): void => { const [x,y,w,h] = rect; c.drawImage(image, x,y,w,h,x,mapY(y),w,h); };
  if (p) {
    for (const y of [476, 832, 1024]) { c.fillStyle = '#c48456'; c.fillRect(75, mapY(y), 330, 4); c.fillRect(622, mapY(y), 328, 4); }
    for (const y of [1193, 1294]) { c.fillStyle = '#c48456'; c.fillRect(75, mapY(y), 875, 4); }
  } else {
    for (const rect of [[245, 152, 622, 16], [79, 278, 854, 8], [79, 448, 856, 8], [79, 542, 854, 8], [79, 642, 854, 8], [131, 748, 742, 20]] as const) slice(rect);
  }
  for (const label of ['title', 'sound', 'music', 'effects', 'language', 'text', 'saved'] as const) drawLabel(label);
  const frame = (x: number, y: number, w: number, h: number, selected: boolean, back: boolean): void => {
    const sy = p ? (back ? 1350 : 530) : 786, sx = p ? (back ? 224 : selected ? 171 : 538) : 317, sw = p ? (back ? 580 : 313) : 384, sh = p ? (back ? 104 : 82) : 84;
    // Nine-slice the original portrait buttons. Their centers remain free of baked text.
    const art = p ? source('portrait') : image;
    if (!art.complete || !art.naturalWidth) { art.addEventListener('load', () => { if (canvas.isConnected) layoutReferenceSettings(root, view); }, { once:true }); return; }
    c.fillStyle = selected ? '#4b3930' : '#222d41'; c.fillRect(x + 8, y + 8, w - 16, h - 16);
    const edge = p && back ? 22 : 12;
    for (const [a,b,d,e] of [[0,0,edge,edge],[sw-edge,0,edge,edge],[0,sh-edge,edge,edge],[sw-edge,sh-edge,edge,edge]] as const) c.drawImage(art,sx+a,sy+b,d,e,x+(a? w-edge:0),y+(b? h-edge:0),edge,edge);
    c.drawImage(art,sx+edge,sy,sw-edge*2,edge,x+edge,y,w-edge*2,edge);
    c.drawImage(art,sx+edge,sy+sh-edge,sw-edge*2,edge,x+edge,y+h-edge,w-edge*2,edge);
    c.drawImage(art,sx,sy+edge,edge,sh-edge*2,x,y+edge,edge,h-edge*2);
    c.drawImage(art,sx+sw-edge,sy+edge,edge,sh-edge*2,x+w-edge,y+edge,edge,h-edge*2);
  };
  const choices: [Label, boolean][] = [['on', view.settings.soundEnabled], ['off', !view.settings.soundEnabled], ['auto', view.settings.language === 'auto'], ['ru', view.settings.language === 'ru'], ['en', view.settings.language === 'en'], ['normal', view.settings.textSize === 'normal'], ['large', view.settings.textSize === 'large'], ['back', false]];
  for (const [label, selected] of choices) {
    const [x,y,w,h] = original[label];
    const frameRect = p ? portraitButtons[label] : label === 'back' ? [317,786,384,84] as const : undefined;
    if (frameRect) frame(frameRect[0], mapY(frameRect[1]), frameRect[2], frameRect[3], selected, label === 'back');
    else if (selected) { c.fillStyle = '#dc9158'; c.fillRect(x - 10, mapY(y) + h + 7, w + 20, 7); }
    drawLabel(label, frameRect ? mapY(frameRect[1]) + frameRect[3]/2 : undefined);
    const element = board.querySelector<HTMLElement>(`[data-setting="${label}"]`)!;
    const hit = frameRect ?? [x - 15, y - 20, w + 30, h + 40];
    const hitHeight = Math.max(44, hit[3]! * scale);
    element.style.cssText = `left:${hit[0]!*scale}px;top:${mapY(hit[1]!)*scale-(hitHeight-hit[3]!*scale)/2}px;width:${hit[2]!*scale}px;height:${hitHeight}px;`;
  }
  for (const [label, volume] of [['music', view.settings.musicVolume], ['effects', view.settings.effectsVolume]] as const) {
    const x = p ? 348 : 449, y = mapY(p ? (label === 'music' ? 676 : 748) : (label === 'music' ? 325 : 397));
    const w = p ? 582 : 465, h = p ? 10 : 12;
    // Original track, fill and handle sprites; only their lengths / positions change.
    c.drawImage(image, p ? 800 : 811, p ? 677 : 324, p ? 122 : 100, h, x, y, w, h);
    if (volume > 0) c.drawImage(image, p ? 355 : 453, p ? 677 : 324, p ? 240 : 235, h, x, y, w * volume / 100, h);
    const handle: Rect = p ? [740, 662, 38, 39] : [764, 312, 33, 35];
    c.drawImage(image, ...handle, x + w * volume / 100 - handle[2]/2, y - (handle[3]-h)/2, handle[2], handle[3]);
    if (!p) c.drawImage(image, 368, 311, 52, 39, 368, y - 14, 52, 39);
    const element = board.querySelector<HTMLElement>(`[data-setting="${label}"]`)!;
    const thumbWidth = Math.max(12, handle[2] * scale);
    element.style.cssText = `left:${x*scale-thumbWidth/2}px;top:${y*scale-22}px;width:${w*scale+thumbWidth}px;height:44px;--slider-thumb:${thumbWidth}px;`;
  }
  // A failed write replaces the promise of autosaving with actionable error UI.
  if (view.settingsError) { const [x,y,w,h] = original.saved; clear(x-30,mapY(y)-5,w+60,h+10); }
  page.dataset.ready = 'true';
}

