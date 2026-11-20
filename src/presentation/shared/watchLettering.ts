/** Carved lettering from the concept compositor. The DOM owns wrapping, translation and accessible names. */
const carved = [
  '.watch-title', '.watch-dialog h2', '.campaign-story-heading h2', '.watch-primary:not(:disabled)',
  '.chronicle-heading h1', '.campaign-development h1', '.campaign-collection h1', '.save-error-heading',
  '.campaign-upgrade-inspector h2', '#campaign-reward-title', '.campaign-currency-offer h3', '.battle-night-label',
].join(',');
const plain = [
  '.game-menu-information p', '.game-menu-control', '.campaign-story-heading small', '#campaign-intro-journal',
  '.outcome-copy p', '.outcome-copy .eyebrow', '.outcome-ledger dt', '.outcome-ledger dd', '.outcome-actions button', '.watch-result .page-nav button',
  '.watch-dialog p', '.watch-dialog-actions button', '.save-error-intro p', '.pause-panel p',
  '.chronicle-cover p', '.chronicle-chapter-caption', '.chronicle-page-number',
  '.campaign-upgrade-inspector p', '.campaign-display p', '.prep-current-lens p',
].join(',');
const prepared = new WeakMap<HTMLElement, string>();

function letteringPixels(span: HTMLElement, scale: number, bevel: boolean): void {
  const node = span.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const box = span.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const style = getComputedStyle(span);
  const font = Number.parseFloat(style.fontSize) / scale;
  const text = node.textContent ?? '';
  const width = Math.ceil(box.width / scale), height = Math.ceil(box.height / scale);
  const ink = getComputedStyle(span.parentElement!).color;
  const carvedFace = bevel && font >= 15;
  const key = [text, width, height, font, ink, carvedFace, style.textAlign].join('|');
  if (prepared.get(span) === key) return;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.font = `400 ${font}px "Avalon Menu"`;
  const metrics = ctx.measureText('Аg');
  const range = document.createRange();
  const rows = new Map<number, { text: string; x: number }[]>();
  for (const word of text.matchAll(/\S+/gu)) {
    range.setStart(node, word.index);
    range.setEnd(node, word.index + word[0].length);
    const rect = range.getBoundingClientRect();
    // The browser can hyphenate or break a long word. Preserve those exact glyphs
    // using native text if the word no longer occupies one rectangle in this span.
    if (range.getClientRects().length !== 1 || rect.right > box.right + 1 || rect.left < box.left - 1) {
      span.style.removeProperty('background-image');
      span.classList.remove('watch-carved-painted');
      prepared.set(span, key);
      return;
    }
    const baseline = Math.round((rect.top - box.top) / scale +
      (rect.height / scale + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2);
    const line = rows.get(baseline) ?? [];
    line.push({text:word[0], x:(rect.left - box.left) / scale});
    rows.set(baseline, line);
  }
  if (!carvedFace) {
    // Small captions keep the coverage of every native pixel, particularly fine Cyrillic serifs.
    for (const [baseline, line] of rows) {
      if (!span.closest('.chronicle-cover,.chronicle-entries')) {
        ctx.fillStyle = '#0a1523';
        for (const word of line) ctx.fillText(word.text, word.x, baseline + 1);
      }
      ctx.fillStyle = ink;
      for (const word of line) ctx.fillText(word.text, word.x, baseline);
    }
  } else {
    const result = ctx.createImageData(width, height);
    for (const [baseline, line] of rows) {
      ctx.clearRect(0, 0, width, height);
      for (const word of line) ctx.fillText(word.text, word.x, baseline);
      const mask = ctx.getImageData(0, 0, width, height).data;
      let top = height, bottom = 0;
      const face: number[] = [];
      for (let i = 0; i < width * height; i++) {
        if (mask[i * 4 + 3]! < 106) continue;
        face.push(i);
        const y = Math.floor(i / width);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const paint = (i: number, r: number, g: number, b: number) => {
        const j = i * 4;
        result.data[j] = r; result.data[j+1] = g; result.data[j+2] = b; result.data[j+3] = 255;
      };
      for (const i of face) if (i % width + 1 < width && i+2*width+1 < width*height) paint(i+2*width+1, 29, 19, 18);
      for (const i of face) if (i+width < width*height) paint(i+width, 143, 72, 34);
      for (const i of face) {
        const y = Math.floor(i / width) - top, h = bottom - top + 1;
        if (y <= Math.floor(h / 3)) paint(i, 255, 227, 173);
        else if (y >= Math.floor(4 * h / 5)) paint(i, 232, 154, 72);
        else paint(i, 255, 198, 113);
      }
    }
    ctx.putImageData(result, 0, 0);
  }
  span.style.backgroundImage = 'url("' + canvas.toDataURL() + '")';
  span.style.backgroundSize = `${width * scale}px ${height * scale}px`;
  span.classList.add('watch-carved-painted');
  prepared.set(span, key);
}

export function mountWatchLettering(root: HTMLElement): { sync(): void; destroy(): void } {
  let frame = 0, closed = false, loaded = false;
  function render() {
    frame = 0;
    const portrait = innerHeight >= innerWidth;
    const scale = Math.min(innerWidth / (portrait ? 360 : 640), innerHeight / (portrait ? 640 : 360));
    if (!scale || root.querySelector('.is-main-menu')) return;
    for (const control of root.querySelectorAll<HTMLElement>(carved + ',' + plain)) {
      if (!control.getClientRects().length || control.closest(':disabled')) continue;
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      const words: Text[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.data.trim() && !text.parentElement?.closest('.watch-carved')) words.push(text);
      }
      for (const text of words) {
        const span = document.createElement('span');
        span.className = 'watch-carved';
        text.replaceWith(span);
        span.append(text);
      }
      const bevel = control.matches(carved);
      for (const span of control.querySelectorAll<HTMLElement>('.watch-carved')) letteringPixels(span, scale, bevel);
    }
  }
  function sync() {
    if (!closed && loaded && !frame) frame = requestAnimationFrame(render);
  }
  if (document.fonts?.load) void document.fonts.load('20px "Avalon Menu"').then(() => {loaded = true; sync();}).catch(() => {});
  return {sync, destroy() {closed = true; cancelAnimationFrame(frame);}};
}
