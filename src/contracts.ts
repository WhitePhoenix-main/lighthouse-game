/** Shared contracts. Only the lead edits this file. All balance is provisional. */
export type EnemyKind = 'ghost' | 'turtle' | 'minotaur' | 'bat';
export type NightId = 'first-light' | 'broken-shore' | 'winged-tide' | 'rescue-trial' | 'abyss-warden' | 'far-shore';
export type BossId = 'abyss-warden';
export type LensId = 'basic' | 'expanded' | 'slowing' | 'armor-breaker' | 'focused' | 'smoldering' | 'resonant' | 'long-range';
export type LensUpgradeId = 'expanded-width' | 'expanded-targets' | 'slowing-control' | 'slowing-power' | 'armor-breaker-armor' | 'armor-breaker-power'
    | 'basic-power-1' | 'basic-power-2' | 'basic-width' | 'basic-range' | 'basic-paired'
    | 'focused-power' | 'focused-range' | 'focused-hold-1' | 'focused-hold-2'
    | 'smoldering-power' | 'smoldering-burn-1' | 'smoldering-duration' | 'smoldering-burn-2'
    | 'resonant-power' | 'resonant-width' | 'resonant-bonus-1' | 'resonant-bonus-2'
    | 'long-range-power-1' | 'long-range-power-2' | 'long-range-width-1' | 'long-range-width-2'
    | 'expanded-power-1' | 'expanded-power-2' | 'slowing-range' | 'slowing-power-2' | 'armor-breaker-width' | 'armor-breaker-power-2';
export interface BurnState { remainingTicks: number }
/** Independent sources preserve a weaker slow after a stronger pulse expires. */
export interface BellSlow { sourceId: number; untilTick: number; multiplier: number }
export interface BossRules {
    id: BossId; name: string; level: number; health: number; materialReward: number;
    tentacleCount: number; spawnRadius: number; radius: number; speed: number;
    attackDamage: number; attackInterval: number; litSpeedMultiplier: number;
}
export interface TentacleState {
    id: number; x: number; y: number; attackCooldown: number;
    bellSlows?: BellSlow[];
}
export interface BossState {
    id: BossId; health: number; stunnedUntilTick: number; tentacles: TentacleState[];
    burn?: BurnState;
}
export interface LensDefinition {
    id: LensId; name: string; description: string; materialCost: number;
    damageMultiplier: number; widthMultiplier: number; rangeMultiplier: number;
    maxTargets: number; slowMultiplier: number; armorMultiplier: number;
    focus?: { seconds: number; damageBonus: number };
    burn?: { seconds: number; damagePerSecond: number };
    resonance?: { seconds: number; damageBonus: number };
}
export interface LensUpgradeDefinition {
    id: LensUpgradeId; lensId: LensId; name: string; description: string;
    cost: number; materialCost: number; requires: readonly LensUpgradeId[];
    effect: { stat: BeamStat | 'maxTargets' | 'slowMultiplier' | 'armorMultiplier' | 'pairedDamageBonus' | 'focusDamageBonus' | 'burnDamagePerSecond' | 'burnDuration' | 'resonanceDamageBonus'; amount: number };
}
export interface LensUpgradeView extends UpgradeAvailability {
    definition: LensUpgradeDefinition;
}
export interface LensOptionView {
    definition: LensDefinition; unlocked: boolean; selected: boolean;
    canPurchase: boolean; reason: string; upgrades: readonly LensUpgradeView[];
}
export type Outcome = 'playing' | 'victory' | 'defeat';

export type DeviceKind = 'cannon' | 'barrier' | 'generator' | 'light-trap' | 'harpoon' | 'mortar' | 'bell' | 'repair-lamp';
export type CannonPriority = 'nearest' | 'strongest' | 'weakest';
export interface DeviceDefinition {
    id: DeviceKind;
    name: string;
    description: string;
    cost: number;
    radius: number;
    health: number;
    range: number;
    damage: number;
    attackInterval: number;
}
export interface DeviceRules {
    definitions: Readonly<Record<DeviceKind, DeviceDefinition>>;
    typeSlots: number;
    maxObjects: number;
    perType: Readonly<Record<DeviceKind, number>>;
    placementRadius: number;
    cannon: { manualDamageBonus: number; armorMultiplier: number };
    barrier: { incomingDamageMultiplier: number; chargeDamageMultiplier: number; breakSlowMultiplier: number; breakSlowSeconds: number; breakSlowRadius: number; repairCostMultiplier: number };
    generator: { incomingDamageMultiplier: number; lastStandEnabled: boolean; residualSeconds: number };
    harpoon: { slowMultiplier: number; slowSeconds: number; flyingDamageMultiplier: number };
    trap: { triggerRadius: number; blastRadius: number; damage: number; armorMultiplier: number; charges: number; rearmSeconds: number };
    mortar: { blastRadius: number; projectileSpeed: number; armorMultiplier: number };
    bell: { duration: number; slowMultiplier: number; firstPulseSlowMultiplier: number; incomingDamageMultiplier: number };
    repairLamp: { healAmount: number; charges: number; incomingDamageMultiplier: number; emergencyEnabled: boolean; emergencyMultiplier: number; emergencyThreshold: number };
}
export interface MortarProjectile {
    id: number; deviceId: number; fromX: number; fromY: number; x: number; y: number;
    launchTick: number; impactTick: number; damage: number; blastRadius: number; armorMultiplier: number;
}
export interface DevicePlacement { id: number; kind: DeviceKind; x: number; y: number }
/** Persistent v6 ownership: health uses base-max HP units; a null position means reserve. */
export interface OwnedDevice {
    id: number; kind: DeviceKind; health: number; consumed: boolean;
    /** Required for traps in v6 saves; absent on other device kinds. */
    trapCharges?: number;
    position: { x: number; y: number } | null;
}
export interface DeviceDeployment extends DevicePlacement { health: number; consumed: boolean; trapCharges?: number }
export interface OwnedDeviceView extends OwnedDevice {
    maxHealth: number; repairCost: number; rechargeCost: number;
}
export interface DeviceState extends DevicePlacement {
    /** Actual HP after hull upgrades; never persist directly as OwnedDevice.health. */
    health: number;
    attackCooldown: number;
    lastShot: { tick: number; x: number; y: number } | null;
    priority: CannonPriority;
    targetId: number | null;
    consumed: boolean;
    /** Attempt-local pulse count, never persisted in the owned body. */
    bellPulses?: number;
    /** Attempt-only ceiling: combat repair cannot remove pre-existing damage. */
    startHealth?: number;
    repairCharges?: number;
    emergencyRepairUsed?: boolean;
    /** Attempt-only targets already granted the manual opening-shot bonus; boss uses one owner key. */
    manualBonusTargets?: number[];
    lastStandUsed?: boolean;
    residualUntilTick?: number;
    trapCharges?: number;
    trapReadyTick?: number;
}
export interface PlacementCheck { valid: boolean; reason: string }
export interface PreparationView {
    inventory: readonly OwnedDeviceView[];
    selectedType: DeviceKind | null;
    placements: readonly DevicePlacement[];
    preview: (PlacementCheck & { x: number; y: number }) | null;
    cost: number;
    remaining: number;
    canStart: boolean;
    reason: string;
}

export interface EnemyDefinition {
    id: EnemyKind;
    name: string;
    description: string;
    radius: number;
    health: number;
    armor: number;
    speed: number;
    attackDamage: number;
    attackInterval: number;
    reward: number;
    movement?: 'ground' | 'flying' | 'ethereal';
    spawnSide?: 'land' | 'both';
    charge?: { windup: number; speed: number; damageMultiplier: number; triggerDistance: number };
}

export interface WaveDefinition {
    id: string;
    enemies: readonly EnemyKind[];
    spawnInterval: number;
}

export interface NightConfig {
    id: string;
    rulesVersion: string;
    stepSeconds: number;
    worldRadius: number;
    spawnRadius: number;
    lighthouseRadius: number;
    lighthouseHealth: number;
    beam: { range: number; halfAngle: number; damagePerSecond: number; maxTargets: number; turnSpeed: number };
    /** Bonus fraction only while at least two hostile zones are actually lit. */
    pairedDamageBonus?: number;
    waveInterval: number;
    earlyBonusPerSecond: number;
    /** Shards awarded for each full victory, in addition to earned combat rewards. */
    victoryReward: number;
    enemies: Readonly<Record<EnemyKind, EnemyDefinition>>;
    waves: readonly WaveDefinition[];
    devices: DeviceRules;
    shield: { radius: number; capacityPerGenerator: number; regenerationDelay: number; regenerationPerSecond: number };
    flash: { radius: number; damage: number; stunDuration: number; cooldown: number; enabled?: boolean };
    /** Absent only in legacy/synthetic combat configurations. Land is x <= shoreX. */
    terrain?: { shoreX: number; landOnlyPlacement: boolean };
    /** Absent means unrestricted equipment for legacy combat fixtures. */
    availableDevices?: readonly DeviceKind[];
    ship?: { x: number; y: number; radius: number; rescueSeconds: number; deadline: number; reward: number };
    boss?: BossRules;
    lens?: { id: LensId; slowMultiplier: number; armorMultiplier: number; focus?: { seconds: number; damageBonus: number }; burn?: { seconds: number; damagePerSecond: number }; resonance?: { seconds: number; damageBonus: number } };
}

export interface NightDefinition {
    id: NightId; name: string; description: string; chapter: string;
    requires: NightId | null; optional: boolean; config: NightConfig;
}
export interface NightOptionView {
    id: NightId; name: string; description: string; chapter: string;
    optional: boolean; available: boolean; completed: boolean; reason: string;
    bossLevel?: number; materialReward?: number;
}
export interface ShipState {
    x: number; y: number; radius: number; progress: number; remaining: number;
    status: 'waiting' | 'rescued' | 'lost'; lit: boolean;
}

export interface RandomSource {
    next(): number;
}

export interface EnemyState {
    id: number;
    kind: EnemyKind;
    waveIndex: number;
    x: number;
    y: number;
    health: number;
    armor: number;
    attackCooldown: number;
    /** Optional for external fixtures; absent means not stunned. Simulation uses ticks. */
    stunnedUntilTick?: number;
    chargePhase?: 'ready' | 'windup' | 'charging' | 'spent';
    chargeRemaining?: number;
    targetDeviceId?: number | null;
    burn?: BurnState;
    bellSlows?: BellSlow[];
}

export interface WaveState {
    started: boolean;
    startedEarly: boolean;
    spawned: number;
    defeated: number;
    completed: boolean;
    nextSpawnAt: number;
    earlyBonus: number;
}

/** Facts emitted after actual state changes, never inferred from beam decoration. */
export type CombatEventData = { x: number; y: number } & (
    | { type: 'enemy-hit'; enemyId: number; enemyKind: EnemyKind; healthDamage: number; armorDamage: number }
    | { type: 'armor-broken' | 'enemy-died'; enemyId: number; enemyKind: EnemyKind }
    | { type: 'device-hit' | 'device-destroyed'; deviceId: number; deviceKind: DeviceKind; damage: number }
    | { type: 'lighthouse-hit'; damage: number }
    | { type: 'wave-started' | 'wave-completed'; waveIndex: number; bonus: number; early: boolean }
    | { type: 'shield-hit'; damage: number }
    | { type: 'shield-broken' | 'shield-restored' | 'flash-used' }
    | { type: 'trap-triggered'; deviceId: number }
    | { type: 'mortar-impact'; deviceId: number; radius: number }
    | { type: 'bell-pulse'; deviceId: number; radius: number; multiplier: number }
    | { type: 'barrier-slow'; deviceId: number; radius: number; multiplier: number }
    | { type: 'generator-saved'; deviceId: number }
    | { type: 'generator-residual'; deviceId: number; untilTick: number }
    | { type: 'device-repaired'; deviceId: number; sourceId: number; amount: number; emergency: boolean }
    | { type: 'charge-started' | 'charge-impact'; enemyId: number; enemyKind: EnemyKind }
    | { type: 'ship-rescued' | 'ship-lost' }
    | { type: 'boss-hit'; healthDamage: number }
    | { type: 'boss-died' | 'boss-stunned' }
);
export type CombatEvent = CombatEventData & { id: number; tick: number };

export interface BattleState {
    /** Bounded chronological history (256 facts); presentation ages it by simulation ticks. */
    events: CombatEvent[];
    nextEventId: number;
    tick: number;
    elapsed: number;
    outcome: Outcome;
    seed: number;
    rngState: number;
    lighthouseHealth: number;
    beamAngle: number;
    /** Desired direction; actual beamAngle moves toward it at beam.turnSpeed radians/s. */
    desiredBeamAngle: number;
    /** Continuous illumination of one hostile zone, measured in simulation steps. */
    focus: { targetId: number | null; ticks: number };
    /** Continuous steps with at least two actually selected hostile hit zones. */
    resonance: { ticks: number };
    enemies: EnemyState[];
    devices: DeviceState[];
    mortarProjectiles: MortarProjectile[];
    nextProjectileId: number;
    shield: { current: number; maximum: number; recoveryRemaining: number };
    flash: { cooldownRemaining: number; lastUsedTick: number | null };
    ship: ShipState | null;
    earnedRescue: number;
    boss: BossState | null;
    litTentacleIds: number[];
    blockedTentacleIds: number[];
    waves: WaveState[];
    nextWaveAt: number;
    nextEnemyId: number;
    litEnemyIds: number[];
    blockedEnemyIds: number[];
    earnedResources: number;
    earnedBonus: number;
    kills: number;
    encountered: EnemyKind[];
}

export type BattleCommand = { type: 'aim'; angle: number } | { type: 'callWave' } | { type: 'flash' }
    | { type: 'cannon-priority'; deviceId: number; priority: CannonPriority }
    | { type: 'cannon-target'; deviceId: number; enemyId: number | null };

export type UpgradeId = 'beam-power-1' | 'beam-power-2' | 'beam-width-1' | 'beam-width-2' | 'beam-range-1' | 'beam-range-2'
    | 'unlock-cannon' | 'unlock-barrier' | 'unlock-generator' | 'unlock-trap' | 'unlock-flash'
    | 'device-slots-3' | 'device-slots-4' | 'paired-light'
    | 'beam-turn-1' | 'beam-turn-2' | 'lighthouse-health-1' | 'lighthouse-health-2'
    | 'shield-capacity-1' | 'shield-regeneration-1' | 'flash-damage-1' | 'flash-cooldown-1'
    | 'cannon-damage-1' | 'cannon-speed-1' | 'cannon-range-1'
    | 'unlock-harpoon' | 'harpoon-damage-1' | 'harpoon-speed-1' | 'harpoon-range-1'
    | 'unlock-mortar' | 'mortar-damage-1' | 'mortar-damage-2' | 'mortar-radius-1' | 'mortar-radius-2'
    | 'mortar-projectile-speed' | 'mortar-reload' | 'mortar-armor'
    | 'unlock-bell' | 'bell-radius-1' | 'bell-radius-2' | 'bell-duration-1' | 'bell-duration-2'
    | 'bell-reload' | 'bell-guard' | 'bell-first-pulse'
    | 'unlock-repair-lamp' | 'repair-amount-1' | 'repair-amount-2' | 'repair-range'
    | 'repair-charges-1' | 'repair-charges-2' | 'repair-guard' | 'repair-emergency'
    | 'cannon-damage-2' | 'cannon-speed-2' | 'cannon-first-shot' | 'cannon-armor'
    | 'barrier-health-1' | 'barrier-health-2' | 'barrier-health-3' | 'barrier-guard' | 'barrier-charge-guard' | 'barrier-break-slow' | 'barrier-repair'
    | 'generator-health-1' | 'generator-health-2' | 'generator-health-3' | 'generator-guard-1' | 'generator-guard-2' | 'generator-residual' | 'generator-last-stand'
    | 'harpoon-damage-2' | 'harpoon-speed-2' | 'harpoon-slow' | 'harpoon-flying'
    | 'trap-damage-1' | 'trap-damage-2' | 'trap-radius-1' | 'trap-radius-2' | 'trap-health' | 'trap-armor' | 'trap-second-charge';
export type BeamStat = 'damagePerSecond' | 'halfAngle' | 'range';
export type UpgradeStat = BeamStat | DeviceKind | 'flash' | 'typeSlots' | 'pairedDamageBonus'
    | 'turnSpeed' | 'lighthouseHealth' | 'shieldCapacity' | 'shieldRegeneration' | 'flashDamage' | 'flashCooldownReduction'
    | 'cannonDamage' | 'cannonIntervalReduction' | 'cannonRange' | 'harpoonDamage' | 'harpoonIntervalReduction' | 'harpoonRange'
    | 'mortarDamage' | 'mortarBlastRadius' | 'mortarProjectileSpeed' | 'mortarIntervalReduction' | 'mortarArmorMultiplier'
    | 'bellRadius' | 'bellDuration' | 'bellIntervalReduction' | 'bellDamageReduction' | 'bellFirstPulseReduction'
    | 'repairAmount' | 'repairRange' | 'repairCharges' | 'repairDamageReduction' | 'repairEmergency'
    | 'cannonManualBonus' | 'cannonArmorMultiplier' | 'barrierHealth' | 'barrierDamageReduction' | 'barrierChargeReduction'
    | 'barrierBreakSlowReduction' | 'barrierRepairReduction' | 'generatorHealth' | 'generatorDamageReduction' | 'generatorResidualSeconds' | 'generatorLastStand'
    | 'harpoonSlowReduction' | 'harpoonFlyingMultiplier' | 'trapDamage' | 'trapRadius' | 'trapHealth' | 'trapArmorMultiplier' | 'trapCharges';
export interface UpgradeDefinition {
    id: UpgradeId;
    name: string;
    branch: 'power' | 'width' | 'range' | 'devices' | 'defense' | 'synergy';
    tier: number;
    cost: number;
    requires: readonly UpgradeId[];
    effect: { stat: UpgradeStat; amount: number };
    requiresNight?: NightId;
}
export type UpgradeStatus = 'purchased' | 'available' | 'requires' | 'insufficient';
export interface UpgradeAvailability { status: UpgradeStatus; reason: string }
export interface UpgradeNodeView extends UpgradeAvailability {
    definition: UpgradeDefinition;
    currentValue: number;
    nextValue: number;
}

export interface Profile {
    devices: OwnedDevice[];
    nextDeviceId: number;
    resources: number;
    completedNights: number;
    encountered: EnemyKind[];
    purchasedUpgrades: UpgradeId[];
    wonNightIds: NightId[];
    legacyEquipment: boolean;
    bossMaterials: number;
    bossLevel: number;
    unlockedLenses: LensId[];
    lensUpgrades: LensUpgradeId[];
    selectedLensId: LensId;
}

export interface AttemptRecord {
    /** Base-normalized HP (unchanged since v5), matching OwnedDevice exactly; not combat HP. */
    deviceSnapshot?: DeviceDeployment[];
    /** Only migrated, already paid attempts may retain a rental refund. */
    legacyRental?: true;
    id: string;
    seed: number;
    placementCost: number;
    nightId?: NightId;
    lensId?: LensId;
    bossLevel?: number;
    bossReward?: number;
}

export interface SettledAttempt {
    id: string;
    outcome: 'victory' | 'defeat' | 'interrupted';
    reward: number;
}

export interface SaveData {
    version: 6;
    profile: Profile;
    activeAttempt: AttemptRecord | null;
    lastSettled: SettledAttempt | null;
}

export interface SaveStore {
    read(): string | null;

    write(value: string): void;
}

export interface NightResult {
    attemptId: string;
    outcome: 'victory' | 'defeat';
    resources: number;
    victoryReward: number;
    /** Complete shard payout computed by application, including every reward source. */
    totalResources: number;
    bonus: number;
    kills: number;
    saved: boolean;
    nightId: NightId;
    rescue: number;
    bossMaterials: number;
    bossDefeated: boolean;
}

export type ApplicationScreen = 'menu' | 'development' | 'settings' | 'preparation' | 'battle' | 'result';
export type TextSize = 'normal' | 'large';
export type LanguagePreference = 'auto' | 'ru' | 'en';
export interface AudioSettings { soundEnabled: boolean; musicVolume: number; effectsVolume: number }
export interface UserSettings extends AudioSettings { textSize: TextSize; language: LanguagePreference }

export interface ApplicationView {
    screen: ApplicationScreen;
    hasProgress: boolean;
    settings: Readonly<UserSettings>;
    settingsError: string | null;
    profile: Readonly<Profile>;
    battle: Readonly<BattleState> | null;
    paused: boolean;
    error: string | null;
    interrupted: boolean;
    result: Readonly<NightResult> | null;
    config: NightConfig;
    upgrades: readonly UpgradeNodeView[];
    preparation: PreparationView;
    nights: readonly NightOptionView[];
    selectedNightId: NightId;
    selectedLensId: LensId;
    lenses: readonly LensOptionView[];
}

export interface GameApplication {
    readonly view: ApplicationView;

    start(): void;

    openPreparation(): void;
    openMainMenu(): void;
    openDevelopment(): void;
    openSettings(): void;
    back(): void;
    /** UI asks for explicit confirmation before sending this command. Only from paused battle. */
    abandonNight(destination: 'menu' | 'preparation'): void;
    setLanguage(language: LanguagePreference): void;
    setTextSize(size: TextSize): void;
    setAudioSettings(patch: Partial<AudioSettings>): void;
    retrySettings(): void;
    cancelSettingsChange(): void;

    purchaseUpgrade(id: UpgradeId): void;

    selectDevice(kind: DeviceKind | null): void;
    purchaseDevice(kind: DeviceKind): void;
    repairDevice(id: number): void;
    rechargeDevice(id: number): void;
    selectNight(id: NightId): void;
    selectLens(id: LensId): void;
    purchaseLens(id: LensId): void;
    purchaseLensUpgrade(id: LensUpgradeId): void;
    previewPlacement(x: number, y: number): PlacementCheck;
    placeDevice(x: number, y: number): void;
    removeDevice(id: number): void;
    clearPlacements(): void;

    command(command: BattleCommand): void;

    advance(deltaMs: number): void;

    pause(): void;

    resume(): void;

    retrySave(): void;
}
