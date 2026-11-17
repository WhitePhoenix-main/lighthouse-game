import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave, decodeSave } from '../src/application/saves';
import { NIGHT_CONFIG } from '../src/content/night';
import type { SaveStore } from '../src/contracts';
import { grantFixtureDevices } from './helpers/devices';

class Store implements SaveStore {
    raw: string | null = null;
    writes = 0;
    fail = false;
    ambiguous = false;
    failRead = false;
    read(): string | null { if (this.failRead) throw Error('read failed'); return this.raw; }
    write(raw: string): void {
        this.writes++;
        if (this.fail) throw Error('quota');
        this.raw = raw;
        if (this.ambiguous) { this.failRead = true; throw Error('lost reply'); }
    }
}
let id = 0;
const appFor = (store: Store, easy = false) => new LighthouseApplication(store, easy
    ? { ...structuredClone(NIGHT_CONFIG), spawnRadius: 100,
        beam: { ...NIGHT_CONFIG.beam, halfAngle: Math.PI, damagePerSecond: 10000 },
        waves: [{ id: 'test', enemies: ['ghost'], spawnInterval: 1 }] }
    : NIGHT_CONFIG, () => ({ id: `navigation-${++id}`, seed: 42 }));
function funded(resources = 100): Store {
    const store = new Store(); const save = emptySave(); save.profile.resources = resources;
    save.profile.legacyEquipment = true; grantFixtureDevices(save.profile);
    store.raw = JSON.stringify(save); return store;
}
function finish(app: LighthouseApplication): void {
    for (let n = 0; n < 300 && app.view.screen === 'battle'; n++) app.advance(1000 / 30);
    expect(app.view.screen).toBe('result');
}

describe('screen navigation and permanent progress', () => {
    it('starts on menu without creating progress; first action persists an empty profile before preparation', () => {
        const store = new Store(); const app = appFor(store);
        expect(app.view).toMatchObject({ screen: 'menu', hasProgress: false });
        app.start(); expect(app.view.screen).toBe('menu');
        app.openDevelopment(); expect(app.view.screen).toBe('development');
        app.back(); expect(app.view.screen).toBe('menu'); expect(store.writes).toBe(0);
        app.openPreparation();
        expect(app.view).toMatchObject({ screen: 'preparation', hasProgress: true, battle: null });
        expect(store.writes).toBe(1);
        app.openMainMenu(); app.openPreparation(); expect(store.writes).toBe(1);
        expect(appFor(store).view).toMatchObject({ screen: 'menu', hasProgress: true });
    });
    it('retains the menu and same pending profile creation when the first save fails', () => {
        const store = new Store(); const app = appFor(store); store.fail = true;
        app.openPreparation(); expect(app.view.screen).toBe('menu'); expect(app.view.hasProgress).toBe(false);
        expect(app.view.error).toContain('quota'); app.start(); expect(app.view.battle).toBeNull();
        store.fail = false; app.retrySave();
        expect(app.view).toMatchObject({ screen: 'preparation', hasProgress: true, error: null });
    });
    it('accepts an ambiguously committed initial profile without wiping or duplicate creation', () => {
        const store = new Store(); const app = appFor(store); store.ambiguous = true;
        app.openPreparation(); expect(app.view.error).not.toBeNull();
        store.failRead = false; store.ambiguous = false; app.retrySave();
        expect(app.view.screen).toBe('preparation'); expect(store.writes).toBe(1);
    });
    it('loads a returning profile without resetting resources or purchases', () => {
        const store = funded(); const app = appFor(store); const raw = store.raw;
        app.openPreparation(); app.openMainMenu(); app.openPreparation();
        expect(app.view.profile.resources).toBe(100); expect(store.raw).toBe(raw);
        expect(store.writes).toBe(0);
    });
    it('keeps owned placements across menu, settings and tree without a start fee after a purchase', () => {
        const app = appFor(funded(64)); app.openPreparation(); app.selectDevice('cannon'); app.placeDevice(100, 0);
        app.selectDevice('barrier'); app.placeDevice(200, 0);
        const draft = structuredClone(app.view.preparation.placements);
        app.openSettings(); app.back(); app.openMainMenu(); app.openDevelopment();
        app.purchaseUpgrade('beam-power-1'); app.back(); expect(app.view.screen).toBe('menu');
        app.openPreparation();
        expect(app.view.preparation).toMatchObject({ placements: draft, cost: 0, remaining: 19, canStart: true });
        app.start(); expect(app.view.screen).toBe('battle');
        expect(app.view.battle!.devices).toHaveLength(2);
        expect(app.view.config.beam.damagePerSecond).toBe(36);
    });
    it('only allows purchases on development and returns to its actual source', () => {
        const app = appFor(funded()); app.purchaseUpgrade('beam-power-1');
        app.openPreparation(); app.purchaseUpgrade('beam-power-1'); expect(app.view.profile.resources).toBe(100);
        app.openDevelopment(); app.openSettings(); app.back(); expect(app.view.screen).toBe('development');
        app.purchaseUpgrade('beam-power-1'); app.back(); expect(app.view.screen).toBe('preparation');
        expect(app.view.profile.resources).toBe(55);
    });
    it('settings opened from pause never lift pause or advance/aim the same battle', () => {
        const app = appFor(funded()); app.openPreparation(); app.start(); app.advance(1000 / 30);
        app.openSettings(); expect(app.view.screen).toBe('battle');
        app.pause(); const battle = structuredClone(app.view.battle);
        app.openSettings(); app.resume(); app.command({ type: 'aim', angle: 1 }); app.advance(200);
        app.openPreparation(); app.openMainMenu(); app.openDevelopment();
        expect(app.view.screen).toBe('settings'); expect(app.view.battle).toEqual(battle);
        app.back(); expect(app.view).toMatchObject({ screen: 'battle', paused: true });
        app.advance(200); expect(app.view.battle).toEqual(battle);
        app.resume(); app.advance(1000 / 30); expect(app.view.battle!.tick).toBe(battle!.tick + 1);
    });
    it('keeps an unsaved result until settlement retry, then allows tree and return to result', () => {
        const store = funded(); const app = appFor(store, true); app.openPreparation(); app.start(); store.fail = true;
        finish(app); expect(app.view.result?.saved).toBe(false);
        app.openMainMenu(); app.openPreparation(); app.openDevelopment(); app.openSettings(); app.back(); app.start();
        expect(app.view.screen).toBe('result'); expect(app.view.result?.saved).toBe(false);
        store.fail = false; app.retrySave(); expect(app.view.result?.saved).toBe(true);
        app.openDevelopment(); app.purchaseUpgrade('beam-power-1'); app.back();
        expect(app.view.screen).toBe('result'); app.openMainMenu(); app.openPreparation();
        expect(app.view.preparation.placements).toEqual([]); expect(app.view.result).toBeNull();
    });
});

describe('explicit interrupted night', () => {
    it.each(['menu', 'preparation'] as const)('leaves pause to %s once without a refund and discards temporary discoveries', destination => {
        const store = funded(); const app = appFor(store); app.openPreparation();
        app.selectDevice('cannon'); app.placeDevice(100, 0); app.start();
        app.abandonNight(destination); expect(app.view.screen).toBe('battle'); // needs pause
        app.advance(1000 / 30); expect(app.view.battle!.encountered.length).toBeGreaterThan(0);
        app.pause(); app.abandonNight(destination); app.abandonNight(destination); app.retrySave();
        expect(app.view).toMatchObject({ screen: destination, interrupted: true, battle: null });
        expect(app.view.profile).toMatchObject({ resources: 100, encountered: [], completedNights: 0 });
        expect(decodeSave(store.raw!).lastSettled).toMatchObject({ outcome: 'interrupted', reward: 0 });
        expect(app.view.preparation.placements).toHaveLength(1);
        expect(appFor(store).view.profile.resources).toBe(100);
    });
    it('holds battle and destination when refund save fails, never permits accidental resume', () => {
        const store = funded(); const app = appFor(store); app.openPreparation(); app.start(); app.pause();
        const snapshot = structuredClone(app.view.battle); store.fail = true; app.abandonNight('menu');
        expect(app.view.screen).toBe('battle'); expect(app.view.error).not.toBeNull();
        app.resume(); app.advance(100); expect(app.view.battle).toEqual(snapshot);
        store.fail = false; app.retrySave(); expect(app.view.screen).toBe('menu');
    });
    it('reconciles a lost refund response without paying twice or altering destination', () => {
        const store = funded(); const app = appFor(store); app.openPreparation(); app.selectDevice('cannon');
        app.placeDevice(100, 0); app.start(); app.pause(); const writes = store.writes;
        store.ambiguous = true; app.abandonNight('preparation'); expect(app.view.error).not.toBeNull();
        store.failRead = false; store.ambiguous = false; app.retrySave(); app.retrySave();
        expect(app.view.screen).toBe('preparation'); expect(app.view.profile.resources).toBe(100);
        expect(store.writes).toBe(writes + 1);
    });
});
