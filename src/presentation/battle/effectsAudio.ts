import type { BattleState, CombatEvent, GameApplication } from '../../contracts';

/** Browser boundary: tests supply a deterministic Web Audio context and lifecycle. */
export interface EffectsAudioEnvironment {
    createContext(): AudioContext | null;
    window: EventTarget;
    document: EventTarget;
    visible(): boolean;
    focused(): boolean;
}

type Cue = 'ui' | 'hit' | 'break' | 'death' | 'danger' | 'shield' | 'restore' | 'flash' | 'wave' | 'success';
// Provisional quiet synthesis: start/end frequency, seconds, peak gain, waveform.
const CUES: Record<Cue, readonly [number, number, number, number, OscillatorType]> = {
    ui: [660, 880, .055, .07, 'sine'],
    hit: [210, 140, .045, .045, 'triangle'],
    break: [900, 180, .14, .08, 'triangle'],
    death: [280, 90, .13, .07, 'sine'],
    danger: [120, 65, .2, .12, 'triangle'],
    shield: [420, 260, .09, .07, 'sine'],
    restore: [360, 720, .24, .09, 'sine'],
    flash: [1050, 130, .23, .09, 'triangle'],
    wave: [220, 440, .18, .09, 'sine'],
    success: [440, 880, .3, .1, 'sine']
};
function eventCue(event: CombatEvent): Cue {
    switch (event.type) {
        case 'enemy-hit': case 'boss-hit': return 'hit';
        case 'armor-broken': return 'break';
        case 'enemy-died': return 'death';
        case 'device-hit': case 'device-destroyed': case 'lighthouse-hit':
        case 'shield-broken': case 'charge-impact': case 'ship-lost': return 'danger';
        case 'shield-hit': return 'shield';
        case 'generator-residual': case 'barrier-slow': case 'bell-pulse': return 'shield';
        case 'generator-saved': case 'device-repaired': case 'shield-restored': return 'restore';
        case 'ability-used': case 'mortar-impact': case 'flash-used': case 'trap-triggered': case 'boss-stunned': return 'flash';
        case 'wave-started': case 'charge-started': return 'wave';
        case 'wave-completed': case 'ship-rescued': case 'boss-died': return 'success';
    }
}

export function mountEffectsAudio(root: HTMLElement, application: GameApplication,
    environment?: EffectsAudioEnvironment): { sync(): void; preview(event: Event): void; destroy(): void } {
    const document = root.ownerDocument;
    const window = document.defaultView!;
    const env = environment ?? {
        createContext: () => typeof AudioContext === 'undefined' ? null : new AudioContext(),
        window, document,
        visible: () => document.visibilityState !== 'hidden', focused: () => document.hasFocus()
    };
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    let destroyed = false;
    let focused = env.focused();
    let pageVisible = true;
    let battle: Readonly<BattleState> | null = null;
    let lastId = 0;
    let previousPaused = application.view.paused;
    let previousScreen = application.view.screen;
    const voices = new Map<OscillatorNode, GainNode>();
    const lastPlayed = new Map<Cue, number>();
    let resuming = false;

    function allowed(): boolean {
        const settings = application.view.settings;
        return !destroyed && focused && pageVisible && env.visible() && settings.soundEnabled && settings.effectsVolume > 0;
    }
    function stopVoices(): void {
        for (const [oscillator, gain] of voices) {
            oscillator.onended = null;
            try { oscillator.stop(); } catch { /* Already ended. */ }
            oscillator.disconnect(); gain.disconnect();
        }
        voices.clear();
        lastPlayed.clear();
    }
    function suspend(): void {
        if (context && context.state !== 'closed') void context.suspend().catch(() => {});
    }
    function play(cue: Cue): void {
        if (!context || !master || context.state !== 'running' || !allowed()) return;
        const now = context.currentTime;
        // The damage journal contains a hit per simulation tick. Coalesce all such
        // hits to at most four quiet notes per second, with at most six voices total.
        if (voices.size >= 6 || now - (lastPlayed.get(cue) ?? -Infinity) < (cue === 'hit' ? .25 : cue === 'ui' ? .09 : .12)) return;
        lastPlayed.set(cue, now);
        const [start, end, duration, peak, type] = CUES[cue];
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(start, now);
        oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + .006);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(gain); gain.connect(master);
        voices.set(oscillator, gain);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(now); oscillator.stop(now + duration + .01);
    }
    function sync(): void {
        if (destroyed) return;
        const view = application.view;
        const current = view.battle;
        if (previousPaused !== view.paused || previousScreen !== view.screen) stopVoices();
        previousPaused = view.paused; previousScreen = view.screen;
        if (master && context) master.gain.setValueAtTime(allowed() ? view.settings.effectsVolume / 100 : 0, context.currentTime);
        if (!allowed()) { stopVoices(); suspend(); }
        // A new battle (or mounting mid-battle) establishes a baseline. Never replay
        // its retained journal, including events skipped while muted or inactive.
        if (current !== battle) {
            battle = current;
            lastId = current?.events.at(-1)?.id ?? 0;
            return;
        }
        if (!current) return;
        for (const event of current.events) {
            if (event.id <= lastId) continue;
            lastId = event.id;
            if (view.screen !== 'battle' || view.paused || !allowed()) continue;
            const age = (current.tick - event.tick) * view.config.stepSeconds;
            if (age >= 0 && age <= .2) play(eventCue(event));
        }
    }
    function unlock(event: Event): void {
        if (!event.isTrusted || !allowed()) return;
        if (!context) {
            try {
                context = env.createContext();
                if (context) { master = context.createGain(); master.connect(context.destination); }
            } catch { context = null; master = null; }
        }
        sync();
        if (!context || context.state === 'running' || context.state === 'closed' || resuming) return;
        resuming = true;
        // Nothing is queued here. A late resume only enables future fresh effects.
        try {
            void context.resume().then(() => {
                resuming = false;
                if (!allowed()) suspend();
            }, () => { resuming = false; });
        } catch { resuming = false; }
    }
    const click = (event: Event): void => {
        if (!event.isTrusted) return;
        unlock(event);
        const target = event.target as Element | null;
        const control = target?.closest?.('[data-action]');
        if (control && !control.hasAttribute('disabled') && control.getAttribute('aria-disabled') !== 'true') play('ui');
    };
    // Call after the effects-volume setter and sync, while handling the trusted
    // input gesture. A delayed resume enables the next fresh sample, never a queue.
    const preview = (event: Event): void => {
        if (!event.isTrusted) return;
        unlock(event);
        sync();
        play('ui');
    };
    const blur = (): void => { focused = false; sync(); };
    const focus = (): void => { focused = true; sync(); };
    const hide = (): void => { pageVisible = false; sync(); };
    const show = (): void => { pageVisible = true; focused = env.focused(); sync(); };
    const visibility = (): void => { if (env.visible()) focused = env.focused(); sync(); };
    const listeners: [EventTarget, string, EventListener][] = [
        [env.document, 'pointerdown', unlock], [env.document, 'pointerup', unlock],
        [env.document, 'keydown', unlock], [env.document, 'click', unlock],
        [root, 'click', click],
        [env.window, 'blur', blur], [env.window, 'focus', focus],
        [env.window, 'pagehide', hide], [env.window, 'pageshow', show],
        [env.document, 'visibilitychange', visibility]
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
    sync();
    return { sync, preview, destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
        if (master && context) master.gain.setValueAtTime(0, context.currentTime);
        stopVoices(); master?.disconnect();
        if (context && context.state !== 'closed') void context.close().catch(() => {});
    } };
}
