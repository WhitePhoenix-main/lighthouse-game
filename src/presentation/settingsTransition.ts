const duration = 420;
const menuDuration = 220;
type Phase = 'idle' | 'entry' | 'menu-out' | 'exit' | 'menu-in';

/** Navigation owns the real DOM until its outro finishes; rerenders retain the playhead. */
export function mountSettingsTransition(overlay: HTMLElement): {
  sync(): void;
  openSettings(navigate: () => void): void;
  closeSettings(navigate: () => void): void;
  isNavigating(): boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
} {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let page: HTMLElement | null = null;
  let board: HTMLElement | null = null;
  let scrim: HTMLElement | null = null;
  let menu: HTMLElement | null = null;
  let animation: Animation | null = null;
  let scrimAnimation: Animation | null = null;
  let phase: Phase = 'idle';
  let elapsed = 0;
  let completed = false;
  let paused = false;
  let destroyed = false;
  let committing = false;
  let navigate: (() => void) | null = null;
  let exitFrom: Keyframe = {};
  let scrimFrom = '1';

  const busy = (element: HTMLElement | null, value: boolean): void => {
    if (!element) return;
    element.inert = value;
    if (value) element.setAttribute?.('aria-busy', 'true');
    else element.removeAttribute?.('aria-busy');
  };
  const cancelAnimation = (): void => {
    if (animation) { animation.onfinish = null; animation.cancel(); }
    scrimAnimation?.cancel();
    animation = null;
    scrimAnimation = null;
  };
  const release = (): void => {
    if (page) { page.dataset.entering = 'false'; page.dataset.exiting = 'false'; }
    if (menu) menu.dataset.menuTransition = 'false';
    busy(page, false);
    busy(menu, false);
  };
  const abort = (): void => {
    cancelAnimation();
    release();
    navigate = null;
    phase = 'idle';
    elapsed = 0;
  };
  const finish = (): void => {
    const finishedPhase = phase;
    cancelAnimation();
    release();
    elapsed = 0;
    if (finishedPhase === 'entry') {
      completed = true;
      phase = 'idle';
      return;
    }
    const callback = navigate;
    navigate = null;
    phase = finishedPhase === 'exit' ? 'menu-in' : 'idle';
    if (finishedPhase === 'menu-in') {
      // Restoring while the intro is inert is ignored by browsers. Resolve the
      // current button here because locale/layout rerenders replace the markup.
      const currentMenu = overlay.querySelector<HTMLElement>('.menu-artboard');
      const target = menu === currentMenu ? menu?.querySelector<HTMLElement>('[data-action="settings"]') : null;
      if (!destroyed && target?.isConnected) target.focus({ preventScroll: true });
    }
    if (!callback) return;
    // sync() may run inside the callback. It must recognize this as our navigation.
    committing = true;
    try { callback(); } finally { committing = false; }
    if (!destroyed) sync();
  };
  const run = (target: HTMLElement, frames: Keyframe[], length: number, scrimFrames?: Keyframe[]): void => {
    const current = target.animate(frames, {
      duration: length, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
    });
    animation = current;
    current.currentTime = elapsed;
    if (paused) current.pause();
    if (scrimFrames && scrim && typeof scrim.animate === 'function') {
      scrimAnimation = scrim.animate(scrimFrames, {
        duration: length, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
      });
      scrimAnimation.currentTime = elapsed;
      if (paused) scrimAnimation.pause();
    }
    current.onfinish = () => {
      if (!destroyed && animation === current) finish();
    };
  };
  const distance = (): number => Math.min(640, Math.max(360, overlay.clientWidth * 0.52));
  const reveal = (): void => {
    if (destroyed || animation) return;
    if (phase === 'menu-out' || phase === 'menu-in') {
      if (!menu) { if (!committing) abort(); return; }
      menu.dataset.menuTransition = phase === 'menu-out' ? 'out' : 'in';
      busy(menu, true);
      if (reducedMotion.matches || typeof menu.animate !== 'function') { finish(); return; }
      run(menu, [{ opacity: phase === 'menu-in' ? 0 : 1 }, { opacity: phase === 'menu-in' ? 1 : 0 }], menuDuration);
      return;
    }
    if (!page || !board) return;
    if (phase === 'exit') {
      page.dataset.entering = 'false';
      page.dataset.exiting = 'true';
      busy(page, true);
      if (reducedMotion.matches || typeof board.animate !== 'function') { finish(); return; }
      run(board, [exitFrom, { transform: `translateX(-${distance()}px)`, opacity: 0 }], duration,
        [{ opacity: scrimFrom }, { opacity: 0 }]);
      return;
    }
    if (completed || reducedMotion.matches || typeof board.animate !== 'function') {
      phase = 'entry'; finish(); return;
    }
    phase = 'entry';
    if (page.dataset.ready !== 'true' && page.dataset.ready !== 'error') {
      page.dataset.entering = 'pending';
      return;
    }
    page.dataset.entering = 'true';
    run(board, [{ transform: `translateX(-${distance()}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 }], duration, [{ opacity: 0 }, { opacity: 1 }]);
  };
  const observer = new MutationObserver(reveal);

  function sync(): void {
    if (destroyed) return;
    const nextPage = overlay.querySelector<HTMLElement>('.reference-settings');
    const nextBoard = nextPage?.querySelector<HTMLElement>('.settings-board') ?? null;
    const nextScrim = nextPage?.querySelector<HTMLElement>('.settings-scrim') ?? null;
    const nextMenu = nextPage ? null : overlay.querySelector<HTMLElement>('.menu-artboard');
    if (nextPage === page && nextBoard === board && nextScrim === scrim && nextMenu === menu) {
      reveal(); return;
    }
    // Replacing markup on the same screen keeps a transition; leaving that screen cancels it.
    if (!committing && ((phase === 'exit' && !nextPage) ||
      ((phase === 'menu-out' || phase === 'menu-in') && !nextMenu))) abort();
    if (animation) {
      const time = animation.currentTime;
      if (typeof time === 'number') elapsed = Math.max(0, time);
      if (phase === 'entry' && (animation.playState === 'finished' || elapsed >= duration)) completed = true;
      cancelAnimation();
    }
    observer.disconnect();
    release();
    const wasPage = page !== null;
    page = nextPage; board = nextBoard; scrim = nextScrim; menu = nextMenu;
    if (!page) {
      completed = false;
      if (phase === 'entry' || (phase === 'idle' && wasPage)) { phase = 'idle'; elapsed = 0; }
    } else {
      page.dataset.exiting = phase === 'exit' ? 'true' : 'false';
      observer.observe(page, { attributes: true, attributeFilter: ['data-ready'] });
    }
    reveal();
  }
  const motionChanged = (): void => {
    if (reducedMotion.matches && phase !== 'idle') finish();
  };
  reducedMotion.addEventListener('change', motionChanged);
  sync();

  return {
    sync,
    openSettings(callback) {
      if (destroyed || navigate || phase === 'menu-out' || phase === 'menu-in' || phase === 'exit' || page) return;
      navigate = callback;
      phase = 'menu-out'; elapsed = 0;
      if (!menu) finish(); else reveal();
    },
    closeSettings(callback) {
      if (destroyed || !page || navigate || phase === 'exit' || phase === 'menu-in' || phase === 'menu-out') return;
      const pending = page.dataset.entering === 'pending';
      const style = board && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(board) : null;
      const scrimStyle = scrim && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(scrim) : null;
      exitFrom = { transform: style?.transform ?? 'translateX(0)', opacity: style?.opacity ?? '1' };
      scrimFrom = scrimStyle?.opacity ?? '1';
      cancelAnimation();
      phase = 'exit'; elapsed = 0; navigate = callback;
      if (pending) finish(); else reveal();
    },
    isNavigating: () => phase === 'menu-out' || phase === 'exit' || phase === 'menu-in',
    setPaused(value) {
      if (destroyed || paused === value) return;
      paused = value;
      if (paused) { animation?.pause(); scrimAnimation?.pause(); }
      else { animation?.play(); scrimAnimation?.play(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      reducedMotion.removeEventListener('change', motionChanged);
      abort();
      page = null; board = null; scrim = null; menu = null;
    },
  };
}
