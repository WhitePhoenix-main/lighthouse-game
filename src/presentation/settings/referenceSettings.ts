import type { ApplicationView } from '../../contracts';
import { resolveLanguage, translate } from '../shared/localization';
import { paintSettingsCaption } from './settingsArtwork';

export function referenceSettings(view: ApplicationView): string {
  const settings = view.settings;
  const language = resolveLanguage(settings.language, undefined, typeof navigator === 'undefined' ? [] : navigator.languages);
  const t = (word: string): string => translate(word, language).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]!);
  const disabled = view.settingsError ? 'disabled' : '';
  const caption = (label: string) => `<span class="settings-caption">${t(label)}</span>`;
  const choice = (id: string, label: string, action: string, attribute: string, selected: boolean) =>
    `<button type="button" class="settings-choice settings-control" data-setting="${id}" data-action="${action}" ${attribute} aria-pressed="${selected}" ${disabled}>${caption(label)}</button>`;
  const volume = (id: 'music' | 'effects', label: string, value: number) =>
    `<label class="settings-slider settings-control" data-setting="${id}">${caption(label)}
    <output class="settings-caption" data-${id}-volume>${value}%</output>
    <span class="settings-range"><span class="settings-track" aria-hidden="true"></span>
    <input type="range" aria-label="${t(label)}" data-action="${id}-volume" min="0" max="100" step="1" value="${value}" aria-valuetext="${value}%" ${disabled}></span></label>`;
  return `<section class="reference-settings" aria-labelledby="settings-title" data-ready="true" data-sound="${settings.soundEnabled}">
    <div class="settings-scrim" aria-hidden="true"></div>
    <div class="settings-board" ${view.settingsError ? 'inert' : ''}>
    <div class="settings-stone settings-cabinet">
      <header class="settings-lintel"><h1 id="settings-title" tabindex="-1">${caption('Настройки')}</h1></header>
      <div class="settings-shelves">
        <div class="sound-shelf">
          <div class="sound-state settings-group">
            <h2>${caption('Звук')}</h2>
            <div class="settings-choices" role="group" aria-label="${t('Звук')}">
              ${choice('on', 'Вкл', 'sound-toggle', 'data-enabled="true"', settings.soundEnabled)}
              ${choice('off', 'Выкл', 'sound-toggle', 'data-enabled="false"', !settings.soundEnabled)}
            </div>
          </div>
          <div class="settings-volumes">
            ${volume('music', 'Музыка', settings.musicVolume)}
            ${volume('effects', 'Звуки', settings.effectsVolume)}
          </div>
        </div>
        <div class="reading-shelf">
          <div class="settings-group">
            <h2>${caption('Язык')}</h2>
            <div class="settings-choices settings-languages" role="group" aria-label="${t('Язык')}">
              ${choice('auto', 'Авто', 'language', 'data-language="auto"', settings.language === 'auto')}
              ${choice('ru', 'Русский', 'language', 'data-language="ru"', settings.language === 'ru')}
              ${choice('en', 'English', 'language', 'data-language="en"', settings.language === 'en')}
            </div>
          </div>
          <div class="settings-group">
            <h2>${caption('Размер текста')}</h2>
            <div class="settings-choices" role="group" aria-label="${t('Размер текста')}">
              ${choice('normal', 'Обычный', 'text-size', 'data-size="normal"', settings.textSize === 'normal')}
              ${choice('large', 'Крупный', 'text-size', 'data-size="large"', settings.textSize === 'large')}
            </div>
          </div>
        </div>
      </div>
    </div>
    <button type="button" class="settings-frame-button settings-back settings-control" data-setting="back" data-action="back">${caption('Назад')}</button></div>
    ${view.settingsError ? `<div class="watch-dialog-shade settings-error-shade"><section class="reference-settings-error settings-stone" role="alertdialog" aria-modal="true" aria-labelledby="settings-error-title"><h2 id="settings-error-title">${t('Настройки не подтверждены')}</h2><p>${t(view.settingsError)}</p><div class="settings-error-actions"><button type="button" class="settings-frame-button" data-action="retry-settings">${t('Повторить сохранение')}</button><button type="button" class="settings-frame-button" data-action="cancel-settings">${t('Вернуться к сохранённому')}</button></div></section></div>` : ''}</section>`;
}

/** Preserve the mounted input during drags and refresh both the numeric and accessible value. */
export function layoutReferenceSettings(root: HTMLElement, view: ApplicationView): void {
  const page = root.querySelector<HTMLElement>('.reference-settings');
  if (!page) return;
  page.dataset.orientation = page.clientWidth > page.clientHeight ? 'landscape' : 'portrait';
  page.dataset.layout = page.clientWidth < 960 ? 'mobile' : 'desktop';
  for (const caption of page.querySelectorAll<HTMLElement>('.settings-caption:not(output)')) {
    const parent = caption.parentElement;
    const tone = parent?.matches('h1, .settings-back') ? 'gold'
      : parent?.matches('[aria-pressed="true"]') ? 'selected'
        : parent?.matches('[aria-pressed="false"]') ? 'choice' : 'heading';
    paintSettingsCaption(caption, caption.textContent ?? '', tone);
  }
  for (const name of ['music','effects'] as const) {
    const value = view.settings[name === 'music' ? 'musicVolume' : 'effectsVolume'] + '%';
    const output = page.querySelector<HTMLOutputElement>(`[data-${name}-volume]`)!;
    output.value = value;
    paintSettingsCaption(output, value, 'value');
    const slider = page.querySelector<HTMLInputElement>(`[data-action="${name}-volume"]`)!;
    slider.setAttribute('aria-valuetext', value);
    slider.parentElement!.style.setProperty('--volume', value);
  }
}
