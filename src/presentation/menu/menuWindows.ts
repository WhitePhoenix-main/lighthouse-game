type Random = () => number;

export const WINDOW_LIGHT_SPRITE = {
  frames: 12, peakFrame: 6, durationMs: 4200,
  frameOffsets: [0, .02, .04, .06, .08, .10, .12, .30, .49, .68, .85, .99]
} as const;

/** Former lighthouse profile: a quick rise followed by one long, uninterrupted decay. */
export function windowLightKeyframes(): { spriteFrames: Keyframe[]; brightnessFrames: Keyframe[] } {
  const { frames, frameOffsets } = WINDOW_LIGHT_SPRITE;
  const spriteFrames: Keyframe[] = frameOffsets.map((offset, frame) => ({
    offset, backgroundPositionX: `${frame / (frames - 1) * 100}%`, easing: 'steps(1, end)'
  }));
  spriteFrames.push({ offset: 1, backgroundPositionX: '100%' });
  return { spriteFrames, brightnessFrames: [
    { offset: 0, opacity: 0 },
    { offset: .12, opacity: .96 },
    { offset: .30, opacity: .74 },
    { offset: .49, opacity: .54 },
    { offset: .68, opacity: .34 },
    { offset: .85, opacity: .20 },
    { offset: 1, opacity: 0 }
  ] };
}

/** A shuffled bag gives every window a turn; each new round gets a different order. */
export function windowLightSequence(count: number, random: Random = Math.random): () => { index: number; durationMs: number; waitMs: number } {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('A window sequence needs at least one window');
  let bag: number[] = [];
  let previous = -1;
  return () => {
    if (!bag.length) {
      bag = Array.from({ length: count }, (_, index) => index);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      if (bag.length > 1 && bag[0] === previous) [bag[0], bag[1]] = [bag[1]!, bag[0]!];
    }
    previous = bag.shift()!;
    return { index: previous, durationMs: WINDOW_LIGHT_SPRITE.durationMs, waitMs: 5200 + Math.floor(random() * 2401) };
  };
}

/** Presentation time only: pauses preserve both the pending cue and each active fade. */
export function mountMenuWindows(overlay: HTMLElement, random: Random = Math.random): { setPaused(paused: boolean): void; destroy(): void } {
  const window = overlay.ownerDocument.defaultView!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>();
  let elements: HTMLElement[] = [];
  let next: ReturnType<typeof windowLightSequence> | undefined;
  let paused = true;
  let active = false;
  let timer: number | undefined;
  let deadline = 0;
  let remaining = 650;
  let ticket = 0;

  const cancelTimer = (): void => {
    if (timer === undefined) return;
    remaining = Math.max(0, deadline - window.performance.now());
    window.clearTimeout(timer);
    timer = undefined;
  };
  const cancelAnimations = (): void => {
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  const schedule = (): void => {
    if (!active || timer !== undefined || !next) return;
    deadline = window.performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!active || !next) return;
      const cue = next();
      const element = elements[cue.index]!;
      const frames = windowLightKeyframes();
      for (const keyframes of [frames.spriteFrames, frames.brightnessFrames]) {
        const animation = element.animate(keyframes, { duration: cue.durationMs, easing: 'linear' });
        animations.add(animation);
        animation.onfinish = () => { animations.delete(animation); };
      }
      element.dataset.windowDurationMs = String(cue.durationMs);
      element.dataset.windowPulse = String(++ticket);
      remaining = cue.waitMs;
      schedule();
    }, remaining);
  };
  const sync = (): void => {
    const shouldRun = !paused && !reducedMotion.matches && elements.length > 0;
    if (shouldRun === active) return;
    active = shouldRun;
    if (active) {
      for (const animation of animations) animation.play();
      schedule();
    } else {
      cancelTimer();
      for (const animation of animations) animation.pause();
    }
  };
  const reset = (): void => {
    cancelTimer();
    cancelAnimations();
    active = false;
    elements = [...overlay.querySelectorAll<HTMLElement>('.menu-window-glow')];
    next = elements.length ? windowLightSequence(elements.length, random) : undefined;
    remaining = 650;
    sync();
  };
  const motionPreference = (): void => {
    sync();
    if (reducedMotion.matches) cancelAnimations();
  };
  // Only screen replacement resets the order. Resize and text/HUD updates leave it intact.
  const observer = new window.MutationObserver(reset);
  observer.observe(overlay, { childList: true });
  reducedMotion.addEventListener('change', motionPreference);
  reset();
  return {
    setPaused(value) { paused = value; sync(); },
    destroy() {
      active = false;
      observer.disconnect();
      reducedMotion.removeEventListener('change', motionPreference);
      cancelTimer();
      cancelAnimations();
      elements = [];
      next = undefined;
    }
  };
}
