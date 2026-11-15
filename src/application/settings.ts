import type { SaveStore, UserSettings } from '../contracts';

// Provisional listening levels; independent of profile and game balance.
export const defaultSettings = (): UserSettings => ({ language: 'auto', textSize: 'normal', soundEnabled: true, musicVolume: 50, effectsVolume: 70 });

const volume = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

export function decodeSettings(raw: string): UserSettings {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || !('version' in value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) || !('textSize' in value)
        || (value.textSize !== 'normal' && value.textSize !== 'large')) {
        throw new Error('Неизвестные или повреждённые настройки. Запись не изменена.');
    }
    if (value.version === 1) return { ...defaultSettings(), textSize: value.textSize };
    if (!('soundEnabled' in value) || typeof value.soundEnabled !== 'boolean'
        || !('musicVolume' in value) || !volume(value.musicVolume)
        || !('effectsVolume' in value) || !volume(value.effectsVolume)) {
        throw new Error('Неизвестные или повреждённые настройки. Запись не изменена.');
    }
    if (value.version === 3 && (!('language' in value) || (value.language !== 'auto' && value.language !== 'ru' && value.language !== 'en'))) {
        throw new Error('Неизвестные или повреждённые настройки. Запись не изменена.');
    }
    return { language: value.version === 3 ? (value as unknown as { language: UserSettings['language'] }).language : 'auto', textSize: value.textSize, soundEnabled: value.soundEnabled, musicVolume: value.musicVolume, effectsVolume: value.effectsVolume };
}

/** Independent from the profile: changing text never creates or charges a game profile. */
export class SettingsRepository {
    private raw: string | null = null;
    private data = defaultSettings();
    private pending: string | null = null;
    constructor(private readonly store: SaveStore) {}
    get current(): UserSettings { return { ...this.data }; }

    load(): void {
        const raw = this.store.read();
        const data = raw === null ? defaultSettings() : decodeSettings(raw);
        this.raw = raw;
        this.data = data;
    }

    private resolve(): void {
        if (this.pending === null) return;
        const raw = this.store.read();
        if (raw === this.pending) {
            this.raw = raw;
            this.data = decodeSettings(raw);
        } else if (raw !== this.raw) throw new Error('Настройки изменились извне. Перезагрузите игру.');
        this.pending = null;
    }

    save(settings: UserSettings): void {
        this.resolve();
        const raw = JSON.stringify({ version: 3, ...settings });
        const data = decodeSettings(raw);
        if (JSON.stringify(this.data) === JSON.stringify(data)) return;
        if (this.store.read() !== this.raw) throw new Error('Настройки изменились извне. Перезагрузите игру.');
        this.pending = raw;
        try { this.store.write(raw); }
        catch (error) {
            this.resolve();
            if (this.raw !== raw) throw error;
            return;
        }
        this.raw = raw;
        this.data = data;
        this.pending = null;
    }

    cancel(): void {
        // A lost write reply may already have changed storage. Reconcile before claiming cancellation.
        this.resolve();
        this.load();
    }
}

export function memorySettingsStore(): SaveStore {
    let raw: string | null = null;
    return { read: () => raw, write: value => { raw = value; } };
}
