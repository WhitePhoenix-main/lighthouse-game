import { skillIcon } from './skillTreeIcons';
import { translate, type Language } from '../shared/localization';
import { drawSettingsPixelText, settingsTextWidth } from '../shared/settingsLettering';
import { watchAsset } from '../shared/watchArtwork';

const watchIcons: Record<string, string> = {
  shard: 'coin', pearl: 'pearl', upgrades: 'tree', recon: 'book', zoom: 'target',
  flash: 'charge', devices: 'gear', hull: 'heart', shield: 'shield', engineering: 'gear',
  trap: 'trap', lock: 'lock', generator: 'generator', repair: 'repair', cannon: 'cannon',
};
export function skillSprite(name: string): string {
  if (name === 'lighthouse') return `<img class="skill-lighthouse-sprite" src="${watchAsset('world/beacon')}" alt="" draggable="false" aria-hidden="true">`;
  const path = watchIcons[name] ? 'ui/icon-' + watchIcons[name]
    : ['beam', 'lens', 'optics'].includes(name) ? 'navigation/optic' : '';
  if (path) return `<img class="skill-raster-icon" src="${watchAsset(path)}" alt="" draggable="false" aria-hidden="true">`;
  return skillIcon(name);
}

const portraits: Record<string, string> = {
  cannon: 'shore-cannon', barrier: 'palisade', generator: 'generator', trap: 'light-trap',
  harpoon: 'harpoon', mortar: 'mortar', bell: 'bell', repair: 'repair-lamp',
};
export function skillPortrait(name: string): string {
  return portraits[name] ? `<img class="skill-prop-portrait" src="${watchAsset('world/' + portraits[name])}" alt="" draggable="false" aria-hidden="true">`
    : skillSprite(name);
}
function paintLettering(canvas: HTMLCanvasElement, lines: string[]): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Skill lettering canvas unavailable');
  const scale = 2;
  canvas.width = Math.ceil(Math.max(...lines.map(line => settingsTextWidth(line, scale))) + 4);
  canvas.height = 26 + (lines.length - 1) * 22;
  lines.forEach((line, index) => drawSettingsPixelText(context, line, 1, 6 + index * 22, scale, '#dfc7a2'));
}

export function layoutSkillTreeArtwork(root: HTMLElement, language: Language): void {
  root.querySelectorAll<HTMLElement>('[data-skill-lettering]').forEach(element => {
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    const value = translate(element.dataset.skillLettering ?? '', language).toUpperCase();
    if (element.dataset.drawnText === value && element.dataset.ready === 'true') return;
    if (!value) return;
    try {
      paintLettering(canvas, [value]);
      const stacked = element.querySelector<HTMLCanvasElement>('.skill-lettering-stacked');
      const splitAt = value.indexOf(' ');
      if (stacked && splitAt >= 0) paintLettering(stacked, [value.slice(0, splitAt), value.slice(splitAt + 1)]);
      element.dataset.ready = 'true';
      element.dataset.drawnText = value;
    } catch {
      delete element.dataset.ready;
    }
  });
}
