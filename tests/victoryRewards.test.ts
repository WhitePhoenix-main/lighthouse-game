import { describe, expect, it } from 'vitest';
import type { BattleState, NightConfig, SaveStore } from '../src/contracts';
import { LighthouseApplication } from '../src/application/gameApplication';
import { decodeSave, emptySave } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { grantFixtureDevices } from './helpers/devices';

class Store implements SaveStore {
  raw: string | null = null;
  failure: 'before' | 'after' | 'after-unreadable' | null = null;
  unreadable = false;
  read() { if (this.unreadable) throw new Error('read unavailable'); return this.raw; }
  write(raw: string) {
    if (this.failure === 'before') throw new Error('quota');
    this.raw = raw;
    if (this.failure === 'after-unreadable') this.unreadable = true;
    if (this.failure?.startsWith('after')) throw new Error('write response lost');
  }
}

function setup() {
  const store = new Store();
  const save = emptySave();
  save.profile.resources = 123;
  save.profile.purchasedUpgrades = ['unlock-cannon'];
  save.profile.wonNightIds = ['first-light'];
  grantFixtureDevices(save.profile);
  save.profile.devices[0]!.position = { x: -100, y: 0 };
  store.raw = JSON.stringify(save);
  const config: NightConfig = { ...structuredClone(NIGHT_CONFIG), victoryReward: 72 };
  let sequence = 0;
  const create = () => new LighthouseApplication(store, config, () => ({ id: `reward-${++sequence}`, seed: 42 }));
  const app = create(); app.openPreparation(); app.start();
  expect(app.view.screen).toBe('battle');
  return { store, app, create, config, initial: save };
}

/** Synthetic end-of-battle facts isolate settlement from combat balancing. */
function outcome(app: LighthouseApplication, result: 'victory' | 'defeat') {
  const battle = app.view.battle as BattleState;
  battle.earnedResources = 18; battle.earnedBonus = 5; battle.earnedRescue = 12;
  battle.kills = 12; battle.encountered = ['ghost'];
  battle.devices[0]!.health = 23;
  battle.outcome = result;
  app.advance(0);
}

describe('victory payout through application and atomic saves', () => {
  it.each(['victory', 'defeat'] as const)('settles %s with an explicit breakdown and device damage in one transition', result => {
    const { app, store, create } = setup();
    outcome(app, result);
    const bonus = result === 'victory' ? 72 : 0;
    expect(app.view.result).toMatchObject({ resources: 18, bonus: 5, rescue: 12,
      victoryReward: bonus, totalResources: 35 + bonus, saved: true });
    const persisted = decodeSave(store.raw!);
    expect(persisted.profile.resources).toBe(123 + 35 + bonus);
    expect(persisted.profile.devices[0]!.health).toBe(23);
    expect(persisted.activeAttempt).toBeNull();
    expect(persisted.lastSettled).toMatchObject({ reward: 35 + bonus, outcome: result });
    app.retrySave(); app.advance(0);
    expect(create().view.profile).toEqual(persisted.profile);
    expect(decodeSave(store.raw!).profile.resources).toBe(123 + 35 + bonus);
  });

  it('pays the same victory bonus on a new attempt of an already completed night', () => {
    const { app } = setup();
    outcome(app, 'victory');
    const first = app.view.result!.attemptId;
    app.openPreparation(); app.start(); outcome(app, 'victory');
    expect(app.view.result!.attemptId).not.toBe(first);
    expect(app.view.result!.victoryReward).toBe(72);
    expect(app.view.profile.resources).toBe(123 + 2 * 107);
    expect(app.view.profile.wonNightIds).toEqual(['first-light']);
  });

  it.each(['before', 'after', 'after-unreadable'] as const)('never duplicates a victory on %s storage failure and retry', failure => {
    const { store, app, create, initial } = setup();
    store.failure = failure;
    outcome(app, 'victory');
    expect(app.view.result!.totalResources).toBe(107);
    if (failure !== 'after') {
      expect(app.view.result!.saved).toBe(false);
      expect(app.view.error).toBeTruthy();
      expect(app.view.profile.resources).toBe(initial.profile.resources);
      expect(app.view.profile.devices[0]!.health).toBe(initial.profile.devices[0]!.health);
    }
    if (failure === 'before') {
      const saved = decodeSave(store.raw!);
      expect(saved.profile).toEqual(initial.profile);
      expect(saved.activeAttempt).not.toBeNull();
    }
    store.failure = null; store.unreadable = false;
    app.retrySave(); app.retrySave();
    expect(app.view.result!.saved).toBe(true);
    expect(app.view.profile.resources).toBe(230);
    expect(app.view.profile.devices[0]!.health).toBe(23);
    expect(create().view.profile.resources).toBe(230);
  });

  it('recovers a committed but unacknowledged result on reload without paying twice', () => {
    const { store, app, create } = setup();
    store.failure = 'after-unreadable'; outcome(app, 'victory');
    expect(app.view.result!.saved).toBe(false);
    store.failure = null; store.unreadable = false;
    const restart = create();
    expect(restart.view.interrupted).toBe(false);
    expect(restart.view.profile.resources).toBe(230);
    app.retrySave();
    expect(app.view.profile.resources).toBe(230);
    expect(create().view.profile.resources).toBe(230);
  });

  it.each(['reload', 'abandon', 'failed-result-reload'] as const)('discards every reward on %s interruption', method => {
    const { store, app, create, initial } = setup();
    const battle = app.view.battle as BattleState;
    battle.earnedResources = 18; battle.earnedBonus = 5; battle.earnedRescue = 12;
    battle.devices[0]!.health = 23;
    if (method === 'abandon') { app.pause(); app.abandonNight('preparation'); }
    if (method === 'failed-result-reload') {
      store.failure = 'before'; outcome(app, 'victory');
      expect(app.view.result!.saved).toBe(false); store.failure = null;
    }
    const restart = create();
    expect(restart.view.profile).toEqual(initial.profile);
    expect(decodeSave(store.raw!).lastSettled).toMatchObject({ outcome: 'interrupted', reward: 0 });
    expect(create().view.profile).toEqual(initial.profile);
  });

  it('does not grant new rewards retroactively to an existing v5 profile', () => {
    const { store, create, app } = setup();
    app.pause(); app.abandonNight('menu');
    const before = store.raw;
    const profile = decodeSave(before!).profile;
    expect(create().view.profile).toEqual(profile);
    expect(store.raw).toBe(before);
  });

  it('keeps the payout frozen to the rules selected for the attempt', () => {
    const { config, app } = setup();
    config.victoryReward = 999;
    outcome(app, 'victory');
    expect(app.view.result!.victoryReward).toBe(72);
  });

  it('does not pay the shard victory bonus or materials for a dead boss in a lost night', () => {
    const store = new Store(), save = emptySave();
    save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide'];
    store.raw = JSON.stringify(save);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'boss-loss', seed: 42 }), undefined, NIGHT_CATALOG);
    app.selectNight('abyss-warden'); app.openPreparation(); app.start();
    const battle = app.view.battle as BattleState;
    battle.boss!.health = 0; battle.earnedResources = 9; battle.outcome = 'defeat'; app.advance(0);
    expect(app.view.result).toMatchObject({ resources: 9, victoryReward: 0, totalResources: 9, bossMaterials: 0 });
    expect(app.view.profile).toMatchObject({ resources: 9, bossMaterials: 0, bossLevel: 1 });
    expect(app.view.profile.wonNightIds).not.toContain('abyss-warden');
  });
});
