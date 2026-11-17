import { skillIcon } from './skillTreeIcons';
import { translate, type Language } from '../shared/localization';
import { drawSettingsPixelText, settingsTextWidth } from '../shared/settingsLettering';

const preparationIcons = new Set(['shard', 'pearl', 'upgrades', 'recon', 'zoom', 'lens', 'flash', 'devices']);
export function skillSprite(name: string): string {
  if (name === 'lighthouse') return `<img class="skill-lighthouse-sprite" src="${import.meta.env.BASE_URL}images/preparation/world/lighthouse-main.png" alt="" aria-hidden="true">`;
  if (preparationIcons.has(name)) return `<img class="skill-raster-icon" src="${import.meta.env.BASE_URL}images/preparation/ui/${name}.png" alt="" draggable="false" aria-hidden="true">`;
  return skillIcon(name);
}
export function layoutSkillTreeArtwork(root: HTMLElement, language: Language): void {
  root.querySelectorAll<HTMLElement>('[data-skill-lettering]').forEach(element => {
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    const value = translate(element.dataset.skillLettering ?? '', language).toUpperCase();
    if (element.dataset.drawnText === value && element.dataset.ready === 'true') return;
    const context = canvas.getContext('2d');
    if (!context || !value) return;
    const scale = 2;
    canvas.width = Math.ceil(settingsTextWidth(value, scale) + 4);
    canvas.height = 26;
    canvas.setAttribute('aria-hidden', 'true');
    try {
      drawSettingsPixelText(context, value, 1, 6, scale, '#dfc7a2');
      element.dataset.ready = 'true';
      element.dataset.drawnText = value;
    } catch {
      delete element.dataset.ready;
    }
  });
}
