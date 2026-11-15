import type { LensDefinition, LensUpgradeDefinition, LensId, LensUpgradeId, LensOptionView, Profile, UpgradeAvailability } from '../contracts';
import { LENSES, LENS_UPGRADES } from '../content/lenses';

/** Validate the content graph independently of any saved purchases. */
export function validateLensDefinitions(lenses: readonly LensDefinition[] = LENSES, nodes: readonly LensUpgradeDefinition[] = LENS_UPGRADES): void {
    const byLens = new Map(lenses.map(lens => [lens.id, lens]));
    const byNode = new Map(nodes.map(node => [node.id, node]));
    if (byLens.size !== lenses.length || byNode.size !== nodes.length) throw new Error('Повторный идентификатор линзы или улучшения.');
    const natural = (value: number) => Number.isSafeInteger(value) && value >= 0;
    const positive = (value: number) => Number.isFinite(value) && value > 0;
    for (const lens of lenses) {
        if (!lens.id || !lens.name.trim() || !natural(lens.materialCost)
            || ![lens.damageMultiplier, lens.widthMultiplier, lens.rangeMultiplier, lens.armorMultiplier].every(positive)
            || !positive(lens.slowMultiplier) || lens.slowMultiplier > 1
            || !Number.isSafeInteger(lens.maxTargets) || lens.maxTargets < 1) throw new Error('Неверные параметры линзы.');
        if (lens.focus !== undefined && (lens.id !== 'focused' || !positive(lens.focus.seconds)
            || !Number.isFinite(lens.focus.damageBonus) || lens.focus.damageBonus < 0 || lens.focus.damageBonus > 1))
            throw new Error('Неверные параметры удержания фокуса.');
        if (lens.burn !== undefined && (lens.id !== 'smoldering' || !positive(lens.burn.seconds) || lens.burn.seconds > 60
            || !positive(lens.burn.damagePerSecond) || lens.burn.damagePerSecond > 10000))
            throw new Error('Неверные параметры горения.');
        if (lens.resonance !== undefined && (lens.id !== 'resonant' || !positive(lens.resonance.seconds) || lens.resonance.seconds > 60
            || !positive(lens.resonance.damageBonus) || lens.resonance.damageBonus > 1))
            throw new Error('Неверные параметры резонанса.');
    }
    const effectStats = ['damagePerSecond', 'halfAngle', 'range', 'maxTargets', 'slowMultiplier', 'armorMultiplier', 'pairedDamageBonus', 'focusDamageBonus', 'burnDamagePerSecond', 'burnDuration', 'resonanceDamageBonus'];
    for (const node of nodes) {
        if (!node.id || !node.name.trim() || !byLens.has(node.lensId)
            || !natural(node.cost) || node.cost === 0 || !natural(node.materialCost)
            || new Set(node.requires).size !== node.requires.length) throw new Error('Неверная цена или линза улучшения.');
        const effect = node.effect;
        if (!effect || !effectStats.includes(effect.stat) || !Number.isFinite(effect.amount)
            || (effect.stat !== 'slowMultiplier' && effect.amount <= 0)
            || (effect.stat === 'maxTargets' && !Number.isSafeInteger(effect.amount))) throw new Error('Неверный эффект улучшения линзы.');
        if (effect.stat === 'focusDamageBonus' && !byLens.get(node.lensId)?.focus)
            throw new Error('Бонус удержания требует фокусирующую линзу.');
        if (effect.stat === 'resonanceDamageBonus' && !byLens.get(node.lensId)?.resonance)
            throw new Error('Бонус резонанса требует резонансную линзу.');
        if ((effect.stat === 'burnDamagePerSecond' || effect.stat === 'burnDuration') && !byLens.get(node.lensId)?.burn)
            throw new Error('Улучшение горения требует тлеющую линзу.');
        for (const id of node.requires) {
            const dependency = byNode.get(id);
            if (!dependency) throw new Error('Неизвестная зависимость улучшения линзы.');
            if (dependency.lensId !== node.lensId) throw new Error('Зависимость относится к другой линзе.');
        }
    }
    const visited = new Set<LensUpgradeId>(), visiting = new Set<LensUpgradeId>();
    const visit = (id: LensUpgradeId): void => {
        if (visiting.has(id)) throw new Error('Цикл зависимостей улучшений линз.');
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dependency of byNode.get(id)!.requires) visit(dependency);
        visiting.delete(id); visited.add(id);
    };
    for (const node of nodes) visit(node.id);
    for (const lens of lenses) {
        const effects = nodes.filter(node => node.lensId === lens.id).map(node => node.effect);
        // Bounding both signs separately also covers every valid subset of purchased nodes.
        const slowAmounts = effects.filter(effect => effect.stat === 'slowMultiplier').map(effect => effect.amount);
        const minimumSlow = lens.slowMultiplier + slowAmounts.reduce((sum, amount) => sum + Math.min(0, amount), 0);
        const maximumSlow = lens.slowMultiplier + slowAmounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
        const targets = lens.maxTargets + effects.filter(effect => effect.stat === 'maxTargets').reduce((sum, effect) => sum + effect.amount, 0);
        if (!positive(minimumSlow) || maximumSlow > 1 || !Number.isSafeInteger(targets) || targets < 1) throw new Error('Эффекты выводят параметры линзы за допустимые границы.');
        if (lens.burn) {
            const duration = lens.burn.seconds + effects.filter(effect => effect.stat === 'burnDuration').reduce((sum, effect) => sum + effect.amount, 0);
            const damage = lens.burn.damagePerSecond + effects.filter(effect => effect.stat === 'burnDamagePerSecond').reduce((sum, effect) => sum + effect.amount, 0);
            if (!positive(duration) || duration > 60 || !positive(damage) || damage > 10000)
                throw new Error('Слишком сильное или длительное горение.');
        }
        for (const stat of ['pairedDamageBonus', 'focusDamageBonus', 'resonanceDamageBonus'] as const) {
            const bonus = (stat === 'focusDamageBonus' ? lens.focus?.damageBonus ?? 0 : 0)
                + (stat === 'resonanceDamageBonus' ? lens.resonance?.damageBonus ?? 0 : 0)
                + effects.filter(effect => effect.stat === stat).reduce((sum, effect) => sum + effect.amount, 0);
            if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1) throw new Error('Слишком большой бонус линзы.');
        }
    }
}
validateLensDefinitions();

export function validateLensOwnership(unlocked: readonly string[], upgrades: readonly string[], selected: string): void {
    if (new Set(unlocked).size !== unlocked.length || !unlocked.includes('basic') || unlocked.some(id => !LENSES.some(lens => lens.id === id)) || !unlocked.includes(selected))
        throw new Error('Повреждены открытия линз.');
    if (new Set(upgrades).size !== upgrades.length)
        throw new Error('Повторное улучшение линзы.');
    for (const id of upgrades) {
        const node = LENS_UPGRADES.find(item => item.id === id);
        if (!node || !unlocked.includes(node.lensId) || node.requires.some(required => !upgrades.includes(required)))
            throw new Error('Нарушены зависимости линз.');
    }
}
export function getLensAvailability(profile: Readonly<Profile>, id: LensId): UpgradeAvailability {
    const lens = LENSES.find(item => item.id === id);
    if (!lens)
        throw new Error('Неизвестная линза.');
    if (profile.unlockedLenses.includes(id))
        return { status: 'purchased', reason: 'Уже открыта' };
    if (profile.bossMaterials < lens.materialCost)
        return { status: 'insufficient', reason: `Требуется ${lens.materialCost} материала босса` };
    return { status: 'available', reason: `Открыть за ${lens.materialCost} материала босса` };
}
export function getLensUpgradeAvailability(profile: Readonly<Profile>, id: LensUpgradeId): UpgradeAvailability {
    const node = LENS_UPGRADES.find(item => item.id === id);
    if (!node)
        throw new Error('Неизвестное улучшение линзы.');
    if (profile.lensUpgrades.includes(id))
        return { status: 'purchased', reason: 'Уже куплено' };
    if (!profile.unlockedLenses.includes(node.lensId) || node.requires.some(required => !profile.lensUpgrades.includes(required)))
        return { status: 'requires', reason: 'Сначала откройте линзу и предыдущее улучшение' };
    if (profile.resources < node.cost || profile.bossMaterials < node.materialCost)
        return { status: 'insufficient', reason: `Требуется ${node.cost} осколков и ${node.materialCost} материала босса` };
    return { status: 'available', reason: `Купить за ${node.cost} осколков и ${node.materialCost} материала босса` };
}
export function createLensViews(profile: Readonly<Profile>, selected: LensId): LensOptionView[] {
    return LENSES.map(lens => { const availability = getLensAvailability(profile, lens.id); return { definition: structuredClone(lens), unlocked: profile.unlockedLenses.includes(lens.id), selected: lens.id === selected, canPurchase: availability.status === 'available', reason: availability.reason, upgrades: LENS_UPGRADES.filter(node => node.lensId === lens.id).map(node => ({ definition: structuredClone(node), ...getLensUpgradeAvailability(profile, node.id) })) }; });
}
