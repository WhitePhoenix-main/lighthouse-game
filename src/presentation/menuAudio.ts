import type { GameApplication } from '../contracts';

export interface MenuAudioPort {
    loop: boolean;
    preload: string;
    volume: number;
    muted: boolean;
    src: string;
    play(): Promise<void> | void;
    pause(): void;
    load(): void;
    removeAttribute(name: string): void;
}

/** Injectable browser boundary for deterministic lifecycle tests. */
export interface MenuAudioEnvironment {
    audio: MenuAudioPort;
    window: EventTarget;
    document: EventTarget;
    visible(): boolean;
    focused(): boolean;
}

export function mountMenuAudio(root: HTMLElement, application: GameApplication,
    environment?: MenuAudioEnvironment): { sync(): void; destroy(): void } {
    const document = root.ownerDocument;
    const window = document.defaultView!;
    const browserAudio = environment ? null : document.createElement('audio');
    if (browserAudio) { browserAudio.hidden = true; browserAudio.dataset.menuAudio = ''; root.append(browserAudio); }
    const env = environment ?? {
        audio: browserAudio!, window, document,
        visible: () => document.visibilityState !== 'hidden', focused: () => document.hasFocus()
    };
    const audio = env.audio;
    audio.preload = 'auto';
    audio.loop = true;
    audio.src = `${import.meta.env.BASE_URL}audio/menu-theme.mp3`;
    let destroyed = false;
    let focused = env.focused();
    let pageVisible = true;
    let menuSettings = application.view.screen === 'menu';
    let previousScreen = application.view.screen;
    let playing = false;
    let generation = 0;
    let blocked = false;
    let previousChoice = '';

    function sync(): void {
        if (destroyed) return;
        const { screen, settings } = application.view;
        if (screen !== previousScreen) {
            if (screen === 'settings') menuSettings = previousScreen === 'menu' || previousScreen === 'game-menu';
            previousScreen = screen;
        }
        audio.volume = settings.musicVolume / 100;
        audio.muted = !settings.soundEnabled;
        const choice = `${screen}/${settings.musicVolume}/${settings.soundEnabled}`;
        if (choice !== previousChoice) { blocked = false; previousChoice = choice; }
        const allowed = focused && pageVisible && env.visible()
            && settings.soundEnabled && settings.musicVolume > 0
            && (screen === 'menu' || screen === 'game-menu' || (screen === 'settings' && menuSettings));
        if (!allowed) {
            if (playing) { playing = false; generation++; audio.pause(); }
            return;
        }
        if (playing || blocked) return;
        playing = true;
        const request = ++generation;
        try {
            const result = audio.play();
            if (result) void result.then(() => {
                // A pending play must not resurrect sound after a pause or teardown.
                if (destroyed || !playing) audio.pause();
            }, () => { if (generation === request) { playing = false; blocked = true; } });
        } catch { if (generation === request) { playing = false; blocked = true; } }
    }
    // Try on mount; a trusted gesture retries if the browser blocks autoplay.
    const unlock = (event: Event): void => {
        if (!event.isTrusted) return;
        blocked = false;
        sync();
    };
    const blur = (): void => { focused = false; sync(); };
    const focus = (): void => { focused = true; blocked = false; sync(); };
    const hide = (): void => { pageVisible = false; sync(); };
    const show = (): void => { pageVisible = true; focused = env.focused(); sync(); };
    const visibility = (): void => { if (env.visible()) focused = env.focused(); sync(); };
    const listeners: [EventTarget, string, EventListener][] = [
        [env.document, 'pointerdown', unlock], [env.document, 'pointerup', unlock],
        [env.document, 'click', unlock], [env.document, 'keydown', unlock],
        [env.window, 'blur', blur], [env.window, 'focus', focus],
        [env.window, 'pagehide', hide], [env.window, 'pageshow', show],
        [env.document, 'visibilitychange', visibility]
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
    sync();
    return { sync, destroy() {
        if (destroyed) return;
        destroyed = true;
        playing = false;
        generation++;
        for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        browserAudio?.remove();
    } };
}
