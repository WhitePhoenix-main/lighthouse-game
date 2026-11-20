import type { campaignChapterIntro } from '../../content/campaignIntros';
import { translate, type Language } from '../shared/localization';
import { preparationEscape as escape, watchPrepAsset, watchPrepIcon } from './preparationArtwork';

export function campaignStoryCard(intro: NonNullable<ReturnType<typeof campaignChapterIntro>>, language: Language,
    replay: boolean, blocked: boolean): string {
  const en = language === 'en';
  const action = replay ? 'close-intro-replay' : 'acknowledge-intro';
  const chapter = ['I','II','III','IV','V','VI','VII'][intro.chapterNumber - 1];
  return `<article class="campaign-story-card" role="dialog" aria-modal="true"
    aria-labelledby="campaign-intro-title" aria-describedby="campaign-intro-journal" lang="${language}" data-prep-scroll>
    <img class="campaign-story-illustration" draggable="false" data-chapter="${intro.chapterNumber}" src="${watchPrepAsset('illustrations', `intro-${intro.chapterNumber}`)}" alt="">
    <header class="campaign-story-heading">
      <small>${watchPrepIcon('book')}${en ? 'Chapter' : 'Глава'} ${chapter}</small><div class="watch-rail"></div>
      <h2 class="watch-title" id="campaign-intro-title">${escape(translate(intro.title, language))}</h2>
    </header>
    <div class="campaign-story-copy">
      <div class="campaign-story-rule" aria-hidden="true">${watchPrepIcon('book')}<div class="watch-rail"></div></div>
      <p id="campaign-intro-journal">${escape(intro[language])}</p>
      <div class="campaign-story-actions">
        <button type="button" class="prep-button watch-button watch-primary" data-prep-action="${action}" ${blocked ? 'disabled' : ''}>${watchPrepIcon(replay ? 'back' : 'play')}${replay ? en ? 'Back to Chronicle' : 'К Хронике' : en ? 'Continue' : 'Продолжить'}</button>
        ${replay ? '' : `<button type="button" class="prep-button watch-button" data-prep-action="${action}" ${blocked ? 'disabled' : ''}>${en ? 'Skip intro' : 'Пропустить вступление'}</button>`}
      </div>
    </div>
  </article>`;
}
