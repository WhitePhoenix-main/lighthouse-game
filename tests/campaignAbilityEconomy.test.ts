import { describe, expect, it } from 'vitest';
import { ABILITY_PRICES, ABILITY_ECONOMY_CHAPTERS, PROPOSED_FIRST_BOSS_PEARLS,
  validateCampaignAbilityEconomy, abilityEconomyRoutePrices, auditAbilityOpening,
  auditAbilityShardRoute, auditAbilityPearlRoute } from '../src/content/campaignAbilityEconomy';
import { CAMPAIGN_ABILITY_DRAFT, type CampaignAbilityNodeId } from '../src/content/campaignAbilityDraft';
import type { CampaignAbilityPrice } from '../src/content/campaignAbilityBalanceTypes';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';

const changed = (id: CampaignAbilityNodeId, patch: Partial<CampaignAbilityPrice>) =>
  ABILITY_PRICES.map(p => p.id === id ? { ...p, ...patch } : p);

describe('provisional ability economy', () => {
  it('retains forty independent prices, sixteen main-route nodes and eight optional pearl leaves', () => {
    expect(() => validateCampaignAbilityEconomy()).not.toThrow();
    expect(ABILITY_PRICES).toHaveLength(40);
    expect(abilityEconomyRoutePrices('main')).toHaveLength(16);
    expect(abilityEconomyRoutePrices('broad')).toHaveLength(24);
    expect(abilityEconomyRoutePrices('complete')).toHaveLength(40);
    expect(ABILITY_PRICES.filter(p => p.pearls > 0)).toHaveLength(8);
    for (const ability of ['overload', 'seal', 'barrage', 'bastion']) {
      const group = ABILITY_PRICES.filter(p => p.abilityId === ability);
      expect(group.reduce((sum, p) => sum + p.pearls, 0)).toBe(3);
      expect(group.filter(p => p.pearls === 0)).toHaveLength(8);
      for (const price of group.filter(p => p.pearls === 0)) {
        for (const dependency of CAMPAIGN_ABILITY_DRAFT.find(n => n.id === price.id)!.requires)
          expect(ABILITY_PRICES.find(p => p.id === dependency)!.pearls).toBe(0);
      }
    }
  });
  it.each([-1, NaN, Infinity, .5])('rejects invalid shard or pearl amount %s', amount => {
    expect(() => validateCampaignAbilityEconomy(changed('ability-overload-unlock', { shards: amount }))).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-overload-armor', { pearls: amount }))).toThrow();
  });
  it('rejects duplicate, wrong currency/owner/chapter and reversed dependency availability', () => {
    expect(() => validateCampaignAbilityEconomy([...ABILITY_PRICES.slice(1), ABILITY_PRICES[1]!])).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-seal-unlock', { currency: 'shards-and-pearls' }))).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-overload-armor', { currency: 'shards' }))).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-overload-power-1', { pearls: 1, currency: 'shards-and-pearls' }))).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-seal-unlock', { abilityId: 'overload' }))).toThrow();
    for (const chapter of [NaN, 0, 2, 8, 3.5])
      expect(() => validateCampaignAbilityEconomy(changed('ability-seal-unlock', { chapter }))).toThrow();
    expect(() => validateCampaignAbilityEconomy(changed('ability-overload-power-1', { chapter: 6 }))).toThrow(/later/);
    const gated = CAMPAIGN_ABILITY_DRAFT.map(n => n.id === 'ability-overload-power-1'
      ? { ...n, requires: ['ability-overload-armor' as const] } : n);
    expect(() => validateCampaignAbilityEconomy(ABILITY_PRICES, gated)).toThrow();
  });
  it('funds opening and first upgrade after two ordinary nights with maintenance/instances reserved', () => {
    for (const ability of ['overload', 'seal', 'barrage', 'bastion'] as const) {
      const audit = auditAbilityOpening(ability);
      expect(audit.ordinaryWins).toBeLessThan(audit.ordinaryNightsBeforeBoss);
      expect(audit.surplus).toBeGreaterThanOrEqual(0);
    }
  });
  it('reconciles all income, service and instance reserves; stress includes no victory or boss reward', () => {
    expect(ABILITY_ECONOMY_CHAPTERS.reduce((s, c) => s + c.nights, 0)).toBe(56);
    for (const route of ['main', 'broad'] as const) {
      const rows = auditAbilityShardRoute(route);
      expect(rows.reduce((s, r) => s + r.income, 0)).toBe(20210);
      expect(rows.reduce((s, r) => s + r.instances, 0)).toBe(1400);
      expect(rows[2]!.basicPairedPrerequisites).toBe(150);
      expect(rows[2]!.otherProgressionAfterEarmark).toBe(850);
      for (const [index, row] of rows.entries()) {
        expect(row.carryOut).toBe(row.carryIn + row.income - row.maintenance - row.instances
          - row.otherProgression - row.lensShards - row.abilityShards);
        expect(row.afterThreeZeroKillDefeats).toBe(row.carryOut - row.emergencyReserve);
        expect(row.afterThreeHalfKillDefeats).toBe(row.afterThreeZeroKillDefeats
          + 3 * Math.floor(ABILITY_ECONOMY_CHAPTERS[index]!.killBudget / 2));
        expect(row.carryOut).toBeGreaterThanOrEqual(0);
        expect(row.afterThreeZeroKillDefeats).toBeGreaterThanOrEqual(0);
      }
    }
    expect(auditAbilityShardRoute('complete')[6]!.carryOut).toBe(-1571);
    expect(auditAbilityShardRoute('complete', 'original-reserve')[6]!.carryOut).toBe(-1771);
    expect(auditAbilityShardRoute('main', 'original-reserve')[3]!.afterThreeZeroKillDefeats).toBe(-145);
    expect(auditAbilityShardRoute('broad')[6]!.beforeBossIfAllChapterPurchasesPaid).toBe(151);
    // Chapter 6's last upgrade is bought after its boss, or another purchase is deferred.
    expect(auditAbilityShardRoute('broad')[5]!.beforeBossIfAllChapterPurchasesPaid).toBe(-6);
    const focusedMain = auditAbilityShardRoute('main', 'ability-priority', 'focused-complete');
    expect(focusedMain[6]!.carryOut).toBe(2294);
    expect(focusedMain.every(r => r.afterThreeZeroKillDefeats >= 0)).toBe(true);
  });
  it('reserves each lens pair and first upgrades before spending pearls; final boss cannot fund prefinal build', () => {
    expect(PROPOSED_FIRST_BOSS_PEARLS.reduce((s, n) => s + n, 0)).toBe(47);
    const broad = auditAbilityPearlRoute('broad');
    expect(broad.map(r => r.openingReserve)).toEqual([5, 6, 6, 3, 0, 0, 0]);
    expect(broad.map(r => r.firstUpgradeReserve)).toEqual([2, 2, 2, 1, 0, 0, 0]);
    for (const row of broad) {
      expect(row.available).toBeGreaterThanOrEqual(0);
      expect(row.available).toBe(row.earned - row.lensReserve - row.abilityPearls);
      for (const id of row.bought)
        expect(ABILITY_PRICES.find(p => p.id === id)!.chapter).toBeLessThanOrEqual(Math.min(7, row.usableBeforeChapter));
    }
    expect(broad[5]).toMatchObject({ earned: 43, lensReserve: 28, abilityPearls: 12, available: 3 });
    expect(broad[6]).toMatchObject({ earned: 47, lensReserve: 28, abilityPearls: 12, available: 7 });
    expect(auditAbilityPearlRoute('main')[5]).toMatchObject({ abilityPearls: 3, available: 12 });
    const completeLensCost = LENSES.reduce((s, l) => s + l.materialCost, 0)
      + LENS_UPGRADES.reduce((s, u) => s + u.materialCost, 0);
    expect(completeLensCost).toBe(59);
    expect(completeLensCost + 12 - 47).toBe(24);
  });
});
