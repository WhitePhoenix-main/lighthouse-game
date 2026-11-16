import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSettingsTransition } from '../src/presentation/settingsTransition';

afterEach(() => vi.unstubAllGlobals());

function fixture(reduced = false) {
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const observers: { callback: () => void; observing: boolean }[] = [];
  vi.stubGlobal('window', { matchMedia: () => media });
  vi.stubGlobal('MutationObserver', class {
    state: { callback: () => void; observing: boolean };
    constructor(callback: () => void) { this.state = { callback, observing: false }; observers.push(this.state); }
    observe() { this.state.observing = true; }
    disconnect() { this.state.observing = false; }
  });
  const animations: ReturnType<typeof makeAnimation>[] = [];
  const scrimAnimations: ReturnType<typeof makeAnimation>[] = [];
  function makeAnimation() {
    const animation = {
      currentTime: 0, playState: 'running', onfinish: null as null | (() => void),
      pause: vi.fn(() => { animation.playState = 'paused'; }),
      play: vi.fn(() => { animation.playState = 'running'; }),
      cancel: vi.fn(() => { animation.playState = 'idle'; })
    };
    return animation;
  }
  function makePage(ready = 'loading') {
    const board = { animate: vi.fn(() => { const a = makeAnimation(); animations.push(a); return a; }) };
    const scrim = { animate: vi.fn(() => { const a = makeAnimation(); scrimAnimations.push(a); return a; }) };
    return { dataset: { ready, entering: '' }, board, querySelector: (selector: string) => selector === '.settings-board' ? board : selector === '.settings-scrim' ? scrim : null };
  }
  let page: ReturnType<typeof makePage> | null = makePage();
  const overlay = { clientWidth: 1280, querySelector: (selector: string) => selector === '.reference-settings' ? page : null } as unknown as HTMLElement;
  const transition = mountSettingsTransition(overlay);
  return {
    transition, media, animations, scrimAnimations, get page() { return page!; },
    ready() { page!.dataset.ready = 'true'; for (const o of observers) if (o.observing) o.callback(); },
    replace(ready = 'true') { page = makePage(ready); transition.sync(); },
    leave() { page = null; transition.sync(); }
  };
}

describe('one settings entrance per visit', () => {
  it('waits for artwork and starts only once when layout becomes ready', () => {
    const s = fixture();
    expect(s.page.dataset.entering).toBe('pending');
    expect(s.animations).toHaveLength(0);
    s.ready(); s.transition.sync(); s.ready();
    expect(s.animations).toHaveLength(1);
    expect(s.page.dataset.entering).toBe('true');
    s.animations[0]!.onfinish!();
    expect(s.page.dataset.entering).toBe('false');
    expect(s.animations[0]!.cancel).toHaveBeenCalledOnce();
    s.transition.destroy();
  });

  it('preserves elapsed entrance time across rerender and resets only after leaving', () => {
    const s = fixture(); s.ready();
    s.animations[0]!.currentTime = 180;
    s.replace();
    expect(s.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(s.animations[1]!.currentTime).toBe(180);
    s.animations[1]!.onfinish!(); s.replace();
    expect(s.animations).toHaveLength(2);
    expect(s.page.dataset.entering).toBe('false');
    s.leave(); s.replace();
    expect(s.animations).toHaveLength(3);
    expect(s.animations[2]!.currentTime).toBe(0);
    s.transition.destroy();
  });

  it('freezes an entrance including a board replaced while paused', () => {
    const s = fixture(); s.transition.setPaused(true); s.ready();
    expect(s.animations[0]!.playState).toBe('paused');
    s.animations[0]!.currentTime = 130; s.replace();
    expect(s.animations[1]!.currentTime).toBe(130);
    expect(s.animations[1]!.playState).toBe('paused');
    expect(s.scrimAnimations[1]!.currentTime).toBe(130);
    expect(s.scrimAnimations[1]!.playState).toBe('paused');
    s.transition.setPaused(false);
    expect(s.animations[1]!.play).toHaveBeenCalledOnce();
    expect(s.scrimAnimations[1]!.play).toHaveBeenCalledOnce();
    s.transition.destroy();
  });

  it('settles immediately with reduced motion and does not replay when preference changes', () => {
    const s = fixture(true);
    expect(s.page.dataset.entering).toBe('false');
    s.ready(); s.media.matches = false; s.media.dispatchEvent(new Event('change')); s.replace();
    expect(s.animations).toHaveLength(0);
    s.leave(); s.replace();
    expect(s.animations).toHaveLength(1);
    s.media.matches = true; s.media.dispatchEvent(new Event('change'));
    expect(s.page.dataset.entering).toBe('false');
    expect(s.animations[0]!.cancel).toHaveBeenCalledOnce();
    s.transition.destroy();
  });

  it('cancels on teardown and ignores stale readiness or animation completion', () => {
    const s = fixture(); s.ready();
    const stale = s.animations[0]!.onfinish!;
    s.transition.destroy(); stale(); s.ready(); s.transition.sync();
    expect(s.animations).toHaveLength(1);
    expect(s.animations[0]!.onfinish).toBeNull();
    expect(s.scrimAnimations[0]!.cancel).toHaveBeenCalledOnce();
    expect(s.page.dataset.entering).toBe('false');
  });

  it('reveals usable fallback controls when artwork fails', () => {
    const s = fixture(); s.replace('error');
    expect(s.page.dataset.entering).toBe('true');
    expect(s.animations).toHaveLength(1);
    s.animations[0]!.onfinish!();
    expect(s.page.dataset.entering).toBe('false');
    s.transition.destroy();
  });
});
