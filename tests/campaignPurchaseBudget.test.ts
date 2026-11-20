import { describe, expect, it } from 'vitest';
import { ABILITY_ECONOMY_CHAPTERS, PROPOSED_FIRST_BOSS_PEARLS } from '../src/content/campaignAbilityEconomy';
import { CAMPAIGN_LENS_CHAPTERS, CAMPAIGN_LENS_PAIRS, CAMPAIGN_PURCHASE_DRAFT, draftFirstWinPearls, winsAtChapterStart } from '../src/content/campaignPurchaseDraft';
import { campaignLensUnlockId } from '../src/content/campaignTreeDraft';
import { DEVICE_RULES } from '../src/content/devices';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { UPGRADES } from '../src/content/upgrades';
import { rechargeCost, repairCost } from '../src/progression/devices';
import { auditCampaignBudget } from './helpers/campaignBudget';

const byId = new Map(CAMPAIGN_PURCHASE_DRAFT.map(node => [node.id, node]));
const finalBoss = (audit: ReturnType<typeof auditCampaignBudget>) => audit.chapters.at(-1)!.boss;

describe('campaign purchase draft terms', () => {
  it('covers the complete 256-node DAG with integer prices and inherited night gates before the final boss', () => {
    expect(byId.size).toBe(256);
    expect(CAMPAIGN_PURCHASE_DRAFT.length).toBe(256);
    for (const node of CAMPAIGN_PURCHASE_DRAFT) {
      expect(Number.isSafeInteger(node.shards) && node.shards >= 0, node.id).toBe(true);
      expect(Number.isSafeInteger(node.pearls) && node.pearls >= 0, node.id).toBe(true);
      expect(node.shards + node.pearls, node.id).toBeGreaterThan(0);
      expect(Number.isSafeInteger(node.winsBeforePurchase), node.id).toBe(true);
      expect(node.winsBeforePurchase, node.id).toBeLessThan(56);
      for (const required of node.requires) {
        expect(node.winsBeforePurchase, `${node.id} before ${required}`).toBeGreaterThanOrEqual(byId.get(required)!.winsBeforePurchase);
      }
    }
  });

  it('uses actual legacy prices and preserves the entire flash path', () => {
    for (const node of UPGRADES) {
      expect(byId.get(node.id)).toMatchObject({ shards: node.cost, pearls: 0, requires: node.requires });
    }
    for (const lens of LENSES.filter(lens => lens.id !== 'basic')) {
      expect(byId.get(campaignLensUnlockId(lens.id))).toMatchObject({ shards: 0, pearls: lens.materialCost });
    }
    for (const upgrade of LENS_UPGRADES) {
      expect(byId.get(upgrade.id)).toMatchObject({ shards: upgrade.cost, pearls: upgrade.materialCost });
    }
  });

  it('can fund any one purchase with its full prerequisite chain before the final boss', () => {
    const firstWinRewards = ABILITY_ECONOMY_CHAPTERS.flatMap(entry => Array.from({ length: entry.nights },
      (_, index) => ({ shards: entry.firstWin, pearls: draftFirstWinPearls(entry.chapter, index + 1) })));
    const budget = firstWinRewards.slice(0, -1).reduce((sum, reward) => ({
      shards: sum.shards + reward.shards, pearls: sum.pearls + reward.pearls,
    }), { shards: 0, pearls: 0 });
    for (const node of CAMPAIGN_PURCHASE_DRAFT) {
      const chain = new Set([node.id]);
      for (const id of chain) byId.get(id)!.requires.forEach(required => chain.add(required));
      const cost = [...chain].reduce((sum, id) => ({
        shards: sum.shards + byId.get(id)!.shards, pearls: sum.pearls + byId.get(id)!.pearls,
      }), { shards: 0, pearls: 0 });
      expect(cost.shards, node.id).toBeLessThanOrEqual(budget.shards);
      expect(cost.pearls, node.id).toBeLessThanOrEqual(budget.pearls);
    }
  });

  it('opens only the intended hardware tiers and does not make late trials prerequisites', () => {
    for (const [chapter, id] of [[1, 'unlock-trap'], [2, 'unlock-harpoon'], [2, 'unlock-generator'], [2, 'device-slots-3'],
      [3, 'unlock-bell'], [3, 'unlock-mortar'], [4, 'device-slots-4'], [5, 'unlock-repair-lamp']] as const) {
      expect(byId.get(id)!.winsBeforePurchase).toBe(chapter === 1 ? 2 : winsAtChapterStart(chapter));
    }
    for (const rank of [1, 2, 3, 4]) {
      expect(byId.get(`device-objects-${rank}`)!.winsBeforePurchase).toBe(winsAtChapterStart(rank + 3));
    }
  });

  it('rejects invalid chapters and night numbers instead of projecting spurious gates or rewards', () => {
    expect(() => winsAtChapterStart(0)).toThrow('Unknown campaign draft chapter');
    expect(() => draftFirstWinPearls(2.5, 2)).toThrow('Unknown campaign draft chapter');
    expect(() => draftFirstWinPearls(2, 8)).toThrow('Unknown campaign draft night');
  });

  it.each(CAMPAIGN_LENS_PAIRS.map(([primary, secondary]) => ({ primary, secondary })))
  ('covers pearl costs for $primary at the boss and $secondary on an ordinary first win', ({ primary, secondary }) => {
    const chapter = CAMPAIGN_LENS_CHAPTERS[primary];
    const pearlPrice = (id: typeof primary | typeof secondary) => byId.get(campaignLensUnlockId(id))!.pearls
      + CAMPAIGN_PURCHASE_DRAFT.find(node => node.category === 'lens' && node.branch === id && node.requires.length === 1)!.pearls;
    expect(draftFirstWinPearls(chapter - 1, ABILITY_ECONOMY_CHAPTERS[chapter - 2]!.nights)).toBe(pearlPrice(primary));
    expect(draftFirstWinPearls(chapter, 1)).toBe(0);
    expect(draftFirstWinPearls(chapter, 2)).toBeGreaterThanOrEqual(pearlPrice(secondary));
    const entry = ABILITY_ECONOMY_CHAPTERS[chapter - 1]!;
    const bothFirstUpgrades = LENS_UPGRADES.filter(node => (node.lensId === primary || node.lensId === secondary)
      && node.requires.length === 0).reduce((sum, node) => sum + node.cost, 0);
    const openingBudget = 2 * (entry.firstWin - entry.repair - entry.recharge) - entry.instances;
    expect(openingBudget).toBeGreaterThanOrEqual(bothFirstUpgrades);
  });

  it('reallocates rather than adds pearls, and never anticipates the final reward', () => {
    const allRewards = ABILITY_ECONOMY_CHAPTERS.flatMap(entry => Array.from({ length: entry.nights },
      (_, index) => draftFirstWinPearls(entry.chapter, index + 1)));
    expect(allRewards).toHaveLength(56);
    expect(allRewards.reduce((sum, reward) => sum + reward, 0)).toBe(PROPOSED_FIRST_BOSS_PEARLS.reduce((sum, reward) => sum + reward, 0));
    expect(allRewards.slice(0, -1).reduce((sum, reward) => sum + reward, 0)).toBe(43);
  });
});

describe.each(['control', 'artillery'] as const)('%s campaign route', build => {
  it('keeps every night solvent with dated purchases and independent field limits', () => {
    const audit = auditCampaignBudget(build);
    for (const { snapshots } of audit.chapters) for (const { before, after } of snapshots) {
      const bought = new Set(before.purchases);
      expect(before.shards).toBeGreaterThanOrEqual(0);
      expect(before.pearls).toBeGreaterThanOrEqual(0);
      expect(after.shards).toBeGreaterThanOrEqual(0);
      const limit = (stat: 'maxObjects' | 'typeSlots') => UPGRADES.filter(node => bought.has(node.id) && node.effect.stat === stat)
        .reduce((sum, node) => sum + node.effect.amount, DEVICE_RULES[stat]);
      expect(before.field.length).toBeLessThanOrEqual(limit('maxObjects'));
      expect(new Set(before.field).size).toBeLessThanOrEqual(limit('typeSlots'));
      for (const kind of new Set(before.field)) {
        expect(before.field.filter(value => value === kind).length).toBeLessThanOrEqual(DEVICE_RULES.perType[kind]);
        expect(UPGRADES.some(node => bought.has(node.id) && node.effect.stat === kind)).toBe(true);
      }
      for (const id of bought) {
        const price = byId.get(id)!;
        expect(price.winsBeforePurchase).toBeLessThanOrEqual(before.wins);
        expect(price.requires.every(required => bought.has(required))).toBe(true);
      }
    }
    const { ledger } = audit;
    expect(audit.wins).toBe(56);
    expect(ledger.victoryShards).toBe(20210);
    expect(audit.shards).toBe(ledger.victoryShards - ledger.nodeShards - ledger.instanceShards - ledger.repair - ledger.recharge);
    expect(audit.pearls).toBe(ledger.earnedPearls - ledger.nodePearls);
    expect(audit.instances).toBe(ledger.extraInstances + UPGRADES.filter(node => audit.purchases.includes(node.id)
      && Object.hasOwn(DEVICE_RULES.definitions, node.effect.stat)).length);
    expect(finalBoss(audit).before.purchases.length).toBeGreaterThan(120);
    expect(audit.purchases).toEqual(finalBoss(audit).before.purchases);
  });

  it('can stop at 110 or 120 purchases without giving up its main lens and ability', () => {
    const [ability, lens, bossChapter] = build === 'control' ? ['seal', 'slowing', 3] as const : ['barrage', 'focused', 4] as const;
    for (const purchaseLimit of [110, 120]) {
      const audit = auditCampaignBudget(build, { purchaseLimit });
      expect(audit.chapters[bossChapter - 1]!.boss.before.purchases).toEqual(expect.arrayContaining([
        `ability-${ability}-unlock`, `ability-${ability}-power-1`, campaignLensUnlockId(lens),
      ]));
      expect(finalBoss(audit).before.purchases).toHaveLength(purchaseLimit);
      expect(finalBoss(audit).before.shards).toBeGreaterThanOrEqual(finalBoss(audit).before.reserve);
    }
  });

  it.each(ABILITY_ECONOMY_CHAPTERS.map(entry => entry.chapter))('pays for three zero-kill defeats before boss %i', chapter => {
    const audit = auditCampaignBudget(build, { stress: { chapter, kills: 'none' } });
    const { boss } = audit.chapters[chapter - 1]!;
    const ids = UPGRADES.filter(node => boss.before.purchases.includes(node.id)).map(node => node.id);
    const bill = boss.before.field.reduce((sum, kind, id) => {
      const device = { id, kind, health: 0, consumed: kind === 'light-trap', position: null };
      return sum + repairCost(device, ids) + rechargeCost(device, ids);
    }, 0);
    const minimumFieldSize = [3, 4, 4, 5, 6, 7, 7][chapter - 1]!;
    expect(boss.before.field.length).toBeGreaterThanOrEqual(minimumFieldSize);
    expect(boss.afterStressShards).toBeGreaterThanOrEqual(0);
    expect(boss.before.shards - boss.afterStressShards).toBe(3 * bill);
    expect(audit.ledger.defeatShards).toBe(0);
    expect(audit.ledger.earnedPearls).toBe(47);
    expect(audit.wins).toBe(56);
  });

  it('credits half kills on three defeats without a win reward or pearls', () => {
    const audit = auditCampaignBudget(build, { stress: { chapter: 7, kills: 'half' } });
    const zeroKills = auditCampaignBudget(build, { stress: { chapter: 7, kills: 'none' } });
    expect(audit.ledger.defeatShards).toBe(336);
    expect(finalBoss(audit).afterStressShards - finalBoss(zeroKills).afterStressShards).toBe(336);
    expect(audit.ledger.earnedPearls).toBe(zeroKills.ledger.earnedPearls);
    expect(audit.ledger.victoryShards).toBe(zeroKills.ledger.victoryShards);
  });
});
