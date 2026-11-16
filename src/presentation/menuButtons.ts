const FRAME_MS = 60;
const LABEL_OFFSETS = [0, 0, 1, 2, 2, 1, 0, 0] as const;

/** Native clicks confirm an action; presentation time determines when it may run. */
export function mountMenuButtons(root: HTMLElement): {
  activate(button: HTMLButtonElement, onComplete: () => void, immediate?: boolean): void;
  setPaused(paused: boolean): void;
  destroy(): void;
} {
  const window = root.ownerDocument.defaultView!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  type Press = {
    button: HTMLButtonElement; frame: HTMLElement | null; label: HTMLElement | null;
    index: number; held: boolean; pointerId?: number; key?: string;
    finished: boolean; holding: boolean; callback?: () => void;
  };
  let press: Press | undefined;
  let paused = false;
  let destroyed = false;
  let timer: number | undefined;
  let deadline = 0;
  let remaining = FRAME_MS;
  const canceled = new WeakSet<HTMLButtonElement>();
  const valid = (button: HTMLButtonElement): boolean => !destroyed && !button.disabled &&
    root.contains(button) && !!button.closest('.avalon-menu');
  const buttonAt = (event: Event): HTMLButtonElement | null => {
    const target = event.target as Element | null;
    const button = target?.closest?.<HTMLButtonElement>('.menu-hotspot') ?? null;
    return button && valid(button) ? button : null;
  };
  const stopTimer = (): void => {
    if (timer === undefined) return;
    remaining = Math.max(0, deadline - window.performance.now());
    window.clearTimeout(timer);
    timer = undefined;
  };
  const reset = (): void => {
    stopTimer();
    if (press) {
      press.button.classList.remove('is-menu-pressing');
      press.frame?.style.removeProperty('background-position-x');
      press.label?.style.removeProperty('transform');
    }
    press = undefined;
    remaining = FRAME_MS;
  };
  const paint = (): void => {
    if (!press) return;
    press.button.classList.add('is-menu-pressing');
    if (press.frame) press.frame.style.backgroundPositionX = `${press.index / 7 * 100}%`;
    if (press.label) press.label.style.transform = `translateY(calc(${LABEL_OFFSETS[press.index]}px * var(--menu-scale)))`;
  };
  const complete = (): void => {
    if (!press || paused || !press.finished || !press.callback) return;
    const callback = valid(press.button) ? press.callback : undefined;
    reset();
    callback?.();
  };
  const schedule = (): void => {
    if (!press || paused || timer !== undefined || press.finished || (press.held && press.holding)) return;
    deadline = window.performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!press || !valid(press.button)) { reset(); return; }
      remaining = FRAME_MS;
      if (press.index === 4 && press.held) { press.holding = true; return; }
      if (press.index === 7) {
        press.finished = true;
        if (press.callback) complete();
        else reset();
      } else {
        press.index++;
        paint();
        schedule();
      }
    }, remaining);
  };
  const begin = (button: HTMLButtonElement, held: boolean): Press => {
    canceled.delete(button);
    press = { button, frame: button.querySelector('.menu-button-frame'), label: button.querySelector('.menu-button-label-art'),
      index: 0, held, holding: false, finished: reducedMotion.matches };
    remaining = FRAME_MS;
    if (!reducedMotion.matches) { paint(); schedule(); }
    return press;
  };
  const release = (): void => {
    if (!press) return;
    press.held = false;
    if (press.finished && !press.callback) { reset(); return; }
    schedule();
  };
  const cancel = (): void => {
    if (press) canceled.add(press.button);
    reset();
  };
  const pointerDown = (event: PointerEvent): void => {
    const button = buttonAt(event);
    if (!button || event.button !== 0 || event.isPrimary === false || press || paused) return;
    begin(button, true).pointerId = event.pointerId;
  };
  const pointerUp = (event: PointerEvent): void => {
    if (!press || press.pointerId !== event.pointerId) return;
    const bounds = press.button.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) cancel();
    else release();
  };
  const pointerCancel = (event: PointerEvent): void => { if (press?.pointerId === event.pointerId) cancel(); };
  const keyDown = (event: KeyboardEvent): void => {
    const button = buttonAt(event);
    if (!button || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (event.repeat || press || paused) { event.preventDefault(); return; }
    begin(button, true).key = event.key;
  };
  const keyUp = (event: KeyboardEvent): void => { if (press?.key === event.key) release(); };
  const click = (event: MouseEvent): void => {
    const button = buttonAt(event);
    if (!button) return;
    if (event.detail === 0) canceled.delete(button);
    // A canceled gesture, second finger, or repeated native click cannot confirm a new action.
    const pointerId = (event as PointerEvent).pointerId;
    if (paused || canceled.has(button) || (press && (press.button !== button || !!press.callback ||
      (event.detail > 0 && pointerId !== undefined && press.pointerId !== undefined && pointerId !== press.pointerId)))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const preferenceChanged = (): void => {
    if (!reducedMotion.matches || !press) return;
    stopTimer();
    press.finished = true;
    complete();
  };
  const observer = new window.MutationObserver(() => { if (press && !valid(press.button)) reset(); });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('keydown', keyDown);
  root.addEventListener('click', click, true);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerCancel);
  window.addEventListener('keyup', keyUp);
  reducedMotion.addEventListener('change', preferenceChanged);
  return {
    activate(button, callback, immediate = false) {
      if (!valid(button) || paused || canceled.has(button)) return;
      if (press && (press.button !== button || press.callback)) return;
      const current = press ?? begin(button, false);
      current.callback = callback;
      // Screen crossfades already provide click feedback; they must not wait for
      // the remaining press frames. Other menu actions keep the full sequence.
      if (immediate) current.finished = true;
      complete();
    },
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (paused) {
        // Blur may swallow the eventual pointerup/keyup. Only a native click commits
        // the action: discard unconfirmed gestures and release committed ones logically.
        if (press && !press.callback) cancel();
        else {
          stopTimer();
          if (press) {
            press.held = false;
            delete press.pointerId;
            delete press.key;
          }
        }
      }
      else { complete(); schedule(); }
    },
    destroy() {
      destroyed = true;
      reset();
      observer.disconnect();
      root.removeEventListener('pointerdown', pointerDown);
      root.removeEventListener('keydown', keyDown);
      root.removeEventListener('click', click, true);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keyup', keyUp);
      reducedMotion.removeEventListener('change', preferenceChanged);
    }
  };
}
