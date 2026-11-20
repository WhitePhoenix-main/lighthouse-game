import { describe, expect, it } from 'vitest';
import { CampaignGameStore } from '../src/application/campaignGameStore';
import { emptyCampaignProfile, decodeCampaignProfile } from '../src/application/campaignProfileCodec';
import type { CampaignProfile } from '../src/application/campaignProfileTypes';
import { LighthouseApplication } from '../src/application/gameApplication';
import { memorySettingsStore } from '../src/application/settings';
import { campaignChapterFor, campaignFirstRewards, CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { NIGHT_CONFIG } from '../src/content/night';
import { screenContent } from '../src/presentation/screens';
import { createBattle } from '../src/simulation/battle';
import { isLandPath } from '../src/content/terrain';
import { CAMPAIGN_ENEMY_KINDS_BY_CHAPTER } from '../src/content/campaignEnemies';
import { lensSelection } from '../src/presentation/shared/lenses';
import { translate } from '../src/presentation/shared/localization';
import type { BattleState } from '../src/contracts';

function setup(initial?: CampaignProfile) {
  let raw = initial ? JSON.stringify(initial) : null;
  const store = { read: () => raw, write: (value: string) => { raw = value; } };
  let sequence = 1;
  const catalog = CAMPAIGN_NIGHT_CATALOG.map(night => night.id === 'first-light' ? {
    ...night, config: { ...night.config, beam: { ...night.config.beam, range: 480, damagePerSecond: 10000 },
      waves: [{ id: 'integration-ghost', enemies: ['ghost' as const], spawnInterval: 1 }] },
  } : night);
  const open = () => new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `campaign-${sequence++}`, seed: 42 }),
    memorySettingsStore(), catalog, new CampaignGameStore(store));
  return { open, read: () => raw ? decodeCampaignProfile(raw) : null, replace: (profile: CampaignProfile) => { raw = JSON.stringify(profile); } };
}

function progressBefore(id: string) {
  const profile = emptyCampaignProfile();
  const index = CAMPAIGN_NIGHT_CATALOG.findIndex(night => night.id === id);
  profile.wonNightIds = CAMPAIGN_NIGHT_CATALOG.slice(0, index).map(night => campaignChapterFor(night.id).night.id);
  profile.completedNights = profile.wonNightIds.length;
  profile.shards = 1000;
  return profile;
}

describe('campaign integrated profile and gameplay', () => {
  it('describes and persists the selected campaign lens before the night starts', () => {
    const profile = progressBefore('thorn-marsh-01');
    profile.purchasedNodeIds = ['lens-unlock-smoldering'];
    const { open, read } = setup(profile);
    const app = open();
    app.openGameMenu(); app.continueGame(); app.acknowledgeIntro();
    app.selectLens('smoldering');
    expect(read()).toMatchObject({ selectedLensId: 'smoldering', activeAttempt: null });
    expect(open().view.selectedLensId).toBe('smoldering');
    const panel = lensSelection(app.view);
    expect(panel).toContain('Линза сохраняется сразу при выборе.');
    expect(translate(panel, 'en')).toContain('The lens is saved as soon as you select it.');
  });

  it('keeps every story gate and supplies a battle on seven dry coast configurations', () => {
    expect(CAMPAIGN_NIGHT_CATALOG).toHaveLength(56);
    const maps = new Set<string>();
    for (const [index, night] of CAMPAIGN_NIGHT_CATALOG.entries()) {
      expect(night.requires).toBe(CAMPAIGN_NIGHT_CATALOG[index - 1]?.id ?? null);
      expect(night.config.waves.length).toBeGreaterThan(0);
      const mapId = night.config.campaignMapId!;
      if (!maps.has(mapId)) {
        maps.add(mapId);
        const wave = { id: 'integration-land', enemies: ['turtle' as const], spawnInterval: 1 };
        const { enemies: [enemy] } = createBattle({ ...night.config, waves: [wave] }, 7);
        const route = [enemy!, ...(enemy!.groundWaypoints ?? [{ x: 0, y: 0 }])];
        for (let leg = 1; leg < route.length; leg++) {
          expect(isLandPath(night.config.terrain, route[leg - 1]!, route[leg]!, night.config.enemies.turtle.radius)).toBe(true);
        }
      }
    }
    expect(maps.size).toBe(7);
    expect(CAMPAIGN_NIGHT_CATALOG.filter(night => night.config.boss)).toHaveLength(7);
  });

  it('introduces every new species before the associated boss and translates all 56 briefings', () => {
    const seen = new Set<string>();
    const schedules = new Set<string>();
    for (const night of CAMPAIGN_NIGHT_CATALOG) {
      const chapter = campaignChapterFor(night.id).chapterIndex + 1;
      const schedule = JSON.stringify(night.config.waves);
      expect(schedules.has(schedule)).toBe(false);
      schedules.add(schedule);
      if (night.config.boss) {
        const cohort = CAMPAIGN_ENEMY_KINDS_BY_CHAPTER[chapter as keyof typeof CAMPAIGN_ENEMY_KINDS_BY_CHAPTER] ?? [];
        for (const kind of cohort) expect(seen.has(kind), kind).toBe(true);
        expect(night.config.boss.id).toBe(night.id);
      }
      for (const wave of night.config.waves) for (const kind of wave.enemies) seen.add(kind);
      expect(translate(night.name, 'en'), night.id).not.toMatch(/[А-Яа-яЁё]/);
      expect(translate(night.description, 'en'), night.id).not.toMatch(/[А-Яа-яЁё]/);
    }
    expect(seen.size).toBe(18);
  });

  it('settles simultaneous boss and lighthouse deaths as defeat and keeps the next chapter closed', () => {
    const initial = progressBefore('abyss-warden');
    initial.selectedNightId = 'abyss-warden';
    const { open, read } = setup(initial);
    const game = open();
    game.openGameMenu(); game.continueGame(); game.acknowledgeIntro(); game.start();
    const state = game.view.battle as BattleState;
    const ghost = state.enemies[0]!;
    ghost.x = -(game.view.config.lighthouseRadius + game.view.config.enemies.ghost.radius);
    ghost.y = 0;
    state.lighthouseHealth = 1;
    state.boss!.health = .5;
    state.beamAngle = state.desiredBeamAngle = 0;
    game.advance(1000 / 30);
    expect(game.view.result).toMatchObject({ outcome: 'defeat', bossDefeated: true, saved: true, victoryReward: 0, bossMaterials: 0 });
    expect(read()?.wonNightIds).toEqual(initial.wonNightIds);
    expect(open().view.nights.find(night => night.id === 'far-shore')?.available).toBe(false);
  });

  it('clears a boss, keeps remaining waves live, and gives the one-time prize only on the first full win', () => {
    const initial = progressBefore('abyss-warden');
    initial.selectedNightId = 'abyss-warden';
    const { open, read } = setup(initial);
    const playControlledWin = (expectedPrize: number) => {
      const game = open();
      game.openGameMenu(); game.continueGame(); game.acknowledgeIntro(); game.start();
      const state = game.view.battle as BattleState;
      const rulesVersion = game.view.config.rulesVersion;
      const attemptId = read()!.activeAttempt!.id;
      state.boss!.health = .5;
      state.beamAngle = state.desiredBeamAngle = 0;
      game.advance(1000 / 30);
      expect(state.boss!.health).toBe(0);
      expect(state.outcome).toBe('playing');
      expect(read()?.lastSettled?.id).not.toBe(attemptId);
      // Fast-forward ordinary wave bookkeeping to exercise the actual final clear and settlement.
      state.nextWaveAt = Infinity;
      for (const enemy of state.enemies) enemy.health = 0;
      for (const [index, wave] of state.waves.entries()) {
        wave.started = true;
        wave.spawned = game.view.config.waves[index]!.enemies.length;
        wave.defeated = wave.spawned - state.enemies.filter(enemy => state.waves[enemy.waveIndex] === wave).length;
      }
      game.advance(1000 / 30);
      expect(game.view.result).toMatchObject({ saved: true, outcome: 'victory', bossMaterials: expectedPrize });
      return rulesVersion;
    };
    expect(playControlledWin(campaignFirstRewards('abyss-warden').firstWinPearls)).not.toContain('boss-replay');
    const saved = read()!;
    expect(saved.wonNightIds.filter(id => id === 'abyss-warden')).toHaveLength(1);
    expect(open().view.nights.find(night => night.id === 'far-shore')?.available).toBe(true);
    expect(playControlledWin(0)).toContain('boss-replay');
    expect(read()?.pearls).toBe(saved.pearls);
  });

  it('opens from the menu, saves intro and attempt, and awards the first win once', () => {
    const { open, read } = setup();
    const game = open();
    game.openGameMenu(); game.startNewGame(); game.start();
    expect(game.view.screen).toBe('preparation');
    expect(read()!.activeAttempt).toBeNull();
    game.acknowledgeIntro(); game.start();
    expect(game.view.screen).toBe('battle');
    expect(read()!.activeAttempt).toMatchObject({ nightId: 'first-light', seed: 42, mapId: 'headland', rulesVersion: CAMPAIGN_NIGHT_CATALOG[0]!.config.rulesVersion });
    for (let tick = 0; tick < 180 && game.view.screen === 'battle'; tick++) {
      const target = game.view.battle!.enemies[0];
      if (target) game.command({ type: 'aim', angle: Math.atan2(target.y, target.x) });
      game.advance(1000 / 30);
    }
    const result = game.view.result!;
    expect(result).toMatchObject({ saved: true, outcome: 'victory', firstWinShards: campaignFirstRewards('first-light').firstWinShards });
    expect(read()!.shards).toBe(result.totalResources);
    expect(read()!.wonNightIds).toEqual(['first-light']);
    expect(game.view.nights.find(night => night.id === 'broken-shore')?.available).toBe(true);
    game.retrySave();
    expect(open().view.profile.resources).toBe(result.totalResources);
  });

  it('buys campaign ability upgrades in the 256-node view and restores the selected night and slot', () => {
    const { open, read } = setup(progressBefore('ashen-cliffs-01'));
    const game = open();
    game.openGameMenu(); game.continueGame(); game.selectNight('ashen-cliffs-01');
    expect(game.view.config.campaignMapId).toBe('ashen-plateau');
    game.acknowledgeIntro(); game.openDevelopment();
    expect(game.view.campaign?.purchases).toHaveLength(256);
    expect(screenContent(game.view, undefined, false, false, undefined, undefined, 'ability')).toContain('ability-barrage-unlock');
    game.purchaseCampaignNode('ability-bastion-unlock');
    expect(game.view.error).toBeNull();
    expect(read()!.purchasedNodeIds).not.toContain('ability-bastion-unlock');
    game.purchaseCampaignNode('ability-barrage-unlock');
    game.purchaseCampaignNode('ability-barrage-power-1');
    game.back(); game.selectAbility('barrage');
    expect(read()!.selectedAbilityId).toBe('barrage');
    const reloaded = open();
    expect(reloaded.view.selectedNightId).toBe('ashen-cliffs-01');
    expect(reloaded.view.config.ability?.abilityId).toBe('barrage');
    expect(reloaded.view.config.flash.enabled).toBe(false);
  });

  it('interrupts an active run on reload without granting rewards or damaging the profile', () => {
    const profile = progressBefore('ashen-cliffs-01');
    profile.selectedNightId = 'ashen-cliffs-01';
    profile.purchasedNodeIds = ['unlock-cannon'];
    profile.inventory = [{ id: 1, kind: 'cannon', health: 55, consumed: false }];
    profile.nextDeviceId = 2;
    profile.layouts = { 'ashen-plateau': [{ deviceId: 1, x: -125, y: 0 }] };
    const { open, read } = setup(profile);
    const game = open();
    game.openGameMenu(); game.continueGame(); game.acknowledgeIntro(); game.start();
    expect(read()!.activeAttempt!.devices).toMatchObject([{ id: 1, health: 55 }]);
    const reloaded = open();
    expect(reloaded.view.interrupted).toBe(true);
    expect(read()).toMatchObject({ activeAttempt: null, lastSettled: { outcome: 'interrupted', shards: 0, pearls: 0 },
      inventory: profile.inventory, layouts: profile.layouts, shards: profile.shards, wonNightIds: profile.wonNightIds });
  });

  it('matches an uncertain start or result to the original operation before acknowledging it', () => {
    let raw: string | null = null;
    let readFails = false, writes = 0;
    const store = new CampaignGameStore({ read: () => {
      if (readFails) throw new Error('readback unavailable');
      return raw;
    }, write: value => { raw = value; writes++; readFails = true; } });
    store.load();
    const config = CAMPAIGN_NIGHT_CATALOG[0]!.config;
    const attempt = { id: 'first-attempt', seed: 42, nightId: 'first-light' as const, placementCost: 0 };
    expect(() => store.begin(attempt, config)).toThrow('readback unavailable');
    readFails = false;
    expect(() => store.begin({ ...attempt, id: 'other-attempt' }, config)).toThrow('другая операция');
    store.begin(attempt, config);
    expect(store.current.activeAttempt?.id).toBe(attempt.id);
    expect(writes).toBe(1);

    expect(() => store.settle(attempt.id, 'victory', 10, ['ghost'], [])).toThrow('readback unavailable');
    readFails = false;
    expect(() => store.settle(attempt.id, 'defeat', 0, [], [])).toThrow('другая операция');
    store.settle(attempt.id, 'victory', 10, ['ghost'], []);
    expect(store.current.profile.resources).toBe(10 + campaignFirstRewards('first-light').firstWinShards);
    expect(writes).toBe(2);
  });

  it('recovers from a conflicting reset and uses campaign rules even through the shared upgrade command', () => {
    const profile = progressBefore('winged-tide');
    profile.shards = 65;
    profile.purchasedNodeIds = ['unlock-barrier'];
    profile.inventory = [{ id: 1, kind: 'barrier', health: 140, consumed: false }];
    profile.nextDeviceId = 2;
    const { open, read, replace } = setup(profile);
    const game = open();
    game.openGameMenu(); game.continueGame(); game.openDevelopment();
    game.purchaseUpgrade('unlock-generator');
    expect(game.view.error).toBeNull();
    expect(read()!.shards).toBe(65);
    game.back(); game.openGameMenu();
    replace({ ...profile, shards: 85 });
    game.startNewGame(true);
    expect(game.view.error).toContain('изменился');
    game.cancelNewGame(); game.retrySave(); game.continueGame();
    expect(game.view.screen).toBe('preparation');
    expect(game.view.error).toBeNull();
    expect(read()!.shards).toBe(85);
  });
});
