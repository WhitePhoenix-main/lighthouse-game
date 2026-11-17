import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountGameMenuTransition } from '../src/presentation/menu/gameMenuTransition';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture(initial: 'menu' | 'game-menu' | 'other' = 'menu', ready = 'true', mobile = false) {
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('window', {
    matchMedia: () => media,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms), clearTimeout: (timer: number) => clearTimeout(timer),
    getComputedStyle: (element: unknown) => Object.assign(
      ['--menu-scale', '--menu-text-scale', 'font', 'background-position'], {
        getPropertyValue: (key: string) => ({ '--menu-scale': '1.5', '--menu-text-scale': textScale, font: '24px Avalon Menu', 'background-position': '50% 0%' })[key] ?? '',
        transform: element === board ? 'matrix(1, 0, 0, 1, 0, 123)' : 'none',
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
    cloneNode(): FakeNode; focus: ReturnType<typeof vi.fn>;
  }
  let viewport = { width: 540, height: 960 };
  let textScale = '1.12';
  function element(): FakeNode {
    const attributes = new Map<string, string>([['id', 'menu-title'], ['data-action', 'game-menu'], ['data-focus-key', 'game-menu']]);
    const properties: Record<string, string> = {};
    const classes = new Set(['menu-artboard', 'menu-title-ready']);
    const node: FakeNode = { focus: vi.fn(), dataset: {}, inert: false, attributes, properties, classes, children: [],
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
    return { ...node, button, querySelector: (selector: string) => selector === '.play-hotspot' ? button : null };
  }
  const created: FakeNode[] = [];
  let screen = initial;
  let menu = makeMenu();
  let board = element();
  let page = { ...element(), dataset: { ready, entering: '', exiting: '', layout: mobile ? 'mobile' : 'desktop' } as Record<string, string>, querySelector: (selector: string) => selector === '.game-menu-board' ? board : null };
  const overlay = { clientWidth: 390,
    ownerDocument: { createElement: () => { const node = element(); node.classes.clear(); created.push(node); return node; } },
    parentElement: { clientLeft: 0, clientTop: 0, getBoundingClientRect: () => ({ left: 10, top: 15 }) },
    before: vi.fn(), querySelector: (selector: string) => selector === '.reference-game-menu'
    ? (screen === 'game-menu' ? page : null) : screen === 'menu' ? menu : null } as unknown as HTMLElement;
  const controller = mountGameMenuTransition(overlay);
  return {
    controller, animations, media, get ghosts() { return created.filter(node => 'gameMenuGhost' in node.dataset); }, get staging() { return created.filter(node => !('gameMenuGhost' in node.dataset)); }, get page() { return page; }, get menu() { return menu; },
    setLayout(value: string) { page.dataset.layout = value; },
    button() { return Object.assign(element(), { disabled: false, isConnected: true }) as unknown as HTMLButtonElement; },
    ready() { page.dataset.ready = 'true'; readinessChanged(); },
    get ghostBoard() { return created.filter(node => 'gameMenuGhost' in node.dataset).at(-1)?.children[0] as FakeNode; },
    resize(width: number, height: number) { viewport = { width, height }; },
    textScale(value: string) { textScale = value; },
    show(next: typeof initial) { screen = next; controller.sync(); },
    replace() {
      if (screen === 'menu') { menu.button.isConnected = false; menu = makeMenu(); }
      else { board = element(); page = { ...page }; }
      controller.sync();
    },
    finish(index: number) { const a = animations[index]!; a.currentTime = Number(a.options.duration); a.onfinish!(); },
  };
}

describe('game menu navigation motion', () => {
  it.each([false, true])('moves the whole board from below with a simultaneous menu fade (mobile=%s)', mobile => {
    const s = fixture('menu', 'true', mobile);
    const open = vi.fn(() => s.show('game-menu'));
    s.controller.open(open); s.controller.open(open);
    expect(open).toHaveBeenCalledOnce();
    expect(s.animations).toHaveLength(2);
    expect(s.animations[0]!.frames).toEqual([
      { transform: 'translateY(calc(100% + 1px))', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ]);
    expect(s.animations[1]!.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(s.animations.map(a => a.options)).toEqual(Array(2).fill({ duration: 560, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }));
    expect(s.animations.map(a => a.startTime)).toEqual([1000, 1000]);
    expect(s.page.inert).toBe(true); // Escape reverses entry without enabling duplicate button actions
    const ghost = s.ghosts[0]!;
    expect(ghost.inert).toBe(true);
    expect(ghost.attributes.get('aria-hidden')).toBe('true');
    expect(s.ghostBoard.attributes.has('data-action')).toBe(false);
    expect(s.ghostBoard.classes.has('menu-artboard')).toBe(false);
    s.finish(0);
    expect(ghost.remove).toHaveBeenCalledOnce();
    const close = vi.fn(() => {
      expect(s.page.dataset.departed).toBe('true');
      s.show('menu');
    });
    s.controller.close(close); s.controller.close(close);
    expect(s.page.inert).toBe(true);
    expect(s.animations[2]!.frames.at(-1)).toEqual({ transform: 'translateY(calc(100% + 1px))', opacity: 0 });
    expect(s.animations[3]!.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(close).not.toHaveBeenCalled();
    const stale = s.animations[2]!.onfinish!;
    s.finish(2); stale();
    expect(close).toHaveBeenCalledOnce();
    expect(s.menu.button.focus).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('reverses entry from its computed pose and retains the timeline through rotation and repaint', () => {
    const s = fixture();
    s.controller.open(() => s.show('game-menu'));
    s.animations[0]!.currentTime = 140;
    const stale = s.animations[0]!.onfinish!;
    const close = vi.fn(() => s.show('menu'));
    s.controller.close(close);
    expect(s.animations[2]!.frames[0]).toEqual({ transform: 'matrix(1, 0, 0, 1, 0, 123)', opacity: '0.45' });
    expect(s.animations[3]!.frames[0]).toEqual({ opacity: '0.4' });
    stale(); expect(close).not.toHaveBeenCalled();
    s.animations[2]!.currentTime = 123;
    s.setLayout('mobile'); s.resize(844, 390); s.replace();
    expect(s.animations.slice(4).map(a => a.currentTime)).toEqual([123, 123]);
    expect(s.animations[4]!.frames.at(-1)).toEqual({ transform: 'translateY(calc(100% + 1px))', opacity: 0 });
    expect(s.ghosts[1]!.remove).toHaveBeenCalledOnce();
    s.finish(4); expect(close).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('preserves entry playheads across markup replacements and never restarts a settled menu', () => {
    const s = fixture();
    s.controller.open(() => s.show('game-menu'));
    s.animations[0]!.currentTime = 91; s.replace();
    expect(s.animations.slice(2).map(a => a.currentTime)).toEqual([91, 91]);
    expect(s.ghosts).toHaveLength(1);
    s.finish(2); s.replace();
    expect(s.animations).toHaveLength(4);
    s.controller.destroy();
  });

  it.each(['close', 'pause', 'reduce', 'destroy', 'external'] as const)('cleans pending artwork on %s', reason => {
    const s = fixture('menu', 'pending');
    s.controller.open(() => s.show('game-menu'));
    expect(s.page.dataset.entering).toBe('pending');
    expect(s.animations).toHaveLength(0);
    const close = vi.fn(() => s.show('menu'));
    if (reason === 'close') s.controller.close(close);
    else if (reason === 'pause') { s.controller.setPaused(true); s.ready(); }
    else if (reason === 'reduce') { s.media.matches = true; s.media.dispatchEvent(new Event('change')); }
    else if (reason === 'destroy') s.controller.destroy();
    else s.show('other');
    expect(s.ghosts[0]!.remove).toHaveBeenCalledOnce();
    expect(s.animations).toHaveLength(0);
    if (reason === 'close') expect(close).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it.each(['pause', 'reduce', 'destroy', 'external'] as const)('settles or cancels active exit exactly once on %s', reason => {
    const s = fixture(); s.controller.open(() => s.show('game-menu')); s.finish(0);
    const close = vi.fn(() => s.show('menu')); s.controller.close(close);
    const stale = s.animations[2]!.onfinish!;
    if (reason === 'pause') s.controller.setPaused(true);
    else if (reason === 'reduce') { s.media.matches = true; s.media.dispatchEvent(new Event('change')); }
    else if (reason === 'destroy') s.controller.destroy(); else s.show('other');
    stale();
    expect(close).toHaveBeenCalledTimes(reason === 'pause' || reason === 'reduce' ? 1 : 0);
    expect(s.controller.isNavigating()).toBe(false);
    s.controller.destroy();
  });

  it('uses one 140ms press, discards detached presses and cancels presses on lifecycle pause', () => {
    vi.useFakeTimers();
    const s = fixture(); s.controller.open(() => s.show('game-menu')); s.finish(0);
    const button = s.button(), callback = vi.fn();
    s.controller.press(button, callback); s.controller.press(button, callback);
    expect(button.classList).toBeDefined();
    vi.advanceTimersByTime(139); expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(callback).toHaveBeenCalledOnce();
    s.controller.press(button, callback); s.controller.setPaused(true);
    vi.advanceTimersByTime(140); expect(callback).toHaveBeenCalledOnce();
    s.controller.setPaused(false);
    s.controller.press(button, callback); Object.assign(button, { isConnected: false });
    vi.advanceTimersByTime(140); expect(callback).toHaveBeenCalledOnce();
    s.controller.destroy();
  });
});
