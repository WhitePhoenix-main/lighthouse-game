import type { ApplicationView, TextSize } from '../../contracts';
import { drawSettingsPixelText, settingsTextWidth } from '../shared/settingsLettering';
import { resolveLanguage, translate } from '../shared/localization';

export interface MenuRect { x: number; y: number; width: number; height: number }
export interface GameMenuLayout {
  mobile: boolean; horizontal: boolean; floor: MenuRect | null;
  back: MenuRect; continue: MenuRect; trials: MenuRect; newGame: MenuRect;
}

/** Native reference coordinates. Transparent atlas padding is included in each rect. */
export const GAME_MENU_COMPOSITIONS = {
  desktop: { width: 1672, height: 941,
    continue: { x: 75, y: 510, width: 610, height: 352 },
    trials: { x: 680, y: 625, width: 443, height: 232 },
    newGame: { x: 1121, y: 625, width: 465, height: 232 },
    back: { x: 54, y: 54, width: 275, height: 79 },
    floor: { x: 0, y: 730, width: 1672, height: 211 } },
  mobile: { width: 841, height: 1870,
    continue: { x: 10, y: 670, width: 814, height: 510 },
    trials: { x: 30, y: 1190, width: 780, height: 210 },
    newGame: { x: 25, y: 1398, width: 790, height: 205 },
    back: { x: 175, y: 1625, width: 485, height: 140 },
    floor: { x: 0, y: 1100, width: 841, height: 770 } }
} as const;

/** Scale interface artwork uniformly; the shared scenery keeps its own unchanged camera. */
export function gameMenuLayout(width: number, height: number, coarse = false): GameMenuLayout {
  const mobile = width < 960 || (coarse && width < 1280);
  const horizontal = mobile && width > height;
  // A landscape phone uses the same horizontal stone arrangement as a computer.
  const portrait = mobile && !horizontal;
  const source = GAME_MENU_COMPOSITIONS[portrait ? 'mobile' : 'desktop'];
  const scale = Math.min(width / source.width, height / source.height);
  const left = (width - source.width * scale) / 2, top = height - source.height * scale;
  const rect = (value: MenuRect): MenuRect => ({ x: left + value.x * scale, y: top + value.y * scale,
    width: value.width * scale, height: value.height * scale });
  const backScale = Math.max(scale, 44 / source.back.height);
  const back = { x: portrait ? left + (source.back.x + source.back.width / 2) * scale - source.back.width * backScale / 2 : Math.max(12, source.back.x * scale),
    y: portrait ? top + (source.back.y + source.back.height / 2) * scale - source.back.height * backScale / 2 : Math.max(12, source.back.y * scale),
    width: source.back.width * backScale, height: source.back.height * backScale };
  return { mobile, horizontal, back, floor: rect(source.floor),
    continue: rect(source.continue), trials: rect(source.trials), newGame: rect(source.newGame) };
}

export function gameMenuChapter(view: ApplicationView): { chapter: string; number: number; night: number } {
  const main = view.nights.filter(night => !night.optional);
  const selected = main.find(night => night.id === view.selectedNightId) ?? main[0];
  const chapters = [...new Set(main.map(night => night.chapter))];
  return { chapter: selected?.chapter ?? 'Туманный берег',
    number: Math.max(1, chapters.indexOf(selected?.chapter ?? '') + 1),
    night: Math.max(1, main.filter(night => night.chapter === selected?.chapter).findIndex(night => night.id === selected?.id) + 1) };
}

const art = (sprite: string): string => `<span class="game-menu-sprite" aria-hidden="true" style="--game-menu-art:url('${import.meta.env.BASE_URL}images/game-menu/${sprite}.png')"></span>`;
const escape = (value: string): string => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
export function referenceGameMenu(view: ApplicationView, confirmReset = false): string {
  const blocked = !!view.error;
  const control = (name: string, action: string, label: string, disabled = false): string =>
    `<button class="game-menu-control game-menu-${name}" data-game-control="${name}" data-action="${action}" ${disabled ? 'disabled' : ''}>${art(`${name}-desktop`)}<canvas class="game-menu-lettering" aria-hidden="true"></canvas><span class="game-menu-accessible">${label}</span></button>`;
  return `<section class="reference-game-menu" aria-labelledby="game-menu-title" data-ready="pending"><h1 id="game-menu-title" class="game-menu-accessible" tabindex="-1">Выбор игры</h1>
    <div class="game-menu-board"><img class="game-menu-floor" src="${import.meta.env.BASE_URL}images/game-menu/floor-desktop.png" draggable="false" alt="">
    ${control('continue', 'continue-game', 'Продолжить', blocked || !view.hasProgress)}
    ${control('trials', 'trials', 'Испытания', blocked)}${control('new-game', 'new-game', 'Новая игра', blocked)}
    ${control('back', 'game-menu-back', 'Назад', blocked)}</div>
    ${!view.hasProgress ? '<p class="game-menu-accessible" id="no-campaign">Сохранения пока нет. Начните новую игру.</p>' : ''}
    <p class="game-menu-load-error" role="status" hidden></p>
    ${confirmReset ? `<div class="game-menu-confirm-scrim"><section class="game-menu-confirm" role="alertdialog" aria-modal="true" aria-labelledby="new-game-title" aria-describedby="new-game-description"><h2 id="new-game-title">${view.hasProgress ? 'Начать новую игру?' : 'Не удалось начать игру'}</h2><p id="new-game-description">${view.error ? escape(view.error) : 'Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.'}</p><button data-action="cancel-new-game">Отмена</button>${view.error ? '<button data-action="save">Повторить сохранение</button>' : '<button data-action="confirm-new-game">Начать заново</button>'}</section></div>` : ''}</section>`;
}

const decoded = new Map<string, Promise<void>>();
function loadSprite(path: string): Promise<void> {
  let pending = decoded.get(path);
  if (!pending) { const image = new Image(); image.src = path; pending = image.decode(); decoded.set(path, pending); void pending.catch(() => decoded.delete(path)); }
  return pending;
}

function position(element: HTMLElement, rect: MenuRect): void {
  Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}
function text(context: CanvasRenderingContext2D, label: string, x: number, y: number, maxWidth: number, scale: number, color: string): void {
  const value = label.toUpperCase();
  const fitted = Math.min(scale, maxWidth / Math.max(1, settingsTextWidth(value, 1)));
  drawSettingsPixelText(context, value, x, y, fitted, color, 'center');
}

/** Include the Й accent and the shared pixel font's two-pixel shadow in line spacing. */
export function gameMenuMetadataLayout(height: number, scale: number, mobile: boolean): {
  chapter: number; name: number; night: number | null;
} {
  const glyphHeight = scale * 9 + 2, accent = scale * 3, gap = Math.max(2, height * .006);
  const chapter = height * (mobile ? .20 : .23);
  const name = Math.max(height * (mobile ? .30 : .335), chapter + glyphHeight + accent + gap);
  const night = Math.max(height * (mobile ? .40 : .445), name + glyphHeight + gap);
  const divider = height * (mobile ? .53 : .58);
  if (night + glyphHeight <= divider - 2) return { chapter, name, night };
  const compactChapter = height * (mobile ? .22 : .25);
  return { chapter: compactChapter, name: Math.max(height * (mobile ? .40 : .43), compactChapter + glyphHeight + accent + gap), night: null };
}

function paintLabel(button: HTMLButtonElement, name: string, mobile: boolean, view: ApplicationView, textSize: TextSize): void {
  const canvas = button.querySelector<HTMLCanvasElement>('canvas')!;
  const w = button.clientWidth, h = button.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  const t = (value: string): string => translate(value, language);
  // These are the same letterforms, ivory and muted inks used by settingsArtwork.
  const ink = button.disabled ? '#aebac1' : '#dfc7a2';
  const multiplier = textSize === 'large' ? 1.12 : 1;
  const metadataInk = button.disabled ? '#93a2ac' : '#cfc3ac';
  const native = GAME_MENU_COMPOSITIONS[mobile ? 'mobile' : 'desktop'];
  const source = name === 'new-game' ? native.newGame : native[name as 'continue' | 'trials' | 'back'];
  const scale = w / source.width;
  const font = (pixels: number, minimum = 14): number => Math.max(minimum, pixels * scale) / 9 * multiplier;
  if (name === 'back') {
    const size = Math.min(font(mobile ? 40 : 30), w * .76 / settingsTextWidth(t('Назад').toUpperCase(), 1));
    text(ctx, t('Назад'), w / 2, (h - 9 * size) / 2, w * .76, size, ink);
    button.setAttribute('aria-label', t('Назад'));
    return;
  }
  if (name === 'continue') {
    const chapter = gameMenuChapter(view);
    const numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][chapter.number - 1] ?? String(chapter.number);
    const metadataSize = font(mobile ? 28 : 22, 12);
    const rows = gameMenuMetadataLayout(h, metadataSize, mobile);
    const chapterLabel = `${t('Глава')} ${numeral}`;
    const nightLabel = `${t('Ночь')} ${chapter.night}`;
    text(ctx, view.hasProgress ? rows.night === null ? `${chapterLabel}  ${nightLabel}` : chapterLabel : t('Сохранения нет'),
      w / 2, rows.chapter, w * (rows.night === null ? .60 : .76), metadataSize, metadataInk);
    if (view.hasProgress) {
      text(ctx, t(chapter.chapter), w / 2, rows.name, w * .76, metadataSize, metadataInk);
      if (rows.night !== null) text(ctx, nightLabel, w / 2, rows.night, w * .76, metadataSize, metadataInk);
    }
    // The small stone divider belongs to the artwork, not a second drawn UI line.
    text(ctx, t('Продолжить'), w / 2, h * (mobile ? .63 : .675), w * .82, font(mobile ? 66 : 50, 19), ink);
    button.setAttribute('aria-label', view.hasProgress ? `${t('Продолжить')}: ${t(chapter.chapter)}, ${t('Ночь').toLowerCase()} ${chapter.night}` : t('Продолжить — сохранения нет'));
    if (!view.hasProgress) button.setAttribute('aria-describedby', 'no-campaign');
  } else {
    const label = t(name === 'trials' ? 'Испытания' : 'Новая игра');
    const size = font(mobile ? 48 : 38);
    text(ctx, label, w * (mobile ? .63 : .50), mobile ? (h - 9 * size) / 2 : h * .56,
      w * (mobile ? .60 : .82), size, ink);
    button.setAttribute('aria-label', label);
  }
}

/** Decoding gates the entry animation; rerenders and rotation retain the same scene. */
export function layoutGameMenu(root: HTMLElement, view: ApplicationView): void {
  const page = root.querySelector<HTMLElement>('.reference-game-menu');
  if (!page) return;
  const layout = gameMenuLayout(page.clientWidth, page.clientHeight, window.matchMedia('(pointer: coarse)').matches);
  const artwork = layout.mobile && !layout.horizontal ? 'mobile' : 'desktop';
  page.dataset.layout = layout.mobile ? 'mobile' : 'desktop';
  page.dataset.orientation = page.clientWidth > page.clientHeight ? 'landscape' : 'portrait';
  page.dataset.artwork = artwork;
  const floor = page.querySelector<HTMLImageElement>('.game-menu-floor')!;
  floor.hidden = !layout.floor;
  floor.src = `${import.meta.env.BASE_URL}images/game-menu/floor-${artwork}.png`;
  if (layout.floor) position(floor, layout.floor);
  const paths: string[] = [];
  for (const button of page.querySelectorAll<HTMLButtonElement>('[data-game-control]')) {
    const name = button.dataset.gameControl!;
    const rect = name === 'new-game' ? layout.newGame : layout[name as 'back' | 'continue' | 'trials'];
    position(button, rect);
    const sprite = `${name}-${artwork}`;
    const path = `${import.meta.env.BASE_URL}images/game-menu/${sprite}.png`;
    button.querySelector<HTMLElement>('.game-menu-sprite')!.style.setProperty('--game-menu-art', `url('${new URL(path, document.baseURI).href}')`);
    paths.push(path);
    paintLabel(button, name, artwork === 'mobile', view, view.settings.textSize);
  }
  if (layout.floor) paths.push(floor.src);
  // A rotation may request another sprite family while the first is decoding.
  const request = paths.join('|');
  if (page.dataset.assets !== request || page.dataset.ready === 'pending') {
    page.dataset.assets = request;
    void Promise.all(paths.map(loadSprite)).then(() => {
    if (page.isConnected && page.dataset.assets === request) {
      page.dataset.ready = 'true';
      page.classList.remove('game-menu-art-failed');
      page.querySelector<HTMLElement>('.game-menu-load-error')!.hidden = true;
    }
  }).catch(() => {
    if (!page.isConnected || page.dataset.assets !== request) return;
    page.dataset.ready = 'error';
    const status = page.querySelector<HTMLElement>('.game-menu-load-error')!;
    status.hidden = false; status.textContent = translate('Не удалось загрузить оформление меню. Обновите страницу.', resolveLanguage(view.settings.language, undefined, navigator.languages));
    page.classList.add('game-menu-art-failed');
  });
  }
}
