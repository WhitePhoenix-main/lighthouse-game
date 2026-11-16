import type { ApplicationView } from '../contracts';
import { resolveLanguage, translate } from './localization';
import { loadSettingsAssets, paintSettingsArtwork, type SettingsAssets } from './settingsArtwork';
import { settingsLayout, usesMobileSettingsLayout, type SettingsChoice, type SettingsLayout, type SettingsRect, type SettingsVolume } from './settingsLayout';

const words: Record<SettingsChoice, string> = {
  on: 'ВКЛ', off: 'ВЫКЛ', auto: 'АВТОМАТИЧЕСКИ', ru: 'РУССКИЙ', en: 'ENGLISH', normal: 'ОБЫЧНЫЙ', large: 'КРУПНЫЙ', back: 'НАЗАД'
};
const escape = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
let assets: SettingsAssets | undefined;
const pending = new WeakMap<HTMLCanvasElement, symbol>();

/** Artwork and real native controls share a layout, including range thumb travel. */
export function referenceSettings(view: ApplicationView): string {
  const language = resolveLanguage(view.settings.language, undefined, typeof navigator === 'undefined' ? [] : navigator.languages);
  const t = (word: string): string => escape(translate(word, language));
  const disabled = view.settingsError ? 'disabled' : '';
  const choice = (label: Exclude<SettingsChoice, 'back'>, action: string, data: string, selected: boolean): string =>
    `<button class="settings-control" data-setting="${label}" data-action="${action}" ${data} aria-label="${t(words[label])}" aria-pressed="${selected}" ${disabled}><span class="settings-accessible-label settings-native-label">${label === 'auto' ? language === 'ru' ? 'АВТО' : 'AUTO' : t(words[label])}</span></button>`;
  const slider = (label: SettingsVolume, word: string, value: number): string =>
    `<label class="settings-control settings-slider" data-setting="${label}"><span class="settings-accessible-label settings-native-label">${t(word)}</span><input aria-label="${t(word)}" aria-valuetext="${value}%" data-action="${label}-volume" type="range" min="0" max="100" step="1" value="${value}" ${disabled}></label>`;
  return `<section class="reference-settings" aria-labelledby="settings-title"><div class="settings-scrim" aria-hidden="true"></div><div class="settings-board"><canvas class="settings-art" aria-hidden="true"></canvas><h1 id="settings-title" class="settings-accessible-label" tabindex="-1">${t('Настройки')}</h1>
    ${choice('on', 'sound-toggle', 'data-enabled="true"', view.settings.soundEnabled)}${choice('off', 'sound-toggle', 'data-enabled="false"', !view.settings.soundEnabled)}
    ${slider('music', 'Музыка', view.settings.musicVolume)}${slider('effects', 'Звуки', view.settings.effectsVolume)}
    ${choice('auto', 'language', 'data-language="auto"', view.settings.language === 'auto')}${choice('ru', 'language', 'data-language="ru"', view.settings.language === 'ru')}${choice('en', 'language', 'data-language="en"', view.settings.language === 'en')}
    ${choice('normal', 'text-size', 'data-size="normal"', view.settings.textSize === 'normal')}${choice('large', 'text-size', 'data-size="large"', view.settings.textSize === 'large')}
    <button class="settings-control" data-setting="back" data-action="back"><span class="settings-accessible-label settings-native-label">${t('Назад')}</span></button></div>
    <p class="settings-load-status" role="status" hidden></p>
    ${view.settingsError ? `<div class="reference-settings-error" role="alert"><p>${t(view.settingsError)}</p><button data-action="retry-settings">${t('Повторить сохранение')}</button><button data-action="cancel-settings">${t('Вернуться к сохранённому')}</button></div>` : ''}</section>`;
}

function position(element: HTMLElement, rect: SettingsRect, scale: number): void {
  element.style.left = `${rect.x * scale}px`; element.style.top = `${rect.y * scale}px`;
  element.style.width = `${rect.width * scale}px`; element.style.height = `${rect.height * scale}px`;
}

export function layoutReferenceSettings(root: HTMLElement, view: ApplicationView): void {
  const page = root.querySelector<HTMLElement>('.reference-settings');
  const board = page?.querySelector<HTMLElement>('.settings-board');
  const canvas = board?.querySelector<HTMLCanvasElement>('.settings-art');
  if (!page || !board || !canvas || !page.clientWidth || !page.clientHeight) return;
  let layout: SettingsLayout;
  // A newly visible scrollbar can change available width on the first pass.
  for (let pass = 0; pass < 2; pass++) {
    const width = page.clientWidth;
    const mobile = usesMobileSettingsLayout(width, page.clientHeight,
      window.matchMedia('(pointer: coarse)').matches, navigator.maxTouchPoints);
    layout = settingsLayout(width, page.clientHeight, view.settings.textSize, mobile);
    board.style.width = `${layout.width * layout.scale}px`;
    board.style.height = `${Math.ceil(layout.height * layout.scale)}px`;
    if (page.clientWidth === width) break;
  }
  const current = layout!;
  page.style.setProperty('--settings-ui-scale', String(current.scale));
  page.style.setProperty('--settings-content-height', `${Math.ceil(current.height * current.scale)}px`);
  page.dataset.orientation = current.orientation;
  page.dataset.layout = current.mobile ? 'mobile' : 'desktop';
  page.dataset.compact = String(current.compact);
  for (const [label, rect] of Object.entries(current.choices)) {
    position(board.querySelector<HTMLElement>(`[data-setting="${label}"]`)!, rect, current.scale);
  }
  for (const label of ['music', 'effects'] as const) {
    const rect = current.sliders[label], height = Math.max(44 / current.scale, rect.height);
    const element = board.querySelector<HTMLElement>(`[data-setting="${label}"]`)!;
    position(element, { ...rect, y: rect.y + 5 - height / 2, height }, current.scale);
    element.style.setProperty('--slider-thumb', `${24 * current.scale}px`);
    element.querySelector('input')!.setAttribute('aria-valuetext', `${view.settings[label === 'music' ? 'musicVolume' : 'effectsVolume']}%`);
  }
  if (!assets) {
    page.dataset.ready = 'loading';
    const ticket = Symbol(); pending.set(canvas, ticket);
    void loadSettingsAssets().then(loaded => {
      assets = loaded;
      if (canvas.isConnected && pending.get(canvas) === ticket) layoutReferenceSettings(root, view);
    }).catch(() => {
      if (!canvas.isConnected || pending.get(canvas) !== ticket) return;
      page.dataset.ready = 'error';
      const status = page.querySelector<HTMLElement>('.settings-load-status')!;
      const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
      status.textContent = language === 'ru' ? 'Не удалось загрузить оформление. Настройки доступны ниже.' : 'Could not load the artwork. Settings remain available below.';
      status.hidden = false;
    });
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(current.width * current.scale * ratio);
  canvas.height = Math.ceil(current.height * current.scale * ratio);
  const context = canvas.getContext('2d')!;
  context.setTransform(current.scale * ratio, 0, 0, current.scale * ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  const language = resolveLanguage(view.settings.language, undefined, navigator.languages);
  paintSettingsArtwork(context, current, view.settings, language, assets, !view.settingsError);
  const status = page.querySelector<HTMLElement>('.settings-load-status')!;
  status.hidden = true;
  status.textContent = '';
  page.dataset.ready = 'true';
}
