import { describe, expect, it } from 'vitest';
import { ABILITY_BASE_RULES, ABILITY_NUMERIC_NODES, validateCampaignAbilityBalance } from '../src/content/campaignAbilityBalance';
import type { CampaignAbilityRulesById, CampaignAbilityNumericNode } from '../src/content/campaignAbilityBalanceTypes';
import type { CampaignAbilityDraftId, CampaignAbilityNodeId } from '../src/content/campaignAbilityDraft';

type MutableBases = { -readonly [K in keyof CampaignAbilityRulesById]: CampaignAbilityRulesById[K] };
const bases = (): MutableBases => structuredClone(ABILITY_BASE_RULES);
const nodes = (): CampaignAbilityNumericNode[] => structuredClone(ABILITY_NUMERIC_NODES) as CampaignAbilityNumericNode[];
function replaceDelta(id: CampaignAbilityNodeId, amount: number): CampaignAbilityNumericNode[] {
  return nodes().map(node => node.id === id ? { ...node, adjustments: node.adjustments.map(delta => ({ ...delta, amount })) } : node);
}
function vector(id: CampaignAbilityDraftId): Record<string, unknown> {
  const result = { ...ABILITY_BASE_RULES[id] } as unknown as Record<string, unknown>;
  for (const node of ABILITY_NUMERIC_NODES.filter(candidate => candidate.abilityId === id))
    for (const delta of node.adjustments) result[delta.stat] = (result[delta.stat] as number) + delta.amount;
  return result;
}

describe('candidate ability numbers', () => {
  it('provides four initially-ready bases and 40 nodes, with empty unlock deltas', () => {
    expect(() => validateCampaignAbilityBalance()).not.toThrow();
    expect(ABILITY_NUMERIC_NODES).toHaveLength(40);
    for (const [id, base] of Object.entries(ABILITY_BASE_RULES)) {
      expect(base.initiallyReady).toBe(true);
      expect(ABILITY_NUMERIC_NODES.filter(node => node.abilityId === id)).toHaveLength(10);
      expect(ABILITY_NUMERIC_NODES.find(node => node.id === `ability-${id}-unlock`)?.adjustments).toEqual([]);
    }
  });
  it('composes the entire overload vector without duplicating its unlock bonus', () => {
    const result = vector('overload');
    expect(result).toMatchObject({ abilityId: 'overload', initiallyReady: true, cooldownSeconds: 20,
      durationSeconds: 6, turnSpeedBonus: 0.35, armorDamageBonus: 0.25, guidanceDamageBonus: 0.15,
      damageBonusCap: 0.75, turnSpeedBonusCap: 0.75 });
    expect(result.damageBonus).toBeCloseTo(0.55);
    // Armored direct hits reach the ability's 75% cap; the 15% guidance applies to weapons only.
    expect(Math.min(Number(result.damageBonus) + Number(result.armorDamageBonus), Number(result.damageBonusCap))).toBe(0.75);
  });
  it('composes the entire seal vector and enables entry/lingering only through their nodes', () => {
    expect(ABILITY_BASE_RULES.seal).toMatchObject({ entrySeconds: 0, entrySpeedMultiplier: 1, lingeringSeconds: 0 });
    const result = vector('seal');
    expect(result).toMatchObject({ abilityId: 'seal', initiallyReady: true, cooldownSeconds: 22, durationSeconds: 7,
      radius: 110, targetingRange: 300, minimumSpeedMultiplier: 0.25, entrySpeedMultiplier: 0.25,
      entrySeconds: 1, lingeringSeconds: 1 });
    expect(result.speedMultiplier).toBeCloseTo(0.45);
  });
  it('composes the entire barrage vector and keeps exactly one extra attack', () => {
    expect(vector('barrage')).toEqual({ abilityId: 'barrage', initiallyReady: true, cooldownSeconds: 26,
      targetingRange: 300, additionalAttacksPerWeapon: 1, damageBonus: 0.30, armorDamageBonus: 0.25,
      airDamageBonus: 0.25, blastRadiusBonus: 0.20, projectileSpeedBonus: 0.25, litDamageBonus: 0.15, damageBonusCap: 0.75 });
  });
  it('composes the entire bastion vector with finite residual protection below the main phase', () => {
    const result = vector('bastion');
    expect(result).toMatchObject({ abilityId: 'bastion', initiallyReady: true, cooldownSeconds: 24, durationSeconds: 6,
      mechanismReduction: 0.10, heavyReduction: 0.10, fadeSeconds: 2, fadeReduction: 0.15,
      abilityReductionCap: 0.60, totalReductionCap: 0.75 });
    expect(result.damageReduction).toBeCloseTo(0.40);
  });
  it('allows tuning rather than requiring identical candidate numbers', () => {
    const tuned = bases();
    tuned.overload = { ...tuned.overload, cooldownSeconds: 25, damageBonus: 0.32, initiallyReady: false };
    expect(() => validateCampaignAbilityBalance(tuned, replaceDelta('ability-overload-power-2', 0.12))).not.toThrow();
  });
  it.each([NaN, Infinity, -Infinity, -0.1])('rejects invalid base values %s', invalid => {
    const tuned = bases();
    tuned.overload = { ...tuned.overload, damageBonus: invalid };
    expect(() => validateCampaignAbilityBalance(tuned)).toThrow();
  });
  it.each([NaN, Infinity, -Infinity, -1, 0])('rejects invalid positive deltas %s', invalid => {
    expect(() => validateCampaignAbilityBalance(bases(), replaceDelta('ability-overload-power-1', invalid))).toThrow();
  });
  it('rejects positive recovery, reversed slow, rank regression and effects exceeding bounds', () => {
    for (const [id, amount] of [
      ['ability-overload-recovery-1', 2], ['ability-seal-power-1', 0.1],
      ['ability-overload-power-2', 0.01], ['ability-seal-power-2', -0.5],
      ['ability-bastion-power-2', 0.9], ['ability-seal-radius-2', 1000],
    ] as const) expect(() => validateCampaignAbilityBalance(bases(), replaceDelta(id, amount))).toThrow();
  });
  it('rejects missing, duplicate, unknown and foreign IDs', () => {
    expect(() => validateCampaignAbilityBalance(bases(), nodes().slice(1))).toThrow();
    const duplicate = nodes(); duplicate[1] = duplicate[0]!;
    expect(() => validateCampaignAbilityBalance(bases(), duplicate)).toThrow();
    for (const patch of [{ id: 'ability-unknown-unlock' }, { abilityId: 'seal' }]) {
      const changed = nodes(); changed[0] = { ...changed[0]!, ...patch } as CampaignAbilityNumericNode;
      expect(() => validateCampaignAbilityBalance(bases(), changed)).toThrow();
    }
    const missing = bases(); delete (missing as Partial<MutableBases>).seal;
    expect(() => validateCampaignAbilityBalance(missing)).toThrow();
  });
  it('rejects wrong stats, duplicate stats and nonempty unlocks', () => {
    for (const adjustments of [
      [{ stat: 'damageBonus', amount: 0.1 }],
      [{ stat: 'radius', amount: 1 }],
      [{ stat: 'turnSpeedBonus', amount: 0.1 }, { stat: 'turnSpeedBonus', amount: 0.1 }],
    ] as const) {
      const changed = nodes(); changed[0] = { ...changed[0]!, adjustments };
      expect(() => validateCampaignAbilityBalance(bases(), changed)).toThrow();
    }
    const changed = nodes();
    changed[1] = { ...changed[1]!, adjustments: [{ stat: 'radius', amount: 1 }] };
    expect(() => validateCampaignAbilityBalance(bases(), changed)).toThrow();
  });
  it('rejects negative or infinite caps and immunity', () => {
    for (const value of [-1, Infinity, NaN]) {
      const tuned = bases(); tuned.overload = { ...tuned.overload, damageBonusCap: value };
      expect(() => validateCampaignAbilityBalance(tuned)).toThrow();
    }
    const tuned = bases(); tuned.bastion = { ...tuned.bastion, totalReductionCap: 1 };
    expect(() => validateCampaignAbilityBalance(tuned)).toThrow();
  });
  it('rejects base specializations and permanent effect uptime in any purchase subset', () => {
    const tuned = bases(); tuned.seal = { ...tuned.seal, lingeringSeconds: 1 };
    expect(() => validateCampaignAbilityBalance(tuned)).toThrow();
    const uptime = bases(); uptime.bastion = { ...uptime.bastion, cooldownSeconds: 10 };
    expect(() => validateCampaignAbilityBalance(uptime)).toThrow();
    // Main power upgrades are optional: fade cannot rely on buying them first.
    const tail = nodes().map(node => node.id === 'ability-bastion-fade'
      ? { ...node, adjustments: [{ stat: 'fadeSeconds' as const, amount: 2 }, { stat: 'fadeReduction' as const, amount: 0.35 }] } : node);
    expect(() => validateCampaignAbilityBalance(bases(), tail)).toThrow();
  });
});
