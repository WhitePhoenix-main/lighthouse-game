import { describe, expect, it } from 'vitest';
import { MENU_COMPOSITIONS, MENU_LIGHTING, menuSceneryViewport, menuViewport, mountMenuMotion } from '../src/presentation/menu/referenceMenu';

describe('menu composition in both orientations', () => {
  it.each([[390, 844], [844, 390], [320, 568], [568, 320], [1920, 1080], [768, 1024], [2560, 1080], [1024, 1024], [320, 1000]])(
    'keeps the original title and both controls on screen at %i × %i', (width, height) => {
      const viewport = menuViewport(width, height);
      const source = MENU_COMPOSITIONS[viewport.orientation];
      for (const name of ['title', 'play', 'settings'] as const) {
        const [x, y, w, h] = source[name];
        expect(viewport.left + x * viewport.scale, name).toBeGreaterThanOrEqual(0);
        expect(viewport.left + (x + w) * viewport.scale, name).toBeLessThanOrEqual(width);
        expect(viewport.top + y * viewport.scale, name).toBeGreaterThanOrEqual(0);
        expect(viewport.top + (y + h) * viewport.scale, name).toBeLessThanOrEqual(height);
      }
      expect(viewport.width / viewport.height).toBeCloseTo(source.width / source.height);
      const scenery = menuSceneryViewport(width, height);
      expect(scenery.left).toBeLessThanOrEqual(0);
      expect(scenery.top).toBeLessThanOrEqual(0);
      expect(scenery.left + scenery.size).toBeGreaterThanOrEqual(width);
      expect(scenery.top + scenery.size).toBeGreaterThanOrEqual(height);
      const sceneScale = scenery.size / 640;
      expect(scenery.left + 514 * sceneScale).toBeGreaterThanOrEqual(0);
      expect(scenery.left + 578 * sceneScale).toBeLessThanOrEqual(width);
      expect(scenery.top + 125 * sceneScale).toBeGreaterThanOrEqual(0);
      expect(scenery.top + 382 * sceneScale).toBeLessThanOrEqual(height);
    });
  it('uses the two original crops of one world at the reference aspect ratios', () => {
    expect(menuSceneryViewport(640, 360)).toEqual({ left: 0, top: -100, size: 640 });
    expect(menuSceneryViewport(360, 640)).toEqual({ left: -220, top: 0, size: 640 });
  });
  it('keeps the lantern centred on its source and leaves the doorway without an extra glow', () => {
    const [x, y, width, height] = MENU_LIGHTING.lantern;
    expect([x + width / 2, y + height / 2]).toEqual([391, 186]);
    expect(width).toBe(height);
    expect(MENU_LIGHTING.windows).toEqual([[406, 238], [386, 252], [371, 276], [412, 286], [394, 300]]);
    expect(MENU_LIGHTING.windowSize).toBeGreaterThan(24);
    expect(MENU_LIGHTING.shipWindows).toEqual([[521, 365], [537, 368]]);
  });
});

function motionFixture() {
  const window = new EventTarget();
  let focused = true;
  const document = Object.assign(new EventTarget(), { defaultView: window, hasFocus: () => focused, visibilityState: 'visible' });
  const classes = new Set<string>();
  const root = { ownerDocument: document, classList: {
    toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
    remove(name: string) { classes.delete(name); }
  } } as unknown as HTMLElement;
  const motion = mountMenuMotion(root);
  return { document, window, motion, paused: () => classes.has('menu-motion-paused'),
    documentFocus(value: boolean) { focused = value; },
    focus(value: boolean) { focused = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
    visible(value: boolean) { document.visibilityState = value ? 'visible' : 'hidden'; document.dispatchEvent(new Event('visibilitychange')); } };
}

describe('decorative animation lifecycle', () => {
  it('recovers on interaction if document focus returns without a window focus event', () => {
    const s = motionFixture();
    s.focus(false); expect(s.paused()).toBe(true);
    s.documentFocus(true);
    s.document.dispatchEvent(new Event('pointerdown')); expect(s.paused()).toBe(false);
    s.window.dispatchEvent(new Event('pagehide'));
    s.document.dispatchEvent(new Event('keydown')); expect(s.paused()).toBe(true);
    s.window.dispatchEvent(new Event('pageshow')); expect(s.paused()).toBe(false);
    s.motion.destroy();
  });
  it('requires a visible, focused page before continuing the existing CSS timelines', () => {
    const s = motionFixture();
    expect(s.paused()).toBe(false);
    s.focus(false); expect(s.paused()).toBe(true);
    s.visible(false); s.focus(true); expect(s.paused()).toBe(true);
    s.visible(true); expect(s.paused()).toBe(false);
    s.window.dispatchEvent(new Event('pagehide'));
    s.focus(true); expect(s.paused()).toBe(true);
    s.window.dispatchEvent(new Event('pageshow')); expect(s.paused()).toBe(false);
    s.motion.destroy();
  });
  it('removes listeners and its pause class on teardown', () => {
    const s = motionFixture();
    s.focus(false); expect(s.paused()).toBe(true);
    s.motion.destroy(); expect(s.paused()).toBe(false);
    s.visible(false); s.window.dispatchEvent(new Event('pagehide')); expect(s.paused()).toBe(false);
  });
});
