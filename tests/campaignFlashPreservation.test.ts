import { describe, expect, it } from 'vitest';
import type { UpgradeId } from '../src/contracts';
import { UPGRADES } from '../src/content/upgrades';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { CAMPAIGN_TREE_DRAFT } from '../src/content/campaignTreeDraft';
import { calculateNightConfig } from '../src/progression/upgrades';
import { emptySave, decodeSave, SaveRepository } from '../src/application/saves';
import { grantFixtureDevices } from './helpers/devices';

// Explicit preservation contract from the user's decision; these ranks must not be merged or repriced.
const flashSnapshot = [
  ['unlock-flash', 'flash', 1, 60, ['unlock-barrier'], 'broken-shore'],
  ['flash-damage-1', 'flashDamage', 6, 55, ['unlock-flash'], 'broken-shore'],
  ['flash-damage-2', 'flashDamage', 6, 95, ['flash-damage-1'], 'abyss-warden'],
  ['flash-damage-3', 'flashDamage', 6, 140, ['flash-damage-2'], 'far-shore'],
  ['flash-damage-4', 'flashDamage', 6, 180, ['flash-damage-3'], 'far-shore'],
  ['flash-radius-1', 'flashRadius', 15, 110, ['unlock-flash'], 'far-shore'],
  ['flash-radius-2', 'flashRadius', 15, 145, ['flash-radius-1'], 'far-shore'],
  ['flash-radius-3', 'flashRadius', 15, 180, ['flash-radius-2'], 'far-shore'],
  ['flash-cooldown-1', 'flashCooldownReduction', 2, 75, ['flash-damage-1'], 'winged-tide'],
  ['flash-cooldown-2', 'flashCooldownReduction', 1, 120, ['flash-cooldown-1'], 'abyss-warden'],
  ['flash-cooldown-3', 'flashCooldownReduction', 1, 170, ['flash-cooldown-2'], 'far-shore'],
  ['flash-stun-1', 'flashStunDuration', .2, 120, ['unlock-flash'], 'far-shore'],
  ['flash-stun-2', 'flashStunDuration', .2, 155, ['flash-stun-1'], 'far-shore'],
  ['flash-stun-3', 'flashStunDuration', .2, 190, ['flash-stun-2'], 'far-shore'],
  ['flash-ready', 'flashReloadAssist', .5, 200, ['flash-cooldown-3'], 'far-shore'],
  ['flash-damaged-armor', 'flashDamagedArmorBonus', .25, 185, ['flash-damage-4'], 'far-shore'],
] as const;

function withDependencies(ids: readonly UpgradeId[]): UpgradeId[] {
  const owned = new Set<UpgradeId>();
  const include = (id: UpgradeId): void => {
    if (owned.has(id)) return;
    const node = UPGRADES.find(node => node.id === id)!;
    node.requires.forEach(include); owned.add(id);
  };
  ids.forEach(include);
  return [...owned];
}

describe('preserve all sixteen existing flash purchases', () => {
  it('keeps exact ids, effects, prices and prerequisite/story rules', () => {
    for (const [id, stat, amount, cost, requires, requiresNight] of flashSnapshot) {
      expect(UPGRADES.find(node => node.id === id)).toMatchObject({ id, effect: { stat, amount }, cost, requires, requiresNight });
      expect(CAMPAIGN_TREE_DRAFT.find(node => node.id === id)).toMatchObject({ category: 'ability', branch: 'flash', sourceId: id });
    }
    expect(flashSnapshot.reduce((sum, row) => sum + row[3], 0)).toBe(2180);
  });

  it('keeps intermediate damage ranks at +6/+12/+18/+24 without rounding up', () => {
    for (const rank of [1, 2, 3, 4]) {
      const id = `flash-damage-${rank}` as UpgradeId;
      const config = calculateNightConfig(NIGHT_CONFIG, withDependencies([id]));
      expect(config.flash.damage).toBe(NIGHT_CONFIG.flash.damage + 6 * rank);
    }
  });

  it('keeps full flash characteristics and independent existing bonuses', () => {
    const config = calculateNightConfig(NIGHT_CONFIG, withDependencies(flashSnapshot.map(row => row[0])));
    expect(config.flash).toMatchObject({ enabled: true, damage: 46, radius: 255, cooldown: 14, reloadAssist: .5, damagedArmorBonus: .25 });
    expect(config.flash.stunDuration).toBeCloseTo(2.6);
  });

  it.each(['flash-damage-1', 'flash-damage-3', 'flash-ready', 'flash-damaged-armor'] as const)
    ('loads a v6 profile with %s without a migration, refund or replacement purchase', id => {
      const save = emptySave();
      save.profile.resources = 901;
      save.profile.bossMaterials = 7;
      save.profile.wonNightIds = NIGHT_CATALOG.map(night => night.id);
      save.profile.bossLevel = 2;
      save.profile.purchasedUpgrades = withDependencies([id]);
      grantFixtureDevices(save.profile);
      save.profile.devices[0]!.health = 13.5;
      const raw = JSON.stringify(save);
      let writes = 0;
      const repository = new SaveRepository({ read: () => raw, write: () => { writes++; } });
      repository.load();
      expect(repository.current).toEqual(save);
      expect(decodeSave(raw)).toEqual(save);
      expect(writes).toBe(0);
    });
});
