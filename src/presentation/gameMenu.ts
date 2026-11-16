import type { ApplicationView, TextSize } from '../contracts';
import { drawSettingsPixelText, settingsTextWidth } from './settingsLettering';
import { resolveLanguage, translate } from './localization';

export interface MenuRect { x: number; y: number; width: number; height: number }
export interface GameMenuLayout {
  mobile: boolean; horizontal: boolean; floor: MenuRect | null;
  back: MenuRect; continue: MenuRect; trials: MenuRect; newGame: MenuRect;
}

/** Interface coordinates only; the existing scenery keeps its independent world crop. */
export function gameMenuLayout(width: number, height: number, coarse = false): GameMenuLayout {
  const mobile = width < 960 || (coarse && width < 1280);
  const horizontal = mobile && width > height;
  const back = { x: 16, y: 16, width: 52, height: 44 };
  if (!mobile) {
    const scale = Math.min((width - 48) / 768, height / 540, 2.4);
    const left = (width - 768 * scale) / 2, bottom = height - 24;
    return { mobile, horizontal, back,
      floor: { x: left, y: height - 108 * scale + 8, width: 768 * scale, height: 108 * scale },
      continue: { x: left + 12 * scale, y: bottom - 128 * scale, width: 256 * scale, height: 128 * scale },
      trials: { x: left + 280 * scale, y: bottom - 96 * scale, width: 224 * scale, height: 96 * scale },
      newGame: { x: left + 516 * scale, y: bottom - 96 * scale, width: 224 * scale, height: 96 * scale }
    };
  }
  if (horizontal) {
    const w = Math.min(352, width * .45), x = 80, gap = 10;
    const primaryHeight = Math.max(112, Math.min(136, height * .36));
    const secondaryHeight = Math.max(48, Math.min(60, height * .16));
    const total = primaryHeight + 2 * secondaryHeight + gap * 2;
    const y = Math.max(16, height - total - 16);
    return { mobile, horizontal, floor: null, back,
      continue: { x, y, width: w, height: primaryHeight },
      trials: { x, y: y + primaryHeight + gap, width: w, height: secondaryHeight },
      newGame: { x, y: y + primaryHeight + secondaryHeight + 2 * gap, width: w, height: secondaryHeight }
    };
  }
  const w = Math.min(440, width - 32), x = (width - w) / 2;
  const primaryHeight = Math.min(168, Math.max(122, w * .425));
  const secondaryHeight = Math.max(52, Math.min(72, w * .20)), gap = 12;
  const total = primaryHeight + 2 * secondaryHeight + gap * 2;
  const y = Math.max(80, height - total - 20);
  return { mobile, horizontal, floor: null, back,
    continue: { x, y, width: w, height: primaryHeight },
    trials: { x, y: y + primaryHeight + gap, width: w, height: secondaryHeight },
    newGame: { x, y: y + primaryHeight + secondaryHeight + 2 * gap, width: w, height: secondaryHeight }
  };
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
    `<button class="game-menu-control game-menu-${name}" data-game-control="${name}" data-action="${action}" ${disabled ? 'disabled' : ''}>${art(name === 'back' ? 'back' : name === 'continue' ? 'continue-desktop' : `${name}-desktop`)}<canvas class="game-menu-lettering" aria-hidden="true"></canvas><span class="game-menu-accessible">${label}</span></button>`;
  return `<section class="reference-game-menu" aria-labelledby="game-menu-title" data-ready="pending"><h1 id="game-menu-title" class="game-menu-accessible" tabindex="-1">Выбор игры</h1>
    <div class="game-menu-board"><img class="game-menu-floor" src="${import.meta.env.BASE_URL}images/game-menu/floor-desktop.png" draggable="false" alt="">
    ${control('continue', 'continue-game', 'Продолжить', blocked || !view.hasProgress)}
    ${control('trials', 'trials', 'Испытания', blocked)}${control('new-game', 'new-game', 'Новая игра', blocked)}</div>
    ${control('back', 'game-menu-back', 'Назад', blocked)}
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
function paintLabel(button: HTMLButtonElement, name: string, mobile: boolean, view: ApplicationView, textSize: TextSize): void {
  if (name === 'back') return;
  const canvas = button.querySelector<HTMLCanvasElement>('canvas')!;
  const w = button.clientWidth, h = button.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  const t = (value: string): string => translate(value, language);
  const ink = button.disabled ? '#8294a4' : '#ffe0a2';
  const unit = Math.min(w / (mobile ? 152 : 124), h / (mobile ? 28 : 40)) * (textSize === 'large' ? 1.12 : 1);
  if (name === 'continue') {
    const chapter = gameMenuChapter(view);
    const numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][chapter.number - 1] ?? String(chapter.number);
    text(ctx, view.hasProgress ? `${t('Глава')} ${numeral}` : t('Сохранения нет'), w / 2, h * .15, w * .82, unit * .68, ink);
    if (view.hasProgress) {
      text(ctx, t(chapter.chapter), w / 2, h * .32, w * (mobile ? .84 : .74), unit * (mobile ? .9 : .76), ink);
      text(ctx, `${t('Ночь')} ${chapter.night}`, w / 2, h * .49, w * .76, unit * .65, ink);
    }
    ctx.fillStyle = button.disabled ? '#536879' : '#9b6946'; ctx.fillRect(w * .12, Math.round(h * .65), w * .76, Math.max(1, h / 110));
    text(ctx, t('Продолжить'), w / 2, h * .74, w * .82, unit, ink);
    button.setAttribute('aria-label', view.hasProgress ? `${t('Продолжить')}: ${t(chapter.chapter)}, ${t('Ночь').toLowerCase()} ${chapter.night}` : t('Продолжить — сохранения нет'));
    if (!view.hasProgress) button.setAttribute('aria-describedby', 'no-campaign');
  } else text(ctx, t(name === 'trials' ? 'Испытания' : 'Новая игра'), w / 2, h * (mobile ? .34 : .70), w * .84, unit, ink);
}

/** Decoding gates the entry animation; rerenders and rotation retain the same scene. */
export function layoutGameMenu(root: HTMLElement, view: ApplicationView): void {
  const page = root.querySelector<HTMLElement>('.reference-game-menu');
  if (!page) return;
  const layout = gameMenuLayout(page.clientWidth, page.clientHeight, window.matchMedia('(pointer: coarse)').matches);
  page.dataset.layout = layout.mobile ? 'mobile' : 'desktop';
  page.dataset.orientation = layout.horizontal ? 'landscape' : 'portrait';
  const floor = page.querySelector<HTMLImageElement>('.game-menu-floor')!;
  floor.hidden = !layout.floor;
  if (layout.floor) position(floor, layout.floor);
  const paths: string[] = [];
  for (const button of page.querySelectorAll<HTMLButtonElement>('[data-game-control]')) {
    const name = button.dataset.gameControl!;
    const rect = name === 'new-game' ? layout.newGame : layout[name as 'back' | 'continue' | 'trials'];
    position(button, rect);
    const sprite = name === 'back' ? 'back' : layout.mobile ? name === 'continue' ? 'continue-mobile' : 'secondary-mobile' : `${name}-desktop`;
    const path = `${import.meta.env.BASE_URL}images/game-menu/${sprite}.png`;
    button.querySelector<HTMLElement>('.game-menu-sprite')!.style.setProperty('--game-menu-art', `url('${new URL(path, document.baseURI).href}')`);
    paths.push(path);
    paintLabel(button, name, layout.mobile, view, view.settings.textSize);
  }
  if (layout.floor) paths.push(floor.src);
  if (page.dataset.ready === 'pending') void Promise.all(paths.map(loadSprite)).then(() => {
    if (page.isConnected) page.dataset.ready = 'true';
  }).catch(() => {
    if (!page.isConnected) return;
    page.dataset.ready = 'error';
    const status = page.querySelector<HTMLElement>('.game-menu-load-error')!;
    status.hidden = false; status.textContent = translate('Не удалось загрузить оформление меню. Обновите страницу.', resolveLanguage(view.settings.language, undefined, navigator.languages));
    page.classList.add('game-menu-art-failed');
  });
}
