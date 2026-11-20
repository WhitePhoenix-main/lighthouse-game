import type { ApplicationView, GameApplication } from '../contracts';
import { CAMPAIGN_REWARD_CATALOG, isCampaignCosmeticForSlot, isCampaignRewardId } from '../content/campaignRewards';
import type { CampaignGameView, CampaignRewardOffer, CampaignRewardUnavailableReason } from '../application/campaignView';
import { resolveLanguage, translate, type Language } from './shared/localization';
import { preparationEscape as escape } from './preparation/preparationArtwork';
import { watchAsset, watchIcon, watchIllustration } from './shared/watchArtwork';
import './campaignEconomy.css';

const unavailable: Record<CampaignRewardUnavailableReason, readonly [string, string]> = {
  'active-attempt': ['Сначала завершите бой.', 'Finish the battle first.'],
  'pending-operation': ['Завершите текущее предложение.', 'Finish the pending offer.'],
  'chapter-locked': ['Доступно с главы 4.', 'Available from Chapter 4.'],
  'warden-required': ['Доступно после первой полной победы над Стражем.', 'Available after clearing the Abyss Warden night.'],
  'already-unlocked': ['Уже получено.', 'Already unlocked.'],
  'global-limit': ['Достигнут общий лимит за 24 часа.', 'The overall 24-hour limit has been reached.'],
  'category-limit': ['Достигнут лимит этой награды за 24 часа.', 'This reward has reached its 24-hour limit.'],
  'balance-limit': ['Достигнут предел баланса.', 'The balance limit has been reached.'],
};

function language(view: ApplicationView): Language {
  return resolveLanguage(view.settings.language, undefined, typeof navigator === 'undefined' ? [] : navigator.languages);
}

function rewardText(offer: Pick<CampaignRewardOffer, 'request' | 'amount'>, lang: Language): string {
  if (offer.request.kind === 'shards') return `+${offer.amount} ◈`;
  if (offer.request.kind === 'pearl') return `+${offer.amount} ◎`;
  return lang === 'en' ? `+1 point for ${CAMPAIGN_REWARD_CATALOG[offer.request.rewardId].title.en}`
    : `+1 очко для «${CAMPAIGN_REWARD_CATALOG[offer.request.rewardId].title.ru}»`;
}

const rewardIcon = (kind: CampaignRewardOffer['request']['kind']): string =>
  watchIcon(kind === 'shards' ? 'coin' : kind === 'pearl' ? 'pearl' : 'check');

function testOffer(offer: CampaignRewardOffer, rewards: CampaignGameView['rewards'], lang: Language, blocked: boolean): string {
  const en = lang === 'en';
  const reason = offer.unavailableReason ? unavailable[offer.unavailableReason][en ? 1 : 0]
    : !rewards.testAvailable ? en ? 'Video offers are currently unavailable.' : 'Видеопредложения пока недоступны.' : '';
  const request = offer.request;
  return `<div class="campaign-offer"><p class="economy-reward-amount">${rewardIcon(request.kind)}<strong>${escape(rewardText(offer, lang))}</strong></p>
    <p>${en ? 'Remaining in 24 h' : 'Осталось за 24 ч'} ${Math.min(offer.remainingGlobal, offer.remainingCategory)}</p>
    ${reason ? `<p class="economy-offer-reason">${escape(reason)}</p>` : ''}
    ${rewards.testAvailable ? `<button class="watch-button" type="button" data-action="campaign-reward-start" data-reward-kind="${request.kind}" ${request.kind === 'collection' ? `data-reward-id="${request.rewardId}"` : ''}
      ${reason || blocked ? 'disabled' : ''}>${en ? 'Start test viewing' : 'Тестовый просмотр'}</button>` : ''}</div>`;
}

function pendingReward(rewards: CampaignGameView['rewards'], lang: Language, blocked: boolean): string {
  if (!rewards.pending) return '';
  const en = lang === 'en';
  const operation = `data-reward-operation="${escape(rewards.pending.id)}"`;
  return `<section class="campaign-offer campaign-pending" aria-label="${en ? 'Pending offer' : 'Ожидающее предложение'}">
    <h3>${en ? 'Pending offer' : 'Ожидающее предложение'}</h3>
    <p class="economy-reward-amount">${rewardIcon(rewards.pending.request.kind)}<strong>${escape(rewardText(rewards.pending, lang))}</strong></p>
    <p>${en ? 'Waiting for confirmation.' : 'Ожидает подтверждения.'}</p>
    <div class="campaign-offer-actions">
      ${rewards.testAvailable ? `<button class="watch-button watch-primary" type="button" data-action="campaign-reward-finish" data-reward-result="confirmed" ${operation} ${blocked ? 'disabled' : ''}>${en ? 'Simulate confirmation' : 'Имитировать подтверждение'}</button>
        <button class="watch-button" type="button" data-action="campaign-reward-finish" data-reward-result="unavailable" ${operation} ${blocked ? 'disabled' : ''}>${en ? 'Simulate no video' : 'Имитировать отсутствие видео'}</button>` : ''}
      <button class="watch-button" type="button" data-action="campaign-reward-finish" data-reward-result="dismissed" ${operation} ${blocked ? 'disabled' : ''}>${en ? 'Cancel offer' : 'Отменить предложение'}</button>
    </div></section>`;
}

function rewardNotice(rewards: CampaignGameView['rewards'], lang: Language): string {
  const messages = {
    confirmed: ['Тестовая награда сохранена.', 'Test reward saved.'],
    dismissed: ['Предложение отменено. Лимит сохранён.', 'Offer canceled. No view counted.'],
    unavailable: ['Видео недоступно. Награда не получена, лимит сохранён.', 'Video unavailable. No reward or view counted.'],
  } as const;
  return rewards.notice ? `<p role="status" data-reward-notice>${messages[rewards.notice][lang === 'en' ? 1 : 0]}</p>` : '';
}

export function campaignCurrencyPanel(view: ApplicationView, kind: 'shards' | 'pearl'): string {
  const rewards = view.campaign?.rewards;
  if (!rewards) return '';
  const lang = language(view), en = lang === 'en';
  return `<div class="campaign-currency-layout">
    <div class="economy-archive"><img src="${watchIllustration('archive')}" alt="" draggable="false"></div>
    <section class="watch-panel watch-gold campaign-currency-offer">
      ${rewardNotice(rewards, lang)}
      ${rewards.pending ? pendingReward(rewards, lang, !!view.error)
        : `<h3>${en ? 'Optional reward' : 'Добровольная награда'}</h3>${testOffer(rewards.currency[kind === 'shards' ? 0 : 1], rewards, lang, !!view.error)}`}
      <button type="button" class="watch-button economy-close-offer" data-prep-action="close-panel">${watchIcon('back')}${en ? 'Back' : 'Назад'}</button>
    </section></div>`;
}

export function campaignResultReward(view: ApplicationView): string {
  const id = view.result?.nightId;
  const item = view.campaign?.rewards.collection.find(reward => reward.ordinaryVictoryNightId === id && reward.canClaimOrdinary);
  if (!item || view.result?.outcome !== 'victory' || !view.result.saved) return '';
  const lang = language(view), en = lang === 'en';
  return `<div class="campaign-result-reward watch-inset">
    <img src="${watchAsset('navigation/' + item.id)}" alt="" draggable="false">
    <strong>${escape(item.title[lang])}</strong>
    <button class="watch-button watch-primary" type="button" data-action="campaign-reward-claim" data-reward-id="${item.id}" ${view.error ? 'disabled' : ''}>${en ? 'Claim reward' : 'Забрать награду'}</button></div>`;
}

const details = {
  'siege-cannon': ['Урон +25% · интервал между выстрелами +25%.', 'Damage +25% · time between shots +25%.'],
  'long-harpoon': ['Дальность +15% · урон −15%.', 'Range +15% · damage −15%.'],
  'dawn-beacon': ['Медно-золотая отделка маяка. Меняет внешний вид.', 'Copper and gold trim for the lighthouse. Cosmetic only.'],
  'bronze-devices': ['Бронзовая отделка устройств. Меняет внешний вид.', 'Bronze finish for devices. Cosmetic only.'],
  moonbeam: ['Серебристо-голубой свет. Область поражения прежняя.', 'Silver-blue light with the same effective area.'],
} as const;

export function campaignCollection(view: ApplicationView, selectedId?: string): string {
  const rewards = view.campaign?.rewards;
  if (!rewards) return '';
  const lang = language(view), en = lang === 'en', disabled = view.error ? 'disabled' : '';
  const pending = rewards.pending?.request;
  const selected = rewards.collection.find(item => item.id === (selectedId ?? (pending?.kind === 'collection' ? pending.rewardId : undefined)))
    ?? rewards.collection.find(item => item.id === 'dawn-beacon') ?? rewards.collection[0];
  if (!selected) return '';
  const equipped = selected.type === 'cosmetic' && rewards.equipped[selected.slot] === selected.id;
  const night = view.nights.find(night => night.id === selected.ordinaryVictoryNightId)?.name;
  const nightName = escape(night ? translate(night, lang) : selected.ordinaryVictoryNightId);
  const nightCondition = en ? `${selected.canClaimOrdinary ? 'Victory' : 'Win'} in “${nightName}”`
    : `${selected.canClaimOrdinary ? 'Победа' : 'Победите'} в ночи «${nightName}»`;
  const cosmeticAction = selected.unlocked && selected.type === 'cosmetic'
    ? `<button class="watch-button ${equipped ? '' : 'watch-primary'}" type="button" ${disabled} data-action="campaign-cosmetic" data-reward-id="${selected.id}" aria-pressed="${equipped}">
      ${watchIcon(equipped ? 'gear' : 'check')}${equipped ? en ? 'Restore original' : 'Снять оформление' : en ? 'Equip' : 'Применить'}</button>` : '';
  const claim = selected.canClaimOrdinary
    ? `<button class="watch-button watch-primary" type="button" ${disabled} data-action="campaign-reward-claim" data-reward-id="${selected.id}">
      ${watchIcon('check')}${en ? 'Claim reward' : 'Забрать награду'}</button>` : '';
  const shelf = (type: 'variant' | 'cosmetic', title: string): string => `<section class="campaign-shelf"><h2>${title}</h2>
    <div>${rewards.collection.filter(item => item.type === type).map(item => {
      const isEquipped = item.type === 'cosmetic' && rewards.equipped[item.slot] === item.id;
      const state = isEquipped ? en ? 'Equipped' : 'Применено'
        : item.unlocked ? en ? 'Unlocked' : 'Получено'
          : item.canClaimOrdinary ? en ? 'Ready to claim' : 'Можно получить' : en ? 'Locked' : 'Закрыто';
      return `<button type="button" class="campaign-shelf-slot watch-inset" data-action="campaign-select-reward"
        data-reward-id="${item.id}" data-focus-key="campaign-collection-${item.id}" aria-pressed="${selected.id === item.id}"
        aria-label="${escape(item.title[lang])} · ${state}" title="${escape(item.title[lang])}">
        <img src="${watchAsset('navigation/' + item.id)}" alt="" draggable="false">
        ${item.unlocked || !item.canClaimOrdinary ? `<span class="campaign-shelf-mark">${watchIcon(item.unlocked ? 'check' : 'lock')}</span>` : ''}
      </button>`;
    }).join('')}</div></section>`;
  return `<section class="campaign-collection economy-screen" data-text-size="${view.settings.textSize}">
    <header class="economy-header"><button class="watch-button economy-back" type="button" data-action="back"
      aria-label="${en ? 'Back' : 'Назад'}">${watchIcon('back')}</button><h1 tabindex="-1">${en ? 'Collection' : 'Коллекция'}</h1>
      <span class="economy-collection-count" aria-label="${en ? 'Items unlocked' : 'Получено предметов'}">${rewards.collection.filter(item => item.unlocked).length} / ${rewards.collection.length}</span>
    </header>
    <div class="campaign-collection-board">
      <div class="campaign-cabinet">${shelf('variant', en ? 'Devices' : 'Устройства')}${shelf('cosmetic', en ? 'Cosmetics' : 'Оформление')}</div>
      <aside class="campaign-display watch-panel watch-gold" aria-labelledby="campaign-reward-title">
        <div class="economy-inspector-body">
          <div class="campaign-display-case watch-inset"><img src="${watchAsset('navigation/' + selected.id)}" alt="" draggable="false"></div>
          <h2 id="campaign-reward-title" tabindex="-1" data-reward-heading="${selected.id}" data-focus-key="campaign-reward-heading-${selected.id}">${escape(selected.title[lang])}</h2>
          <p>${details[selected.id][en ? 1 : 0]}</p>
          ${rewardNotice(rewards, lang)}${pendingReward(rewards, lang, !!view.error)}
          ${selected.unlocked
            ? selected.type === 'variant'
              ? `<p>${en ? 'Available to buy in Devices on the preparation screen.' : 'Можно купить в «Устройствах» на подготовке.'}</p>`
              : equipped ? `<p class="economy-reward-status">${watchIcon('check')}${en ? 'Equipped' : 'Оформление применено'}</p>` : ''
            : `<p class="economy-reward-status">${watchIcon(selected.canClaimOrdinary ? 'check' : 'lock')}${nightCondition}</p>
              <p>${en ? 'Collection points' : 'Очки коллекции'} ${selected.collectionPoints}/${selected.requiredPoints}</p>
              ${rewards.pending ? '' : testOffer(selected.offer, rewards, lang, !!view.error)}`}
        </div>
        ${claim || cosmeticAction}
      </aside></div></section>`;
}

/** Shared DOM dispatch for both the collection page and the preparation drawers. */
export function campaignRewardAction(application: GameApplication, action: string, button: HTMLElement): boolean {
  const id = button.dataset.rewardId;
  if (action === 'campaign-collection') application.openCollection?.();
  else if (action === 'campaign-reward-claim') {
    if (isCampaignRewardId(id)) application.claimCampaignReward?.(id);
  } else if (action === 'campaign-cosmetic') {
    if (isCampaignRewardId(id)) {
      const item = CAMPAIGN_REWARD_CATALOG[id];
      if (item.type === 'cosmetic' && isCampaignCosmeticForSlot(id, item.slot)) {
        application.equipCampaignCosmetic?.(item.slot, application.view.campaign?.rewards.equipped[item.slot] === id ? null : id);
      }
    }
  } else if (action === 'campaign-reward-start') {
    const kind = button.dataset.rewardKind;
    if (kind === 'shards' || kind === 'pearl') application.beginRewardPreview?.({ kind });
    if (kind === 'collection' && isCampaignRewardId(id)) application.beginRewardPreview?.({ kind, rewardId: id });
  } else if (action === 'campaign-reward-finish') {
    const result = button.dataset.rewardResult;
    const operation = button.dataset.rewardOperation;
    if (operation && (result === 'confirmed' || result === 'dismissed' || result === 'unavailable')) {
      application.finishRewardPreview?.(operation, result);
    }
  } else return false;
  return true;
}
