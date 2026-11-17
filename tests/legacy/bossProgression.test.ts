import { describe, expect, it } from 'vitest';
import type { BattleState, SaveStore, NightId } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { NIGHT_CONFIG } from '../../src/content/night';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { calculateNightConfig } from '../../src/progression/upgrades';
class Store implements SaveStore {
    value: string | null = null;
    fail = false;
    lostReply = false;
    writes = 0;
    read() { return this.value; }
    write(value: string) { this.writes++; if (this.fail)
        throw new Error('quota'); this.value = value; if (this.lostReply) {
        this.lostReply = false;
        throw new Error('reply lost');
    } }
}
const initialWins: NightId[] = ['first-light', 'broken-shore', 'winged-tide'];
function setup(materials = 0) { const store = new Store(), save = emptySave(); save.profile.resources = 500; save.profile.wonNightIds = [...initialWins]; save.profile.bossMaterials = materials; store.value = JSON.stringify(save); const repo = new SaveRepository(store); repo.load(); return { store, repo }; }
let sequence = 0;
function appFor(store: Store) { return new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `boss-attempt-${++sequence}`, seed: 42 }), undefined, NIGHT_CATALOG); }
function beginBoss(repo: SaveRepository, id: string, cost = 0) { const level = repo.current.profile.bossLevel; repo.begin({ id, seed: 42, placementCost: cost, nightId: 'abyss-warden', lensId: 'basic', bossLevel: level, bossReward: level + 1 }); }
describe('boss progression and atomic settlements', () => {
    it('awards 2/3/4 materials, raises only full wins, caps level and permits capped replays', () => {
        const { repo } = setup();
        for (const [index, reward] of [2, 3, 4, 4].entries()) {
            const id = `win-${index}`;
            beginBoss(repo, id);
            repo.settle(id, 'victory', 7, ['ghost']);
            repo.settle(id, 'victory', 7, ['ghost']);
            expect(repo.current.profile.bossLevel).toBe(Math.min(3, index + 2));
            expect(repo.current.profile.bossMaterials).toBe([2, 5, 9, 13][index]);
            expect(repo.current.lastSettled?.reward).toBe(7);
            expect(reward).toBe(index === 0 ? 2 : index === 1 ? 3 : 4);
        }
        expect(repo.current.profile.resources).toBe(528);
        expect(repo.current.profile.wonNightIds).toEqual([...initialWins, 'abyss-warden']);
    });
    it('opens the new chapter only after winning the boss night', () => {
        const { store } = setup();
        const app = appFor(store);
        expect(app.view.nights.find(n => n.id === 'far-shore')?.available).toBe(false);
        app.selectNight('abyss-warden');
        app.openPreparation();
        app.start();
        const battle = app.view.battle as BattleState;
        battle.boss!.health = 0;
        battle.outcome = 'victory';
        app.advance(0);
        expect(app.view.result).toMatchObject({ bossMaterials: 2, bossDefeated: true, saved: true });
        expect(app.view.nights.find(n => n.id === 'far-shore')?.available).toBe(true);
        expect(NIGHT_CATALOG.find(n => n.id === 'far-shore')?.chapter).not.toBe(NIGHT_CATALOG.find(n => n.id === 'abyss-warden')?.chapter);
    });
    it('keeps ordinary earnings but no boss material, level or chapter after killing boss then losing', () => {
        const { store } = setup();
        const app = appFor(store);
        app.selectNight('abyss-warden');
        app.openPreparation();
        app.start();
        const battle = app.view.battle as BattleState;
        battle.boss!.health = 0;
        battle.earnedResources = 8;
        battle.earnedBonus = 4;
        battle.outcome = 'defeat';
        app.advance(0);
        expect(app.view.result).toMatchObject({ bossMaterials: 0, bossDefeated: true, saved: true });
        expect(app.view.profile).toMatchObject({ resources: 512, bossMaterials: 0, bossLevel: 1, wonNightIds: initialWins });
        expect(app.view.nights.find(n => n.id === 'far-shore')?.available).toBe(false);
    });
    it('interrupts a free boss attempt once through reload and awards no materials', () => {
        const { store, repo } = setup();
        beginBoss(repo, 'interrupted');
        const app = appFor(store);
        expect(app.view.interrupted).toBe(true);
        expect(app.view.profile).toMatchObject({ resources: 500, bossMaterials: 0, bossLevel: 1 });
        expect(appFor(store).view.profile.resources).toBe(500);
    });
    it('retries failed settlement and reconciles writes whose reply was lost once', () => {
        const { store, repo } = setup();
        beginBoss(repo, 'uncertain');
        store.fail = true;
        expect(() => repo.settle('uncertain', 'victory', 12, [])).toThrow();
        expect(repo.current.profile.bossMaterials).toBe(0);
        store.fail = false;
        store.lostReply = true;
        repo.settle('uncertain', 'victory', 12, []);
        repo.settle('uncertain', 'victory', 12, []);
        expect(repo.current.profile).toMatchObject({ resources: 512, bossMaterials: 2, bossLevel: 2 });
    });
    it('requires current boss metadata at begin but accepts valid frozen active metadata on decode', () => {
        const { repo } = setup();
        expect(() => repo.begin({ id: 'stale', seed: 1, placementCost: 0, nightId: 'abyss-warden', bossLevel: 2, bossReward: 3 })).toThrow();
        beginBoss(repo, 'frozen');
        const save = repo.current;
        save.profile.bossLevel = 2;
        save.profile.wonNightIds.push('abyss-warden');
        expect(decodeSave(JSON.stringify(save)).activeAttempt).toMatchObject({ bossLevel: 1, bossReward: 2 });
    });
});
describe('lens economy and configuration', () => {
    it('preserves the original lens prices and sequential two-node trees', () => { expect(LENSES.slice(0, 4).map(l => l.materialCost)).toEqual([0, 2, 3, 3]); for (const lens of LENSES.slice(1, 4)) {
        const nodes = LENS_UPGRADES.filter(n => n.lensId === lens.id);
        expect(nodes).toHaveLength(2);
        expect(nodes[0]!.requires).toEqual([]);
        expect(nodes[1]!.requires).toEqual([nodes[0]!.id]);
    } });
    it('buys each lens and node once, atomically spends both currencies and retains dependencies', () => {
        const { store, repo } = setup(20);
        repo.purchaseLens('expanded');
        const writes = store.writes;
        repo.purchaseLens('expanded');
        expect(store.writes).toBe(writes);
        expect(() => repo.purchaseLensUpgrade('expanded-targets')).toThrow();
        repo.purchaseLensUpgrade('expanded-width');
        repo.purchaseLensUpgrade('expanded-targets');
        repo.purchaseLensUpgrade('expanded-targets');
        expect(repo.current.profile).toMatchObject({ resources: 385, bossMaterials: 15, unlockedLenses: ['basic', 'expanded'], lensUpgrades: ['expanded-width', 'expanded-targets'] });
        expect(decodeSave(store.value!).profile).toEqual(repo.current.profile);
    });
    it('does not spend materials on failed purchases; intended action can retry', () => {
        const { store } = setup(8);
        const app = appFor(store);
        app.openDevelopment();
        store.fail = true;
        app.purchaseLens('slowing');
        expect(app.view.profile.bossMaterials).toBe(8);
        expect(app.view.error).toBeTruthy();
        store.fail = false;
        app.retrySave();
        expect(app.view.profile.bossMaterials).toBe(5);
        store.fail = true;
        app.purchaseLensUpgrade('slowing-control');
        expect(app.view.profile.resources).toBe(500);
        expect(app.view.profile.bossMaterials).toBe(5);
        store.fail = false;
        app.retrySave();
        app.retrySave();
        expect(app.view.profile).toMatchObject({ resources: 455, bossMaterials: 4, lensUpgrades: ['slowing-control'] });
    });
    it('keeps draft selection through navigation and purchases, starts atomically and reloads last started selection', () => {
        const { store, repo } = setup(12);
        repo.purchaseLens('expanded');
        repo.purchaseLens('slowing');
        const app = appFor(store);
        app.selectLens('expanded');
        const writes = store.writes;
        app.openPreparation();
        app.openDevelopment();
        app.purchaseLensUpgrade('expanded-width');
        app.back();
        app.openSettings();
        app.back();
        expect(app.view.selectedLensId).toBe('expanded');
        expect(app.view.profile.selectedLensId).toBe('basic');
        expect(store.writes).toBe(writes + 1);
        app.start();
        const snapshot = app.view.config;
        expect(decodeSave(store.value!).activeAttempt?.lensId).toBe('expanded');
        expect(app.view.profile.selectedLensId).toBe('expanded');
        app.selectLens('slowing');
        expect(app.view.config).toBe(snapshot);
        expect(app.view.selectedLensId).toBe('expanded');
        const reload = appFor(store);
        expect(reload.view.selectedLensId).toBe('expanded');
        reload.selectLens('slowing');
        expect(appFor(store).view.selectedLensId).toBe('expanded');
    });
    it('keeps the draft device placements and price when selecting a lens', () => {
        const { store, repo } = setup(4);
        repo.purchaseLens('expanded');
        repo.purchase('unlock-cannon');
        const app = appFor(store);
        app.openPreparation();
        app.selectDevice('cannon');
        app.placeDevice(-100, 0);
        const placements = structuredClone(app.view.preparation.placements), cost = app.view.preparation.cost, writes = store.writes;
        app.selectLens('expanded');
        expect(app.view.preparation.placements).toEqual(placements);
        expect(app.view.preparation.cost).toBe(cost);
        expect(store.writes).toBe(writes);
    });
    it('applies global stats then lens multipliers then lens nodes without mutating base', () => {
        const base = structuredClone(NIGHT_CONFIG);
        const config = calculateNightConfig(base, ['beam-power-1', 'beam-width-1'], false, { lensId: 'slowing', upgrades: ['slowing-control', 'slowing-power'] });
        expect(config.beam.damagePerSecond).toBeCloseTo(36 * .8 + 6);
        expect(config.beam.halfAngle).toBeCloseTo(base.beam.halfAngle + Math.PI / 45);
        expect(config.lens?.slowMultiplier).toBeCloseTo(.45);
        expect(base).toEqual(NIGHT_CONFIG);
        expect(calculateNightConfig(base, [], false, { lensId: 'basic', upgrades: [] }).beam).toEqual(base.beam);
        expect(calculateNightConfig(base, [], false, { lensId: 'expanded', upgrades: ['expanded-width', 'expanded-targets'] }).beam.maxTargets).toBe(4);
        expect(calculateNightConfig(base, [], false, { lensId: 'armor-breaker', upgrades: ['armor-breaker-armor'] }).lens?.armorMultiplier).toBe(2.5);
    });
});
describe('v4 migrations and validation', () => {
    it.each([1, 2, 3])('migrates schema v%s preserving balances, wins, equipment and active cost without inventing boss wins', version => {
        const profile = { resources: 123, completedNights: 99, encountered: ['ghost'], purchasedUpgrades: version === 1 ? [] : ['beam-power-1'], ...(version === 3 ? { wonNightIds: ['first-light', 'broken-shore'], legacyEquipment: false } : {}) };
        const old = { version, profile, activeAttempt: { id: 'old', seed: 42, placementCost: 17, ...(version === 3 ? { nightId: 'broken-shore' } : {}) }, lastSettled: { id: 'previous', outcome: 'defeat', reward: 7 } };
        const next = decodeSave(JSON.stringify(old));
        expect(next.version).toBe(6);
        expect(next.profile).toMatchObject({ resources: 123, completedNights: 99, bossMaterials: 0, bossLevel: 1, unlockedLenses: ['basic'], lensUpgrades: [], selectedLensId: 'basic', legacyEquipment: version !== 3 });
        expect(next.profile.wonNightIds).toEqual(version === 3 ? ['first-light', 'broken-shore'] : ['first-light']);
        expect(next.activeAttempt).toMatchObject({ id: 'old', seed: 42, placementCost: 17, lensId: 'basic', nightId: version === 3 ? 'broken-shore' : 'first-light' });
        expect(next.lastSettled).toEqual(old.lastSettled);
    });
    it.each(['negative-material', 'bad-level', 'unknown-lens', 'locked-selected', 'missing-basic', 'node-dependency', 'locked-node', 'boss-win-level', 'boss-reward', 'ordinary-boss'])('rejects inconsistent %s without accepting invalid progress', field => {
        const save = emptySave();
        save.profile.wonNightIds = [...initialWins];
        if (field === 'negative-material')
            save.profile.bossMaterials = -1;
        if (field === 'bad-level')
            save.profile.bossLevel = 4;
        if (field === 'unknown-lens')
            save.profile.unlockedLenses.push('unknown' as never);
        if (field === 'locked-selected')
            save.profile.selectedLensId = 'expanded';
        if (field === 'missing-basic')
            save.profile.unlockedLenses = [];
        if (field === 'node-dependency') {
            save.profile.unlockedLenses.push('expanded');
            save.profile.lensUpgrades = ['expanded-targets'];
        }
        if (field === 'locked-node')
            save.profile.lensUpgrades = ['expanded-width'];
        if (field === 'boss-win-level')
            save.profile.wonNightIds.push('abyss-warden');
        if (field === 'boss-reward')
            save.activeAttempt = { id: 'x', seed: 1, placementCost: 0, nightId: 'abyss-warden', bossLevel: 1, bossReward: 99 };
        if (field === 'ordinary-boss')
            save.activeAttempt = { id: 'x', seed: 1, placementCost: 0, nightId: 'first-light', bossLevel: 1, bossReward: 2 };
        expect(() => decodeSave(JSON.stringify(save))).toThrow();
    });
    it.each([1, 2, 3])('rejects new content and new fields masquerading as v%s', version => {
        const profile = { resources: 1, completedNights: 1, encountered: [], purchasedUpgrades: [], ...(version === 3 ? { wonNightIds: ['first-light', 'broken-shore', 'winged-tide', 'abyss-warden'], legacyEquipment: false } : { bossMaterials: 4 }) };
        expect(() => decodeSave(JSON.stringify({ version, profile, activeAttempt: null, lastSettled: null }))).toThrow();
    });
});
