const duration = 420;

/** One entrance per visit; replacing the settings markup preserves its playhead. */
export function mountSettingsTransition(overlay: HTMLElement): {
  sync(): void;
  setPaused(paused: boolean): void;
  destroy(): void;
} {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let page: HTMLElement | null = null;
  let board: HTMLElement | null = null;
  let scrim: HTMLElement | null = null;
  let animation: Animation | null = null;
  let scrimAnimation: Animation | null = null;
  let elapsed = 0;
  let completed = false;
  let paused = false;
  let destroyed = false;

  const cancelAnimation = (): void => {
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
    }
    scrimAnimation?.cancel();
    animation = null;
    scrimAnimation = null;
  };

  const complete = (): void => {
    completed = true;
    elapsed = duration;
    if (page) page.dataset.entering = 'false';
    // Do not leave a filled animation overriding subsequent layout or navigation.
    cancelAnimation();
  };

  const reveal = (): void => {
    if (!page || !board || destroyed) return;
    if (completed || reducedMotion.matches || typeof board.animate !== 'function') {
      complete();
      return;
    }
    if (animation) return;
    if (page.dataset.ready !== 'true' && page.dataset.ready !== 'error') {
      page.dataset.entering = 'pending';
      return;
    }
    page.dataset.entering = 'true';
    const distance = Math.min(640, Math.max(360, overlay.clientWidth * 0.52));
    const current = board.animate([
      { transform: `translateX(-${distance}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    animation = current;
    current.currentTime = elapsed;
    if (paused) current.pause();
    if (scrim && typeof scrim.animate === 'function') {
      scrimAnimation = scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
      });
      scrimAnimation.currentTime = elapsed;
      if (paused) scrimAnimation.pause();
    }
    current.onfinish = () => {
      if (animation === current) complete();
    };
  };

  const observer = new MutationObserver(reveal);

  const sync = (): void => {
    if (destroyed) return;
    const nextPage = overlay.querySelector<HTMLElement>('.reference-settings');
    const nextBoard = nextPage?.querySelector<HTMLElement>('.settings-board') ?? null;
    const nextScrim = nextPage?.querySelector<HTMLElement>('.settings-scrim') ?? null;
    if (nextPage === page && nextBoard === board && nextScrim === scrim) {
      reveal();
      return;
    }
    if (animation) {
      const time = animation.currentTime;
      if (typeof time === 'number') elapsed = Math.min(duration, Math.max(0, time));
      if (animation.playState === 'finished' || elapsed >= duration) completed = true;
      cancelAnimation();
    }
    observer.disconnect();
    if (page) page.dataset.entering = 'false';
    page = nextPage;
    board = nextBoard;
    scrim = nextScrim;
    if (!page) {
      elapsed = 0;
      completed = false;
      return;
    }
    observer.observe(page, { attributes: true, attributeFilter: ['data-ready'] });
    reveal();
  };

  const motionChanged = (): void => {
    // Disabling reduced motion during a visit must not replay its entrance.
    if (reducedMotion.matches && page) complete();
  };
  reducedMotion.addEventListener('change', motionChanged);
  sync();

  return {
    sync,
    setPaused(value) {
      if (destroyed || paused === value) return;
      paused = value;
      if (!animation) return;
      if (paused) {
        animation.pause();
        scrimAnimation?.pause();
      } else {
        animation.play();
        scrimAnimation?.play();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      reducedMotion.removeEventListener('change', motionChanged);
      cancelAnimation();
      if (page) page.dataset.entering = 'false';
      page = null;
      board = null;
      scrim = null;
    },
  };
}
