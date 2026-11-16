import { MENU_AMBIENT_LAYERS } from './menuAmbientData';
import { menuFog } from './menuFog';

type Rect = readonly [x: number, y: number, width: number, height: number];

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
export function menuScenery(): string {
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

/** Apply the shared world crop without replacing scenery or restarting its animations. */
export function layoutMenuScenery(root: HTMLElement, width: number, height: number): void {
  const scenery = root.querySelector<HTMLElement>('.menu-scenery');
  if (!scenery || !width || !height) return;
  const scene = menuSceneryViewport(width, height);
  scenery.style.left = `${scene.left}px`;
  scenery.style.top = `${scene.top}px`;
  scenery.style.width = scenery.style.height = `${scene.size}px`;
  scenery.style.setProperty('--menu-world-scale', String(scene.size / 640));
}
