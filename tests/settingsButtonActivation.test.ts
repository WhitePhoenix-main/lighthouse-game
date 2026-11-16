import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMenuButtons } from '../src/presentation/menuButtons';

afterEach(() => vi.useRealTimers());

function fixture(immediate = true) {
  vi.useFakeTimers();
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    performance: { now: () => Date.now() },
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
    MutationObserver: class { observe() {} disconnect() {} }
  });
  const styles = { removeProperty: vi.fn() };
  const classes = new Set<string>();
  const button = {
    disabled: false, closest: () => button,
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
    querySelector: () => ({ style: styles }),
    getBoundingClientRect: () => ({ left: 0, right: 240, top: 0, bottom: 48 })
  };
  const root = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: window }, contains: (node: unknown) => node === button
  });
  const controller = mountMenuButtons(root as unknown as HTMLElement);
  const navigate = vi.fn();
  root.addEventListener('click', () => controller.activate(button as unknown as HTMLButtonElement, navigate, immediate));
  const emit = (type: string, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries({ target: button, button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 20, detail: 1, ...properties })) Object.defineProperty(event, name, { value });
    (['pointerup', 'pointercancel', 'keyup'].includes(type) ? window : root).dispatchEvent(event);
  };
  return { controller, navigate, emit, classes, button };
}

describe('settings crossfade starts on confirmed activation', () => {
  it('starts at a fast pointer click without waiting for the remaining press frames', () => {
    const s = fixture();
    s.emit('pointerdown'); vi.advanceTimersByTime(15); s.emit('pointerup'); s.emit('click');
    expect(s.navigate).toHaveBeenCalledOnce();
    expect(s.classes.has('is-menu-pressing')).toBe(false);
    vi.advanceTimersByTime(1000); expect(s.navigate).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('also starts immediately for keyboard activation', () => {
    const s = fixture();
    s.emit('keydown', { key: 'Enter' }); s.emit('click', { detail: 0 }); s.emit('keyup', { key: 'Enter' });
    expect(s.navigate).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it('retains the full 480ms press for ordinary menu navigation', () => {
    const s = fixture(false);
    s.emit('pointerdown'); s.emit('pointerup'); s.emit('click');
    vi.advanceTimersByTime(479); expect(s.navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(s.navigate).toHaveBeenCalledOnce();
    s.controller.destroy();
  });

  it.each(['pointercancel', 'outside'] as const)('does not activate a cancelled %s gesture', reason => {
    const s = fixture(); s.emit('pointerdown');
    s.emit(reason === 'outside' ? 'pointerup' : 'pointercancel', { clientX: 400 }); s.emit('click');
    expect(s.navigate).not.toHaveBeenCalled();
    s.controller.destroy();
  });
});
