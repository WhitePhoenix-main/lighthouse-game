import { describe, expect, it } from 'vitest';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import type { CampaignProfile } from '../src/application/campaignProfileTypes';
import { ABILITY_BASE_RULES } from '../src/content/campaignAbilityBalance';
import { CAMPAIGN_STORY_DRAFT } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_GENERAL_DRAFT } from '../src/content/campaignGeneralDraft';
import { CAMPAIGN_PURCHASE_DRAFT } from '../src/content/campaignPurchaseDraft';
import { DEVICE_RULES } from '../src/content/devices';
import { LENSES } from '../src/content/lenses';
import { NIGHT_CONFIG } from '../src/content/night';
import { UPGRADES } from '../src/content/upgrades';
import { calculateCampaignLoadout, campaignPurchaseViews, isCampaignAbilityUnlocked, purchaseCampaignDevice,
  purchaseCampaignNode, rechargeCampaignDevice, repairCampaignDevice, selectCampaignAbility,
  selectCampaignLens } from '../src/progression/campaignProgression';
import { calculateNightConfig } from '../src/progression/upgrades';

const nodes = new Map(CAMPAIGN_PURCHASE_DRAFT.map(node => [node.id, node]));
const profileWithWins = (count = CAMPAIGN_STORY_DRAFT.length): CampaignProfile => ({ ...emptyCampaignProfile(),
  shards: 40_000, pearls: 100, completedNights: count, wonNightIds: CAMPAIGN_STORY_DRAFT.slice(0, count).map(night => night.id) });

function buyChain(profile: CampaignProfile, id: string): CampaignProfile {
  const ready = nodes.get(id)!.requires.reduce(buyChain, profile);
  return purchaseCampaignNode(ready, id);
}

describe('campaign tree purchases', () => {
  it('projects the local next effect of every node, even before its prerequisites are bought', () => {
    const initial = emptyCampaignProfile();
    const views = campaignPurchaseViews(initial);
    const view = (id: string) => views.find(({ node }) => node.id === id)!;
    expect(views.map(({ node }) => node.id)).toEqual(CAMPAIGN_PURCHASE_DRAFT.map(node => node.id));
    expect(views.every(item => item.stats.length && item.stats.every(({ current, next }) =>
      [current, next].every(value => typeof value !== 'number' || Number.isFinite(value))))).toBe(true);
    expect(view('cannon-damage-1')).toMatchObject({ purchased: false, available: false,
      reasons: [{ code: 'wins', required: 1, missing: 1 }, { code: 'requires', nodeIds: ['unlock-cannon'] }, { code: 'shards', missing: 60 }],
      stats: [{ key: 'devices.definitions.cannon.damage', current: DEVICE_RULES.definitions.cannon.damage,
        next: DEVICE_RULES.definitions.cannon.damage + 4 }] });
    expect(view('expanded-targets').stats).toEqual([{ key: 'beam.maxTargets', current: 3, next: 4 }]);
    expect(view('slowing-control').stats[0]?.next).toBeCloseTo(.45);
    expect(view('flash-cooldown-3').stats).toEqual([{ key: 'flash.cooldown', current: 18, next: 17 }]);
    expect(view('ability-seal-entry').stats).toEqual([
      { key: 'ability.entrySeconds', current: 0, next: 1 },
      { key: 'ability.entrySpeedMultiplier', current: 1, next: .25 },
    ]);
    expect(view('ability-barrage-air-intercept').stats).toEqual([{ key: 'ability.airDamageBonus', current: 0, next: .25 }]);
    expect(view('ability-barrage-blast-radius').stats).toEqual([{ key: 'ability.blastRadiusBonus', current: 0, next: .2 }]);
    expect(view('lens-unlock-expanded').reasons).toContainEqual({ code: 'pearls', missing: 2 });
    expect(view('lens-unlock-expanded').stats).toContainEqual({ key: 'beam.maxTargets', current: 2, next: 3 });
    expect(initial).toEqual(emptyCampaignProfile());
  });

  it('enforces the same gates in views and commands and charges both currencies in a single result', () => {
    const node = nodes.get('ability-barrage-air-intercept')!;
    const tooEarly = buyChain(profileWithWins(node.winsBeforePurchase - 1), 'ability-barrage-unlock');
    expect(() => purchaseCampaignNode({ ...tooEarly, completedNights: 100 }, node.id)).toThrow('Нужно побед');
    const missingUnlock = profileWithWins(node.winsBeforePurchase);
    expect(() => purchaseCampaignNode(missingUnlock, node.id)).toThrow('Сначала купите');
    expect(() => purchaseCampaignNode(missingUnlock, 'wrong-id')).toThrow('Неизвестный узел');

    const owned = buyChain(missingUnlock, 'ability-barrage-unlock');
    const wallet = { ...owned, shards: node.shards, pearls: node.pearls };
    expect(() => purchaseCampaignNode({ ...wallet, shards: wallet.shards - 1 }, node.id)).toThrow('осколков');
    expect(() => purchaseCampaignNode({ ...wallet, pearls: wallet.pearls - 1 }, node.id)).toThrow('жемчуга');
    const bought = purchaseCampaignNode(wallet, node.id);
    expect(bought).toMatchObject({ shards: 0, pearls: 0, selectedAbilityId: null });
    expect(bought.purchasedNodeIds).toEqual([...wallet.purchasedNodeIds, node.id]);
    expect(purchaseCampaignNode(bought, node.id)).toBe(bought);
    expect(campaignPurchaseViews(bought).find(item => item.node.id === node.id)).toMatchObject({
      available: false, purchased: true, reasons: [{ code: 'purchased' }],
      stats: [{ key: 'ability.airDamageBonus', current: .25, next: .25 }],
    });
  });

  it('buys the full 256-node catalog with exact tariffs and a codec-valid inventory', () => {
    const original = profileWithWins();
    const owned = CAMPAIGN_PURCHASE_DRAFT.reduce((profile, node) => buyChain(profile, node.id), original);
    expect(owned.purchasedNodeIds).toHaveLength(256);
    expect(owned.shards).toBe(original.shards - CAMPAIGN_PURCHASE_DRAFT.reduce((total, node) => total + node.shards, 0));
    expect(owned.pearls).toBe(original.pearls - CAMPAIGN_PURCHASE_DRAFT.reduce((total, node) => total + node.pearls, 0));
    expect(owned.inventory).toHaveLength(8);
    expect(owned.nextDeviceId).toBe(9);
    expect(owned.inventory.map(device => device.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(original.inventory).toEqual([]);
    expect(decodeCampaignProfile(JSON.stringify(owned))).toEqual(owned);
    expect(campaignPurchaseViews(owned).every(view => view.purchased && view.stats.every(stat => stat.current === stat.next))).toBe(true);
  });
});

describe('campaign battle loadout', () => {
  it('keeps all sixteen flash upgrades in a single selectable slot and clears a base ability', () => {
    const flashNodes = CAMPAIGN_PURCHASE_DRAFT.filter(node => node.branch === 'flash');
    expect(flashNodes).toHaveLength(16);
    const original = profileWithWins();
    expect(isCampaignAbilityUnlocked(original, 'flash')).toBe(false);
    expect(() => selectCampaignAbility(original, 'seal')).toThrow('Способность не открыта');
    expect(() => selectCampaignLens(original, 'expanded')).toThrow('Линза не открыта');
    const owned = flashNodes.reduce((profile, node) => buyChain(profile, node.id), original);
    const expected = calculateNightConfig(NIGHT_CONFIG, UPGRADES.filter(node => owned.purchasedNodeIds.includes(node.id)).map(node => node.id));
    const base = { ...NIGHT_CONFIG, ability: ABILITY_BASE_RULES.seal };
    const unloaded = calculateCampaignLoadout(base, owned);
    expect(unloaded.flash.enabled).toBe(false);
    expect(unloaded.ability).toBeUndefined();
    expect(unloaded.availableDevices).toEqual(['barrier']);
    const active = calculateCampaignLoadout(base, selectCampaignAbility(owned, 'flash'));
    expect(active.flash).toEqual(expected.flash);
    expect(active.ability).toBeUndefined();
    expect(base.ability).toBe(ABILITY_BASE_RULES.seal);
    expect(NIGHT_CONFIG.flash.enabled).toBeUndefined();
  });

  it('uses the chosen candidate alone and retains independent barrage improvements', () => {
    const handles = ['ability-overload-drive', 'ability-seal-entry', 'ability-bastion-fade'];
    const profile = handles.reduce(buyChain, profileWithWins());
    const harpoon = buyChain(profile, 'ability-barrage-air-intercept');
    const mortar = ['ability-barrage-blast-radius', 'ability-barrage-projectile-speed'].reduce(buyChain, profile);
    const equipped = (owned: CampaignProfile) => calculateCampaignLoadout(NIGHT_CONFIG, selectCampaignAbility(owned, 'barrage'));
    expect(equipped(harpoon).ability).toMatchObject({ abilityId: 'barrage', airDamageBonus: .25, blastRadiusBonus: 0, projectileSpeedBonus: 0 });
    expect(equipped(mortar).ability).toMatchObject({ abilityId: 'barrage', airDamageBonus: 0, blastRadiusBonus: .2, projectileSpeedBonus: .25 });
    const equippedFlash = selectCampaignAbility(buyChain(harpoon, 'unlock-flash'), 'flash');
    for (const [id, expected] of [['overload', { turnSpeedBonus: .35 }], ['seal', { entrySeconds: 1 }], ['bastion', { fadeSeconds: 2 }]] as const) {
      const switched = selectCampaignAbility(equippedFlash, id);
      const config = calculateCampaignLoadout(NIGHT_CONFIG, switched);
      expect(config.ability).toMatchObject({ abilityId: id, ...expected });
      expect(config.flash.enabled).toBe(false);
      expect(calculateCampaignLoadout(NIGHT_CONFIG, selectCampaignAbility(switched, null)).ability).toBeUndefined();
      expect(switched.purchasedNodeIds).toEqual(equippedFlash.purchasedNodeIds);
    }
  });

  it('applies geometry before the chosen lens and passes only the strongest rank of each family', () => {
    const start = ['beam-range-5', 'beam-width-5', 'lens-unlock-long-range', 'long-range-width-1']
      .reduce(buyChain, profileWithWins());
    const baseline = calculateCampaignLoadout(NIGHT_CONFIG, selectCampaignLens(start, 'long-range'));
    const all = CAMPAIGN_GENERAL_DRAFT.reduce((profile, node) => buyChain(profile, node.id), start);
    const selected = selectCampaignLens(all, 'long-range');
    const config = calculateCampaignLoadout(NIGHT_CONFIG, selected);
    const lens = LENSES.find(lens => lens.id === 'long-range')!;
    expect(config.beam.range - baseline.beam.range).toBeCloseTo(10 * lens.rangeMultiplier);
    expect(config.beam.halfAngle - baseline.beam.halfAngle).toBeCloseTo(Math.PI / 180 * lens.widthMultiplier);
    expect(config.beam.maxTargets).toBe(baseline.beam.maxTargets);
    expect(config.beam.quickTurn?.speedBonus).toBe(.6);
    expect(config.shield.stabilization?.regenerationBonus).toBe(.5);
    expect(Object.keys(config.campaignGeneral ?? {})).toHaveLength(10);
    expect(config.campaignGeneral).toMatchObject({ preparationDisruption: { bonus: .25 }, exposedVulnerability: { bonus: .35 },
      onslaughtResilience: { reduction: .18 }, emergencyWindow: { additionalSeconds: 1.5 },
      bombardmentProtection: { reduction: .25 }, backupControl: { durationMultiplier: .7 } });
    const rankOne = buyChain(start, 'beam-quick-turn-1');
    expect(campaignPurchaseViews(rankOne).find(view => view.node.id === 'beam-quick-turn-2')?.stats)
      .toContainEqual({ key: 'campaignGeneral.quickTurn.speedBonus', current: .35, next: .6 });
    expect(calculateCampaignLoadout(NIGHT_CONFIG, selectCampaignLens(selected, 'basic')).beam.range)
      .toBeLessThan(config.beam.range);
    expect(NIGHT_CONFIG.beam.quickTurn).toBeUndefined();
    expect(NIGHT_CONFIG.shield.stabilization).toBeUndefined();
  });
});

describe('campaign permanent devices', () => {
  it('issues the first device atomically and retries an extra device purchase by instance id', () => {
    const ready = profileWithWins(1);
    expect(() => purchaseCampaignDevice(ready, 'cannon', 1)).toThrow('Тип устройства не открыт');
    expect(() => purchaseCampaignNode({ ...ready, nextDeviceId: Number.MAX_SAFE_INTEGER }, 'unlock-cannon')).toThrow('Исчерпаны');
    const opened = purchaseCampaignNode(ready, 'unlock-cannon');
    expect(opened.inventory).toEqual([{ id: 1, kind: 'cannon', consumed: false, health: DEVICE_RULES.definitions.cannon.health }]);
    expect(opened.shards).toBe(ready.shards - nodes.get('unlock-cannon')!.shards);
    expect(opened.layouts).toEqual(ready.layouts);
    expect(ready.inventory).toEqual([]);
    expect(() => purchaseCampaignDevice(opened, 'cannon', 3)).toThrow('Устаревший');
    expect(() => purchaseCampaignDevice(opened, 'barrier', 1)).toThrow('Идентификатор уже занят');
    const bought = purchaseCampaignDevice(opened, 'cannon', 2);
    expect(bought.shards).toBe(opened.shards - DEVICE_RULES.definitions.cannon.cost);
    expect(bought.inventory.map(item => item.id)).toEqual([1, 2]);
    expect(purchaseCampaignDevice({ ...bought, shards: 0 }, 'cannon', 2).shards).toBe(0);
    expect(purchaseCampaignDevice(bought, 'cannon', 2)).toBe(bought);
  });

  it('keeps stored charges during capacity upgrades and repairs and recharges independently', () => {
    const base = buyChain(profileWithWins(), 'unlock-trap');
    const trap = base.inventory.find(device => device.kind === 'light-trap')!;
    expect(trap).toMatchObject({ consumed: false, trapCharges: 1 });
    const owned = buyChain(base, 'engineering-recharge-2');
    expect(owned.inventory.find(device => device.id === trap.id)?.trapCharges).toBe(1);
    expect(calculateCampaignLoadout(NIGHT_CONFIG, owned).devices.trap.charges).toBe(2);
    const withExtra = purchaseCampaignDevice(owned, 'light-trap', owned.nextDeviceId);
    expect(withExtra.inventory.at(-1)?.trapCharges).toBe(2);
    const damaged = { ...owned, inventory: owned.inventory.map(device => device.id === trap.id
      ? { ...device, health: 0, consumed: true, trapCharges: 0 } : device) };
    expect(() => repairCampaignDevice({ ...damaged, shards: 0 }, trap.id)).toThrow('осколков');
    expect(() => rechargeCampaignDevice(damaged, 1)).toThrow('ловушку');
    const recharged = rechargeCampaignDevice(damaged, trap.id);
    expect(recharged.shards).toBe(damaged.shards - 2);
    expect(recharged.inventory.find(device => device.id === trap.id)).toMatchObject({ health: 0, consumed: false, trapCharges: 2 });
    const repaired = repairCampaignDevice(damaged, trap.id);
    expect(repaired.shards).toBe(damaged.shards - 4);
    expect(repaired.inventory.find(device => device.id === trap.id)).toMatchObject({ health: trap.health, consumed: true, trapCharges: 0 });
    expect(repairCampaignDevice(repaired, trap.id)).toBe(repaired);
    expect(rechargeCampaignDevice(recharged, trap.id)).toBe(recharged);
    expect(decodeCampaignProfile(JSON.stringify(recharged))).toEqual(recharged);
    expect(damaged.inventory.find(device => device.id === trap.id)).toMatchObject({ health: 0, consumed: true, trapCharges: 0 });
  });
});
