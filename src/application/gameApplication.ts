import { isLateNight, lateNightModeOptions, resolveLateNight } from '../content/lateModes';
import {getBossRules} from '../content/boss';
import {createLensViews, getLensAvailability, getLensUpgradeAvailability} from '../progression/lenses';
import type { DevicePlacement, LateNightMode, LensId, LensUpgradeId,ApplicationScreen, ApplicationView, BattleCommand, BattleState, DeviceKind, GameApplication, NightConfig, NightDefinition, NightId, PlacementCheck, SaveStore, AudioSettings, LanguagePreference, UserSettings, TextSize, UpgradeId} from '../contracts';
import {createBattle, stepBattle} from '../simulation/battle';
import {calculateNightConfig, createUpgradeViews, getUpgradeAvailability} from '../progression/upgrades';
import {SaveRepository, emptySave} from './saves';
import {checkDraft, checkPlacement} from './placement';
import {actualDeviceHealth, battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost, rechargeCost} from '../progression/devices';
import {validateNightDefinitions} from '../content/nights';
import {defaultSettings, memorySettingsStore, SettingsRepository} from './settings';

export interface AttemptIdentity {
    id: string;
    seed: number;
}

export class LighthouseApplication implements GameApplication {
    readonly view: ApplicationView;
    private readonly saves: SaveRepository;
    private initialized = false;
    private accumulator = 0;
    private commands: BattleCommand[] = [];
    private attemptId: string | null = null;
    private baseConfig: NightConfig;
    private selectedLateMode: LateNightMode = 'transition';
    private readonly catalog: readonly NightDefinition[];
    private attemptConfig: NightConfig | null = null;
    private attemptDeviceSnapshot: ReturnType<typeof deviceDeployments> | null = null;
    private pendingLensPurchase: {kind:'lens';id:LensId}|{kind:'upgrade';id:LensUpgradeId}|null = null;
    private pendingPurchase: UpgradeId | null = null;
    private pendingStart: { identity: AttemptIdentity; config: NightConfig; battle: BattleState; cost: number } | null = null;
    private pendingDeviceOperation: { kind: 'purchase'; deviceKind: DeviceKind; id: number }
        | { kind: 'repair' | 'recharge'; id: number }
        | { kind: 'placement'; placements: DevicePlacement[]; config: NightConfig } | null = null;
    private readonly settings: SettingsRepository;
    private settingsInitialized = false;
    private pendingSettings: UserSettings | null = null;
    private developmentOrigin: 'menu' | 'preparation' | 'result' = 'menu';
    private settingsOrigin: Exclude<ApplicationScreen, 'settings'> = 'menu';
    private pendingPreparation = false;
    private pendingNewGame: object | null = null;
    private pendingAbandon: 'menu' | 'preparation' | null = null;

    constructor(store: SaveStore, config: NightConfig, private readonly identity: () => AttemptIdentity,
        settingsStore: SaveStore = memorySettingsStore(), catalog?: readonly NightDefinition[]) {
        this.saves = new SaveRepository(store);
        this.settings = new SettingsRepository(settingsStore);
        this.catalog = structuredClone(catalog ?? [{ id: 'first-light', name: 'Первый свет', description: 'Защитите маяк.', chapter: 'Туманный берег', requires: null, optional: false, config: { ...config, id: 'first-light' } }]);
        validateNightDefinitions(this.catalog);
        this.baseConfig = structuredClone(this.catalog[0]!.config);
        this.view = {
            selectedNightId: this.catalog[0]!.id, nights: [], selectedLensId: 'basic', lenses: [],
            screen: 'menu', hasProgress: false, settings: defaultSettings(), settingsError: null,
            profile: emptySave().profile, battle: null, paused: false,
            error: null, interrupted: false, result: null,
            config: calculateNightConfig(this.baseConfig, []), upgrades: [],
            preparation: { inventory: [], selectedType: null, placements: [], preview: null, cost: 0, remaining: 0, canStart: false, reason: '' }
        };
        this.initialize();
        this.loadSettings();
    }

    private refreshProfile(): void {
        this.view.profile = this.saves.current.profile;
        this.view.hasProgress = this.saves.hasProfile;
        this.view.nights = this.catalog.map(night => {
            const available = night.requires === null || this.view.profile.wonNightIds.includes(night.requires);
            return { id: night.id, name: night.name, description: isLateNight(night.id) && this.selectedLateMode === 'transition' ? lateNightModeOptions(night.config)[0]!.description : night.description, chapter: night.chapter, optional: night.optional,
                ...(night.config.boss ? {bossLevel:this.view.profile.bossLevel,materialReward:getBossRules(this.view.profile.bossLevel).materialReward}:{}), available, completed: this.view.profile.wonNightIds.includes(night.id), reason: available ? '' : `Требуется победа: ${this.catalog.find(item => item.id === night.requires)!.name}` };
        });
        this.view.lateNightModes = lateNightModeOptions(this.baseConfig);
        this.view.lenses = createLensViews(this.view.profile, this.view.selectedLensId);
        this.view.upgrades = createUpgradeViews(this.view.profile, this.baseConfig);
        if (!this.attemptConfig && this.view.screen !== 'battle' && !(this.view.screen === 'settings' && this.settingsOrigin === 'battle')) {
            this.view.config = calculateNightConfig(resolveLateNight(this.baseConfig, this.selectedLateMode), this.view.profile.purchasedUpgrades, this.view.profile.legacyEquipment, this.loadout());
        }
        this.refreshPreparation();
    }

    private refreshPreparation(): void {
        const draft = this.view.preparation;
        draft.inventory = this.view.profile.devices.map(device => ({ ...structuredClone(device),
            health: actualDeviceHealth(device, this.view.config.devices.definitions),
            maxHealth: this.view.config.devices.definitions[device.kind].health,
            repairCost: repairCost(device, this.view.profile.purchasedUpgrades), rechargeCost: rechargeCost(device, this.view.profile.purchasedUpgrades) }));
        draft.placements = deviceDeployments(this.view.profile);
        const check = checkDraft(this.view.config, draft.placements);
        draft.cost = 0;
        draft.remaining = this.view.profile.resources;
        draft.reason = !check.valid ? check.reason : '';
        draft.canStart = check.valid;
        if (draft.preview && draft.selectedType) {
            const { x, y } = draft.preview;
            draft.preview = { x, y, ...this.placementCheck(draft.selectedType, x, y) };
        }
    }

    selectNight(id: NightId): void {
        if (!this.canNavigate() || !['menu', 'preparation', 'result', 'trials'].includes(this.view.screen) || this.hasLiveBattle()) return;
        const night = this.catalog.find(item => item.id === id);
        if (!night || !this.view.nights.find(item => item.id === id)?.available
            || (this.view.screen === 'trials' && !night.optional)
            || (id === this.view.selectedNightId && this.view.screen !== 'trials')) return;
        if (this.view.screen === 'trials') this.view.screen = 'preparation';
        if (this.view.result) { this.clearAttempt(); this.view.screen = 'preparation'; }
        this.view.selectedNightId = id;
        this.baseConfig = structuredClone(night.config);
        this.view.preparation.selectedType = null;
        this.view.preparation.preview = null;
        this.refreshProfile();
    }

    selectLateMode(mode: LateNightMode): void {
        if (!this.canNavigate() || !['menu', 'preparation'].includes(this.view.screen) || this.hasLiveBattle()
            || !isLateNight(this.view.selectedNightId) || !['transition', 'assault'].includes(mode)
            || mode === this.selectedLateMode) return;
        this.selectedLateMode = mode;
        this.view.preparation.preview = null;
        this.refreshProfile();
    }

    private canEditPreparation(): boolean {
        return this.initialized && !this.view.error && this.view.screen === 'preparation';
    }

    selectDevice(kind: DeviceKind | null): void {
        if (!this.canEditPreparation() || (kind !== null && (!this.view.config.devices.definitions[kind] || (this.view.config.availableDevices !== undefined && !this.view.config.availableDevices.includes(kind))))) return;
        this.view.preparation.selectedType = kind;
        this.view.preparation.preview = null;
    }

    previewPlacement(x: number, y: number): PlacementCheck {
        const kind = this.view.preparation.selectedType;
        if (!this.canEditPreparation() || !kind) return { valid: false, reason: 'Выберите тип устройства.' };
        const check = this.placementCheck(kind, x, y);
        this.view.preparation.preview = { x, y, ...check };
        return check;
    }

    placeDevice(x: number, y: number): void {
        const kind = this.view.preparation.selectedType;
        if (!kind || !this.previewPlacement(x, y).valid) return;
        const device = this.availableDevice(kind)!;
        this.savePlacements([...this.view.preparation.placements, { id: device.id, kind, x, y }]);
        this.view.preparation.preview = null;
    }

    removeDevice(id: number): void {
        if (!this.canEditPreparation()) return;
        this.savePlacements(this.view.preparation.placements.filter(item => item.id !== id));
    }

    clearPlacements(): void {
        if (!this.canEditPreparation()) return;
        this.savePlacements([]);
        this.view.preparation.preview = null;
    }

    private availableDevice(kind: DeviceKind) {
        return this.view.profile.devices.find(device => device.kind === kind && !device.position && device.health > 0 && !device.consumed);
    }

    private placementCheck(kind: DeviceKind, x: number, y: number): PlacementCheck {
        const check = checkPlacement(this.view.config, this.view.preparation.placements, kind, x, y);
        if (!check.valid) return check;
        return this.availableDevice(kind) ? check : { valid: false, reason: 'Нет готового экземпляра в запасе. Купите, восстановите или уберите устройство с поля.' };
    }

    private savePlacements(placements: readonly DevicePlacement[]): void {
        this.pendingDeviceOperation = { kind: 'placement', placements: structuredClone([...placements]), config: structuredClone(this.view.config) };
        this.completeDeviceOperation();
    }

    purchaseDevice(kind: DeviceKind): void {
        if (!this.canEditPreparation()) return;
        this.pendingDeviceOperation = { kind: 'purchase', deviceKind: kind, id: this.view.profile.nextDeviceId };
        this.completeDeviceOperation();
    }

    repairDevice(id: number): void {
        if (!this.canEditPreparation()) return;
        this.pendingDeviceOperation = { kind: 'repair', id };
        this.completeDeviceOperation();
    }

    rechargeDevice(id: number): void {
        if (!this.canEditPreparation()) return;
        this.pendingDeviceOperation = { kind: 'recharge', id };
        this.completeDeviceOperation();
    }

    private completeDeviceOperation(): void {
        const operation = this.pendingDeviceOperation;
        if (!operation) return;
        try {
            if (operation.kind === 'purchase') this.saves.purchaseDevice(operation.deviceKind, operation.id);
            else if (operation.kind === 'repair') this.saves.repairDevice(operation.id);
            else if (operation.kind === 'recharge') this.saves.rechargeDevice(operation.id);
            else if (operation.kind === 'placement') this.saves.savePlacements(operation.placements, operation.config);
            this.view.error = null;
            this.refreshProfile();
            this.pendingDeviceOperation = null;
        } catch (error) { this.fail(error); }
    }

    private fail(error: unknown): void {
        this.view.error = `Не удалось сохранить или прочитать прогресс: ${error instanceof Error ? error.message : String(error)}`;
        this.pause();
    }

    private initialize(): void {
        try {
            this.saves.load();
            const active = this.saves.current.activeAttempt;
            if (active) {
                this.saves.settle(active.id, 'interrupted', 0, []);
                this.view.interrupted = true;
            }
            this.view.selectedLensId = this.saves.current.profile.selectedLensId;
            this.refreshProfile();
            this.initialized = true;
            this.view.error = null;
        } catch (error) {
            this.fail(error);
        }
    }

    private canNavigate(): boolean {
        return this.initialized && !this.view.error && (!this.view.result || this.view.result.saved);
    }

    private hasLiveBattle(): boolean {
        return this.view.battle?.outcome === 'playing';
    }

    private clearAttempt(): void {
        this.view.battle = null;
        this.view.result = null;
        this.view.paused = false;
        this.attemptId = null;
        this.attemptConfig = null;
        this.attemptDeviceSnapshot = null;
        this.view.preparation = { inventory: [], selectedType: null, placements: [], preview: null,
            cost: 0, remaining: 0, canStart: false, reason: '' };
        this.accumulator = 0;
        this.commands = [];
    }

    openPreparation(): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen === 'settings') return;
        this.pendingPreparation = true;
        this.completePreparation();
    }

    private selectCampaignContinuation(): void {
        const available = this.catalog.filter(night => !night.optional && this.view.nights.find(item => item.id === night.id)?.available);
        const night = available.find(item => !this.view.profile.wonNightIds.includes(item.id)) ?? available.at(-1);
        if (!night) return;
        this.view.selectedNightId = night.id;
        this.baseConfig = structuredClone(night.config);
        this.view.preparation.selectedType = null;
        this.view.preparation.preview = null;
        this.refreshProfile();
    }

    openGameMenu(): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen !== 'menu') return;
        this.selectCampaignContinuation();
        this.view.screen = 'game-menu';
    }

    continueGame(): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen !== 'game-menu' || !this.view.hasProgress) return;
        this.selectCampaignContinuation();
        this.openPreparation();
    }

    openTrials(): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen !== 'game-menu') return;
        this.view.screen = 'trials';
    }

    startNewGame(confirmedReset = false): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen !== 'game-menu'
            || (this.view.hasProgress && !confirmedReset)) return;
        this.pendingNewGame = {};
        this.completeNewGame();
    }

    private completeNewGame(): void {
        if (!this.pendingNewGame) return;
        try {
            this.saves.resetProfile(this.pendingNewGame);
            this.clearAttempt();
            this.view.selectedLensId = this.saves.current.profile.selectedLensId;
            this.selectedLateMode = 'transition';
            this.refreshProfile();
            this.selectCampaignContinuation();
            this.view.screen = 'preparation';
            this.view.error = null;
            this.pendingNewGame = null;
        } catch (error) { this.fail(error); }
    }

    cancelNewGame(): void {
        if (!this.pendingNewGame || this.view.screen !== 'game-menu' || this.hasLiveBattle()) return;
        try {
            if (this.saves.cancelReset(this.pendingNewGame) === 'completed') {
                this.completeNewGame();
                return;
            }
            this.pendingNewGame = null;
            this.view.error = null;
            this.refreshProfile();
        } catch (error) { this.fail(error); }
    }

    private completePreparation(): void {
        try {
            this.saves.ensureProfile();
            if (this.view.result) this.clearAttempt();
            this.view.screen = 'preparation';
            this.view.error = null;
            this.pendingPreparation = false;
            this.refreshProfile();
        } catch (error) { this.fail(error); }
    }

    openMainMenu(): void {
        if (!this.canNavigate() || this.hasLiveBattle() || this.view.screen === 'settings') return;
        if (this.view.result) this.clearAttempt();
        this.view.screen = 'menu';
        this.refreshProfile();
    }

    openDevelopment(): void {
        if (!this.canNavigate()) return;
        const origin = this.view.screen;
        if (origin !== 'menu' && origin !== 'preparation' && origin !== 'result') return;
        this.developmentOrigin = origin;
        this.view.screen = 'development';
        this.refreshProfile();
    }

    openSettings(): void {
        if (!this.canNavigate() || this.view.screen === 'settings') return;
        if (this.view.screen === 'battle' && !this.view.paused) return;
        this.settingsOrigin = this.view.screen;
        this.view.screen = 'settings';
    }

    back(): void {
        if (this.view.screen === 'settings') {
            this.view.screen = this.settingsOrigin;
            // Returning to battle keeps its existing pause; only resume() may lift it.
        } else if (this.view.screen === 'development' && this.canNavigate()) {
            this.view.screen = this.developmentOrigin;
            this.refreshProfile();
        } else if (this.canNavigate() && this.view.screen === 'game-menu') {
            this.view.screen = 'menu';
        } else if (this.canNavigate() && this.view.screen === 'trials') {
            this.view.screen = 'game-menu';
        }
    }

    abandonNight(destination: 'menu' | 'preparation'): void {
        if (!this.initialized || this.view.error || this.view.screen !== 'battle'
            || !this.view.paused || !this.attemptId || !this.hasLiveBattle()) return;
        this.pendingAbandon = destination;
        this.completeAbandon();
    }

    private completeAbandon(): void {
        if (!this.pendingAbandon || !this.attemptId) return;
        try {
            this.saves.settle(this.attemptId, 'interrupted', 0, []);
            const destination = this.pendingAbandon;
            this.clearAttempt();
            this.view.screen = destination;
            this.view.interrupted = true;
            this.view.error = null;
            this.pendingAbandon = null;
            this.refreshProfile();
        } catch (error) { this.fail(error); }
    }

    private settingsFailure(error: unknown): void {
        this.view.settingsError = `Настройки не подтверждены: ${error instanceof Error ? error.message : String(error)}. Повторите запись или вернитесь к сохранённым настройкам.`;
    }

    private loadSettings(): void {
        try {
            this.settings.load();
            this.view.settings = this.settings.current;
            this.settingsInitialized = true;
            this.view.settingsError = null;
        } catch (error) { this.settingsFailure(error); }
    }

    setLanguage(language: LanguagePreference): void {
        if (this.view.screen !== 'settings' || !this.settingsInitialized || this.view.settingsError
            || !['auto', 'ru', 'en'].includes(language)) return;
        this.pendingSettings = { ...this.settings.current, language };
        this.completeSettings();
    }

    setTextSize(size: TextSize): void {
        if (this.view.screen !== 'settings' || !this.settingsInitialized || this.view.settingsError
            || (size !== 'normal' && size !== 'large')) return;
        this.pendingSettings = { ...this.settings.current, textSize: size };
        this.completeSettings();
    }

    setAudioSettings(patch: Partial<AudioSettings>): void {
        if (this.view.screen !== 'settings' || !this.settingsInitialized || this.view.settingsError) return;
        if (Object.keys(patch).some(key => !['soundEnabled', 'musicVolume', 'effectsVolume'].includes(key))) return;
        if (patch.soundEnabled !== undefined && typeof patch.soundEnabled !== 'boolean') return;
        for (const value of [patch.musicVolume, patch.effectsVolume]) {
            if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100)) return;
        }
        this.pendingSettings = { ...this.settings.current, ...patch };
        this.completeSettings();
    }

    private completeSettings(): void {
        if (!this.pendingSettings) return;
        try {
            this.settings.save(this.pendingSettings);
            this.view.settings = this.settings.current;
            this.pendingSettings = null;
            this.view.settingsError = null;
        } catch (error) { this.settingsFailure(error); }
    }

    retrySettings(): void {
        if (!this.settingsInitialized) this.loadSettings();
        else this.completeSettings();
    }

    cancelSettingsChange(): void {
        try {
            this.settings.cancel();
            this.view.settings = this.settings.current;
            this.pendingSettings = null;
            this.settingsInitialized = true;
            this.view.settingsError = null;
        } catch (error) { this.settingsFailure(error); }
    }

    start(): void {
        if (!this.initialized || this.view.error) return;
        if (this.view.screen === 'result') {
            this.openPreparation();
            return;
        }
        if (this.view.screen !== 'preparation') return;
        this.refreshPreparation();
        if (!this.view.preparation.canStart) return;
        try {
            const identity = this.identity();
            const config = calculateNightConfig(resolveLateNight(this.baseConfig, this.selectedLateMode), this.saves.current.profile.purchasedUpgrades, this.saves.current.profile.legacyEquipment, this.loadout());
            const placements = battleDeviceDeployments(this.saves.current.profile, config.devices.definitions);
            const cost = 0;
            const battle = createBattle(config, identity.seed, undefined, placements);
            this.pendingStart = { identity, config, battle, cost };
            this.completeStart();
        } catch (error) {
            this.fail(error);
        }
    }

    private completeStart(): void {
        if (!this.pendingStart) return;
        const { identity, config, battle, cost } = this.pendingStart;
        try {
            const snapshot = deviceDeployments(this.saves.current.profile);
            this.saves.begin({...identity, placementCost: cost, deviceSnapshot: snapshot, nightId: this.view.selectedNightId, ...(config.lateMode ? {lateMode: config.lateMode} : {}), lensId: config.lens?.id ?? 'basic', ...(config.boss && this.view.selectedNightId === 'abyss-warden' ? {bossLevel:config.boss.level,bossReward:config.boss.materialReward}:{})});
            this.attemptId = identity.id;
            this.attemptConfig = config;
            this.attemptDeviceSnapshot = snapshot;
            this.view.config = config;
            this.view.profile = this.saves.current.profile;
            this.view.hasProgress = true;
            this.view.battle = battle;
            this.view.screen = 'battle';
            this.view.paused = false;
            this.view.interrupted = false;
            this.accumulator = 0;
            this.commands = [];
            this.pendingStart = null;
            this.view.error = null;
        } catch (error) {
            this.fail(error);
        }
    }

    private loadout() { return { lensId:this.view.selectedLensId, upgrades:this.view.profile.lensUpgrades, ...(this.baseConfig.boss && this.baseConfig.id === 'abyss-warden' ? {bossLevel:this.view.profile.bossLevel}:{}) }; }

    selectLens(id: LensId): void {
        if (!this.canNavigate() || !['menu','preparation'].includes(this.view.screen) || this.hasLiveBattle() || !this.view.profile.unlockedLenses.includes(id)) return;
        this.view.selectedLensId = id;
        this.refreshProfile();
    }

    purchaseLens(id: LensId): void {
        if (!this.initialized || this.view.error || this.view.screen !== 'development' || getLensAvailability(this.view.profile,id).status !== 'available') return;
        this.pendingLensPurchase = {kind:'lens',id}; this.completeLensPurchase();
    }

    purchaseLensUpgrade(id: LensUpgradeId): void {
        if (!this.initialized || this.view.error || this.view.screen !== 'development' || getLensUpgradeAvailability(this.view.profile,id).status !== 'available') return;
        this.pendingLensPurchase = {kind:'upgrade',id}; this.completeLensPurchase();
    }

    private completeLensPurchase(): void {
        const pending=this.pendingLensPurchase; if (!pending) return;
        try {
            if (pending.kind === 'lens') this.saves.purchaseLens(pending.id); else this.saves.purchaseLensUpgrade(pending.id);
            this.refreshProfile(); this.pendingLensPurchase=null; this.view.error=null;
        } catch (error) { this.fail(error); }
    }

    purchaseUpgrade(id: UpgradeId): void {
        if (!this.initialized || this.view.error || this.view.screen !== 'development') return;
        if (getUpgradeAvailability(this.view.profile, id).status !== 'available') return;
        this.pendingPurchase = id;
        this.completePurchase();
    }

    private completePurchase(): void {
        if (!this.pendingPurchase) return;
        try {
            this.saves.purchase(this.pendingPurchase);
            this.refreshProfile();
            this.pendingPurchase = null;
            this.view.error = null;
        } catch (error) {
            this.fail(error);
        }
    }

    command(command: BattleCommand): void {
        if (this.view.screen !== 'battle' || this.view.paused || this.view.error) return;
        if (command.type === 'aim') {
            if (!Number.isFinite(command.angle)) return;
            this.commands = this.commands.filter(item => item.type !== 'aim');
        }
        if (command.type === 'callWave' && this.commands.some(item => item.type === 'callWave')) return;
        // A queued targeted cast owns its input snapshot until the next fixed step.
        this.commands.push(command.type === 'use-ability'
            ? { ...command, ...(command.target ? { target: { ...command.target } } : {}) } : command);
    }

    advance(deltaMs: number): void {
        const battle = this.view.battle;
        const config = this.attemptConfig;
        if (this.view.screen !== 'battle' || !battle || !config || this.view.paused || this.view.error) return;
        // Long frame gaps (sleep/background/stall) never become a burst of attacks.
        if (!Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > 250) {
            this.accumulator = 0;
            return;
        }
        this.accumulator += deltaMs / 1000;
        const step = config.stepSeconds;
        while (this.accumulator + 1e-10 >= step && battle.outcome === 'playing') {
            stepBattle(battle, config, this.commands);
            this.commands = [];
            this.accumulator = Math.max(0, this.accumulator - step);
        }
        if (battle.outcome !== 'playing') {
            const victoryReward = battle.outcome === 'victory' ? config.victoryReward : 0;
            const totalResources = battle.earnedResources + battle.earnedBonus + battle.earnedRescue + victoryReward;
            this.view.screen = 'result';
            this.view.result = {
                attemptId: this.attemptId!, outcome: battle.outcome, ...(config.lateMode ? {lateMode: config.lateMode} : {}),
                victoryReward, totalResources,
                resources: battle.earnedResources, bonus: battle.earnedBonus, kills: battle.kills, saved: false, nightId: this.view.selectedNightId, rescue: battle.earnedRescue, bossDefeated: battle.boss?.health === 0, bossMaterials: battle.outcome === 'victory' && this.view.selectedNightId === 'abyss-warden' ? config.boss?.materialReward ?? 0 : 0
            };
            this.finish();
        }
    }

    private finish(): void {
        const result = this.view.result;
        if (!result || !this.view.battle || !this.attemptConfig || !this.attemptDeviceSnapshot) return;
        try {
            const devices = normalizedDeviceResults(this.view.battle.devices, this.attemptDeviceSnapshot, this.attemptConfig.devices.definitions);
            this.saves.settle(result.attemptId, result.outcome, result.totalResources, this.view.battle.encountered, devices);
            this.view.result = {...result, saved: true};
            this.refreshProfile();
            this.view.error = null;
        } catch (error) {
            this.fail(error);
        }
    }

    pause(): void {
        if (this.hasLiveBattle()) this.view.paused = true;
        this.accumulator = 0;
        this.commands = [];
    }

    resume(): void {
        if (this.view.error || this.view.screen !== 'battle') return;
        this.accumulator = 0;
        this.commands = [];
        this.view.paused = false;
    }

    retrySave(): void {
        if (!this.initialized) this.initialize();
        else if (this.pendingNewGame) this.completeNewGame();
        else if (this.pendingPreparation) this.completePreparation();
        else if (this.pendingAbandon) this.completeAbandon();
        else if (this.view.result && !this.view.result.saved) this.finish();
        else if (this.pendingPurchase) this.completePurchase();
        else if (this.pendingLensPurchase) this.completeLensPurchase();
        else if (this.pendingDeviceOperation) this.completeDeviceOperation();
        else if (this.pendingStart) this.completeStart();
        else {
            this.view.error = null;
        }
    }
}


