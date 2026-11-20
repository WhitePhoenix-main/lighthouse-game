import { expect, it } from 'vitest';
import { CampaignGameStore, type CampaignRewardPreview } from '../src/application/campaignGameStore';
import { emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { LighthouseApplication } from '../src/application/gameApplication';
import { memorySettingsStore } from '../src/application/settings';
import { CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { CAMPAIGN_STORY_DRAFT } from '../src/content/campaignFoundationDraft';
import { campaignChapterIntro } from '../src/content/campaignIntros';
import { CAMPAIGN_REWARD_WINDOW_MS } from '../src/content/campaignRewards';
import { NIGHT_CONFIG } from '../src/content/night';
import { campaignCollection } from '../src/presentation/campaignCollection';
import { campaignDevelopment } from '../src/presentation/campaignDevelopment';
import { openChronicle } from '../src/presentation/preparation/chronicleState';
import { createPreparationUiState } from '../src/presentation/preparation/preparationState';
import { preparationScreen } from '../src/presentation/preparation/preparationScreen';

function fixture(initial = emptyCampaignProfile(), rewardPreview?: CampaignRewardPreview, now = Date.now) {
  let raw = JSON.stringify(initial);
  let sequence = 0;
  let failNextWrite = false;
  const store = { read: () => raw, write: (next: string) => {
    if (failNextWrite) { failNextWrite = false; throw new Error('write failed'); }
    raw = next;
  } };
  const open = () => new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `identity-${++sequence}`, seed: 42 }),
    memorySettingsStore(), CAMPAIGN_NIGHT_CATALOG, new CampaignGameStore(store, rewardPreview, now));
  return { open, saved: () => raw, failWrite: () => { failNextWrite = true; } };
}

function prepare(game: LighthouseApplication) {
  game.openGameMenu(); game.continueGame();
}

it('renders seven distinct story cards and reopens acknowledged journal art without editing the profile', () => {
  const intros = Array.from({ length: 7 }, (_, index) => campaignChapterIntro(index)!);
  expect(new Set(intros.map(intro => intro.image)).size).toBe(7);
  for (const intro of intros) {
    expect(intro.ru.split('. ').length).toBe(3);
    expect(intro.en.split('. ').length).toBe(3);
  }
  const { open, saved } = fixture();
  const game = open(); prepare(game);
  const state = createPreparationUiState(), details = { waves: '', lenses: '', lateModes: '' };
  expect(preparationScreen(game.view, state, details)).toContain('images/avalon-watch/illustrations/intro-1.png');
  expect(preparationScreen(game.view, state, details)).not.toContain('data-prep-action="start"');
  game.acknowledgeIntro();
  const reopened = open(); prepare(reopened);
  expect(reopened.view.campaign?.intro).toBeNull();
  state.panel = 'night'; state.chronicle = openChronicle(reopened.view);
  expect(preparationScreen(reopened.view, state, details)).toContain('data-prep-action="replay-intro"');
  const snapshot = saved();
  state.replayIntroChapter = 1;
  expect(preparationScreen(reopened.view, state, details)).toContain('data-prep-action="close-intro-replay"');
  expect(saved()).toBe(snapshot);
});

it('reopens an interrupted test offer and grants once on confirmation, outside the intro and battle', () => {
  const { open, saved } = fixture(undefined, { finish: result => result });
  const game = open(); prepare(game);
  game.beginRewardPreview({ kind: 'shards' });
  expect(game.view.campaign?.rewards.pending).toBeNull();
  game.acknowledgeIntro();
  game.beginRewardPreview({ kind: 'shards' });
  const pending = game.view.campaign?.rewards.pending;
  expect(pending?.amount).toBe(10);
  expect(game.view.profile.resources).toBe(0);
  const resumed = open(); prepare(resumed);
  expect(resumed.view.campaign?.rewards.pending?.id).toBe(pending?.id);
  resumed.finishRewardPreview(pending!.id, 'confirmed');
  const confirmed = saved();
  resumed.finishRewardPreview(pending!.id, 'confirmed');
  expect(saved()).toBe(confirmed);
  expect(resumed.view.profile.resources).toBe(10);
  resumed.beginRewardPreview({ kind: 'shards' });
  const second = resumed.view.campaign!.rewards.pending!.id;
  resumed.finishRewardPreview(pending!.id, 'confirmed');
  expect(resumed.view.campaign?.rewards.pending?.id).toBe(second);
  resumed.finishRewardPreview(second, 'unavailable');
  expect(resumed.view.campaign?.rewards.notice).toBe('unavailable');
  expect(resumed.view.campaign?.rewards.currency[0].remainingCategory).toBe(1);
  resumed.start();
  expect(resumed.view.screen).toBe('battle');
  resumed.openCollection();
  resumed.beginRewardPreview({ kind: 'shards' });
  expect(resumed.view.screen).toBe('battle');
  expect(resumed.view.campaign?.rewards.pending).toBeNull();
});

it('retries a confirmed write without calling the provider again and refreshes expiring limits', () => {
  let providerCalls = 0;
  let now = 1000;
  const { open, failWrite } = fixture(undefined, { finish: () => ++providerCalls < 3 ? 'confirmed' : 'unavailable' }, () => now);
  const game = open(); prepare(game); game.acknowledgeIntro();
  game.beginRewardPreview({ kind: 'shards' });
  failWrite();
  game.finishRewardPreview(game.view.campaign!.rewards.pending!.id, 'confirmed');
  expect(game.view.error).toContain('write failed');
  game.retrySave();
  expect(game.view.error).toBeNull();
  expect(providerCalls).toBe(1);
  expect(game.view.profile.resources).toBe(10);
  game.beginRewardPreview({ kind: 'shards' });
  game.finishRewardPreview(game.view.campaign!.rewards.pending!.id, 'confirmed');
  expect(game.view.campaign?.rewards.currency[0].unavailableReason).toBe('category-limit');
  expect(game.view.campaign?.rewards.refreshInMs).toBe(CAMPAIGN_REWARD_WINDOW_MS);
  now += CAMPAIGN_REWARD_WINDOW_MS;
  game.refreshCampaignRewards();
  expect(game.view.campaign?.rewards.currency[0].remainingCategory).toBe(2);
  expect(game.view.campaign?.rewards.refreshInMs).toBeNull();
});

it('claims and persists a cosmetic through the ordinary path without modifying combat rules', () => {
  const profile = emptyCampaignProfile();
  profile.wonNightIds = CAMPAIGN_STORY_DRAFT.slice(0, 21).map(night => night.id);
  profile.completedNights = profile.wonNightIds.length;
  profile.seenIntroIds = ['intro-misty-shore'];
  const { open } = fixture(profile);
  const game = open(); prepare(game);
  const before = structuredClone(game.view.config);
  game.openCollection();
  const cabinet = campaignCollection(game.view, 'moonbeam');
  expect(cabinet.match(/data-action="campaign-select-reward"/g)).toHaveLength(5);
  expect(cabinet).toContain('images/avalon-watch/navigation/moonbeam.png');
  expect(cabinet).toMatch(/data-action="campaign-reward-claim" data-reward-id="moonbeam"/);
  game.claimCampaignReward('moonbeam');
  expect(campaignCollection(game.view, 'moonbeam')).toMatch(/data-action="campaign-cosmetic" data-reward-id="moonbeam" aria-pressed="false"/);
  game.equipCampaignCosmetic('beam', 'moonbeam');
  expect(campaignCollection(game.view, 'moonbeam')).toMatch(/data-action="campaign-cosmetic" data-reward-id="moonbeam" aria-pressed="true"/);
  game.beginRewardPreview({ kind: 'shards' });
  expect(game.view.campaign?.rewards.pending).toBeNull();
  const reloaded = open();
  const { campaignAppearance, ...rest } = reloaded.view.config;
  expect(campaignAppearance).toEqual({ beam: 'moonbeam' });
  expect(rest).toEqual(before);
  expect(reloaded.view.profile.resources).toBe(profile.shards);
});

it('inspects the real campaign dependency and purchase preview without editing the profile', () => {
  const profile = emptyCampaignProfile();
  profile.shards = 85;
  profile.wonNightIds = ['first-light'];
  profile.completedNights = 1;
  profile.purchasedNodeIds = ['beam-power-1'];
  const { open, saved } = fixture(profile);
  const game = open();
  game.openDevelopment();
  const { view } = game;
  const before = saved();
  const chart = campaignDevelopment(view, 'all', 'beam-power-2');
  expect(chart.match(/data-campaign-catalog/g)).toHaveLength(256);
  expect(chart).toContain('data-from="beam-power-1" data-to="beam-power-2" data-related="true" data-met="true"');
  expect(chart).toContain('36 <span>→</span> 42');
  expect(chart).toMatch(/data-action="campaign-purchase" data-node="beam-power-2"[^>]*>[^]*?Купить/u);
  const locked = campaignDevelopment(view, 'all', 'paired-light');
  expect(locked).toContain('data-from="beam-width-1" data-to="paired-light" data-related="true" data-met="false"');
  expect(locked).toMatch(/data-action="campaign-purchase" data-node="paired-light"[^>]*disabled/u);
  expect(saved()).toBe(before);
});
