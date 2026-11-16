import {describe, expect, it} from 'vitest';
import {LighthouseApplication} from '../src/application/gameApplication';
import {decodeSave, emptySave, SaveRepository} from '../src/application/saves';
import {NIGHT_CONFIG} from '../src/content/night';
import {NIGHT_CATALOG} from '../src/content/nights';
import {resolveLateNight} from '../src/content/lateModes';
import {calculateNightConfig} from '../src/progression/upgrades';
import {calculateCandidateAbility} from '../src/progression/campaignAbilities';
import {DEVICE_RULES} from '../src/content/devices';
import {trapChargeCapacity, unlockedDeviceKinds} from '../src/progression/devices';
import type {LateNightMode, SaveData, SaveStore} from '../src/contracts';

class Store implements SaveStore {
    value: string | null = null;
    writes = 0;
    failWrite = false;
    ambiguous = false;
    failRead = false;
    read(): string | null {
        if (this.failRead) throw new Error('read unavailable');
        return this.value;
    }
    write(value: string): void {
        this.writes++;
        if (this.failWrite) throw new Error('write unavailable');
        this.value = value;
        if (this.ambiguous) { this.failRead = true; throw new Error('lost acknowledgement'); }
    }
}
function profile(): SaveData {
    const data = emptySave();
    data.profile.resources = 100;
    data.profile.completedNights = 1;
    data.profile.wonNightIds = ['first-light'];
    return data;
}
function create(data?: SaveData) {
    const store = new Store(), settings = new Store();
    if (data) store.value = JSON.stringify(data);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({id: 'menu-test', seed: 42}), settings, NIGHT_CATALOG);
    return {app, store, settings};
}

describe('main application recovery: game menu boundaries', () => {
    it('opens menu without writing and refuses continuation without a profile', () => {
        const {app, store} = create();
        app.continueGame();
        expect(app.view.screen).toBe('menu');
        app.openGameMenu();
        expect(app.view.screen).toBe('game-menu');
        app.continueGame();
        expect(app.view.screen).toBe('game-menu');
        expect(app.view.hasProgress).toBe(false);
        expect(store.writes).toBe(0);
        expect(store.value).toBeNull();
    });

    it('resumes the first open unbeaten campaign night, excluding optional and locked nights', () => {
        const data = profile();
        data.profile.wonNightIds.push('broken-shore', 'winged-tide');
        const {app, store} = create(data);
        app.openGameMenu();
        expect(app.view.selectedNightId).toBe('abyss-warden');
        app.back();
        app.selectNight('rescue-trial');
        app.openGameMenu();
        expect(app.view.selectedNightId).toBe('abyss-warden');
        expect(store.writes).toBe(0);
        app.continueGame();
        expect(app.view.screen).toBe('preparation');
        expect(app.view.selectedNightId).toBe('abyss-warden');
    });

    it('uses the last available campaign night after all campaign victories', () => {
        const data = profile();
        data.profile.wonNightIds = NIGHT_CATALOG.filter(n => !n.optional).map(n => n.id);
        data.profile.bossLevel = 2;
        const {app} = create(data);
        app.openGameMenu();
        expect(app.view.error).toBeNull();
        expect(app.view.selectedNightId).toBe('far-shore');
    });

    it('guards trial selection and returns through game menu while preserving settings origin', () => {
        const {app} = create(profile());
        app.openTrials();
        expect(app.view.screen).toBe('menu');
        app.openGameMenu(); app.openTrials();
        expect(app.view.screen).toBe('trials');
        const selected = app.view.selectedNightId;
        app.selectNight('armored-front');
        app.selectNight('broken-shore');
        expect(app.view.selectedNightId).toBe(selected);
        expect(app.view.screen).toBe('trials');
        app.openSettings(); app.back();
        expect(app.view.screen).toBe('trials');
        app.back();
        expect(app.view.screen).toBe('game-menu');
        app.openSettings(); app.back();
        expect(app.view.screen).toBe('game-menu');
        app.back();
        expect(app.view.screen).toBe('menu');
        app.openGameMenu(); app.openTrials(); app.selectNight('rescue-trial');
        expect(app.view.screen).toBe('preparation');
        expect(app.view.selectedNightId).toBe('rescue-trial');
    });

    it('requires confirmation before resetting progress, and retains settings', () => {
        const {app, store, settings} = create(profile());
        app.openSettings(); app.setLanguage('en'); app.setTextSize('large'); app.back();
        const settingsRaw = settings.value, original = store.value;
        app.openGameMenu(); app.startNewGame(); app.startNewGame(false);
        expect(store.value).toBe(original);
        expect(store.writes).toBe(0);
        app.startNewGame(true);
        expect(app.view.screen).toBe('preparation');
        expect(app.view.selectedNightId).toBe('first-light');
        expect(decodeSave(store.value!)).toEqual(emptySave());
        expect(store.writes).toBe(1);
        expect(settings.value).toBe(settingsRaw);
        expect(app.view.settings.language).toBe('en');
        expect(app.view.settings.textSize).toBe('large');
    });

    it('creates the first profile before opening new-game preparation', () => {
        const {app, store} = create();
        app.openGameMenu(); app.startNewGame();
        expect(app.view.screen).toBe('preparation');
        expect(app.view.hasProgress).toBe(true);
        expect(store.writes).toBe(1);
        expect(decodeSave(store.value!)).toEqual(emptySave());
    });

    it('keeps failure visible and retries the same reset operation', () => {
        const {app, store} = create(profile());
        const original = store.value;
        app.openGameMenu(); store.failWrite = true; app.startNewGame(true);
        expect(app.view.error).toContain('write unavailable');
        expect(app.view.screen).toBe('game-menu');
        expect(store.value).toBe(original);
        store.failWrite = false; app.retrySave();
        expect(app.view.error).toBeNull();
        expect(app.view.screen).toBe('preparation');
        expect(decodeSave(store.value!)).toEqual(emptySave());
        app.retrySave();
        expect(store.writes).toBe(2);
    });

    it('reconciles an ambiguous reset without performing a second write', () => {
        const {app, store} = create(profile());
        app.openGameMenu(); store.ambiguous = true; app.startNewGame(true);
        expect(app.view.error).toBeTruthy();
        expect(app.view.screen).toBe('game-menu');
        store.ambiguous = false; store.failRead = false; app.retrySave();
        expect(app.view.error).toBeNull();
        expect(app.view.screen).toBe('preparation');
        expect(store.writes).toBe(1);
    });

    it('cancels a known failed reset without writing or blocking navigation', () => {
        const {app, store} = create(profile());
        const original = store.value;
        app.openGameMenu(); store.failWrite = true; app.startNewGame(true);
        expect(app.view.error).toBeTruthy();
        app.cancelNewGame();
        expect(app.view.screen).toBe('game-menu');
        expect(app.view.error).toBeNull();
        expect(app.view.profile.resources).toBe(100);
        expect(store.value).toBe(original);
        expect(store.writes).toBe(1);
        app.retrySave(); app.back();
        expect(app.view.screen).toBe('menu');
        expect(store.writes).toBe(1);
    });

    it('finishes an already committed uncertain reset when cancelling instead of restoring old data', () => {
        const {app, store} = create(profile());
        app.openGameMenu(); store.ambiguous = true; app.startNewGame(true);
        app.cancelNewGame();
        expect(app.view.error).toContain('read unavailable');
        expect(app.view.screen).toBe('game-menu');
        expect(app.view.profile.resources).toBe(100);
        store.ambiguous = false; store.failRead = false;
        app.cancelNewGame();
        expect(app.view.error).toBeNull();
        expect(app.view.screen).toBe('preparation');
        expect(app.view.profile).toEqual(emptySave().profile);
        expect(decodeSave(store.value!)).toEqual(emptySave());
        expect(store.writes).toBe(1);
    });

    it('preserves the error and pending operation if cancellation finds a concurrent change', () => {
        const {app, store} = create(profile());
        app.openGameMenu(); store.failWrite = true; app.startNewGame(true);
        const other = profile(); other.profile.resources = 999;
        store.value = JSON.stringify(other);
        app.cancelNewGame();
        expect(app.view.error).toContain('другой вкладке');
        expect(app.view.screen).toBe('game-menu');
        app.back(); app.retrySave();
        expect(app.view.screen).toBe('game-menu');
        expect(app.view.error).toContain('другой вкладке');
        expect(decodeSave(store.value!).profile.resources).toBe(999);
        expect(store.writes).toBe(1);
    });

    it('never overwrites another tab after an ambiguous reset', () => {
        const {app, store} = create(profile());
        app.openGameMenu(); store.ambiguous = true; app.startNewGame(true);
        const other = emptySave(); other.profile.resources = 999;
        store.value = JSON.stringify(other);
        store.ambiguous = false; store.failRead = false; app.retrySave(); app.retrySave();
        expect(app.view.error).toContain('другой вкладке');
        expect(app.view.screen).toBe('game-menu');
        expect(decodeSave(store.value!).profile.resources).toBe(999);
        expect(store.writes).toBe(1);
    });

    it('does not repeat a completed repository reset after new progress', () => {
        const store = new Store(); store.value = JSON.stringify(profile());
        const repo = new SaveRepository(store); repo.load(); const operation = {};
        repo.resetProfile(operation);
        repo.begin({id: 'after-reset', seed: 1, placementCost: 0});
        repo.settle('after-reset', 'defeat', 17, []);
        const writes = store.writes;
        repo.resetProfile(operation);
        expect(repo.current.profile.resources).toBe(17);
        expect(store.writes).toBe(writes);
    });

    it('remembers reset reconciliation performed by a later repository operation', () => {
        const store = new Store(); store.value = JSON.stringify(profile());
        const repo = new SaveRepository(store); repo.load(); const operation = {};
        store.ambiguous = true;
        expect(() => repo.resetProfile(operation)).toThrow('read unavailable');
        store.ambiguous = false; store.failRead = false;
        repo.begin({id: 'after-uncertain-reset', seed: 1, placementCost: 0});
        repo.settle('after-uncertain-reset', 'defeat', 19, []);
        const writes = store.writes;
        repo.resetProfile(operation);
        expect(repo.current.profile.resources).toBe(19);
        expect(store.writes).toBe(writes);
    });

    it('blocks reset in settings, preparation, and live battle', () => {
        const {app, store} = create(profile());
        app.openGameMenu(); app.openSettings(); app.startNewGame(true);
        expect(store.writes).toBe(0);
        app.back(); app.continueGame(); app.startNewGame(true);
        expect(store.writes).toBe(0);
        app.start();
        const raw = store.value, writes = store.writes;
        app.openGameMenu(); app.startNewGame(true);
        expect(app.view.screen).toBe('battle');
        expect(store.value).toBe(raw);
        expect(store.writes).toBe(writes);
    });
});

function lateProfile(): SaveData {
    const data = profile();
    data.profile.wonNightIds = NIGHT_CATALOG.filter(night => !night.optional).map(night => night.id);
    data.profile.bossLevel = 2;
    return data;
}

describe('main application recovery: queued ability targets', () => {
    it.each(['seal', 'barrage'] as const)('%s snapshots its target before the next fixed step', id => {
        const config = structuredClone(NIGHT_CONFIG);
        config.ability = calculateCandidateAbility(id, [`ability-${id}-unlock`])!;
        config.waves = [{id: 'hold', enemies: ['ghost'], spawnInterval: 1}];
        config.enemies.ghost.speed = 0;
        config.enemies.ghost.health = 100000;
        const seed = emptySave();
        seed.profile.legacyEquipment = true;
        seed.profile.devices = unlockedDeviceKinds(seed.profile).map(kind => ({
            id: seed.profile.nextDeviceId++, kind, health: DEVICE_RULES.definitions[kind].health,
            consumed: false, position: kind === 'cannon' ? {x: -100, y: 0} : null,
            ...(kind === 'light-trap' ? {trapCharges: trapChargeCapacity(seed.profile.purchasedUpgrades)} : {})
        }));
        const store = new Store(); store.value = JSON.stringify(seed);
        const app = new LighthouseApplication(store, config, () => ({id: `snapshot-${id}`, seed: 42}));
        app.openPreparation(); app.start();
        expect(app.view.error).toBeNull();
        const enemy = app.view.battle!.enemies[0]!;
        enemy.x = -220; enemy.y = 0;
        const target = {x: -220, y: 0, enemyId: enemy.id};
        app.command({type: 'use-ability', target});
        target.x = NaN;
        target.y = NaN;
        target.enemyId = -1;
        app.advance(config.stepSeconds * 1000);
        const state = app.view.battle!;
        expect(state.ability!.readyTick).toBeGreaterThan(state.tick);
        expect(state.events.filter(event => event.type === 'ability-used')).toHaveLength(1);
        if (id === 'seal') expect(state.ability!.seal).toMatchObject({x: -220, y: 0});
        const readyTick = state.ability!.readyTick;
        app.advance(config.stepSeconds * 1000);
        expect(state.ability!.readyTick).toBe(readyTick);
    });
});

describe('main application recovery: explicit late modes', () => {
    it('keeps locked optional trials disabled without creating a profile', () => {
        const {app, store} = create();
        app.openGameMenu(); app.openTrials(); app.selectNight('rescue-trial');
        expect(app.view.screen).toBe('trials');
        expect(app.view.selectedNightId).toBe('first-light');
        expect(app.view.nights.find(night => night.id === 'rescue-trial')?.available).toBe(false);
        expect(store.value).toBeNull(); expect(store.writes).toBe(0);
    });

    it.each(['transition', 'assault'] as const)('pins %s through failed start, retry and settings', mode => {
        const {app, store} = create(lateProfile());
        app.selectNight('armored-front'); app.selectLateMode(mode); app.openPreparation();
        const base = NIGHT_CATALOG.find(night => night.id === 'armored-front')!.config;
        const expected = calculateNightConfig(resolveLateNight(base, mode), [], false,
            {lensId: 'basic', upgrades: []});
        expect(app.view.config).toEqual(expected);
        expect(app.view.lateNightModes?.map(item => item.id)).toEqual(['transition', 'assault']);
        const originalProfile = structuredClone(app.view.profile);
        store.failWrite = true; app.start();
        expect(app.view.error).toContain('write unavailable');
        app.selectLateMode(mode === 'transition' ? 'assault' : 'transition');
        expect(app.view.config).toEqual(expected);
        store.failWrite = false; app.retrySave();
        expect(app.view.screen).toBe('battle');
        expect(app.view.config).toEqual(expected);
        expect(decodeSave(store.value!).activeAttempt?.lateMode).toBe(mode);
        expect(app.view.profile).toEqual(originalProfile);
        app.pause(); app.openSettings(); app.selectLateMode(mode === 'transition' ? 'assault' : 'transition');
        expect(app.view.config).toEqual(expected);
        app.back(); app.resume();
        expect(app.view.config).toEqual(expected);
        const reloaded = new LighthouseApplication(store, NIGHT_CONFIG,
            () => ({id: 'reload', seed: 42}), undefined, NIGHT_CATALOG);
        expect(reloaded.view.error).toBeNull();
        expect(reloaded.view.interrupted).toBe(true);
        expect(reloaded.view.profile).toEqual(originalProfile);
        expect(decodeSave(store.value!).activeAttempt).toBeNull();
        expect(decodeSave(store.value!).lastSettled?.reward).toBe(0);
        const writes = store.writes;
        const again = new LighthouseApplication(store, NIGHT_CONFIG,
            () => ({id: 'reload-again', seed: 42}), undefined, NIGHT_CATALOG);
        expect(again.view.error).toBeNull();
        expect(again.view.interrupted).toBe(false);
        expect(again.view.profile).toEqual(originalProfile);
        expect(store.writes).toBe(writes);
    });

    it('switches only permitted previews without writing or changing the profile', () => {
        const {app, store} = create(lateProfile());
        app.selectNight('armored-front');
        const original = store.value, before = structuredClone(app.view.profile);
        const transition = structuredClone(app.view.config);
        app.selectLateMode('assault');
        expect(app.view.config.lateMode).toBe('assault');
        expect(app.view.config.enemies.ghost.health).toBeGreaterThan(transition.enemies.ghost.health);
        app.selectLateMode('wrong' as LateNightMode);
        expect(app.view.config.lateMode).toBe('assault');
        expect(app.view.profile).toEqual(before);
        expect(store.value).toBe(original); expect(store.writes).toBe(0);
        app.selectNight('first-light'); app.selectLateMode('transition');
        expect(app.view.config.lateMode).toBeUndefined();
    });

    it.each([undefined, 'transition', 'assault'] as const)('round-trips old/new attempt mode %s and enforces retry identity', mode => {
        const store = new Store(); store.value = JSON.stringify(lateProfile());
        const repo = new SaveRepository(store); repo.load();
        const attempt = {id: 'late-record', seed: 42, placementCost: 0, nightId: 'armored-front' as const,
            ...(mode ? {lateMode: mode} : {})};
        repo.begin(attempt);
        expect(decodeSave(store.value!).activeAttempt?.lateMode).toBe(mode);
        const writes = store.writes;
        repo.begin({...attempt, lateMode: mode ?? 'assault'});
        expect(store.writes).toBe(writes);
        expect(() => repo.begin({...attempt, lateMode: mode === 'transition' ? 'assault' : 'transition'})).toThrow();
    });

    it('rejects invalid persisted mode and mode on an ordinary night without writing', () => {
        const store = new Store(); store.value = JSON.stringify(lateProfile());
        const repo = new SaveRepository(store); repo.load();
        const original = store.value;
        for (const attempt of [
            {nightId: 'first-light' as const, lateMode: 'transition' as const},
            {nightId: 'armored-front' as const, lateMode: 'invalid' as LateNightMode}
        ]) {
            expect(() => repo.begin({id: 'invalid', seed: 1, placementCost: 0, ...attempt})).toThrow();
            const invalid = {...lateProfile(), activeAttempt: {id: 'invalid', seed: 1,
                placementCost: 0, deviceSnapshot: [], lensId: 'basic', ...attempt}};
            expect(() => decodeSave(JSON.stringify(invalid))).toThrow();
        }
        expect(store.value).toBe(original); expect(store.writes).toBe(0);
    });

    it('validates ordinary-night mode before treating begin as an idempotent retry', () => {
        const store = new Store();
        const repo = new SaveRepository(store); repo.load();
        const attempt = {id: 'ordinary', seed: 42, placementCost: 0, nightId: 'first-light' as const};
        repo.begin(attempt);
        const original = store.value, writes = store.writes;
        expect(() => repo.begin({...attempt, lateMode: 'assault'})).toThrow('Неверный режим');
        expect(store.value).toBe(original); expect(store.writes).toBe(writes);
    });
});
