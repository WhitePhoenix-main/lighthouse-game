import { describe, expect, it, vi } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import { NIGHT_CONFIG } from '../src/content/night';
import { createBattle } from '../src/simulation/battle';
import { emitCombatEvent } from '../src/simulation/events';
import { mountEffectsAudio, type EffectsAudioEnvironment } from '../src/presentation/battle/effectsAudio';

class Events extends EventTarget {
    private handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
    override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (!listener) return;
        const handlers = this.handlers.get(type) ?? new Set(); handlers.add(listener); this.handlers.set(type, handlers);
    }
    override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (listener) this.handlers.get(type)?.delete(listener);
    }
    emit(type: string, trusted = true, target: unknown = null): void {
        const event = { type, isTrusted: trusted, target } as Event;
        for (const listener of this.handlers.get(type) ?? []) {
            if (typeof listener === 'function') listener(event); else listener.handleEvent(event);
        }
    }
    get count(): number { return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0); }
}
function fakeContext() {
    const gains: ReturnType<typeof gain>[] = [];
    function gain() {
        return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    }
    const oscillators: ReturnType<typeof oscillator>[] = [];
    function oscillator() {
        return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    }
    const context = {
        state: 'suspended', currentTime: 0, destination: {},
        createGain: vi.fn(() => { const node = gain(); gains.push(node); return node; }),
        createOscillator: vi.fn(() => { const node = oscillator(); oscillators.push(node); return node; }),
        resume: vi.fn<() => Promise<void>>().mockImplementation(() => { context.state = 'running'; return Promise.resolve(); }),
        suspend: vi.fn(async () => { context.state = 'suspended'; }),
        close: vi.fn(async () => { context.state = 'closed'; })
    };
    return { context, gains, oscillators };
}
function setup() {
    let raw: string | null = null;
    const app = new LighthouseApplication({ read: () => raw, write(value) { raw = value; } }, NIGHT_CONFIG, () => ({ id: 'audio', seed: 1 }));
    const window = new Events(); const document = new Events();
    const root = Object.assign(new Events(), { ownerDocument: { defaultView: {} } });
    const fake = fakeContext();
    let visible = true; let focused = true;
    const env: EffectsAudioEnvironment = { createContext: vi.fn(() => fake.context as unknown as AudioContext), window, document,
        visible: () => visible, focused: () => focused };
    const mounted = mountEffectsAudio(root as unknown as HTMLElement, app, env);
    function startBattle() {
        const battle = createBattle(NIGHT_CONFIG, 1);
        app.view.screen = 'battle'; app.view.battle = battle; mounted.sync(); return battle;
    }
    function event() {
        const battle = app.view.battle!;
        fake.context.currentTime += .3;
        emitCombatEvent(battle, { type: 'lighthouse-hit', damage: 3, x: 0, y: 0 });
        mounted.sync();
    }
    return { app, root, window, document, mounted, env, ...fake, event, startBattle,
        visible(value: boolean) { visible = value; document.emit('visibilitychange'); },
        focused(value: boolean) { focused = value; window.emit(value ? 'focus' : 'blur'); } };
}
const control = { closest: () => ({ hasAttribute: () => false, getAttribute: () => null }) };

describe('effects audio', () => {
    it('requires a real gesture; UI clicks and slider preview respect independent effects gain', async () => {
        const s = setup();
        s.document.emit('pointerdown', false); expect(s.env.createContext).not.toHaveBeenCalled();
        s.root.emit('click', false, control); expect(s.env.createContext).not.toHaveBeenCalled();
        s.document.emit('pointerdown'); await Promise.resolve();
        s.root.emit('click', true, control); expect(s.oscillators).toHaveLength(1);
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 27, musicVolume: 0 };
        s.context.currentTime += .2;
        s.mounted.preview({ isTrusted: true } as Event);
        expect(s.oscillators).toHaveLength(2);
        expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(.27, s.context.currentTime);
        s.app.view.settings = { ...s.app.view.settings, soundEnabled: false }; s.mounted.sync();
        expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, s.context.currentTime);
        expect(s.oscillators[0]!.disconnect).toHaveBeenCalled();
        s.root.emit('click', true, control); expect(s.oscillators).toHaveLength(2);
        s.app.view.settings = { ...s.app.view.settings, soundEnabled: true }; s.mounted.sync();
        s.context.currentTime += .2; s.root.emit('click', true, control);
        expect(s.oscillators).toHaveLength(3);
        expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(.27, s.context.currentTime);
        s.mounted.destroy();
    });
    it('consumes event ids once, rate limits beam hits and discards stale or prior battle history', async () => {
        const s = setup(); s.document.emit('keydown'); await Promise.resolve();
        const battle = s.startBattle();
        s.event(); s.mounted.sync(); s.mounted.sync(); expect(s.oscillators).toHaveLength(1);
        for (let i = 0; i < 25; i++) {
            emitCombatEvent(battle, { type: 'enemy-hit', enemyId: i, enemyKind: 'ghost', healthDamage: 1, armorDamage: 0, x: 0, y: 0 });
            s.mounted.sync();
        }
        expect(s.oscillators).toHaveLength(2);
        emitCombatEvent(battle, { type: 'flash-used', x: 0, y: 0 });
        battle.tick += 60; s.mounted.sync(); expect(s.oscillators).toHaveLength(2);
        const next = createBattle(NIGHT_CONFIG, 2);
        emitCombatEvent(next, { type: 'flash-used', x: 0, y: 0 });
        s.app.view.battle = next; s.mounted.sync(); expect(s.oscillators).toHaveLength(2);
        s.event(); expect(s.oscillators).toHaveLength(3); s.mounted.destroy();
    });
    it('never replays events skipped by mute or zero volume', async () => {
        const s = setup(); s.document.emit('keydown'); await Promise.resolve(); s.startBattle();
        for (const settings of [{ soundEnabled: false }, { soundEnabled: true, effectsVolume: 0 }]) {
            s.app.view.settings = { ...s.app.view.settings, ...settings }; s.event();
        }
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 70 }; s.document.emit('keydown');
        s.mounted.sync(); expect(s.oscillators).toHaveLength(0);
        s.event(); expect(s.oscillators).toHaveLength(1); s.mounted.destroy();
    });
    it('stops voices on blur, hidden, pagehide and battle pause without replay on returning', async () => {
        const s = setup(); s.document.emit('keydown'); await Promise.resolve(); s.startBattle(); s.event();
        s.focused(false); expect(s.oscillators[0]!.disconnect).toHaveBeenCalled(); s.event();
        s.focused(true); s.document.emit('keydown'); await Promise.resolve();
        expect(s.oscillators).toHaveLength(1); s.event(); expect(s.oscillators).toHaveLength(2);
        s.visible(false); s.event(); s.visible(true); s.document.emit('keydown'); await Promise.resolve();
        expect(s.oscillators).toHaveLength(2);
        s.window.emit('pagehide'); s.event(); s.window.emit('pageshow'); s.document.emit('keydown'); await Promise.resolve();
        expect(s.oscillators).toHaveLength(2);
        s.app.view.paused = true; s.mounted.sync(); s.event();
        s.app.view.paused = false; s.mounted.sync(); expect(s.oscillators).toHaveLength(2);
        s.event(); expect(s.oscillators).toHaveLength(3); s.mounted.destroy();
    });
    it('bounds polyphony even across different event types and frees ended voices', async () => {
        const s = setup(); s.document.emit('keydown'); await Promise.resolve(); const battle = s.startBattle();
        for (const type of ['flash-used', 'shield-hit', 'shield-restored', 'boss-died', 'shield-broken', 'boss-hit', 'boss-stunned'] as const) {
            emitCombatEvent(battle, { type, damage: 1, healthDamage: 1, x: 0, y: 0 });
        }
        s.mounted.sync(); expect(s.oscillators).toHaveLength(6);
        s.context.currentTime += .4; s.event(); expect(s.oscillators).toHaveLength(6);
        s.oscillators[0]!.onended!(); s.event(); expect(s.oscillators).toHaveLength(7);
        s.mounted.destroy();
    });
    it('does not queue sounds behind a late resume and removes every listener on cleanup', async () => {
        const s = setup(); let resolve!: () => void;
        s.context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = () => { s.context.state = 'running'; done(); }; }));
        s.document.emit('keydown'); s.startBattle(); s.event();
        s.focused(false); resolve(); await Promise.resolve();
        expect(s.context.state).toBe('suspended'); expect(s.oscillators).toHaveLength(0);
        s.focused(true); s.document.emit('keydown'); await Promise.resolve(); s.mounted.sync();
        expect(s.oscillators).toHaveLength(0);
        s.event(); expect(s.oscillators).toHaveLength(1);
        s.mounted.destroy(); s.mounted.destroy(); s.event(); s.root.emit('click', true, control);
        expect(s.root.count + s.window.count + s.document.count).toBe(0);
        expect(s.context.close).toHaveBeenCalledTimes(1); expect(s.oscillators[0]!.disconnect).toHaveBeenCalled();
    });
    it('handles denied audio without render retries and retries only a subsequent gesture', async () => {
        const s = setup();
        s.context.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
        s.document.emit('pointerdown'); await Promise.resolve();
        s.startBattle(); s.event(); s.mounted.sync();
        expect(s.context.resume).toHaveBeenCalledTimes(1); expect(s.oscillators).toHaveLength(0);
        s.document.emit('pointerup'); await Promise.resolve();
        s.mounted.sync(); expect(s.oscillators).toHaveLength(0);
        s.event(); expect(s.oscillators).toHaveLength(1); s.mounted.destroy();
    });
    it('silences a resume that finishes after destruction without creating any voices', async () => {
        const s = setup(); let resolve!: () => void;
        s.context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = () => { s.context.state = 'running'; done(); }; }));
        s.document.emit('pointerdown'); s.root.emit('click', true, control);
        s.mounted.destroy(); resolve(); await Promise.resolve();
        expect(s.context.state).toBe('suspended'); expect(s.oscillators).toHaveLength(0);
        expect(s.root.count + s.window.count + s.document.count).toBe(0);
    });
    it('previews the confirmed level when an effects slider leaves zero during a drag', async () => {
        const s = setup(); s.document.emit('pointerdown'); await Promise.resolve();
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 0 }; s.mounted.sync();
        expect(s.context.state).toBe('suspended');
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 32 }; s.mounted.sync();
        s.mounted.preview({ isTrusted: false } as Event);
        expect(s.context.resume).toHaveBeenCalledTimes(1);
        // No root input listener can play a sample before the application setter.
        s.root.emit('input', true, { dataset: { action: 'effects-volume' } });
        expect(s.oscillators).toHaveLength(0);
        s.mounted.preview({ isTrusted: true } as Event);
        expect(s.context.resume).toHaveBeenCalledTimes(2);
        expect(s.oscillators).toHaveLength(1);
        expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(.32, s.context.currentTime);
        s.mounted.destroy();
    });
    it('drops slider samples behind a late resume across a lifecycle interruption', async () => {
        const s = setup(); s.document.emit('pointerdown'); await Promise.resolve();
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 0 }; s.mounted.sync();
        let resolve!: () => void;
        s.context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = () => { s.context.state = 'running'; done(); }; }));
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 25 }; s.mounted.sync();
        s.mounted.preview({ isTrusted: true } as Event);
        expect(s.oscillators).toHaveLength(0);
        s.visible(false); resolve(); await Promise.resolve();
        expect(s.context.state).toBe('suspended'); expect(s.oscillators).toHaveLength(0);
        s.visible(true); s.mounted.sync(); expect(s.oscillators).toHaveLength(0);
        s.app.view.settings = { ...s.app.view.settings, effectsVolume: 40 }; s.mounted.sync();
        s.mounted.preview({ isTrusted: true } as Event);
        expect(s.oscillators).toHaveLength(1);
        expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(.4, s.context.currentTime);
        s.mounted.destroy();
    });
});
