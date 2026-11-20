import type { ApplicationView, NightOptionView } from '../../contracts';
import { CAMPAIGN_NIGHT_CATALOG } from '../../content/campaignRuntime';
import { NIGHT_CATALOG } from '../../content/nights';
import { campaignChapterIntro } from '../../content/campaignIntros';
import { resolveLanguage, translate } from '../shared/localization';
import { chroniclePage, type ChronicleChapter, type ChronicleSelection } from './chronicleState';
import { prepLabel, preparationEscape as esc, watchPrepAsset, watchPrepIcon as icon } from './preparationArtwork';

const roman = (number: number): string => ['I','II','III','IV','V','VI','VII','VIII','IX','X'][number - 1] ?? String(number);
const leafSize = 4;

function nightCard(night: NightOptionView, active: boolean, number: number, english: boolean, blocked: boolean, trials: boolean): string {
  const status = !night.available ? 'lock' : night.completed ? 'check' : 'book';
  const state = !night.available ? (night.reason || 'Закрыта') : night.completed ? 'Пройдена' : 'Доступна';
  const label = english ? translate(`${night.name} · ${state}`, 'en') : `${night.name} · ${state}`;
  return `<li data-chronicle-night="${esc(night.id)}" data-optional="${night.optional}"><button type="button"
    class="prep-button chronicle-card ${night.available ? '' : 'chronicle-locked'}" data-prep-action="${night.available ? 'chronicle-night' : 'chronicle-preview-night'}"
    data-night="${esc(night.id)}" aria-pressed="${active}" aria-label="${esc(label)}" ${blocked ? 'disabled' : ''}>
    ${trials ? '' : `<small>${roman(number)}</small>`}<strong>${prepLabel(night.name)}</strong>
    ${trials && night.available ? '' : `<span class="chronicle-stud" data-light="${night.completed ? 'lit' : night.available ? 'dim' : 'fog'}">${icon(status)}</span>`}
  </button></li>`;
}

function chapterCard(chapter: ChronicleChapter, active: boolean): string {
  const locked = chapter.nights.every(night => !night.available);
  return `<li data-index-leaf="${Math.floor((chapter.number - 1) / leafSize)}"><button type="button" class="prep-button chronicle-card chronicle-index-entry" data-prep-action="chronicle-chapter"
    data-chapter="${esc(chapter.id)}" aria-label="${esc(`Глава ${roman(chapter.number)} · ${chapter.title}${locked ? ' · Закрыта' : ''}`)}" ${active ? 'aria-current="true"' : ''}>
    <small>${roman(chapter.number)}</small><strong>${prepLabel(chapter.title)}</strong><span class="chronicle-stud">${icon(locked ? 'lock' : 'book')}</span>
  </button></li>`;
}

function pageControls(page: number, count: number, selection: ChronicleSelection, english: boolean): string {
  if (count < 2) return '';
  const contents = selection.contents;
  const action = contents ? 'chronicle-index-page' : 'chronicle-page';
  const label = contents
    ? `${english?'Chapters':'Главы'} ${page * leafSize + 1}–${Math.min((page + 1) * leafSize, count)} / ${count}`
    : `${english?'Leaf':'Лист'} ${page + 1} / ${count}`;
  const last = contents ? Math.ceil(count / leafSize) - 1 : count - 1;
  if (last === 0) return '';
  return `<nav class="chronicle-paginator ${contents ? 'chronicle-index-controls' : ''}" aria-label="Перелистывание">
    <button type="button" class="prep-button watch-button chronicle-page-button" aria-label="Предыдущая страница" data-prep-action="${action}" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}><span aria-hidden="true">‹</span></button>
    <span class="chronicle-page-number" aria-live="polite">${label}</span>
    <button type="button" class="prep-button watch-button chronicle-page-button" aria-label="Следующая страница" data-prep-action="${action}" data-page="${page + 1}" ${page >= last ? 'disabled' : ''}><span aria-hidden="true">›</span></button>
  </nav>`;
}

function detail(view: ApplicationView, chapter: ChronicleChapter, night: NightOptionView, selection: ChronicleSelection, english: boolean): string {
  const trials = selection.kind === 'trials';
  const definitions = view.campaign ? CAMPAIGN_NIGHT_CATALOG : NIGHT_CATALOG;
  const config = view.selectedNightId === night.id ? view.config : definitions.find(definition => definition.id === night.id)?.config;
  const art = trials ? (night.id === 'rescue-trial' ? 'harbor' : 'storm') : selection.contents && chapter.number === 2
    ? 'archive' : chapter.number === 1 ? 'harbor' : view.campaign ? `intro-${chapter.number}` : 'storm';
  const locked = selection.contents ? chapter.nights.every(entry => !entry.available) : !night.available;
  const title = selection.contents ? chapter.title : night.name;
  const number = chapter.nights.indexOf(night) + 1;
  const metadata = selection.contents
    ? (english ? `Chapter ${roman(chapter.number)} · ${chapter.nights.length} nights` : `Глава ${roman(chapter.number)} · Ночей ${chapter.nights.length}`)
    : trials ? locked ? (english ? 'Locked' : 'Закрыто') : (english ? 'Available' : 'Доступно')
    : (english ? `Night ${number}${config ? ` · ${config.waves.length} waves` : ''}` : `Ночь ${number}${config ? ` · Волн ${config.waves.length}` : ''}`);
  const ship = trials ? config?.ship : undefined;
  const description = selection.contents ? (locked ? chapter.nights[0]?.reason : undefined)
    : ship ? (english ? `Keep the ship in the beam for ${ship.rescueSeconds} s before the ${ship.deadline} s deadline.` : `Держите корабль в луче ${ship.rescueSeconds} с, пока не истекли ${ship.deadline} с.`) : night.description;
  const reward = ship ? (english ? `Ship rescue: +${ship.reward} shards.` : `Спасение корабля: +${ship.reward} осколков.`)
    : !selection.contents && !locked && config ? (english ? `Victory reward: ${config.victoryReward} shards.` : `Награда за победу: ${config.victoryReward} осколков.`) : undefined;
  return `<article class="chronicle-cover ${trials ? 'chronicle-paper' : ''}">
    <figure class="chronicle-coast">
      <img src="${watchPrepAsset('illustrations', art)}" draggable="false" alt="">
      ${trials ? `<span class="chronicle-seal">${icon(locked ? 'lock' : 'check')}</span>` : ''}
    </figure>
    <p class="chronicle-kicker">${trials || selection.contents ? '' : `<span class="chronicle-compact-chapter">${prepLabel(chapter.title)} · </span>`}${esc(metadata)}</p>
    <h2>${prepLabel(title)}</h2>
    ${description ? `<p class="chronicle-objective">${esc(description)}</p>` : ''}
    ${!selection.contents && locked && night.reason ? `<p class="chronicle-condition">${esc(night.reason)}</p>` : ''}
    ${reward ? `<p class="chronicle-condition">${esc(reward)}</p>` : ''}
  </article>`;
}

export function nightChronicle(view: ApplicationView, selection: ChronicleSelection): string {
  const page = chroniclePage(view, selection);
  if (!page) return '';
  const english = resolveLanguage(view.settings.language, undefined, typeof navigator === 'undefined' ? [] : navigator.languages) === 'en';
  const trials = selection.kind === 'trials';
  const returnToCampaign = trials && view.screen === 'preparation';
  const blocked = !!view.error;
  const contentsPage = selection.contentsPage ?? Math.floor((page.chapter.number - 1) / leafSize);
  const chapter = selection.contents ? page.chapters.find(entry => entry.id === selection.previewChapterId) ?? page.chapter : page.chapter;
  const night = page.nights.find(entry => entry.id === selection.previewNightId) ?? page.selected ?? page.nights[0]!;
  const heading = trials ? 'Испытания' : 'Хроника маяка';
  const intro = view.campaign && !trials ? campaignChapterIntro(chapter.number - 1) : undefined;
  const replay = intro && view.campaign?.seenIntroIds.includes(intro.id) && chapter.nights.some(entry => entry.available);
  const nightChooser = `<ol class="chronicle-nights" aria-label="${trials ? 'Испытания' : 'Выбор ночи'}" start="${page.page * leafSize + 1}">${page.nights.map((entry, index) => nightCard(entry, entry.id === night.id, page.page * leafSize + index + 1, english, blocked, trials)).join('')}</ol>`;
  return `<section class="night-chronicle ${trials ? 'chronicle-trials' : ''}" role="dialog" aria-modal="true" aria-label="${heading}" data-chronicle-kind="${selection.kind}">
    <header class="chronicle-heading"><button type="button" class="prep-button watch-button" data-prep-action="close-panel" aria-label="Назад" ${trials ? 'data-chronicle-initial-focus' : ''}>${icon('back')}</button>
      <h1>${prepLabel(heading)}</h1>${trials ? `<small>${english ? 'Prototype' : 'Прототип'}</small>` : ''}
    </header>
    <div class="chronicle-body">
      <div class="chronicle-scroll" data-prep-scroll>
        <div class="chronicle-book">
          <div class="chronicle-entries" id="chronicle-leaf" data-chronicle-page tabindex="-1">
            ${trials ? '' : `<div class="chronicle-tabs">
              <button type="button" class="prep-button watch-button chronicle-bookmark" data-prep-action="chronicle-contents" aria-pressed="${selection.contents}" aria-controls="chronicle-leaf" data-chronicle-initial-focus>${prepLabel('Главы')}</button>
              <button type="button" class="prep-button watch-button" data-prep-action="chronicle-nights-tab" aria-pressed="${!selection.contents}" aria-controls="chronicle-leaf">${english ? 'Nights' : 'Ночи'}</button>
            </div>`}
            ${selection.contents ? `<ul class="chronicle-index" data-index-leaf="${contentsPage}">${page.chapters.map(entry => chapterCard(entry, entry.id === chapter.id)).join('')}</ul>
              ${pageControls(contentsPage, page.chapters.length, selection, english)}
              ${view.nights.some(entry => entry.optional) ? `<button type="button" class="prep-button watch-button chronicle-trials-link" data-prep-action="chronicle-trials">${icon('book')}${prepLabel('Испытания')}</button>` : ''}`
              : `${trials ? '' : `<p class="chronicle-chapter-caption">${roman(chapter.number)} · ${prepLabel(chapter.title)}</p>`}${nightChooser}${pageControls(page.page, page.pageCount, selection, english)}`}
          </div>
          ${detail(view, chapter, selection.contents ? chapter.nights[0]! : night, selection, english)}
        </div>
      </div>
      <footer class="chronicle-actions">
        ${returnToCampaign ? `<button type="button" class="prep-button watch-button" data-prep-action="chronicle-contents">${prepLabel('Главы')}</button>` : ''}
        ${selection.contents ? `<button type="button" class="prep-button watch-button chronicle-inspect" data-prep-action="chronicle-inspect-chapter" data-chapter="${esc(chapter.id)}">${icon('book')}${english?'Inspect nights':'Осмотреть ночи'}</button>`
          : `${replay ? `<button type="button" class="prep-button watch-button chronicle-replay" data-prep-action="replay-intro">${icon('book')}${prepLabel('Смотреть вступление')}</button>` : ''}
          <button type="button" class="prep-button watch-button watch-primary chronicle-confirm" data-prep-action="confirm-night" ${!night.available || !page.selected || blocked ? 'disabled' : ''}>${icon(night.available ? 'play' : 'lock')}${prepLabel(night.available ? 'К подготовке' : (english ? 'Locked' : 'Закрыто'))}</button>`}
      </footer>
    </div>
  </section>`;
}
