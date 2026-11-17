import { describe, expect, it } from 'vitest';
import type { LensDefinition, LensUpgradeDefinition, SaveStore } from '../../src/contracts';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { createLensViews, validateLensDefinitions, validateLensOwnership } from '../../src/progression/lenses';

function repository(materials: number) {
    const save = emptySave();
    save.profile.resources = 500;
    save.profile.bossMaterials = materials;
    const store: SaveStore & { value: string } = {
        value: JSON.stringify(save),
        read() { return this.value; },
        write(value: string) { this.value = value; },
    };
    const repo = new SaveRepository(store);
    repo.load();
    return { repo, store };
}

describe('expanded lens catalogue and preserved purchases', () => {
    it('retains every old lens price, multiplier and upgrade prerequisite/effect', () => {
        expect(LENSES.slice(0, 4).map(lens => [lens.id, lens.materialCost, lens.damageMultiplier,
            lens.widthMultiplier, lens.rangeMultiplier, lens.maxTargets, lens.slowMultiplier, lens.armorMultiplier])).toEqual([
            ['basic', 0, 1, 1, 1, 2, 1, 1],
            ['expanded', 2, .85, 1.6, 1, 3, 1, 1],
            ['slowing', 3, .8, 1, 1, 2, .6, 1],
            ['armor-breaker', 3, .8, .7, 1, 1, 1, 2],
        ]);
        expect(LENS_UPGRADES.slice(0, 6).map(node => [node.id, node.lensId, node.cost, node.materialCost,
            node.requires, node.effect])).toEqual([
            ['expanded-width', 'expanded', 45, 1, [], { stat: 'halfAngle', amount: Math.PI / 45 }],
            ['expanded-targets', 'expanded', 70, 2, ['expanded-width'], { stat: 'maxTargets', amount: 1 }],
            ['slowing-control', 'slowing', 45, 1, [], { stat: 'slowMultiplier', amount: -.15 }],
            ['slowing-power', 'slowing', 70, 2, ['slowing-control'], { stat: 'damagePerSecond', amount: 6 }],
            ['armor-breaker-armor', 'armor-breaker', 45, 1, [], { stat: 'armorMultiplier', amount: .5 }],
            ['armor-breaker-power', 'armor-breaker', 70, 2, ['armor-breaker-armor'], { stat: 'damagePerSecond', amount: 6 }],
        ]);
        expect(LENSES).toHaveLength(8);
        expect(LENSES.filter(lens => lens.materialCost > 0)).toHaveLength(7);
        expect(LENS_UPGRADES).toHaveLength(33);
        expect(() => validateLensDefinitions()).not.toThrow();
    });

    it('buys the free-material basic branches before the first boss, respects dependencies and buys once', () => {
        const { repo, store } = repository(0);
        expect(() => repo.purchaseLensUpgrade('basic-width')).toThrow();
        for (const id of ['basic-power-1', 'basic-power-2', 'basic-width', 'basic-range'] as const)
            repo.purchaseLensUpgrade(id);
        repo.purchaseLensUpgrade('basic-power-1');
        expect(repo.current.profile).toMatchObject({ resources: 295, bossMaterials: 0,
            lensUpgrades: ['basic-power-1', 'basic-power-2', 'basic-width', 'basic-range'] });
        expect(() => repo.purchaseLensUpgrade('basic-paired')).toThrow();
        expect(decodeSave(store.value).profile).toEqual(repo.current.profile);
    });

    it('opens focused for exactly three materials and preserves single selected lens through reload', () => {
        const { repo, store } = repository(3);
        expect(() => repo.purchaseLensUpgrade('focused-power')).toThrow();
        repo.purchaseLens('focused');
        repo.purchaseLens('focused');
        expect(repo.current.profile).toMatchObject({ resources: 500, bossMaterials: 0, unlockedLenses: ['basic', 'focused'] });
        expect(() => repo.purchaseLensUpgrade('focused-power')).toThrow();
        repo.begin({ id: 'focused-attempt', seed: 42, placementCost: 0, lensId: 'focused' });
        const profile = decodeSave(store.value).profile;
        expect(profile.selectedLensId).toBe('focused');
        const views = createLensViews(profile, profile.selectedLensId);
        expect(views.filter(view => view.selected).map(view => view.definition.id)).toEqual(['focused']);
        expect(LENSES.find(lens => lens.id === 'focused')).toMatchObject({ materialCost: 3,
            damageMultiplier: 1.5, widthMultiplier: .75, rangeMultiplier: 1, maxTargets: 1,
            slowMultiplier: 1, armorMultiplier: 1, focus: { seconds: 1.5, damageBonus: .1 } });
        const { repo: poor } = repository(2);
        expect(() => poor.purchaseLens('focused')).toThrow();
        expect(poor.current.profile.bossMaterials).toBe(2);
    });

    it('retains a previously fully purchased lens profile without inventing new ownership', () => {
        const save = emptySave();
        save.profile.unlockedLenses = ['basic', 'expanded', 'slowing', 'armor-breaker'];
        save.profile.lensUpgrades = LENS_UPGRADES.slice(0, 6).map(node => node.id);
        save.profile.selectedLensId = 'slowing';
        const loaded = decodeSave(JSON.stringify(save));
        expect(loaded.profile).toEqual(save.profile);
        expect(() => validateLensOwnership(loaded.profile.unlockedLenses, loaded.profile.lensUpgrades, 'slowing')).not.toThrow();
        expect(() => validateLensOwnership(['basic'], ['focused-power'], 'basic')).toThrow();
        expect(() => validateLensOwnership(['basic', 'focused'], ['focused-hold-2'], 'focused')).toThrow();
    });

    it('branches focused upgrades from power and persists their full preliminary cost', () => {
        const { repo, store } = repository(8);
        repo.purchaseLens('focused');
        expect(() => repo.purchaseLensUpgrade('focused-range')).toThrow();
        repo.purchaseLensUpgrade('focused-power');
        // The range branch does not require either holding upgrade.
        repo.purchaseLensUpgrade('focused-range');
        expect(() => repo.purchaseLensUpgrade('focused-hold-2')).toThrow();
        repo.purchaseLensUpgrade('focused-hold-1');
        repo.purchaseLensUpgrade('focused-hold-2');
        repo.purchaseLensUpgrade('focused-hold-2');
        expect(repo.current.profile).toMatchObject({ resources: 200, bossMaterials: 0,
            lensUpgrades: ['focused-power', 'focused-range', 'focused-hold-1', 'focused-hold-2'] });
        expect(decodeSave(store.value).profile).toEqual(repo.current.profile);
        expect(LENS_UPGRADES.filter(node => node.lensId === 'focused').map(node => [node.id, node.effect])).toEqual([
            ['focused-power', { stat: 'damagePerSecond', amount: 4 }],
            ['focused-range', { stat: 'range', amount: 15 }],
            ['focused-hold-1', { stat: 'focusDamageBonus', amount: .05 }],
            ['focused-hold-2', { stat: 'focusDamageBonus', amount: .05 }],
        ]);
    });

    it('requires both basic branches for paired damage and spends its one material once', () => {
        const { repo } = repository(1);
        repo.purchaseLensUpgrade('basic-power-1');
        repo.purchaseLensUpgrade('basic-power-2');
        expect(() => repo.purchaseLensUpgrade('basic-paired')).toThrow();
        repo.purchaseLensUpgrade('basic-width');
        repo.purchaseLensUpgrade('basic-paired');
        repo.purchaseLensUpgrade('basic-paired');
        expect(repo.current.profile).toMatchObject({ resources: 275, bossMaterials: 0 });
    });
});

describe('focus content validation', () => {
    const focused = () => structuredClone(LENSES.find(lens => lens.id === 'focused')!);
    it.each([0, -1, NaN, Infinity])('rejects invalid holding time %s', seconds => {
        const lens = focused();
        lens.focus!.seconds = seconds;
        expect(() => validateLensDefinitions([lens], [])).toThrow();
    });
    it.each([-1, NaN, Infinity, 1.01])('rejects invalid base holding bonus %s', damageBonus => {
        const lens = focused();
        lens.focus!.damageBonus = damageBonus;
        expect(() => validateLensDefinitions([lens], [])).toThrow();
    });
    it('accepts zero base bonus, rejects holding upgrades without focus and limits summed bonuses', () => {
        const lens = focused();
        lens.focus!.damageBonus = 0;
        expect(() => validateLensDefinitions([lens], [])).not.toThrow();
        const node: LensUpgradeDefinition = { ...LENS_UPGRADES.find(item => item.id === 'focused-hold-1')!, requires: [] };
        const plain: LensDefinition = { ...lens };
        delete plain.focus;
        expect(() => validateLensDefinitions([plain], [node])).toThrow();
        node.effect = { stat: 'focusDamageBonus', amount: .6 };
        const other: LensUpgradeDefinition = { ...node, id: 'focused-hold-2', requires: [node.id] };
        expect(() => validateLensDefinitions([lens], [node, other])).toThrow();
        node.effect = { stat: 'focusDamageBonus', amount: NaN };
        expect(() => validateLensDefinitions([lens], [node])).toThrow();
        const wrongLens: LensDefinition = { ...lens, id: 'basic' };
        expect(() => validateLensDefinitions([wrongLens], [])).toThrow();
    });
});
