/** Starts the title reveal only after the current menu's sprite is decoded. */
export function mountMenuTitle(overlay: HTMLElement, backgroundRoot: HTMLElement = overlay): { destroy(): void } {
  let generation = 0;
  let current: HTMLElement | null = null;
  let destroyed = false;

  const sync = (): void => {
    const title = overlay.querySelector<HTMLElement>('.menu-title-sprite');
    if (title === current) return;
    current = title;
    const request = ++generation;
    if (!title) return;
    const match = title.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (!match?.[1]) return;
    const image = new Image();
    image.src = match[1];
    const background = backgroundRoot.querySelector<HTMLImageElement>('img.menu-background');
    void Promise.all([image.decode(), background?.decode() ?? Promise.resolve()]).then(() => {
      if (!destroyed && generation === request && current === title && overlay.contains(title)) {
        title.classList.add('menu-title-ready');
      }
    }).catch(() => {
      // The original background remains visible if decoding fails.
    });
  };

  const observer = new MutationObserver(sync);
  observer.observe(overlay, { childList: true });
  sync();
  return { destroy(): void {
    destroyed = true;
    generation++;
    observer.disconnect();
    current = null;
  } };
}
