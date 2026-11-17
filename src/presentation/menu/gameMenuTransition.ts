import { layoutReferenceMenu } from './referenceMenu';

const duration = 560;
const menuDuration = 220;
const PRESS_MS = 140;
type Phase = 'idle' | 'entry' | 'exit' | 'menu-in';

/** A visual-only copy survives replacement of the overlay while artwork loads. */
function snapshotMenu(overlay: HTMLElement, menu: HTMLElement): { host: HTMLElement; board: HTMLElement } {
  const host = overlay.ownerDocument.createElement('div');
  host.dataset.gameMenuGhost = '';
  host.dataset.gameMenuDirection = 'out';
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
  clone.classList.add('game-menu-outgoing');
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

/** Crossfade controls over the persistent scenery, retaining the real board through its outro. */
export function mountGameMenuTransition(overlay: HTMLElement): {
  sync(): void;
  open(navigate: () => void): void;
  close(navigate: () => void): void;
  press(button: HTMLButtonElement, navigate: () => void): void;
  isNavigating(): boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
} {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let page: HTMLElement | null = null;
  let board: HTMLElement | null = null;
  let menu: HTMLElement | null = null;
  let animation: Animation | null = null;
  let ghost: ReturnType<typeof snapshotMenu> | null = null;
  let ghostAnimation: Animation | null = null;
  // Retain authored styles, not a frozen computed snapshot: language, text size
  // and orientation may all change while the game menu page is open.
  let menuTemplate: HTMLElement | null = null;
  let concurrentReturn = false;
  let incomingOpacity: string | number = 0;
  let phase: Phase = 'idle';
  let elapsed = 0;
  let completed = false;
  let paused = false;
  let destroyed = false;
  let committing = false;
  let navigate: (() => void) | null = null;
  let exitFrom: Keyframe = {};
  let pressTimer: number | undefined;
  let pressed: HTMLButtonElement | null = null;
  const clearPress = (): void => {
    window.clearTimeout(pressTimer);
    pressed?.classList.remove('is-pressed');
    pressed = null; pressTimer = undefined;
  };

  const busy = (element: HTMLElement | null, value: boolean): void => {
    if (!element) return;
    element.inert = value;
    if (value) element.setAttribute?.('aria-busy', 'true');
    else element.removeAttribute?.('aria-busy');
  };
  const cancelAnimation = (preserveGhostFrame = false): void => {
    if (preserveGhostFrame && ghost && ghostAnimation) {
      // A replacement board can itself wait for assets. Keep the outgoing menu
      // at its current opacity until both timelines can resume together.
      ghost.board.style.opacity = window.getComputedStyle(ghost.board).opacity;
    }
    if (animation) { animation.onfinish = null; animation.cancel(); }
    ghostAnimation?.cancel();
    animation = null;
    ghostAnimation = null;
  };
  const removeGhost = (): void => { ghost?.host.remove(); ghost = null; };
  const incomingMenu = (): ReturnType<typeof snapshotMenu> | null => {
    if (!menuTemplate) return null;
    const holder = overlay.ownerDocument.createElement('div');
    holder.inert = true;
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;overflow:hidden;';
    const wrapper = overlay.ownerDocument.createElement('section');
    wrapper.classList.add('avalon-menu');
    const raw = menuTemplate.cloneNode(true) as HTMLElement;
    for (const node of [raw, ...raw.querySelectorAll<HTMLElement>('*')]) {
      for (const attribute of ['id', 'data-action', 'data-focus-key', 'aria-labelledby', 'aria-describedby']) node.removeAttribute(attribute);
      node.classList.remove('is-menu-pressing');
      node.inert = true;
    }
    wrapper.append(raw);
    holder.append(wrapper);
    overlay.before(holder);
    try {
      layoutReferenceMenu(holder);
      const snapshot = snapshotMenu(overlay, raw);
      snapshot.host.dataset.gameMenuDirection = 'in';
      // The staging wrapper is hidden; the frozen artwork itself must be visible.
      for (const node of [snapshot.board, ...snapshot.board.querySelectorAll<HTMLElement>('*')]) node.style.visibility = 'visible';
      snapshot.board.style.opacity = String(incomingOpacity);
      return snapshot;
    } finally { holder.remove(); }
  };
  const release = (): void => {
    if (page) { page.dataset.entering = 'false'; page.dataset.exiting = 'false'; }
    if (menu) menu.dataset.menuTransition = 'false';
    busy(page, false);
    busy(menu, false);
  };
  const abort = (): void => {
    clearPress();
    cancelAnimation();
    removeGhost();
    release();
    if (page) delete page.dataset.departed;
    navigate = null;
    menuTemplate = null;
    concurrentReturn = false;
    incomingOpacity = 0;
    phase = 'idle';
    elapsed = 0;
  };
  const finish = (): void => {
    const finishedPhase = phase;
    const departingPage = finishedPhase === 'exit' ? page : null;
    // cancel() removes the filled final frame. Hide the retiring surface first,
    // so its untransformed canvas/header cannot reappear during DOM handoff.
    if (departingPage) departingPage.dataset.departed = 'true';
    cancelAnimation();
    removeGhost();
    release();
    elapsed = 0;
    if (finishedPhase === 'entry') {
      const firstCompletion = !completed;
      completed = true;
      phase = 'idle';
      if (firstCompletion) page?.querySelector<HTMLElement>('[data-action="continue-game"]:not(:disabled),[data-action="new-game"]')?.focus({ preventScroll: true });
      return;
    }
    const callback = navigate;
    navigate = null;
    const returningConcurrently = finishedPhase === 'exit' && concurrentReturn;
    phase = finishedPhase === 'exit' && !returningConcurrently ? 'menu-in' : 'idle';
    if (finishedPhase === 'menu-in') {
      // Restoring while the intro is inert is ignored by browsers. Resolve the
      // current button here because locale/layout rerenders replace the markup.
      const currentMenu = overlay.querySelector<HTMLElement>('.menu-artboard');
      const target = menu === currentMenu ? menu?.querySelector<HTMLElement>('.play-hotspot') : null;
      if (!destroyed && target?.isConnected) target.focus({ preventScroll: true });
    }
    if (!callback) {
      if (departingPage) delete departingPage.dataset.departed;
      return;
    }
    // sync() may run inside the callback. It must recognize this as our navigation.
    committing = true;
    try { callback(); } finally {
      committing = false;
      // Navigation can be rejected (for example by a save error). Restore a
      // retained game menu surface, but never reveal a detached retiring page.
      if (departingPage && overlay.querySelector('.reference-game-menu') === departingPage) delete departingPage.dataset.departed;
    }
    if (!destroyed) sync();
    if (finishedPhase === 'exit') {
      menuTemplate = null;
      concurrentReturn = false;
      if (returningConcurrently && !destroyed) {
        const target = overlay.querySelector<HTMLElement>('.menu-artboard')?.querySelector<HTMLElement>('.play-hotspot');
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    }
  };
  const run = (target: HTMLElement, frames: Keyframe[], length: number): void => {
    const options = {
      duration: length, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
    } satisfies KeyframeAnimationOptions;
    const current = target.animate(frames, options);
    animation = current;
    if (ghost && (phase === 'entry' || phase === 'exit')) {
      ghostAnimation = ghost.board.animate(phase === 'entry'
        ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: incomingOpacity }, { opacity: 1 }], options);
    }
    // Use a shared timeline origin, also for animations recreated after a repaint.
    const start = current.timeline?.currentTime;
    for (const motion of [current, ghostAnimation]) {
      if (!motion) continue;
      motion.currentTime = elapsed;
      if (typeof start === 'number') motion.startTime = start - elapsed;
    }
    current.onfinish = () => {
      if (!destroyed && animation === current) finish();
    };
  };
  // The extra CSS pixel clears the clip edge even at fractional viewport/DPR sizes.
  const offscreenTransform = (): string => 'translateY(calc(100% + 1px))';
  const restingTransform = (): string => 'translateY(0)';
  const reveal = (): void => {
    if (destroyed || animation) return;
    if (phase === 'menu-in') {
      if (!menu) { if (!committing) abort(); return; }
      menu.dataset.menuTransition = 'in';
      busy(menu, true);
      if (paused || reducedMotion.matches || typeof menu.animate !== 'function') { finish(); return; }
      run(menu, [{ opacity: 0 }, { opacity: 1 }], menuDuration);
      return;
    }
    if (!page || !board) return;
    if (phase === 'exit') {
      page.dataset.entering = 'false';
      page.dataset.exiting = 'true';
      busy(page, true);
      if (paused || reducedMotion.matches || typeof board.animate !== 'function') { finish(); return; }
      run(board, [exitFrom, { transform: offscreenTransform(), opacity: 0 }], duration);
      return;
    }
    if (completed || reducedMotion.matches || typeof board.animate !== 'function') {
      phase = 'entry'; finish(); return;
    }
    phase = 'entry';
    busy(page, true);
    if (page.dataset.ready !== 'true' && page.dataset.ready !== 'error') {
      page.dataset.entering = 'pending';
      return;
    }
    // UI navigation settles on focus loss; a background asset load must not
    // start a new animation or leave translucent controls over the next screen.
    if (paused) { finish(); return; }
    page.dataset.entering = 'true';
    run(board, [{ transform: offscreenTransform(), opacity: 0 },
      { transform: restingTransform(), opacity: 1 }], duration);
  };
  const observer = new MutationObserver(reveal);

  function sync(): void {
    if (destroyed) return;
    const nextPage = overlay.querySelector<HTMLElement>('.reference-game-menu');
    const nextBoard = nextPage?.querySelector<HTMLElement>('.game-menu-board') ?? null;
    const nextMenu = nextPage ? null : overlay.querySelector<HTMLElement>('.menu-artboard');
    if (nextPage === page && nextBoard === board && nextMenu === menu && !(phase === 'exit' && ghost)) {
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
    if (phase === 'exit' && ghost) {
      // A game menu repaint can accompany locale/text-size/orientation changes.
      // Rebuild from raw markup and resume at the existing shared playhead.
      removeGhost();
      ghost = incomingMenu();
    }
    observer.disconnect();
    release();
    const wasPage = page !== null;
    page = nextPage; board = nextBoard; menu = nextMenu;
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
    open(callback) {
      if (destroyed || navigate || committing || phase === 'menu-in' || phase === 'exit' || page) return;
      menuTemplate = menu ? menu.cloneNode(true) as HTMLElement : null;
      if (menu && !reducedMotion.matches) ghost = snapshotMenu(overlay, menu);
      busy(menu, true);
      phase = 'entry'; elapsed = 0;
      committing = true;
      try { callback(); } finally { committing = false; }
      if (!destroyed) { sync(); if (!page) abort(); }
    },
    close(callback) {
      if (destroyed || !page || navigate || phase === 'exit' || phase === 'menu-in') return;
      clearPress();
      const pending = page.dataset.entering === 'pending';
      const style = board && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(board) : null;
      exitFrom = { transform: style?.transform ?? restingTransform(), opacity: style?.opacity ?? '1' };
      // Reverse the visible menu from its current entry pose, before cancel()
      // discards the outgoing animation's computed opacity.
      incomingOpacity = phase === 'entry' && ghost ? window.getComputedStyle(ghost.board).opacity : 0;
      cancelAnimation();
      removeGhost();
      concurrentReturn = menuTemplate !== null;
      if (concurrentReturn && !pending && !reducedMotion.matches) ghost = incomingMenu();
      phase = 'exit'; elapsed = 0; navigate = callback;
      if (pending) finish(); else reveal();
    },
    press(button, callback) {
      if (destroyed || pressed || phase !== 'idle' || button.disabled || !button.isConnected) return;
      if (reducedMotion.matches || paused) { callback(); return; }
      pressed = button; button.classList.add('is-pressed');
      pressTimer = window.setTimeout(() => {
        const valid = button.isConnected && !button.disabled;
        clearPress();
        if (valid && !destroyed) callback();
      }, PRESS_MS);
    },
    isNavigating: () => phase === 'exit' || phase === 'menu-in' || pressed !== null,
    setPaused(value) {
      if (destroyed || paused === value) return;
      paused = value;
      if (paused) clearPress();
      // Battle/audio/scenery keep their own lifecycle pause policy. A partially
      // visible navigation surface should never remain frozen in a background tab.
      if (paused && animation) finish();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      reducedMotion.removeEventListener('change', motionChanged);
      abort();
      page = null; board = null; menu = null;
    },
  };
}
