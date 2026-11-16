import type { ApplicationView } from '../contracts';
import { layoutMenuScenery, menuScenery } from './menuScenery';
export { MENU_LIGHTING, menuSceneryViewport } from './menuScenery';

type Rect = readonly [x: number, y: number, width: number, height: number];
type Orientation = 'landscape' | 'portrait';
interface MenuComposition {
  width: number;
  height: number;
  title: Rect;
  play: Rect;
  settings: Rect;
}

/** Native control positions from the new artwork's reference compositions. */
export const MENU_COMPOSITIONS: Record<Orientation, MenuComposition> = {
  landscape: {
    width: 640, height: 360,
    title: [18, 30, 240, 80], play: [18, 202, 240, 48], settings: [18, 258, 240, 48]
  },
  portrait: {
    width: 360, height: 640,
    title: [60, 415, 240, 80], play: [60, 507, 240, 48], settings: [60, 569, 240, 48]
  }
};

function buttonArt(name: 'play' | 'settings'): string {
  const relativeImages = `${import.meta.env.BASE_URL}images/menu-buttons-v2/`;
  // Custom-property URLs are consumed in an external stylesheet, so anchor them to the document.
  const images = typeof document === 'undefined' ? relativeImages : new URL(relativeImages, document.baseURI).href;
  return `<span class="menu-button-art" aria-hidden="true" style="--menu-button-states:url('${images}frame-states.png');--menu-button-press:url('${images}frame-press.png');--menu-button-labels-ru:url('${images}labels-ru.png');--menu-button-labels-en:url('${images}labels-en.png')">
    <span class="menu-button-frame"></span><span class="menu-button-label-art" data-menu-button-label="${name}"></span>
    <img src="${images}frame-press.png" alt="" hidden draggable="false" decoding="async">
  </span>`;
}

export function referenceMenu(view: ApplicationView): string {
  return `<section class="avalon-menu" aria-labelledby="menu-title">${menuScenery()}<div class="menu-artboard">
    <h1 id="menu-title" class="menu-title" data-menu-rect="title" tabindex="-1" aria-label="Свет Авалона"><span class="menu-title-sprite menu-sprite menu-decoration" aria-hidden="true" style="background-image:url('${import.meta.env.BASE_URL}images/menu-sprites/title.png')"></span></h1>
    <button class="menu-hotspot play-hotspot" data-menu-rect="play" data-action="game-menu" ${view.error ? 'disabled' : ''}>${buttonArt('play')}<span class="menu-button-label">Играть</span></button>
    <button class="menu-hotspot settings-hotspot" data-menu-rect="settings" data-action="settings">${buttonArt('settings')}<span class="menu-button-label">Настройки</span></button>
    </div>${view.interrupted ? '<p class="menu-notice" role="status">Ночь была прервана. Временные награды отброшены, стоимость устройств возвращена.</p>' : ''}</section>`;
}

export function menuViewport(width: number, height: number): { orientation: Orientation; scale: number; left: number; top: number; width: number; height: number } {
  const orientation = height >= width ? 'portrait' : 'landscape';
  const source = MENU_COMPOSITIONS[orientation];
  // The native controls can fit independently of the scenery on tablets and very tall phones.
  const scale = orientation === 'portrait' ? Math.min(height / source.height, Math.max(0, width - 24) / 240)
    : Math.min(width / source.width, height / source.height);
  return { orientation, scale, left: (width - source.width * scale) / 2,
    top: (height - source.height * scale) / (orientation === 'portrait' ? 1 : 2),
    width: source.width * scale, height: source.height * scale };
}

/** Place the logo and native controls independently of the scenery crop. */
export function layoutReferenceMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('.avalon-menu');
  const board = menu?.querySelector<HTMLElement>('.menu-artboard');
  if (!menu || !board) return;
  const { width, height } = menu.getBoundingClientRect();
  if (!width || !height) return;
  const viewport = menuViewport(width, height);
  const source = MENU_COMPOSITIONS[viewport.orientation];
  board.style.width = `${viewport.width}px`;
  board.style.height = `${viewport.height}px`;
  board.style.left = `${viewport.left}px`;
  board.style.top = `${viewport.top}px`;
  board.style.setProperty('--menu-scale', String(viewport.scale));
  menu.dataset.orientation = viewport.orientation;
  layoutMenuScenery(menu, width, height);
  for (const element of board.querySelectorAll<HTMLElement>('[data-menu-rect]')) {
    const rect = source[element.dataset.menuRect as keyof Omit<MenuComposition, 'width' | 'height'>];
    const [x, y, w, h] = rect;
    element.style.left = `${x / source.width * 100}%`;
    element.style.top = `${y / source.height * 100}%`;
    element.style.width = `${w / source.width * 100}%`;
    element.style.height = `${h / source.height * 100}%`;
  }
}

/** CSS timelines freeze on lifecycle changes, then continue without catching up elapsed time. */
export function mountMenuMotion(root: HTMLElement, onPause?: (paused: boolean) => void): { destroy(): void } {
  const document = root.ownerDocument;
  const window = document.defaultView!;
  let pageVisible = true;
  let focused = document.hasFocus();
  const sync = (): void => {
    const paused = !pageVisible || !focused || document.visibilityState === 'hidden';
    root.classList.toggle('menu-motion-paused', paused);
    onPause?.(paused);
  };
  const blur = (): void => { focused = false; sync(); };
  const focus = (): void => { focused = true; sync(); };
  const hide = (): void => { pageVisible = false; sync(); };
  const show = (): void => { pageVisible = true; focused = document.hasFocus(); sync(); };
  const visibility = (): void => { focused = document.hasFocus(); sync(); };
  // Some embedded browsers restore document focus without a window focus event.
  // A real interaction can recover that state while visibility/pagehide still apply.
  const interact = (): void => { focused = document.hasFocus(); sync(); };
  const listeners: [EventTarget, string, EventListener][] = [
    [window, 'blur', blur], [window, 'focus', focus], [window, 'pagehide', hide], [window, 'pageshow', show],
    [document, 'visibilitychange', visibility], [document, 'pointerdown', interact], [document, 'keydown', interact]
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
  sync();
  return { destroy() {
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
    root.classList.remove('menu-motion-paused');
  } };
}
