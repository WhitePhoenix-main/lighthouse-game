import type { ApplicationView } from '../contracts';
import { MENU_AMBIENT_LAYERS } from './menuAmbientData';
import { menuFog } from './menuFog';

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

/** Lights stay registered to their painted sources, independently of their halo size. */
export const MENU_LIGHTING = {
  moonHalo: [466, 80, 160, 160],
  lantern: [271, 66, 240, 240],
  windowSize: 36,
  windows: [[406, 238], [386, 252], [371, 276], [412, 286], [394, 300]],
  shipGlowSize: 20,
  shipWindows: [[521, 365], [537, 368]]
} as const;

/** Coordinates from sprites/manifest.json; all decorations stay attached to the same scenery. */
function scenery(): string {
  const images = `${import.meta.env.BASE_URL}images/menu-sprites/`;
  const sprite = (name: string, rect: Rect, delay = 0, file = name): string => {
    const [x, y, width, height] = rect;
    return `<span class="menu-sprite menu-decoration menu-${name}" data-world-rect="${rect.join(',')}" style="left:${x / 640 * 100}%;top:${y / 640 * 100}%;width:${width / 640 * 100}%;height:${height / 640 * 100}%;background-image:url('${images}${file}.png');animation-delay:${delay}ms"></span>`;
  };
  const ambient = MENU_AMBIENT_LAYERS.map(layer => {
    const [x, y, width, height] = layer.rect;
    const kind = layer.id.split('-')[0];
    return `<span class="menu-ambient menu-ambient-${kind} menu-sprite menu-decoration" data-menu-ambient="${layer.id}" data-world-rect="${layer.rect.join(',')}" style="left:${x / 640 * 100}%;top:${y / 640 * 100}%;width:${width / 640 * 100}%;height:${height / 640 * 100}%;background-image:url('${images}${layer.file}');background-size:${layer.frames * 100}% 100%;animation-duration:${(layer.frames - 1) * layer.frameMs}ms;animation-timing-function:steps(${layer.frames - 1}, end);animation-delay:${-layer.phaseMs}ms"></span>`;
  }).join('');
  const windowSize = MENU_LIGHTING.windowSize;
  const shipGlowSize = MENU_LIGHTING.shipGlowSize;
  const [haloX, haloY, haloWidth, haloHeight] = MENU_LIGHTING.moonHalo;
  return `<div class="menu-scenery" aria-hidden="true">
    <img class="menu-background" src="${images}background.png" alt="" draggable="false" fetchpriority="high" decoding="async">
    ${ambient}
    ${menuFog()}
    <span class="menu-moon-halo menu-decoration" data-world-rect="${MENU_LIGHTING.moonHalo.join(',')}" style="left:${haloX / 640 * 100}%;top:${haloY / 640 * 100}%;width:${haloWidth / 640 * 100}%;height:${haloHeight / 640 * 100}%"></span>
    ${sprite('moon', [514, 128, 64, 64])}
    ${sprite('ship-wake', [501, 362, 56, 17])}
    ${sprite('ship', [500, 318, 64, 64])}${sprite('sail', [500, 318, 64, 64])}
    ${MENU_LIGHTING.shipWindows.map(([x, y], index) => sprite('ship-glow', [x - shipGlowSize / 2, y - shipGlowSize / 2, shipGlowSize, shipGlowSize], -index * 420, 'window-glow')).join('')}
    ${sprite('lantern-halo', MENU_LIGHTING.lantern)}
    ${MENU_LIGHTING.windows.map(([x, y]) => sprite('window-glow', [x - windowSize / 2, y - windowSize / 2, windowSize, windowSize])).join('')}
  </div>`;
}

export function referenceMenu(view: ApplicationView): string {
  return `<section class="avalon-menu" aria-labelledby="menu-title">${scenery()}<div class="menu-artboard">
    <h1 id="menu-title" class="menu-title" data-menu-rect="title" tabindex="-1" aria-label="Свет Авалона"><span class="menu-title-sprite menu-sprite menu-decoration" aria-hidden="true" style="background-image:url('${import.meta.env.BASE_URL}images/menu-sprites/title.png')"></span></h1>
    <button class="menu-hotspot play-hotspot" data-menu-rect="play" data-action="preparation" ${view.error ? 'disabled' : ''}>${buttonArt('play')}<span class="menu-button-label">Играть</span></button>
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

/** One 640 × 640 world, with crops [0,100,640,360] and [220,0,360,640] at their native ratios. */
export function menuSceneryViewport(width: number, height: number): { left: number; top: number; size: number } {
  const portrait = height >= width;
  const scale = portrait ? height / 640 : Math.max(width / 640, height / 360);
  const size = 640 * scale;
  const preferredLeft = portrait ? (width - 360 * scale) / 2 - 220 * scale : (width - size) / 2;
  // Retain the moon and ship on narrower crops without moving them independently of the coast.
  const left = Math.min(preferredLeft, width - 580 * scale);
  const cropTop = portrait ? 0 : Math.max(100, Math.min(120, 384 - height / scale));
  return { left: Math.max(width - size, Math.min(0, left)),
    top: portrait ? 0 : -cropTop * scale, size };
}

/** Place the logo and native controls independently of the scenery crop. */
export function layoutReferenceMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('.avalon-menu');
  const board = menu?.querySelector<HTMLElement>('.menu-artboard');
  const scenery = menu?.querySelector<HTMLElement>('.menu-scenery');
  if (!menu || !board || !scenery) return;
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
  const scene = menuSceneryViewport(width, height);
  scenery.style.left = `${scene.left}px`;
  scenery.style.top = `${scene.top}px`;
  scenery.style.width = scenery.style.height = `${scene.size}px`;
  scenery.style.setProperty('--menu-world-scale', String(scene.size / 640));
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
