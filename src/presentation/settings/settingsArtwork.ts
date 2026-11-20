import { drawSettingsPixelText, settingsTextWidth, supportsSettingsPixelText } from '../shared/settingsLettering';

const letteringColors = {
  gold: ['#ffedc2', '#ffc471', '#db873c', '#833f24'],
  selected: ['#ffedc2', '#ffd69a', '#eda75e', '#75432b'],
  heading: ['#fff0ce', '#f2d9aa', '#c4a178', '#62482f'],
  choice: ['#e6edf3', '#c9d6e1', '#9eafc2', '#415873'],
  value: ['#ffe9be', '#ffd08a', '#e2a567', '#6d442f'],
} as const;
type Tone = keyof typeof letteringColors;
const lettering = new Map<string, string>();

export function paintSettingsCaption(element: HTMLElement, copy: string, tone: Tone): void {
  const text = copy.toUpperCase();
  const key = tone + ':' + text;
  if (element.dataset.painted === key) return;
  element.dataset.painted = key;
  element.classList.remove('settings-caption-painted');

  // The bitmap alphabet covers the authored labels and integer percentages.
  // Older settings can contain fractional values. Keep their native text.
  if (!text || !supportsSettingsPixelText(text)) return;
  const width = settingsTextWidth(text, 1) + 1;
  let sprite = lettering.get(key);
  if (!sprite) {
    const canvas = element.ownerDocument.createElement('canvas');
    canvas.width = width;
    canvas.height = 14;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Three bands give the bitmap letters the same lit face and lower bevel as the menu.
    const [highlight, face, edge, depth] = letteringColors[tone];
    const relief = context.createLinearGradient(0, 3, 0, 12);
    relief.addColorStop(0, highlight);
    relief.addColorStop(2 / 9, highlight);
    relief.addColorStop(2 / 9, face);
    relief.addColorStop(7 / 9, face);
    relief.addColorStop(7 / 9, edge);
    relief.addColorStop(1, edge);
    drawSettingsPixelText(context, text, 0, 4, 1, depth);
    drawSettingsPixelText(context, text, 0, 3, 1, relief);
    sprite = canvas.toDataURL();
    lettering.set(key, sprite);
  }
  element.style.setProperty('--settings-ink', `url("${sprite}")`);
  element.style.setProperty('--settings-ink-width', String(width));
  element.classList.add('settings-caption-painted');
}
