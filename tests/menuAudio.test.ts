import { describe, expect, it, vi } from 'vitest';
import { mountMenuAudio, type MenuAudioEnvironment } from '../src/presentation/menu/menuAudio';
import { LighthouseApplication } from '../src/application/gameApplication';
import { defaultSettings } from '../src/application/settings';
import { NIGHT_CONFIG } from '../src/content/night';
import type { AudioSettings } from '../src/contracts';

class Events extends EventTarget {
    private handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
    override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (!listener) return;
        const handlers = this.handlers.get(type) ?? new Set(); handlers.add(listener); this.handlers.set(type, handlers);
    }
    override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (listener) this.handlers.get(type)?.delete(listener);
    }
    emit(type: string, trusted = true): void {
        const event = { type, isTrusted: trusted } as Event;
        for (const listener of this.handlers.get(type) ?? []) {
            if (typeof listener === 'function') listener(event); else listener.handleEvent(event);
        }
    }
    get count(): number { return [...this.handlers.values()].reduce((sum, set) => sum + set.size, 0); }
}

function setup(options: { play?: () => Promise<void>; visible?: boolean; focused?: boolean; settings?: Partial<AudioSettings> } = {}) {
    let raw: string | null = null;
    let settingsRaw = options.settings ? JSON.stringify({ version: 3, ...defaultSettings(), ...options.settings }) : null;
    const app = new LighthouseApplication({ read: () => raw, write(value) { raw = value; } }, NIGHT_CONFIG, () => ({ id: 'audio', seed: 1 }),
        { read: () => settingsRaw, write(value) { settingsRaw = value; } });
    const window = new Events(); const document = new Events();
    let visible = options.visible ?? true; let focused = options.focused ?? true;
    const audio = { src: '', loop: false, preload: '', volume: 0, muted: false,
        play: vi.fn(options.play ?? (() => Promise.resolve())), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn() };
    const env: MenuAudioEnvironment = { audio, window, document, visible: () => visible, focused: () => focused };
    const root = { ownerDocument: { defaultView: {} } } as HTMLElement;
    const mounted = mountMenuAudio(root, app, env);
    return { app, audio, window, document, mounted,
        visible(value: boolean) { visible = value; document.emit('visibilitychange'); },
        focused(value: boolean) { focused = value; window.emit(value ? 'focus' : 'blur'); } };
}

describe('menu audio lifecycle', () => {
    it('starts on mount without a gesture and keeps the same playback across renders', () => {
        const s = setup();
        expect(s.audio.preload).toBe('auto'); expect(s.audio.loop).toBe(true);
        expect(s.audio.volume).toBe(.5); expect(s.audio.muted).toBe(false);
        expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.mounted.sync(); s.document.emit('pointerdown'); s.document.emit('keydown');
        expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.mounted.destroy();
    });
    it('retries on touch release when pointerdown preceded media activation', async () => {
        const play = vi.fn<() => Promise<void>>().mockResolvedValue()
            .mockRejectedValueOnce(new Error('NotAllowedError'))
            .mockRejectedValueOnce(new Error('NotAllowedError'));
        const s = setup({ play });
        await Promise.resolve();
        s.document.emit('pointerdown');
        await Promise.resolve();
        s.mounted.sync();
        expect(s.audio.play).toHaveBeenCalledTimes(2);
        s.document.emit('pointerup');
        expect(s.audio.play).toHaveBeenCalledTimes(3);
        s.mounted.destroy();
    });
    it('follows menu settings and confirmed levels', () => {
        const s = setup();
        s.app.openSettings(); s.app.setAudioSettings({ musicVolume: 27 }); s.mounted.sync();
        expect(s.audio.volume).toBe(.27); expect(s.audio.pause).not.toHaveBeenCalled();
        s.app.setAudioSettings({ soundEnabled: false }); s.mounted.sync();
        expect(s.audio.muted).toBe(true); expect(s.audio.pause).toHaveBeenCalledTimes(1);
        s.app.setAudioSettings({ soundEnabled: true }); s.mounted.sync();
        expect(s.audio.volume).toBe(.27); expect(s.audio.play).toHaveBeenCalledTimes(2);
        s.mounted.destroy();
    });
    it.each([{ soundEnabled: false }, { musicVolume: 0 }])('respects disabled music on mount: %j', settings => {
        const s = setup({ settings });
        expect(s.audio.play).not.toHaveBeenCalled();
        s.document.emit('pointerdown'); expect(s.audio.play).not.toHaveBeenCalled();
        s.app.openSettings(); s.mounted.sync();
        s.app.setAudioSettings({ soundEnabled: true, musicVolume: 27 }); s.mounted.sync();
        expect(s.audio.volume).toBe(.27); expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.mounted.destroy();
    });
    it.each(['hidden', 'unfocused'])('waits for activity when mounted %s', state => {
        const s = setup({ visible: state !== 'hidden', focused: state !== 'unfocused' });
        expect(s.audio.play).not.toHaveBeenCalled();
        s.visible(true); s.focused(true);
        expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.mounted.destroy();
    });
    it('pauses on blur, hidden and pagehide and resumes only when all permit', () => {
        const s = setup();
        s.focused(false); expect(s.audio.pause).toHaveBeenCalledTimes(1);
        s.visible(false); s.focused(true); expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.visible(true); expect(s.audio.play).toHaveBeenCalledTimes(2);
        s.window.emit('pagehide'); s.focused(true); expect(s.audio.play).toHaveBeenCalledTimes(2);
        s.window.emit('pageshow'); expect(s.audio.play).toHaveBeenCalledTimes(3);
        s.mounted.destroy();
    });
    it('never plays in battle or settings reached from a paused battle', () => {
        const s = setup();
        s.app.openPreparation(); s.mounted.sync(); s.app.start(); s.mounted.sync();
        expect(s.app.view.screen).toBe('battle');
        s.app.pause(); s.app.openSettings(); s.mounted.sync();
        s.focused(false); s.focused(true); s.document.emit('keydown');
        expect(s.audio.play).toHaveBeenCalledTimes(1); s.mounted.destroy();
    });
    it('handles rejected play without retrying every render, and retries a trusted gesture', async () => {
        const s = setup({ play: vi.fn<() => Promise<void>>().mockResolvedValue().mockRejectedValueOnce(Error('autoplay')) });
        await Promise.resolve();
        s.mounted.sync(); s.mounted.sync(); expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.document.emit('pointerdown', false); expect(s.audio.play).toHaveBeenCalledTimes(1);
        s.document.emit('pointerdown'); expect(s.audio.play).toHaveBeenCalledTimes(2); s.mounted.destroy();
    });
    it('removes all listeners, releases media and silences pending play after destroy', async () => {
        let resolve!: () => void;
        const s = setup({ play: () => new Promise<void>(done => { resolve = done; }) });
        s.mounted.destroy(); resolve(); await Promise.resolve();
        expect(s.audio.pause).toHaveBeenCalledTimes(2); expect(s.audio.removeAttribute).toHaveBeenCalledWith('src');
        expect(s.audio.load).toHaveBeenCalledTimes(1); expect(s.window.count + s.document.count).toBe(0);
        s.document.emit('keydown'); s.mounted.sync(); s.mounted.destroy(); expect(s.audio.play).toHaveBeenCalledTimes(1);
    });
});
