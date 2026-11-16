import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsTransition } from '../src/presentation/settingsTransition';

afterEach(() => vi.unstubAllGlobals());

function fixture(initial: 'menu' | 'settings' | 'other' = 'menu', ready = 'true', mobile = false) {
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('window', {
    matchMedia: () => media,
    getComputedStyle: (element: unknown) => Object.assign(
      ['--menu-scale', '--menu-text-scale', 'font', 'background-position'], {
        getPropertyValue: (key: string) => ({ '--menu-scale': '1.5', '--menu-text-scale': textScale, font: '24px Avalon Menu', 'background-position': '50% 0%' })[key] ?? '',
        transform: element === board ? mobile ? 'matrix(1, 0, 0, 1, 0, 123)' : 'matrix(1, 0, 0, 1, -123, 0)' : 'none',
        opacity: element === board ? '0.45' : '0.4',
      }),
  });
  let readinessChanged = () => {};
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { readinessChanged = callback; }
    observe() {} disconnect() {}
  });
  interface FakeAnimation {
    frames: Keyframe[]; options: KeyframeAnimationOptions; currentTime: number;
    playState: string; onfinish: (() => void) | null; startTime: number | null; timeline: { currentTime: number };
    cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>;
  }
  const animations: FakeAnimation[] = [];
  function makeAnimation(frames: Keyframe[], options: KeyframeAnimationOptions): FakeAnimation {
    const result = {
      frames, options, currentTime: 0, startTime: null as number | null, timeline: { currentTime: 1000 }, playState: 'running', onfinish: null as (() => void) | null,
      cancel: vi.fn(), pause: vi.fn(() => { result.playState = 'paused'; }),
      play: vi.fn(() => { result.playState = 'running'; }),
    };
    animations.push(result); return result;
  }
  interface FakeNode {
    dataset: Record<string, string>; inert: boolean; attributes: Map<string, string>;
    properties: Record<string, string>; classes: Set<string>; children: FakeNode[];
    style: CSSStyleDeclaration; classList: { remove(key: string): boolean; add(key: string): Set<string> };
    setAttribute: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>;
    animate: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
    querySelectorAll(selector: string): FakeNode[]; querySelector(selector: string): FakeNode | null;
    cloneNode(): FakeNode;
  }
  let viewport = { width: 540, height: 960 };
  let textScale = '1.12';
  function element(): FakeNode {
    const attributes = new Map<string, string>([['id', 'menu-title'], ['data-action', 'settings'], ['data-focus-key', 'settings']]);
    const properties: Record<string, string> = {};
    const classes = new Set(['menu-artboard', 'menu-title-ready']);
    const node: FakeNode = { dataset: {}, inert: false, attributes, properties, classes, children: [],
      style: { setProperty: (key: string, value: string) => { properties[key] = value; } } as unknown as CSSStyleDeclaration,
      classList: { remove: (key: string) => classes.delete(key), add: (key: string) => classes.add(key) },
      setAttribute: vi.fn((key: string, value: string) => attributes.set(key, value)),
      removeAttribute: vi.fn((key: string) => attributes.delete(key)), animate: vi.fn(makeAnimation),
      getBoundingClientRect: () => ({ left: 30, top: 40, ...viewport }),
      append: vi.fn((child: FakeNode) => node.children.push(child)), remove: vi.fn(),
      querySelectorAll: (selector: string) => selector === '*' ? node.children.flatMap(child => [child, ...child.querySelectorAll('*')]) : [],
      querySelector: (selector: string) => node.querySelectorAll('*').find(child => child.classes.has(selector.slice(1))) ?? null,
      cloneNode: () => {
        const copy = element();
        copy.children = node.children.map(child => child.cloneNode());
        copy.dataset = { ...node.dataset };
        copy.style = { ...node.style, setProperty: copy.style.setProperty } as CSSStyleDeclaration;
        copy.classes.clear(); for (const name of classes) copy.classes.add(name);
        return copy;
      },
    };
    return node;
  }
  function makeMenu() {
    const button = { ...element(), isConnected: true, focus: vi.fn() };
    const node = element(); node.children = [button];
    return { ...node, button, querySelector: (selector: string) => selector === '[data-action="settings"]' ? button : null };
  }
  const created: FakeNode[] = [];
  let screen = initial;
  let menu = makeMenu();
  let board = element();
  let scrim = element();
  let page = { ...element(), dataset: { ready, entering: '', exiting: '', layout: mobile ? 'mobile' : 'desktop' }, querySelector: (selector: string) => selector === '.settings-board' ? board : scrim };
  const overlay = { clientWidth: 390,
    ownerDocument: { createElement: () => { const node = element(); node.classes.clear(); created.push(node); return node; } },
    parentElement: { clientLeft: 0, clientTop: 0, getBoundingClientRect: () => ({ left: 10, top: 15 }) },
    before: vi.fn(), querySelector: (selector: string) => selector === '.reference-settings'
    ? (screen === 'settings' ? page : null) : screen === 'menu' ? menu : null } as unknown as HTMLElement;
  const controller = mountSettingsTransition(overlay);
  return {
    controller, animations, media, get ghosts() { return created.filter(node => 'settingsMenuGhost' in node.dataset); }, get staging() { return created.filter(node => !('settingsMenuGhost' in node.dataset)); }, get page() { return page; }, get menu() { return menu; },
    ready() { page.dataset.ready = 'true'; readinessChanged(); },
    get ghostBoard() { return created.filter(node => 'settingsMenuGhost' in node.dataset).at(-1)?.children[0] as FakeNode; },
    resize(width: number, height: number) { viewport = { width, height }; },
    textScale(value: string) { textScale = value; },
    show(next: typeof initial) { screen = next; controller.sync(); },
    replace() {
      if (screen === 'menu') { menu.button.isConnected = false; menu = makeMenu(); }
      else { board = element(); scrim = element(); page = { ...page }; }
      controller.sync();
    },
    finish(index: number) { const a = animations[index]!; a.currentTime = Number(a.options.duration); a.onfinish!(); },
  };
}

describe('settings navigation motion', () => {
  it('navigates immediately and crossfades menu and settings on the same 560ms timeline', () => {
    const s = fixture();
    const navigate = vi.fn(() => s.show('settings'));
    s.controller.openSettings(navigate); s.controller.openSettings(navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.page.dataset.entering).toBe('true');
    expect(s.animations).toHaveLength(3);
    expect(s.animations[0]!.frames).toEqual([{ transform: 'translateX(-360px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }]);
    expect(s.animations.map(a => a.options.duration)).toEqual([560, 560, 560]);
    expect(s.animations.map(a => a.startTime)).toEqual([1000, 1000, 1000]);
    expect(s.animations[2]!.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    const ghost = s.ghosts[0]!;
    const copy = s.ghostBoard;
    expect(ghost.inert).toBe(true);
    expect(ghost.attributes.get('aria-hidden')).toBe('true');
    expect(ghost.dataset.settingsMenuGhost).toBe('');
    expect(copy.classes.has('menu-artboard')).toBe(false);
    expect(copy.classes.has('settings-menu-outgoing')).toBe(true);
    for (const node of [copy, ...copy.children]) {
      expect(node.inert).toBe(true);
      expect(node.attributes.has('id')).toBe(false);
      expect(node.attributes.has('data-action')).toBe(false);
      expect(node.attributes.has('data-focus-key')).toBe(false);
      expect(node.classes.has('menu-title-ready')).toBe(false);
      expect(node.style.animation).toBe('none');
      expect(node.properties['background-position']).toBe('50% 0%');
    }
    expect(copy.style.left).toBe('20px'); expect(copy.style.top).toBe('25px');
    expect(copy.style.width).toBe('540px'); expect(copy.style.height).toBe('960px');
    expect(copy.style.background).toBe('transparent');
    expect(copy.properties['--menu-scale']).toBe('1.5');
    expect(copy.properties['--menu-text-scale']).toBe('1.12');
    expect(copy.properties.font).toBe('24px Avalon Menu');
    const stale = s.animations[0]!.onfinish!;
    s.finish(0); stale();
    expect(navigate).toHaveBeenCalledOnce();
    expect(s.menu.inert).toBe(false);
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.page.dataset.entering).toBe('false');
    expect(ghost.remove).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('slides the mobile sheet up from its full height and closes down on the shared menu timeline', () => {
    const s = fixture('menu', 'true', true);
    s.controller.openSettings(() => s.show('settings'));
    expect(s.animations[0]!.frames).toEqual([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }]);
    expect(s.animations.map(a => a.options.duration)).toEqual([560, 560, 560]);
    expect(s.animations.map(a => a.startTime)).toEqual([1000, 1000, 1000]);
    s.finish(0);
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    expect(s.animations[3]!.frames.at(-1)).toEqual({ transform: 'translateY(100%)', opacity: 0 });
    expect(s.animations.slice(3).map(a => a.options.duration)).toEqual([560, 560, 560]);
    expect(s.animations.slice(3).map(a => a.startTime)).toEqual([1000, 1000, 1000]);
    expect(s.animations[5]!.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(close).not.toHaveBeenCalled();
    s.finish(3); expect(close).toHaveBeenCalledOnce();
    expect(s.menu.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    s.controller.destroy();
  });

  it('preserves the current mobile vertical pose and menu opacity when closing mid-entry and repainting', () => {
    const s = fixture('menu', 'true', true);
    s.controller.openSettings(() => s.show('settings'));
    s.animations[0]!.currentTime = 140;
    s.controller.closeSettings(() => s.show('menu'));
    expect(s.animations[3]!.frames).toEqual([
      { transform: 'matrix(1, 0, 0, 1, 0, 123)', opacity: '0.45' },
      { transform: 'translateY(100%)', opacity: 0 },
    ]);
    expect(s.animations[5]!.frames[0]).toEqual({ opacity: '0.4' });
    s.animations[3]!.currentTime = 123;
    s.controller.setPaused(true); s.resize(844, 390); s.replace();
    expect(s.animations.slice(6).map(a => a.currentTime)).toEqual([123, 123, 123]);
    expect(s.animations.slice(6).every(a => a.playState === 'paused')).toBe(true);
    expect(s.animations[6]!.frames.at(-1)).toEqual({ transform: 'translateY(100%)', opacity: 0 });
    s.controller.setPaused(false); s.finish(6);
    expect(s.controller.isNavigating()).toBe(false);
    s.controller.destroy();
  });

  it('keeps the ghost fully visible until cold artwork is ready, including pending repaint and pause', () => {
    const s = fixture('menu', 'loading');
    s.controller.openSettings(() => s.show('settings'));
    const copy = s.ghostBoard;
    expect(s.page.dataset.entering).toBe('pending');
    expect(copy.style.opacity).toBe('1');
    expect(s.animations).toHaveLength(0);
    s.controller.setPaused(true); s.replace();
    expect(s.ghosts).toHaveLength(1);
    expect(s.ghostBoard).toBe(copy);
    s.ready();
    expect(s.animations.map(a => a.currentTime)).toEqual([0, 0, 0]);
    expect(s.animations.every(a => a.playState === 'paused')).toBe(true);
    s.controller.setPaused(false);
    expect(s.animations.every(a => a.play.mock.calls.length === 1)).toBe(true);
    s.controller.destroy();
  });

  it('freezes the ghost opacity when a replacement board waits for artwork mid-entry', () => {
    const s = fixture();
    s.controller.openSettings(() => s.show('settings'));
    const copy = s.ghostBoard;
    s.animations[0]!.currentTime = 180;
    s.page.dataset.ready = 'loading'; s.replace();
    expect(s.animations).toHaveLength(3);
    expect(copy.style.opacity).toBe('0.4');
    expect(s.ghostBoard).toBe(copy);
    s.ready();
    expect(s.animations.slice(3).map(a => a.currentTime)).toEqual([180, 180, 180]);
    expect(s.animations.slice(3).map(a => a.startTime)).toEqual([820, 820, 820]);
    s.controller.destroy();
  });

  it('crossfades incoming menu and real settings concurrently, then restores focus without another intro', () => {
    const s = fixture();
    s.controller.openSettings(() => s.show('settings')); s.finish(0);
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close); s.controller.closeSettings(close);
    const incoming = s.ghosts[1]!;
    expect(incoming.dataset.settingsMenuDirection).toBe('in');
    expect(s.ghosts[0]!.dataset.settingsMenuDirection).toBe('out');
    expect(s.animations.slice(3).map(a => a.options.duration)).toEqual([560, 560, 560]);
    expect(s.animations.slice(3).map(a => a.startTime)).toEqual([1000, 1000, 1000]);
    expect(s.animations[5]!.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(s.page.inert).toBe(true); expect(close).not.toHaveBeenCalled();
    const copy = s.ghostBoard;
    for (const node of [copy, ...copy.children]) {
      expect(node.inert).toBe(true);
      expect(node.attributes.has('id')).toBe(false);
      expect(node.attributes.has('data-action')).toBe(false);
      expect(node.attributes.has('data-focus-key')).toBe(false);
    }
    expect(copy.classes.has('menu-artboard')).toBe(false);
    const stale = s.animations[3]!.onfinish!;
    s.finish(3); stale();
    expect(close).toHaveBeenCalledOnce();
    expect(incoming.remove).toHaveBeenCalledOnce();
    expect(s.animations).toHaveLength(6);
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.menu.inert).toBe(false);
    expect(s.menu.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    s.controller.destroy();
  });

  it('measures fresh incoming layout and text size, including resize with the same settings DOM', () => {
    const s = fixture();
    s.controller.openSettings(() => s.show('settings')); s.finish(0);
    s.resize(960, 540); s.textScale('1');
    s.controller.closeSettings(() => s.show('menu'));
    expect(s.ghostBoard.style.width).toBe('960px');
    expect(s.ghostBoard.properties['--menu-text-scale']).toBe('1');
    expect(s.staging.find(node => node.classes.has('avalon-menu'))!.dataset.orientation).toBe('landscape');
    s.animations[3]!.currentTime = 175;
    const firstIncoming = s.ghosts[1]!;
    s.resize(390, 844); s.textScale('1.12'); s.controller.sync();
    expect(firstIncoming.remove).toHaveBeenCalledOnce();
    expect(s.ghostBoard.style.width).toBe('390px');
    expect(s.ghostBoard.properties['--menu-text-scale']).toBe('1.12');
    expect(s.animations.slice(6).map(a => a.currentTime)).toEqual([175, 175, 175]);
    expect(s.staging.filter(node => node.classes.has('avalon-menu')).at(-1)!.dataset.orientation).toBe('portrait');
    s.controller.destroy();
  });

  it('closes mid-entry from the current real pose while reversing the incoming artwork', () => {
    const s = fixture();
    s.controller.openSettings(() => s.show('settings'));
    const stale = s.animations[0]!.onfinish!;
    s.animations[0]!.currentTime = 140;
    s.controller.closeSettings(() => s.show('menu'));
    expect(s.animations[3]!.frames[0]).toEqual({ transform: 'matrix(1, 0, 0, 1, -123, 0)', opacity: '0.45' });
    expect(s.ghostBoard.style.opacity).toBe('0.4');
    expect(s.animations[5]!.frames).toEqual([{ opacity: '0.4' }, { opacity: 1 }]);
    stale(); expect(s.controller.isNavigating()).toBe(true);
    s.animations[3]!.currentTime = 123;
    s.resize(960, 540); s.controller.sync();
    expect(s.ghostBoard.style.opacity).toBe('0.4');
    expect(s.animations[8]!.frames).toEqual([{ opacity: '0.4' }, { opacity: 1 }]);
    expect(s.animations.slice(6).map(a => a.currentTime)).toEqual([123, 123, 123]);
    s.finish(6); expect(s.animations).toHaveLength(9);
    s.controller.destroy();
  });

  it.each(['destroy', 'external'] as const)('cleans incoming artwork, staging and deferred callbacks on %s', reason => {
    const s = fixture();
    s.controller.openSettings(() => s.show('settings')); s.finish(0);
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    const incoming = s.ghosts[1]!;
    const stale = s.animations[3]!.onfinish!;
    if (reason === 'destroy') s.controller.destroy(); else s.show('other');
    stale();
    expect(close).not.toHaveBeenCalled();
    expect(incoming.remove).toHaveBeenCalledOnce();
    expect(s.staging.filter(node => !node.classes.has('avalon-menu')).every(node => node.remove.mock.calls.length === 1)).toBe(true);
    expect(s.controller.isNavigating()).toBe(false);
    s.controller.destroy();
  });

  it('defers a settings return to paused battle without a menu snapshot or second introduction', () => {
    const s = fixture('other');
    s.controller.openSettings(() => s.show('settings')); s.finish(0);
    const close = vi.fn(() => s.show('other'));
    s.controller.closeSettings(close);
    expect(s.animations).toHaveLength(4);
    expect(s.ghosts).toHaveLength(0);
    expect(close).not.toHaveBeenCalled();
    s.finish(2);
    expect(close).toHaveBeenCalledOnce();
    expect(s.animations).toHaveLength(4);
    expect(s.controller.isNavigating()).toBe(false);
    s.controller.destroy();
  });

  it('closes from computed entry styles and retains the real page until exit completes', () => {
    const s = fixture('settings');
    const navigate = vi.fn(() => s.show('menu'));
    s.animations[0]!.currentTime = 140;
    s.controller.closeSettings(navigate); s.controller.closeSettings(navigate);
    expect(s.animations[2]!.frames[0]).toEqual({ transform: 'matrix(1, 0, 0, 1, -123, 0)', opacity: '0.45' });
    expect(s.animations[3]!.frames[0]).toEqual({ opacity: '0.4' });
    expect(s.page.dataset.exiting).toBe('true');
    expect(s.page.inert).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    s.finish(2);
    expect(navigate).toHaveBeenCalledOnce();
    expect(s.menu.dataset.menuTransition).toBe('in');
    expect(s.animations[4]!.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(s.controller.isNavigating()).toBe(true);
    s.finish(4);
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.menu.inert).toBe(false);
    s.controller.destroy();
  });

  it('preserves entry artwork and rebuilds incoming artwork at frozen exit playheads across rerenders', () => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    const ghost = s.ghostBoard;
    s.animations[0]!.currentTime = 83;
    s.controller.setPaused(true); s.replace();
    expect(s.ghosts).toHaveLength(1); expect(s.ghostBoard).toBe(ghost);
    expect(s.animations.slice(3).map(a => a.currentTime)).toEqual([83, 83, 83]);
    expect(s.animations.slice(3).every(a => a.playState === 'paused')).toBe(true);
    s.controller.setPaused(false); s.finish(3);
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    s.animations[6]!.currentTime = 91;
    s.controller.setPaused(true); s.replace();
    expect(s.animations.slice(9).map(a => a.currentTime)).toEqual([91, 91, 91]);
    expect(s.animations.slice(9).every(a => a.playState === 'paused')).toBe(true);
    expect(s.ghosts[1]!.remove).toHaveBeenCalledOnce();
    expect(s.staging.every(node => node.remove.mock.calls.length === 1 || node.classes.has('avalon-menu'))).toBe(true);
    s.controller.setPaused(false); s.finish(9);
    expect(s.animations).toHaveLength(12);
    expect(s.menu.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    s.replace();
    expect(s.animations).toHaveLength(12);
    expect(open).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('settles reduced motion changes once without a second menu introduction', () => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    s.media.matches = true; s.media.dispatchEvent(new Event('change'));
    expect(open).toHaveBeenCalledOnce();
    expect(s.ghosts[0]!.remove).toHaveBeenCalledOnce();
    expect(s.page.dataset.entering).toBe('false');
    expect(s.controller.isNavigating()).toBe(false);
    s.media.matches = false; s.media.dispatchEvent(new Event('change'));
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    s.media.matches = true; s.media.dispatchEvent(new Event('change')); s.media.dispatchEvent(new Event('change'));
    expect(close).toHaveBeenCalledOnce();
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.menu.dataset.menuTransition).toBe('false');
    s.controller.destroy();
  });

  it('navigates directly from pending invisible artwork or when opening without a menu', () => {
    const s = fixture('settings', 'loading');
    const close = vi.fn(() => s.show('other'));
    s.controller.closeSettings(close);
    expect(close).toHaveBeenCalledOnce();
    expect(s.animations).toHaveLength(0);
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    expect(open).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('opens immediately without a ghost or animation when reduced motion is already enabled', () => {
    const s = fixture('menu', 'loading');
    s.media.matches = true;
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    expect(open).toHaveBeenCalledOnce();
    expect(s.ghosts).toHaveLength(0);
    expect(s.animations).toHaveLength(0);
    expect(s.page.dataset.entering).toBe('false');
    s.controller.destroy();
  });

  it.each(['destroy', 'external', 'close'] as const)('cleans pending artwork and its ghost on %s', (reason) => {
    const s = fixture('menu', 'loading');
    const open = vi.fn(() => s.show('settings'));
    const close = vi.fn(() => s.show('menu'));
    s.controller.openSettings(open);
    if (reason === 'destroy') s.controller.destroy();
    else if (reason === 'external') s.show('other');
    else s.controller.closeSettings(close);
    expect(open).toHaveBeenCalledOnce();
    expect(s.ghosts[0]!.remove).toHaveBeenCalledOnce();
    if (reason === 'close') {
      expect(close).toHaveBeenCalledOnce();
      expect(s.animations).toHaveLength(0);
      expect(s.menu.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    } else expect(s.animations).toHaveLength(0);
    s.controller.destroy();
  });

  it.each(['destroy', 'external', 'close'] as const)('removes the ghost on %s and ignores stale entrance completions', (reason) => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    const stale = s.animations[0]!.onfinish!;
    if (reason === 'destroy') s.controller.destroy();
    else if (reason === 'external') s.show('other');
    else s.controller.closeSettings(() => s.show('menu'));
    stale();
    expect(open).toHaveBeenCalledOnce();
    expect(s.ghosts[0]!.remove).toHaveBeenCalledOnce();
    if (reason === 'close') expect(s.page.dataset.exiting).toBe('true');
    s.controller.destroy();
  });
  it('restores focus only after the menu intro and to its current markup', () => {
    const s = fixture('settings');
    s.controller.closeSettings(() => s.show('menu')); s.finish(2);
    const oldButton = s.menu.button;
    expect(oldButton.focus).not.toHaveBeenCalled();
    s.replace();
    const currentButton = s.menu.button;
    expect(currentButton.focus).not.toHaveBeenCalled();
    const stale = s.animations[5]!.onfinish!;
    s.finish(5); stale(); s.controller.sync();
    expect(oldButton.focus).not.toHaveBeenCalled();
    expect(currentButton.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(s.menu.inert).toBe(false);
    s.controller.destroy();
  });

  it.each(['destroy', 'external', 'detached'] as const)('does not restore stale menu focus on %s', (reason) => {
    const s = fixture('settings');
    s.controller.closeSettings(() => s.show('menu')); s.finish(2);
    const button = s.menu.button;
    const stale = s.animations[4]!.onfinish!;
    if (reason === 'destroy') s.controller.destroy();
    else if (reason === 'external') s.show('other');
    else button.isConnected = false;
    stale();
    expect(button.focus).not.toHaveBeenCalled();
    s.controller.destroy();
  });
  it.each(['destroy', 'external'] as const)('cancels stale callbacks on %s', (reason) => {
    const s = fixture('settings');
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    const stale = s.animations[2]!.onfinish!;
    if (reason === 'destroy') s.controller.destroy(); else s.show('other');
    stale(); s.controller.sync();
    expect(close).not.toHaveBeenCalled();
    expect(s.page.inert).toBe(false);
    expect(s.page.dataset.exiting).toBe('false');
    expect(s.controller.isNavigating()).toBe(false);
    s.controller.destroy();
  });
});
