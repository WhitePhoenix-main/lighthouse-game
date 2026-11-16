import { isLateNight } from '../content/lateModes';
import type { AttemptRecord, DeviceDeployment, DeviceKind, DevicePlacement, NightConfig, OwnedDevice, Profile, EnemyKind, NightId, LateNightMode, LensId, LensUpgradeId, SaveData, SaveStore, SettledAttempt, UpgradeId } from '../contracts';
import { DEVICE_RULES } from '../content/devices';
import { DEVICE_KINDS, deviceDeployments, rechargeCost, repairCost, remainingTrapCharges, trapChargeCapacity, unlockedDeviceKinds } from '../progression/devices';
import { checkDraft } from './placement';
import { UPGRADES } from '../content/upgrades';
import { NIGHT_CATALOG, NIGHT_IDS } from '../content/nights';
import { getBossRules } from '../content/boss';
import { LENSES, LENS_UPGRADES } from '../content/lenses';
import { getLensAvailability, getLensUpgradeAvailability, validateLensOwnership } from '../progression/lenses';
import { getUpgradeAvailability, validatePurchasedUpgrades } from '../progression/upgrades';
const legacyKinds = ['ghost', 'turtle'];
const kinds = [...legacyKinds, 'minotaur', 'bat'];
const oldNightIds = ['first-light', 'broken-shore', 'winged-tide', 'rescue-trial'];
const legacyUpgrades = UPGRADES.slice(0, 6).map(node => node.id as string);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const uniqueStrings = (value: unknown, allowed: readonly string[]): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && allowed.includes(item)) && new Set(value).size === value.length;

function addDevice(profile: Profile, kind: DeviceKind): void {
    if (!Number.isSafeInteger(profile.nextDeviceId + 1)) throw new Error('Исчерпаны идентификаторы устройств.');
    profile.devices.push({ id: profile.nextDeviceId++, kind, health: DEVICE_RULES.definitions[kind].health, consumed: false, position: null,
        ...(kind === 'light-trap' ? { trapCharges: trapChargeCapacity(profile.purchasedUpgrades) } : {}) });
}
function validCondition(device: Record<string, unknown>, purchased: readonly UpgradeId[]): boolean {
    if (!DEVICE_KINDS.includes(device.kind as DeviceKind)) return false;
    const maxHealth = DEVICE_RULES.definitions[device.kind as DeviceKind].health;
    return natural(device.id) && device.id > 0 && typeof device.health === 'number' && Number.isFinite(device.health)
        && device.health >= 0 && device.health <= maxHealth && typeof device.consumed === 'boolean'
        && (device.kind === 'light-trap'
            ? natural(device.trapCharges) && device.trapCharges <= trapChargeCapacity(purchased) && device.consumed === (device.trapCharges === 0)
            : device.consumed === false && !('trapCharges' in device));
}
const validPosition = (value: unknown): boolean => record(value) && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y);
function validateDevices(devices: unknown, nextId: unknown, profile: Profile): void {
    if (!Array.isArray(devices) || !natural(nextId) || nextId < 1) throw new Error('Повреждён инвентарь.');
    const ids = new Set<number>(), unlocked = unlockedDeviceKinds(profile);
    for (const device of devices) {
        if (!record(device) || !validCondition(device, profile.purchasedUpgrades) || !unlocked.includes(device.kind as DeviceKind)
            || (device.position !== null && !validPosition(device.position))
            || ids.has(device.id as number) || (device.id as number) >= nextId) throw new Error('Повреждён экземпляр устройства.');
        ids.add(device.id as number);
    }
    if (unlocked.some(kind => !devices.some(device => device.kind === kind))) throw new Error('Отсутствует первый открытый экземпляр.');
}
function sameDeployments(left: readonly DeviceDeployment[], right: readonly DeviceDeployment[]): boolean {
    return left.length === right.length && left.every(a => right.some(b => a.id === b.id && a.kind === b.kind
        && a.x === b.x && a.y === b.y && a.health === b.health && a.consumed === b.consumed && a.trapCharges === b.trapCharges));
}
function validateDeployments(value: unknown, purchased: readonly UpgradeId[]): asserts value is DeviceDeployment[] {
    if (!Array.isArray(value)) throw new Error('Отсутствует снимок устройств.');
    const ids = new Set<number>();
    for (const device of value) {
        if (!record(device) || !validCondition(device, purchased) || !validPosition(device) || ids.has(device.id as number))
            throw new Error('Повреждён снимок устройств.');
        ids.add(device.id as number);
    }
}
function validateSnapshot(value: unknown, profile: Profile): void {
    validateDeployments(value, profile.purchasedUpgrades);
    if (!sameDeployments(value, deviceDeployments(profile))) throw new Error('Снимок не совпадает с сохранённой расстановкой.');
}
function validateResult(result: unknown, snapshot: readonly DeviceDeployment[], purchased: readonly UpgradeId[]): asserts result is readonly DeviceDeployment[] {
    validateDeployments(result, purchased);
    if (result.length !== snapshot.length || result.some(device => {
        const initial = snapshot.find(item => item.id === device.id);
        return !initial || initial.kind !== device.kind || initial.x !== device.x || initial.y !== device.y
            || device.health > initial.health || (initial.consumed && !device.consumed)
            || (device.kind === 'light-trap' && remainingTrapCharges(device) > remainingTrapCharges(initial));
    })) throw new Error('Итог устройств не соответствует стартовому снимку.');
}
export function emptySave(): SaveData {
    return { version: 6, profile: { devices: [], nextDeviceId: 1, resources: 0, completedNights: 0, encountered: [], purchasedUpgrades: [], wonNightIds: [], legacyEquipment: false, bossMaterials: 0, bossLevel: 1, unlockedLenses: ['basic'], lensUpgrades: [], selectedLensId: 'basic' }, activeAttempt: null, lastSettled: null };
}
export function decodeSave(raw: string): SaveData {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || ![1, 2, 3, 4, 5, 6].includes(value.version as number))
        throw new Error('Неизвестная версия сохранения. Файл не изменён.');
    const legacy = value.version === 1 || value.version === 2, persistent = value.version === 5 || value.version === 6, modern = value.version === 4 || persistent, profile = value.profile;
    if (!record(profile) || !natural(profile.resources) || !natural(profile.completedNights) || !uniqueStrings(profile.encountered, legacy ? legacyKinds : kinds))
        throw new Error('Повреждён профиль.');
    if (!persistent && (['devices', 'nextDeviceId'].some(key => key in profile) ||
        (record(value.activeAttempt) && ('deviceSnapshot' in value.activeAttempt || 'legacyRental' in value.activeAttempt))))
        throw new Error('Поля v5 в старом сохранении.');
    if (!modern && ['bossMaterials', 'bossLevel', 'unlockedLenses', 'lensUpgrades', 'selectedLensId'].some(key => key in profile))
        throw new Error('Поля новой схемы в старом профиле.');
    if (!legacy && (!uniqueStrings(profile.wonNightIds, modern ? NIGHT_IDS : oldNightIds) || typeof profile.legacyEquipment !== 'boolean'))
        throw new Error('Повреждены открытия профиля.');
    if (legacy && ('wonNightIds' in profile || 'legacyEquipment' in profile))
        throw new Error('Поля новой схемы в старом профиле.');
    const active = value.activeAttempt, settled = value.lastSettled;
    if (active !== null && (!record(active) || !identifier(active.id) || !natural(active.seed) || active.seed > 0xffffffff || !natural(active.placementCost) || (!legacy && (typeof active.nightId !== 'string' || !(modern ? NIGHT_IDS : oldNightIds).includes(active.nightId as never)))))
        throw new Error('Повреждена запись попытки.');
    if (record(active) && active.lateMode !== undefined && (!['transition', 'assault'].includes(active.lateMode as string) || !isLateNight(active.nightId as NightId)))
        throw new Error('Неверный режим поздней ночи.');
    if (!modern && record(active) && (['lensId', 'bossLevel', 'bossReward'].some(key => key in active) || (legacy && 'nightId' in active)))
        throw new Error('Поля новой схемы в старой попытке.');
    if (settled !== null && (!record(settled) || !identifier(settled.id) || !natural(settled.reward) || typeof settled.outcome !== 'string' || !['victory', 'defeat', 'interrupted'].includes(settled.outcome)))
        throw new Error('Повреждён итог попытки.');
    if (record(active) && record(settled) && active.id === settled.id)
        throw new Error('Несогласованная запись попытки.');
    const purchased = value.version === 1 ? [] : profile.purchasedUpgrades;
    if (!Array.isArray(purchased) || !purchased.every(id => typeof id === 'string' && (!legacy || legacyUpgrades.includes(id))))
        throw new Error('Повреждено дерево улучшений.');
    validatePurchasedUpgrades(purchased, legacy || profile.legacyEquipment === true);
    const wonNightIds = (legacy ? profile.completedNights > 0 ? ['first-light'] : [] : profile.wonNightIds) as NightId[];
    for (const id of wonNightIds) {
        const prerequisite = NIGHT_CATALOG.find(n => n.id === id)!.requires;
        if (prerequisite && !wonNightIds.includes(prerequisite))
            throw new Error('Нарушен порядок открытия ночей.');
    }
    if (record(active) && !legacy) {
        const prerequisite = NIGHT_CATALOG.find(n => n.id === active.nightId)!.requires;
        if (prerequisite && !wonNightIds.includes(prerequisite))
            throw new Error('Активная ночь ещё не открыта.');
    }
    if (!legacy && purchased.some(id => { const night = UPGRADES.find(n => n.id === id)?.requiresNight; return night && !wonNightIds.includes(night); }))
        throw new Error('Нарушены условия открытия улучшения.');
    const next = emptySave();
    Object.assign(next.profile, { resources: profile.resources, completedNights: profile.completedNights, encountered: [...profile.encountered] as EnemyKind[], purchasedUpgrades: [...purchased], wonNightIds: [...wonNightIds], legacyEquipment: legacy || profile.legacyEquipment === true });
    if (modern) {
        if (!natural(profile.bossMaterials) || !natural(profile.bossLevel) || profile.bossLevel < 1 || profile.bossLevel > 3 || !uniqueStrings(profile.unlockedLenses, LENSES.map(l => l.id)) || !uniqueStrings(profile.lensUpgrades, LENS_UPGRADES.map(l => l.id)) || typeof profile.selectedLensId !== 'string')
            throw new Error('Повреждены материалы или линзы.');
        validateLensOwnership(profile.unlockedLenses, profile.lensUpgrades, profile.selectedLensId);
        if (wonNightIds.includes('abyss-warden') !== (profile.bossLevel >= 2))
            throw new Error('Уровень босса не соответствует победам.');
        Object.assign(next.profile, { bossMaterials: profile.bossMaterials, bossLevel: profile.bossLevel, unlockedLenses: [...profile.unlockedLenses], lensUpgrades: [...profile.lensUpgrades], selectedLensId: profile.selectedLensId });
    }
    if (value.version === 5) {
        // Migrate the one old charge exactly; capacity does not refill ammunition.
        const migrateCharges = (devices: unknown): void => {
            if (!Array.isArray(devices)) return;
            for (const device of devices) {
                if (!record(device)) continue;
                if ('trapCharges' in device) throw new Error('Поля v6 в старом сохранении.');
                if (device.kind === 'light-trap' && typeof device.consumed === 'boolean')
                    device.trapCharges = device.consumed ? 0 : 1;
            }
        };
        migrateCharges(profile.devices);
        if (record(active)) migrateCharges(active.deviceSnapshot);
    }
    if (persistent) {
        validateDevices(profile.devices, profile.nextDeviceId, next.profile);
        next.profile.devices = structuredClone(profile.devices as OwnedDevice[]);
        next.profile.nextDeviceId = profile.nextDeviceId as number;
    } else {
        for (const kind of unlockedDeviceKinds(next.profile)) addDevice(next.profile, kind);
        for (const device of next.profile.devices) if (device.kind === 'light-trap') device.trapCharges = 1;
    }
    if (record(active)) {
        const lensId = modern ? (active.lensId ?? 'basic') : 'basic';
        if (typeof lensId !== 'string' || !next.profile.unlockedLenses.includes(lensId as LensId))
            throw new Error('Линза попытки не открыта.');
        if (modern && active.nightId === 'abyss-warden') {
            if (!natural(active.bossLevel) || active.bossLevel < 1 || active.bossLevel > 3 || active.bossReward !== getBossRules(active.bossLevel).materialReward)
                throw new Error('Повреждены правила босса попытки.');
        }
        else if ('bossLevel' in active || 'bossReward' in active)
            throw new Error('Босс в обычной ночи.');
        next.activeAttempt = { id: active.id as string, seed: active.seed as number, placementCost: active.placementCost as number, nightId: legacy ? 'first-light' : active.nightId as NightId, lensId: lensId as LensId, ...(active.lateMode !== undefined ? {lateMode: active.lateMode as LateNightMode} : {}), ...(active.bossLevel !== undefined ? { bossLevel: active.bossLevel as number, bossReward: active.bossReward as number } : {}) };
    }
    if (next.activeAttempt) {
        if (!persistent) next.activeAttempt.legacyRental = true;
        else if (record(active)) {
            if ('legacyRental' in active && active.legacyRental !== true) throw new Error('Повреждена аренда попытки.');
            if (active.legacyRental === true) {
                if ('deviceSnapshot' in active) throw new Error('Снимок в старой арендной попытке.');
                next.activeAttempt.legacyRental = true;
            } else {
                if (active.placementCost !== 0) throw new Error('Повторная расстановка бесплатна.');
                validateSnapshot(active.deviceSnapshot, next.profile);
                next.activeAttempt.deviceSnapshot = structuredClone(active.deviceSnapshot as DeviceDeployment[]);
            }
        }
    }
    next.lastSettled = settled === null ? null : { ...settled } as unknown as SettledAttempt;
    return next;
}
export class SaveRepository {
    private readonly completedResets = new WeakSet<object>();
    private readonly cancelledResets = new WeakSet<object>();
    private raw: string | null = null;
    private data: SaveData = emptySave();
    private pending: {
        raw: string;
        data: SaveData;
        resetOperation?: object;
    } | null = null;
    constructor(private readonly store: SaveStore) { }
    get current(): SaveData { return structuredClone(this.data); }
    get hasProfile(): boolean { return this.raw !== null; }
    // A caller retains this identity across retries, including writes whose acknowledgement failed.
    resetProfile(operation: object): void {
        if (this.cancelledResets.has(operation)) throw new Error('Сброс профиля отменён.');
        if (this.completedResets.has(operation)) return;
        this.resolvePending();
        if (this.completedResets.has(operation)) return;
        if (this.data.activeAttempt) throw new Error('Нельзя сбросить активную попытку.');
        const next = emptySave();
        this.commit(next, operation);
        this.completedResets.add(operation);
    }
    cancelReset(operation: object): 'cancelled' | 'completed' {
        this.resolvePending();
        // Cancellation is read-only and must not hide concurrent changes or unreadable storage.
        if (this.store.read() !== this.raw)
            throw new Error('Сохранение изменилось в другой вкладке. Перезагрузите игру.');
        if (this.completedResets.has(operation)) return 'completed';
        this.cancelledResets.add(operation);
        return 'cancelled';
    }
    ensureProfile(): void { this.resolvePending(); if (!this.hasProfile)
        this.commit(this.current); }
    load(): void { const raw = this.store.read(), next = raw === null ? emptySave() : decodeSave(raw); this.raw = raw; this.data = next; this.pending = null; if (raw !== null && (JSON.parse(raw) as {
        version: number;
    }).version !== 6)
        this.commit(next); }
    // Reconcile an uncertain write before retrying any operation; publish state only after storage agrees.
    private resolvePending(): void { if (!this.pending)
        return; const stored = this.store.read(); if (stored === this.pending.raw) {
        this.raw = this.pending.raw;
        this.data = this.pending.data;
        if (this.pending.resetOperation) this.completedResets.add(this.pending.resetOperation);
    }
    else if (stored !== this.raw)
        throw new Error('Сохранение изменилось в другой вкладке. Перезагрузите игру.'); this.pending = null; }
    private commit(next: SaveData, resetOperation?: object): void { if (this.store.read() !== this.raw)
        throw new Error('Сохранение изменилось в другой вкладке. Перезагрузите игру.'); const serialized = JSON.stringify(next); decodeSave(serialized); this.pending = { raw: serialized, data: next, ...(resetOperation ? {resetOperation} : {}) }; try {
        this.store.write(serialized);
    }
    catch (error) {
        this.resolvePending();
        if (this.raw !== serialized)
            throw error;
        return;
    } this.raw = serialized; this.data = next; this.pending = null; }
    purchase(id: UpgradeId): void { this.resolvePending(); if (this.data.activeAttempt)
        throw new Error('Улучшения доступны только между попытками.'); const availability = getUpgradeAvailability(this.data.profile, id); if (availability.status === 'purchased')
        return; if (availability.status !== 'available')
        throw new Error(availability.reason); const node = UPGRADES.find(n => n.id === id)!, next = this.current; next.profile.resources -= node.cost; next.profile.purchasedUpgrades.push(id);
        const kind = DEVICE_KINDS.find(kind => node.effect.stat === kind);
        if (kind) addDevice(next.profile, kind);
        this.commit(next); }
    private requirePreparation(): void {
        this.resolvePending();
        if (this.data.activeAttempt) throw new Error('Устройства доступны только между попытками.');
    }
    purchaseDevice(kind: DeviceKind, id: number): void {
        this.requirePreparation();
        if (!DEVICE_KINDS.includes(kind) || !natural(id) || id < 1) throw new Error('Неверный экземпляр.');
        const existing = this.data.profile.devices.find(device => device.id === id);
        if (existing) {
            if (existing.kind !== kind) throw new Error('Идентификатор уже занят другим устройством.');
            return;
        }
        if (id !== this.data.profile.nextDeviceId) throw new Error('Устаревший идентификатор покупки.');
        if (!unlockedDeviceKinds(this.data.profile).includes(kind)) throw new Error('Тип устройства не открыт.');
        const next = this.current, cost = DEVICE_RULES.definitions[kind].cost;
        if (next.profile.resources < cost) throw new Error('Недостаточно ресурсов.');
        next.profile.resources -= cost;
        addDevice(next.profile, kind);
        this.commit(next);
    }
    repairDevice(id: number): void {
        this.requirePreparation();
        const next = this.current, device = next.profile.devices.find(item => item.id === id);
        if (!device) throw new Error('Устройство не принадлежит игроку.');
        const cost = repairCost(device, next.profile.purchasedUpgrades);
        if (next.profile.resources < cost) throw new Error('Недостаточно ресурсов.');
        if (device.health === DEVICE_RULES.definitions[device.kind].health) return;
        next.profile.resources -= cost;
        device.health = DEVICE_RULES.definitions[device.kind].health;
        this.commit(next);
    }
    rechargeDevice(id: number): void {
        this.requirePreparation();
        const next = this.current, device = next.profile.devices.find(item => item.id === id);
        if (!device || device.kind !== 'light-trap') throw new Error('Можно перезарядить только свою ловушку.');
        const cost = rechargeCost(device, next.profile.purchasedUpgrades);
        if (cost === 0) return;
        if (next.profile.resources < cost) throw new Error('Недостаточно ресурсов.');
        next.profile.resources -= cost; device.consumed = false;
        device.trapCharges = trapChargeCapacity(next.profile.purchasedUpgrades);
        this.commit(next);
    }
    savePlacements(placements: readonly DevicePlacement[], config: NightConfig): void {
        this.requirePreparation();
        const next = this.current;
        for (const placement of placements) {
            if (!next.profile.devices.some(device => device.id === placement.id && device.kind === placement.kind))
                throw new Error('Расстановка чужого устройства.');
        }
        const check = checkDraft(config, placements);
        if (!check.valid) throw new Error(check.reason);
        for (const device of next.profile.devices) {
            const placement = placements.find(item => item.id === device.id);
            device.position = placement ? { x: placement.x, y: placement.y } : null;
        }
        this.commit(next);
    }
    purchaseLens(id: LensId): void { this.resolvePending(); if (this.data.activeAttempt)
        throw new Error('Линзы доступны между попытками.'); const availability = getLensAvailability(this.data.profile, id); if (availability.status === 'purchased')
        return; if (availability.status !== 'available')
        throw new Error(availability.reason); const next = this.current; next.profile.bossMaterials -= LENSES.find(l => l.id === id)!.materialCost; next.profile.unlockedLenses.push(id); this.commit(next); }
    purchaseLensUpgrade(id: LensUpgradeId): void { this.resolvePending(); if (this.data.activeAttempt)
        throw new Error('Линзы доступны между попытками.'); const availability = getLensUpgradeAvailability(this.data.profile, id); if (availability.status === 'purchased')
        return; if (availability.status !== 'available')
        throw new Error(availability.reason); const node = LENS_UPGRADES.find(n => n.id === id)!, next = this.current; next.profile.resources -= node.cost; next.profile.bossMaterials -= node.materialCost; next.profile.lensUpgrades.push(id); this.commit(next); }
    begin(attempt: AttemptRecord): void {
        this.resolvePending();
        if (attempt.placementCost !== 0 || attempt.legacyRental !== undefined) throw new Error('Новая попытка не оплачивает аренду.');
        const normalized = { ...structuredClone(attempt), deviceSnapshot: structuredClone(attempt.deviceSnapshot ?? deviceDeployments(this.data.profile)), nightId: attempt.nightId ?? 'first-light' as const, lensId: attempt.lensId ?? 'basic' as const }, active = this.data.activeAttempt;
        if (active && active.id === normalized.id && active.seed === normalized.seed && active.placementCost === normalized.placementCost && active.nightId === normalized.nightId && (active.lensId ?? 'basic') === normalized.lensId && (active.lateMode ?? 'assault') === (normalized.lateMode ?? 'assault') && active.bossLevel === normalized.bossLevel && active.bossReward === normalized.bossReward && sameDeployments(active.deviceSnapshot ?? [], normalized.deviceSnapshot))
            return;
        if (active)
            throw new Error('Предыдущая попытка ещё активна.');
        if (this.data.lastSettled?.id === attempt.id)
            throw new Error('Идентификатор попытки уже использован.');
        if (normalized.nightId === 'abyss-warden' && (normalized.bossLevel !== this.data.profile.bossLevel || normalized.bossReward !== getBossRules(this.data.profile.bossLevel).materialReward))
            throw new Error('Устаревшие правила босса.');
        const next = this.current;
        validateSnapshot(normalized.deviceSnapshot, next.profile);
        next.profile.selectedLensId = normalized.lensId;
        next.activeAttempt = normalized;
        this.commit(next);
    }
    settle(id: string, outcome: SettledAttempt['outcome'], reward: number, encountered: readonly EnemyKind[], devices?: readonly DeviceDeployment[]): void {
        this.resolvePending();
        if (this.data.lastSettled?.id === id)
            return;
        if (this.data.activeAttempt?.id !== id)
            throw new Error('Активная попытка не совпадает с результатом.');
        if (!natural(reward))
            throw new Error('Неверная награда.');
        const next = this.current, attempt = next.activeAttempt!, amount = outcome === 'interrupted' ? (attempt.legacyRental ? attempt.placementCost : 0) : reward;
        if (!['victory', 'defeat', 'interrupted'].includes(outcome)) throw new Error('Неверный исход.');
        if (outcome !== 'interrupted' && !attempt.legacyRental) {
            const snapshot = attempt.deviceSnapshot!;
            if (snapshot.length && devices === undefined) throw new Error('Отсутствует итог устройств боя.');
            const result = devices ?? snapshot;
            validateResult(result, snapshot, next.profile.purchasedUpgrades);
            for (const device of result) {
                const owned = next.profile.devices.find(item => item.id === device.id)!;
                owned.health = device.health; owned.consumed = device.consumed;
                if (owned.kind === 'light-trap') owned.trapCharges = device.trapCharges;
            }
        }
        next.profile.resources += amount;
        if (outcome === 'victory') {
            next.profile.completedNights++;
            next.profile.wonNightIds = [...new Set([...next.profile.wonNightIds, attempt.nightId!])];
            if (attempt.nightId === 'abyss-warden') {
                next.profile.bossMaterials += attempt.bossReward!;
                next.profile.bossLevel = Math.min(3, next.profile.bossLevel + 1);
            }
        }
        if (outcome !== 'interrupted')
            next.profile.encountered = [...new Set([...next.profile.encountered, ...encountered])];
        next.activeAttempt = null;
        next.lastSettled = { id, outcome, reward: amount };
        this.commit(next);
    }
}
