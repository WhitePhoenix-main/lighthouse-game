const duration = 420;
const menuDuration = 220;
type Phase = 'idle' | 'entry' | 'exit' | 'menu-in';

/** A visual-only copy survives replacement of the overlay while artwork loads. */
function snapshotMenu(overlay: HTMLElement, menu: HTMLElement): { host: HTMLElement; board: HTMLElement } {
  const host = overlay.ownerDocument.createElement('div');
  host.dataset.settingsMenuGhost = '';
  host.inert = true;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  const clone = menu.cloneNode(true) as HTMLElement;
  const sources = [menu, ...menu.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  sources.forEach((source, index) => {
    const copy = copies[index]!;
    // Preserve fonts, inherited custom properties and the current sprite frame,
    // including styles that depend on ancestors which will disappear on navigation.
    const style = window.getComputedStyle(source);
    for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
    for (const attribute of ['id', 'data-action', 'data-focus-key', 'aria-labelledby', 'aria-describedby']) copy.removeAttribute(attribute);
    copy.inert = true;
    copy.setAttribute('tabindex', '-1');
    copy.style.pointerEvents = 'none';
    copy.style.animation = 'none';
    copy.style.transition = 'none';
    copy.classList.remove('menu-title-ready');
  });
  clone.classList.remove('menu-artboard');
  clone.classList.add('settings-menu-outgoing');
  const rect = menu.getBoundingClientRect();
  const parent = overlay.parentElement!;
  const parentRect = parent.getBoundingClientRect();
  clone.style.position = 'absolute';
  clone.style.left = `${rect.left - parentRect.left - parent.clientLeft}px`;
  clone.style.top = `${rect.top - parentRect.top - parent.clientTop}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.transform = 'none';
  clone.style.opacity = '1';
  clone.style.background = 'transparent';
  host.append(clone);
  overlay.before(host);
  return { host, board: clone };
}

/** Entry crossfades a menu snapshot; exit retains the real DOM until its outro finishes. */
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
  let ghost: ReturnType<typeof snapshotMenu> | null = null;
  let ghostAnimation: Animation | null = null;
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
  const cancelAnimation = (preserveGhostFrame = false): void => {
    if (preserveGhostFrame && ghost && ghostAnimation) {
      // A replacement board can itself wait for assets. Keep the outgoing menu
      // at its current opacity until all three timelines can resume together.
      ghost.board.style.opacity = window.getComputedStyle(ghost.board).opacity;
    }
    if (animation) { animation.onfinish = null; animation.cancel(); }
    scrimAnimation?.cancel();
    ghostAnimation?.cancel();
    animation = null;
    scrimAnimation = null;
    ghostAnimation = null;
  };
  const removeGhost = (): void => { ghost?.host.remove(); ghost = null; };
  const release = (): void => {
    if (page) { page.dataset.entering = 'false'; page.dataset.exiting = 'false'; }
    if (menu) menu.dataset.menuTransition = 'false';
    busy(page, false);
    busy(menu, false);
  };
  const abort = (): void => {
    cancelAnimation();
    removeGhost();
    release();
    navigate = null;
    phase = 'idle';
    elapsed = 0;
  };
  const finish = (): void => {
    const finishedPhase = phase;
    cancelAnimation();
    removeGhost();
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
    const options = {
      duration: length, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
    } satisfies KeyframeAnimationOptions;
    const current = target.animate(frames, options);
    animation = current;
    if (scrimFrames && scrim && typeof scrim.animate === 'function') {
      scrimAnimation = scrim.animate(scrimFrames, options);
    }
    if (phase === 'entry' && ghost) {
      ghostAnimation = ghost.board.animate([{ opacity: 1 }, { opacity: 0 }], options);
    }
    // Use a shared timeline origin, also for animations recreated after a repaint.
    const start = current.timeline?.currentTime;
    for (const motion of [current, scrimAnimation, ghostAnimation]) {
      if (!motion) continue;
      motion.currentTime = elapsed;
      if (paused) motion.pause();
      else if (typeof start === 'number') motion.startTime = start - elapsed;
    }
    current.onfinish = () => {
      if (!destroyed && animation === current) finish();
    };
  };
  const distance = (): number => Math.min(640, Math.max(360, overlay.clientWidth * 0.52));
  const reveal = (): void => {
    if (destroyed || animation) return;
    if (phase === 'menu-in') {
      if (!menu) { if (!committing) abort(); return; }
      menu.dataset.menuTransition = 'in';
      busy(menu, true);
      if (reducedMotion.matches || typeof menu.animate !== 'function') { finish(); return; }
      run(menu, [{ opacity: 0 }, { opacity: 1 }], menuDuration);
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
      (phase === 'entry' && !nextPage) || (phase === 'menu-in' && !nextMenu))) abort();
    if (animation) {
      const time = animation.currentTime;
      if (typeof time === 'number') elapsed = Math.max(0, time);
      if (phase === 'entry' && (animation.playState === 'finished' || elapsed >= duration)) completed = true;
      cancelAnimation(true);
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
      if (destroyed || navigate || committing || phase === 'menu-in' || phase === 'exit' || page) return;
      if (menu && !reducedMotion.matches) ghost = snapshotMenu(overlay, menu);
      busy(menu, true);
      phase = 'entry'; elapsed = 0;
      committing = true;
      try { callback(); } finally { committing = false; }
      if (!destroyed) { sync(); if (!page) abort(); }
    },
    closeSettings(callback) {
      if (destroyed || !page || navigate || phase === 'exit' || phase === 'menu-in') return;
      const pending = page.dataset.entering === 'pending';
      const style = board && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(board) : null;
      const scrimStyle = scrim && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(scrim) : null;
      exitFrom = { transform: style?.transform ?? 'translateX(0)', opacity: style?.opacity ?? '1' };
      scrimFrom = scrimStyle?.opacity ?? '1';
      cancelAnimation();
      removeGhost();
      phase = 'exit'; elapsed = 0; navigate = callback;
      if (pending) finish(); else reveal();
    },
    isNavigating: () => phase === 'exit' || phase === 'menu-in',
    setPaused(value) {
      if (destroyed || paused === value) return;
      paused = value;
      for (const motion of [animation, scrimAnimation, ghostAnimation]) {
        if (!motion) continue;
        if (paused) motion.pause(); else motion.play();
      }
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
