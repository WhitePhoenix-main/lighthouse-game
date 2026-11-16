const ENTRY_MS = 560;
const PRESS_MS = 140;

/** Freeze only the outgoing controls. The connected scenery is never cloned or replaced. */
function menuGhost(overlay: HTMLElement): HTMLElement | null {
  const source = overlay.querySelector<HTMLElement>('.menu-artboard');
  if (!source) return null;
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  originals.forEach((node, index) => {
    const target = copies[index]!, style = window.getComputedStyle(node);
    for (const property of style) target.style.setProperty(property, style.getPropertyValue(property));
    for (const attribute of ['id', 'data-action', 'aria-labelledby', 'aria-describedby', 'data-focus-key']) target.removeAttribute(attribute);
    target.inert = true; target.tabIndex = -1;
    target.style.animation = 'none'; target.style.transition = 'none'; target.style.pointerEvents = 'none';
  });
  const bounds = source.getBoundingClientRect(), parent = overlay.parentElement!, hostBounds = parent.getBoundingClientRect();
  Object.assign(clone.style, { position: 'absolute', left: `${bounds.left - hostBounds.left}px`, top: `${bounds.top - hostBounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, transform: 'none', opacity: '1', zIndex: '3' });
  clone.setAttribute('aria-hidden', 'true'); clone.dataset.gameMenuGhost = '';
  parent.append(clone); return clone;
}

export function mountGameMenuTransition(overlay: HTMLElement): {
  sync(): void; open(navigate: () => void): void; close(navigate: () => void): void;
  press(button: HTMLButtonElement, navigate: () => void): void;
  isNavigating(): boolean; setPaused(value: boolean): void; destroy(): void;
} {
  const win = overlay.ownerDocument.defaultView!;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  let page: HTMLElement | null = null, board: HTMLElement | null = null;
  let phase: 'idle' | 'entry' | 'exit' = 'idle';
  let animations: Animation[] = [], elapsed = 0, completed = false, paused = false, destroyed = false;
  let ghost: HTMLElement | null = null, afterExit: (() => void) | null = null;
  let pressTimer: number | undefined, pressed: HTMLButtonElement | null = null;
  let exitFrom: Keyframe = {};
  const observer = new MutationObserver(() => reveal());
  const cancelAnimations = (): void => { for (const motion of animations) { motion.onfinish = null; motion.cancel(); } animations = []; };
  const removeGhost = (): void => { ghost?.remove(); ghost = null; };
  const clearPress = (): void => { win.clearTimeout(pressTimer); pressed?.classList.remove('is-pressed'); pressed = null; pressTimer = undefined; };
  const offscreen = (): string => page?.dataset.layout === 'mobile' ? 'translateY(calc(100% + 1px))' : 'translateX(calc(-100% - 1px))';
  const finish = (): void => {
    const leaving = phase === 'exit';
    if (leaving && page) page.dataset.departed = 'true';
    cancelAnimations(); removeGhost();
    if (page) { page.inert = false; page.removeAttribute('aria-busy'); page.dataset.entering = 'false'; }
    phase = 'idle'; completed = true; elapsed = 0;
    const callback = afterExit; afterExit = null;
    if (leaving) {
      callback?.();
      if (page?.isConnected) delete page.dataset.departed;
      const play = overlay.querySelector<HTMLElement>('.play-hotspot'); play?.focus({ preventScroll: true });
    } else page?.querySelector<HTMLElement>('[data-action="continue-game"]:not(:disabled),[data-action="new-game"]')?.focus({ preventScroll: true });
  };
  function reveal(): void {
    if (destroyed || !page || !board || animations.length || phase === 'idle') return;
    if (phase === 'entry' && page.dataset.ready === 'pending') { page.inert = true; page.setAttribute('aria-busy', 'true'); return; }
    if (paused || reduced.matches || typeof board.animate !== 'function') { finish(); return; }
    page.inert = true; page.setAttribute('aria-busy', 'true'); page.dataset.entering = String(phase === 'entry');
    const entry = phase === 'entry';
    const options: KeyframeAnimationOptions = { duration: ENTRY_MS, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
    const main = board.animate(entry ? [{ transform: offscreen(), opacity: 0 }, { transform: 'none', opacity: 1 }]
      : [exitFrom, { transform: offscreen(), opacity: 0 }], options);
    animations.push(main);
    const back = page.querySelector<HTMLElement>('.game-menu-back');
    if (back) animations.push(back.animate(entry ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], options));
    if (ghost) animations.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], options));
    for (const motion of animations) motion.currentTime = elapsed;
    main.onfinish = () => { if (!destroyed && animations[0] === main) finish(); };
  }
  function sync(): void {
    if (destroyed) return;
    const next = overlay.querySelector<HTMLElement>('.reference-game-menu');
    if (page === next) { reveal(); return; }
    if (animations.length) { const time = animations[0]!.currentTime; if (typeof time === 'number') elapsed = time; }
    cancelAnimations(); observer.disconnect();
    const wasMenu = !!page;
    page = next; board = page?.querySelector<HTMLElement>('.game-menu-board') ?? null;
    if (!page) {
      phase = 'idle'; completed = false; elapsed = 0; afterExit = null; removeGhost(); clearPress(); return;
    }
    if (!wasMenu) { phase = 'entry'; completed = false; elapsed = 0; }
    else if (completed) phase = 'idle';
    observer.observe(page, { attributes: true, attributeFilter: ['data-ready'] });
    reveal();
  }
  const motionChanged = (): void => { if (reduced.matches && phase !== 'idle') finish(); };
  reduced.addEventListener('change', motionChanged);
  return {
    sync,
    open(callback) { if (destroyed || phase === 'exit' || page) return; ghost = menuGhost(overlay); callback(); sync(); if (!page) removeGhost(); },
    close(callback) {
      if (destroyed || !page || phase === 'exit') return;
      const style = board ? win.getComputedStyle(board) : null;
      exitFrom = { transform: style?.transform ?? 'none', opacity: style?.opacity ?? '1' };
      const pending = page.dataset.ready === 'pending';
      cancelAnimations(); clearPress(); phase = 'exit'; elapsed = 0; afterExit = callback;
      if (pending) finish(); else reveal();
    },
    press(button, callback) {
      if (destroyed || pressed || phase === 'exit' || button.disabled) return;
      if (reduced.matches || paused) { callback(); return; }
      pressed = button; button.classList.add('is-pressed');
      pressTimer = win.setTimeout(() => { const valid = button.isConnected && !button.disabled; clearPress(); if (valid && !destroyed) callback(); }, PRESS_MS);
    },
    isNavigating: () => phase === 'exit' || pressed !== null,
    setPaused(value) { paused = value; if (paused && phase !== 'idle') finish(); if (paused) clearPress(); },
    destroy() { destroyed = true; observer.disconnect(); reduced.removeEventListener('change', motionChanged); clearPress(); cancelAnimations(); removeGhost(); page = null; board = null; }
  };
}
