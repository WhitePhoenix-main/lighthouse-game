import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsTransition } from '../src/presentation/settingsTransition';

afterEach(() => vi.unstubAllGlobals());

function fixture(initial: 'menu' | 'settings' | 'other' = 'menu', ready = 'true') {
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('window', {
    matchMedia: () => media,
    getComputedStyle: (element: unknown) => element === board
      ? { transform: 'matrix(1, 0, 0, 1, -123, 0)', opacity: '0.45' }
      : { opacity: '0.4' },
  });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  interface FakeAnimation {
    frames: Keyframe[]; options: KeyframeAnimationOptions; currentTime: number;
    playState: string; onfinish: (() => void) | null;
    cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>;
  }
  const animations: FakeAnimation[] = [];
  function makeAnimation(frames: Keyframe[], options: KeyframeAnimationOptions): FakeAnimation {
    const result = {
      frames, options, currentTime: 0, playState: 'running', onfinish: null as (() => void) | null,
      cancel: vi.fn(), pause: vi.fn(() => { result.playState = 'paused'; }),
      play: vi.fn(() => { result.playState = 'running'; }),
    };
    animations.push(result); return result;
  }
  function element() {
    return { dataset: {} as Record<string, string>, inert: false, setAttribute: vi.fn(),
      removeAttribute: vi.fn(), animate: vi.fn(makeAnimation) };
  }
  function makeMenu() {
    const button = { isConnected: true, focus: vi.fn() };
    return { ...element(), button, querySelector: (selector: string) => selector === '[data-action="settings"]' ? button : null };
  }
  let screen = initial;
  let menu = makeMenu();
  let board = element();
  let scrim = element();
  let page = { ...element(), dataset: { ready, entering: '', exiting: '' }, querySelector: (selector: string) => selector === '.settings-board' ? board : scrim };
  const overlay = { clientWidth: 390, querySelector: (selector: string) => selector === '.reference-settings'
    ? (screen === 'settings' ? page : null) : screen === 'menu' ? menu : null } as unknown as HTMLElement;
  const controller = mountSettingsTransition(overlay);
  return {
    controller, animations, media, get page() { return page; }, get menu() { return menu; },
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
  it('keeps menu inert through its outro, navigates once, then enters settings', () => {
    const s = fixture();
    const navigate = vi.fn(() => s.show('settings'));
    s.controller.openSettings(navigate); s.controller.openSettings(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(s.controller.isNavigating()).toBe(true);
    expect(s.menu.inert).toBe(true);
    expect(s.menu.dataset.menuTransition).toBe('out');
    const stale = s.animations[0]!.onfinish!;
    s.finish(0); stale();
    expect(navigate).toHaveBeenCalledOnce();
    expect(s.menu.inert).toBe(false);
    expect(s.controller.isNavigating()).toBe(false);
    expect(s.page.dataset.entering).toBe('true');
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

  it('preserves callback and frozen playheads across rerenders in every navigation phase', () => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    s.animations[0]!.currentTime = 83;
    s.controller.setPaused(true); s.replace();
    expect(s.animations[1]!.currentTime).toBe(83);
    expect(s.animations[1]!.playState).toBe('paused');
    s.controller.setPaused(false); s.finish(1);
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close);
    s.animations[4]!.currentTime = 91;
    s.controller.setPaused(true); s.replace();
    expect(s.animations[6]!.currentTime).toBe(91);
    expect(s.animations[7]!.playState).toBe('paused');
    s.controller.setPaused(false); s.finish(6);
    s.animations[8]!.currentTime = 54;
    s.controller.setPaused(true); s.replace();
    expect(s.animations[9]!.currentTime).toBe(54);
    expect(s.animations[9]!.playState).toBe('paused');
    s.controller.setPaused(false); s.finish(9);
    expect(open).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('settles reduced motion changes once, including exit followed by menu introduction', () => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    s.media.matches = true; s.media.dispatchEvent(new Event('change'));
    expect(open).toHaveBeenCalledOnce();
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

  it('cancels menu outro on an unrelated screen and settles an in-flight menu intro', () => {
    const s = fixture();
    const open = vi.fn(() => s.show('settings'));
    s.controller.openSettings(open);
    const stale = s.animations[0]!.onfinish!;
    s.show('other'); stale();
    expect(open).not.toHaveBeenCalled();
    expect(s.menu.inert).toBe(false);
    s.show('settings');
    const close = vi.fn(() => s.show('menu'));
    s.controller.closeSettings(close); s.finish(3);
    expect(s.menu.dataset.menuTransition).toBe('in');
    s.media.matches = true; s.media.dispatchEvent(new Event('change'));
    expect(close).toHaveBeenCalledOnce();
    expect(s.menu.dataset.menuTransition).toBe('false');
    expect(s.controller.isNavigating()).toBe(false);
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
