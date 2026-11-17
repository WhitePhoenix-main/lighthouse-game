import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMenuButtons } from '../src/presentation/menu/menuButtons';

/** Small native EventTarget fixture; the controller only needs delegated DOM identity and styles. */
function fixture(reduce = false) {
  vi.useFakeTimers();
  const window = new EventTarget();
  const preference = Object.assign(new EventTarget(), { matches: reduce });
  let mutation: () => void = () => {};
  const observers = { disconnected: false };
  Object.assign(window, {
    matchMedia: () => preference,
    performance: { now: () => Date.now() },
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
    MutationObserver: class {
      constructor(callback: () => void) { mutation = callback; }
      observe() {}
      disconnect() { observers.disconnected = true; }
    }
  });
  const elements = new Set<object>();
  const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: window }, contains: (element: object) => elements.has(element) });
  function button() {
    const classes = new Set<string>();
    const frameStyle = { backgroundPositionX: '', removeProperty: () => { frameStyle.backgroundPositionX = ''; } };
    const labelStyle = { transform: '', removeProperty: () => { labelStyle.transform = ''; } };
    const element = {
      disabled: false,
      classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) },
      closest: () => element,
      querySelector: (selector: string) => ({ style: selector === '.menu-button-frame' ? frameStyle : labelStyle }),
      getBoundingClientRect: () => ({ left: 0, right: 240, top: 0, bottom: 48 })
    };
    elements.add(element);
    return { element: element as unknown as HTMLButtonElement, frameStyle, labelStyle };
  }
  const first = button();
  const second = button();
  const controller = mountMenuButtons(root as unknown as HTMLElement);
  const completed = vi.fn();
  root.addEventListener('click', event => controller.activate(event.target as HTMLButtonElement, completed));
  const emit = (type: string, target = first.element, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target, button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20, detail: 1, ...properties })
      .map(([name, value]) => [name, { value }])));
    (['pointerup', 'pointercancel', 'keyup'].includes(type) ? window : root).dispatchEvent(event);
    return event;
  };
  const frame = () => Math.round(Number.parseFloat(first.frameStyle.backgroundPositionX) * 7 / 100);
  return { ...first, second, frame, emit, controller, completed, preference, observers,
    remove: () => { elements.delete(first.element); mutation(); } };
}

afterEach(() => { vi.useRealTimers(); });

describe('menu button input and presentation timeline', () => {
  it('shows exactly one complete press for a fast native click and calls back once after 480 ms', () => {
    const f = fixture();
    f.emit('pointerdown');
    vi.advanceTimersByTime(30);
    f.emit('pointerup');
    f.emit('click');
    f.emit('click');
    vi.advanceTimersByTime(90);
    expect(f.frame()).toBe(2);
    expect(f.labelStyle.transform).toContain('1px');
    vi.advanceTimersByTime(120);
    expect(f.frame()).toBe(4);
    vi.advanceTimersByTime(239);
    expect(f.frame()).toBe(7);
    expect(f.completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.completed).toHaveBeenCalledTimes(1);
    expect(f.element.classList.contains('is-menu-pressing')).toBe(false);
    expect(f.frameStyle.backgroundPositionX).toBe('');
    f.controller.destroy();
  });

  it('holds the depressed pose until release and ignores another pointer/button', () => {
    const f = fixture();
    f.emit('pointerdown');
    vi.advanceTimersByTime(1000);
    expect(f.frame()).toBe(4);
    f.emit('pointerdown', f.second.element, { pointerId: 2, isPrimary: false });
    f.emit('pointerup', f.second.element, { pointerId: 2 });
    f.emit('click', f.second.element, { pointerId: 2 });
    expect(f.completed).not.toHaveBeenCalled();
    expect(f.frame()).toBe(4);
    f.emit('pointerup');
    f.emit('click');
    vi.advanceTimersByTime(239);
    expect(f.completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it('keeps the 480 ms sequence when released just before the hold threshold', () => {
    const f = fixture();
    f.emit('pointerdown');
    vi.advanceTimersByTime(280);
    f.emit('pointerup'); f.emit('click');
    vi.advanceTimersByTime(199);
    expect(f.completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it.each(['pointercancel', 'outside'] as const)('cancels %s, suppresses its click, and allows a fresh gesture', reason => {
    const f = fixture();
    f.emit('pointerdown');
    vi.advanceTimersByTime(100);
    f.emit(reason === 'outside' ? 'pointerup' : 'pointercancel', f.element, { clientX: 400 });
    f.emit('click');
    vi.advanceTimersByTime(1000);
    expect(f.completed).not.toHaveBeenCalled();
    expect(f.element.classList.contains('is-menu-pressing')).toBe(false);
    f.emit('pointerdown'); f.emit('pointerup'); f.emit('click');
    vi.advanceTimersByTime(480);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it.each(['Enter', ' '])('supports %s and prevents native autorepeat from scheduling another action', key => {
    const f = fixture();
    f.emit('keydown', f.element, { key, detail: 0 });
    if (key === 'Enter') f.emit('click', f.element, { detail: 0 });
    expect(f.emit('keydown', f.element, { key, repeat: true }).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(600);
    expect(f.frame()).toBe(4);
    f.emit('keyup', f.element, { key });
    if (key === ' ') f.emit('click', f.element, { detail: 0 });
    vi.advanceTimersByTime(240);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it('accepts a programmatic click and preserves remaining visible time over a pause', () => {
    const f = fixture();
    f.emit('click', f.element, { detail: 0 });
    vi.advanceTimersByTime(95);
    expect(f.frame()).toBe(1);
    f.controller.setPaused(true);
    vi.advanceTimersByTime(10000);
    expect(f.frame()).toBe(1);
    expect(f.completed).not.toHaveBeenCalled();
    f.controller.setPaused(false);
    vi.advanceTimersByTime(24);
    expect(f.frame()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(f.frame()).toBe(2);
    vi.advanceTimersByTime(360);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it.each(['pointer', 'keyboard'] as const)('cancels an unconfirmed %s hold on blur when release is lost', input => {
    const f = fixture();
    if (input === 'pointer') f.emit('pointerdown');
    else f.emit('keydown', f.element, { key: ' ', detail: 0 });
    vi.advanceTimersByTime(1000);
    expect(f.frame()).toBe(4);
    // mountMenuMotion maps window blur to setPaused; no release event arrives.
    f.controller.setPaused(true);
    vi.advanceTimersByTime(10000);
    f.controller.setPaused(false);
    expect(f.element.classList.contains('is-menu-pressing')).toBe(false);
    expect(f.completed).not.toHaveBeenCalled();
    f.emit('pointerdown', f.element, { pointerId: 7 });
    f.emit('pointerup', f.element, { pointerId: 7 });
    f.emit('click', f.element, { pointerId: 7 });
    vi.advanceTimersByTime(480);
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it.each([{ elapsed: 95, remaining: 385 }, { elapsed: 1000, remaining: 240 }])(
    'resumes a confirmed Enter hold without keyup after blur at $elapsed ms', ({ elapsed, remaining }) => {
      const f = fixture();
      f.emit('keydown', f.element, { key: 'Enter', detail: 0 });
      f.emit('click', f.element, { detail: 0 });
      vi.advanceTimersByTime(elapsed);
      f.controller.setPaused(true);
      vi.advanceTimersByTime(10000);
      expect(f.completed).not.toHaveBeenCalled();
      f.controller.setPaused(false);
      vi.advanceTimersByTime(remaining - 1);
      expect(f.completed).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(f.completed).toHaveBeenCalledTimes(1);
      expect(f.element.classList.contains('is-menu-pressing')).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(f.completed).toHaveBeenCalledTimes(1);
      f.controller.destroy();
    }
  );

  it('activates immediately with reduced motion and never activates while paused', () => {
    const f = fixture(true);
    f.controller.setPaused(true);
    f.emit('click');
    expect(f.completed).not.toHaveBeenCalled();
    f.controller.setPaused(false);
    f.emit('click', f.element, { detail: 0 });
    expect(f.completed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    f.controller.destroy();
  });

  it('does not retain a reduced motion gesture whose native click was canceled elsewhere', () => {
    const f = fixture(true);
    f.emit('pointerdown'); f.emit('pointerup');
    f.emit('click', f.second.element, { detail: 0 });
    expect(f.completed).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it('honors a reduced motion change during a paused pending action only after resume', () => {
    const f = fixture();
    f.emit('click', f.element, { detail: 0 });
    vi.advanceTimersByTime(120);
    f.controller.setPaused(true);
    f.preference.matches = true;
    f.preference.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1000);
    expect(f.completed).not.toHaveBeenCalled();
    f.controller.setPaused(false);
    expect(f.completed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    f.controller.destroy();
  });

  it('ignores disabled buttons and detaches input handlers on destroy', () => {
    const f = fixture();
    f.element.disabled = true;
    f.emit('pointerdown'); f.emit('click');
    expect(vi.getTimerCount()).toBe(0);
    f.element.disabled = false;
    f.controller.destroy();
    f.emit('pointerdown'); f.emit('pointerup'); f.emit('click');
    vi.advanceTimersByTime(1000);
    expect(f.completed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['remove', 'disable', 'destroy'] as const)('drops a pending callback on %s', action => {
    const f = fixture();
    f.emit('click', f.element, { detail: 0 });
    vi.advanceTimersByTime(120);
    if (action === 'remove') f.remove();
    if (action === 'disable') f.element.disabled = true;
    if (action === 'destroy') f.controller.destroy();
    vi.advanceTimersByTime(1000);
    expect(f.completed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    f.controller.destroy();
    expect(f.observers.disconnected).toBe(true);
  });
});
