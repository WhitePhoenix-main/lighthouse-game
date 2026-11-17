import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import { decodeSettings, defaultSettings } from '../src/application/settings';
import { NIGHT_CONFIG } from '../src/content/night';
import type { SaveStore } from '../src/contracts';
import { SAVE_KEY, SETTINGS_KEY } from '../src/platform/browser';

class Store implements SaveStore {
    raw: string | null = null;
    failRead = false;
    failWrite = false;
    lostReply = false;
    writes = 0;
    read(): string | null { if (this.failRead) throw Error('read failed'); return this.raw; }
    write(raw: string): void {
        this.writes++;
        if (this.failWrite) throw Error('write failed'); this.raw = raw;
        if (this.lostReply) { this.failRead = true; throw Error('reply lost'); }
    }
}
const appFor = (profile: Store, settings: Store) => new LighthouseApplication(profile, NIGHT_CONFIG,
    () => ({ id: 'settings-test', seed: 42 }), settings);

describe('persistent text settings independent of profile', () => {
    it('migrates v1 without rewriting, then preserves text and separate levels when muted', () => {
        const settings = new Store(); settings.raw = '{"version":1,"textSize":"large"}';
        const app = appFor(new Store(), settings);
        expect(app.view.settings).toEqual({ ...defaultSettings(), textSize: 'large' });
        expect(settings.writes).toBe(0);
        app.openSettings(); app.setAudioSettings({ musicVolume: 23, effectsVolume: 91, soundEnabled: false });
        expect(JSON.parse(settings.raw!).version).toBe(3);
        const reloaded = appFor(new Store(), settings); reloaded.openSettings(); reloaded.setAudioSettings({ soundEnabled: true });
        expect(reloaded.view.settings).toEqual({ language: 'auto', textSize: 'large', soundEnabled: true, musicVolume: 23, effectsVolume: 91 });
    });
    it('retains confirmed audio during failed write and retries the full selection', () => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        settings.failWrite = true; app.setAudioSettings({ soundEnabled: false, musicVolume: 12 });
        expect(app.view.settings).toEqual(defaultSettings());
        settings.failWrite = false; app.retrySettings();
        expect(app.view.settings).toEqual({ ...defaultSettings(), soundEnabled: false, musicVolume: 12 });
    });
    it.each(['retry', 'cancel'] as const)('reconciles committed audio after a lost reply on %s', action => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        settings.lostReply = true; app.setAudioSettings({ musicVolume: 0 });
        expect(app.view.settings.musicVolume).toBe(50); expect(app.view.settingsError).not.toBeNull();
        settings.failRead = false; settings.lostReply = false;
        if (action === 'retry') app.retrySettings(); else app.cancelSettingsChange();
        expect(app.view.settings.musicVolume).toBe(0); expect(settings.writes).toBe(1);
    });
    it('rejects invalid audio values without writing', () => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        for (const musicVolume of [-1, 101, NaN, Infinity]) app.setAudioSettings({ musicVolume });
        expect(settings.writes).toBe(0);
        for (const musicVolume of [-1, 101, null, '50']) {
            expect(() => decodeSettings(JSON.stringify({ version: 2, ...defaultSettings(), musicVolume }))).toThrow();
        }
    });
    it('saves large text, restores on reload, never creates a profile or changes its schema/key', () => {
        const profile = new Store(); const settings = new Store(); const app = appFor(profile, settings);
        app.setTextSize('large'); expect(settings.writes).toBe(0);
        app.openSettings(); app.setTextSize('large'); expect(app.view.settings.textSize).toBe('large');
        expect(appFor(profile, settings).view.settings.textSize).toBe('large');
        expect(profile.raw).toBeNull(); expect(app.view.hasProgress).toBe(false);
        expect(JSON.parse(settings.raw!)).toEqual({ version: 3, ...defaultSettings(), textSize: 'large' });
        expect(SAVE_KEY).toBe('lighthouse.save.v1'); expect(SETTINGS_KEY).toBe('lighthouse.settings.v1');
    });
    it('keeps the confirmed size on failed write, then retries the selected setting', () => {
        const profile = new Store(); const settings = new Store(); const app = appFor(profile, settings);
        app.openSettings(); settings.failWrite = true; app.setTextSize('large');
        expect(app.view.settings.textSize).toBe('normal'); expect(app.view.settingsError).toContain('write failed');
        expect(app.view.error).toBeNull(); settings.failWrite = false; app.retrySettings();
        expect(app.view.settings.textSize).toBe('large'); expect(app.view.settingsError).toBeNull();
    });
    it('can discard a failed change and use confirmed settings without a write', () => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        settings.failWrite = true; app.setTextSize('large'); const writes = settings.writes;
        app.cancelSettingsChange(); expect(app.view.settingsError).toBeNull();
        app.retrySettings(); expect(settings.writes).toBe(writes); expect(app.view.settings.textSize).toBe('normal');
    });
    it.each(['retry', 'cancel'] as const)('reconciles a committed write with lost response on %s', action => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        settings.lostReply = true; app.setTextSize('large'); expect(app.view.settingsError).not.toBeNull();
        settings.failRead = false; settings.lostReply = false;
        if (action === 'retry') app.retrySettings(); else app.cancelSettingsChange();
        expect(app.view.settings).toEqual({ ...defaultSettings(), textSize: 'large' }); expect(app.view.settingsError).toBeNull();
        expect(settings.writes).toBe(1);
    });
    it('shows unavailable reads and retries without blocking the game profile', () => {
        const settings = new Store(); settings.failRead = true; const app = appFor(new Store(), settings);
        expect(app.view.settingsError).not.toBeNull(); app.openPreparation(); expect(app.view.screen).toBe('preparation');
        settings.raw = JSON.stringify({ version: 2, ...defaultSettings(), textSize: 'large' }); settings.failRead = false; app.retrySettings();
        expect(app.view.settings.textSize).toBe('large'); expect(app.view.settingsError).toBeNull();
    });
    it('rejects corrupted and future settings without overwriting them', () => {
        for (const raw of ['null', '[]', '{"version":2,"textSize":"large"}', '{"version":1,"textSize":"tiny"}']) {
            const settings = new Store(); settings.raw = raw; const app = appFor(new Store(), settings);
            expect(app.view.settingsError).not.toBeNull(); app.openSettings(); app.setTextSize('large');
            expect(settings.raw).toBe(raw); expect(settings.writes).toBe(0);
            expect(() => decodeSettings(raw)).toThrow();
        }
    });
    it('blocks external replacement instead of silently replacing settings', () => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        const external = '{"version":1,"textSize":"large"}'; settings.raw = external;
        app.setTextSize('large'); expect(app.view.settingsError).toContain('извне'); expect(settings.raw).toBe(external);
        app.cancelSettingsChange(); expect(app.view.settings.textSize).toBe('large');
    });
});


describe('language settings v3', () => {
    it('migrates v2 with all existing audio and text choices intact', () => {
        const old = { version: 2, textSize: 'large', soundEnabled: false, musicVolume: 0, effectsVolume: 94 };
        expect(decodeSettings(JSON.stringify(old))).toEqual({ language: 'auto', textSize: 'large', soundEnabled: false, musicVolume: 0, effectsVolume: 94 });
    });
    it('saves manual language separately from the profile and restores on reload', () => {
        const profile = new Store(); const settings = new Store(); const app = appFor(profile, settings);
        app.setLanguage('en'); expect(settings.writes).toBe(0);
        app.openSettings(); app.setLanguage('en');
        expect(JSON.parse(settings.raw!)).toEqual({ version: 3, ...defaultSettings(), language: 'en' });
        expect(appFor(profile, settings).view.settings.language).toBe('en'); expect(profile.raw).toBeNull();
        app.setLanguage('ru'); expect(appFor(profile, settings).view.settings.language).toBe('ru');
        app.setLanguage('auto'); expect(appFor(profile, settings).view.settings.language).toBe('auto');
    });
    it('keeps confirmed language when a write fails, retries, and reconciles lost replies', () => {
        const settings = new Store(); const app = appFor(new Store(), settings); app.openSettings();
        settings.failWrite = true; app.setLanguage('en');
        expect(app.view.settings.language).toBe('auto'); expect(app.view.settingsError).not.toBeNull();
        settings.failWrite = false; app.retrySettings(); expect(app.view.settings.language).toBe('en');
        settings.lostReply = true; app.setLanguage('ru'); expect(app.view.settings.language).toBe('en');
        settings.lostReply = false; settings.failRead = false; app.cancelSettingsChange();
        expect(app.view.settings.language).toBe('ru'); expect(app.view.settingsError).toBeNull();
    });
    it.each([undefined, null, 'de', '', ['en'], 1, true])('rejects invalid v3 language %j without overwriting', language => {
        const settings = new Store(); settings.raw = JSON.stringify({ version: 3, ...defaultSettings(), language });
        expect(() => decodeSettings(settings.raw!)).toThrow();
        const app = appFor(new Store(), settings); app.openSettings(); app.setLanguage('en'); expect(settings.writes).toBe(0);
    });
});
