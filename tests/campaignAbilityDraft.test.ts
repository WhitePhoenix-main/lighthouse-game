import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ABILITY_DRAFT, validateCampaignAbilityDraft,
  type CampaignAbilityDraftNode, type CampaignAbilityNodeId } from '../src/content/campaignAbilityDraft';
import { UPGRADES } from '../src/content/upgrades';

const get = (id: CampaignAbilityNodeId): CampaignAbilityDraftNode => CAMPAIGN_ABILITY_DRAFT.find(n => n.id === id)!;
function changed(id: CampaignAbilityNodeId, patch: Partial<CampaignAbilityDraftNode>): CampaignAbilityDraftNode[] {
  return CAMPAIGN_ABILITY_DRAFT.map(n => n.id === id ? { ...structuredClone(n), ...patch } : structuredClone(n));
}

describe('four new ability branches remain isolated Stage A candidates', () => {
  it('keeps forty new nodes and all sixteen original flash purchases', () => {
    expect(() => validateCampaignAbilityDraft()).not.toThrow();
    expect(CAMPAIGN_ABILITY_DRAFT).toHaveLength(40);
    const oldFlash = UPGRADES.filter(n => n.id === 'unlock-flash' || n.id.startsWith('flash-'));
    expect(oldFlash).toHaveLength(16);
    expect(CAMPAIGN_ABILITY_DRAFT.some(n => (n.abilityId as string) === 'flash')).toBe(false);
    expect(CAMPAIGN_ABILITY_DRAFT.every(n => !UPGRADES.some(old => (old.id as string) === n.id))).toBe(true);
    for (const ability of ['overload', 'seal', 'barrage', 'bastion']) {
      const group = CAMPAIGN_ABILITY_DRAFT.filter(n => n.abilityId === ability);
      expect(group).toHaveLength(10);
      expect(group.filter(n => n.kind === 'unlock')).toHaveLength(1);
    }
  });

  it('specifies only approved opening chapters; values, prices, nights and upgrade chapters remain pending', () => {
    expect(CAMPAIGN_ABILITY_DRAFT.filter(n => n.kind === 'unlock').map(n => [n.abilityId, n.chapter]))
      .toEqual([['overload', 2], ['seal', 3], ['barrage', 4], ['bastion', 5]]);
    for (const node of CAMPAIGN_ABILITY_DRAFT) {
      expect(node).toMatchObject({ price: 'pending', unlockNight: 'pending', effectValues: 'pending',
        balanceStatus: 'pending', dependenciesStatus: 'provisional' });
      if (node.kind === 'upgrade') expect(node.chapter).toBe('pending');
    }
  });

  it('preserves independently accessible specializations and rank chains', () => {
    for (const node of CAMPAIGN_ABILITY_DRAFT) {
      if (node.kind === 'unlock') expect(node.requires).toEqual([]);
      else if (node.rank === 1) expect(node.requires).toEqual([`ability-${node.abilityId}-unlock`]);
      else expect(node.requires).toEqual([`ability-${node.abilityId}-${node.family}-1`]);
    }
    expect(get('ability-barrage-correction').requires).toEqual(['ability-barrage-unlock']);
    expect(get('ability-barrage-air-intercept').requires).toEqual(['ability-barrage-unlock']);
  });

  it('keeps overload within actual beam selection and excludes burning amplification', () => {
    expect(get('ability-overload-guidance').effects).toEqual([
      { kind: 'increase', target: 'eligibleWeapons', stat: 'damage', condition: 'beamSelectedDuringOverload' },
    ]);
    expect(get('ability-overload-unlock').rules).toMatchObject({ burningBonus: false,
      beamGeometry: 'preserveLensSectorRangeOcclusionAndTargetLimit', mandatoryBeamShutdown: false });
  });

  it('retains one eligible extra attack, weapon targeting and optional mortar/harpoon effects', () => {
    expect(get('ability-barrage-unlock').rules).toMatchObject({ attacks: 'oneAdditionalAttackPerEligibleWeapon',
      preservesWeaponRangesAndTargets: true, cannonsHitAir: false, mortarsHitSeaHull: false,
      destroyedOrSuppressedWeaponsParticipate: false, nonWeaponsParticipate: false,
      targeting: 'pendingInputControls', normalFiringCycle: 'resetFiredWeaponsToFullCooldown',
      noEligibleAttack: 'doNotConsumeReadiness' });
    expect(get('ability-barrage-air-intercept').effects[0]).toMatchObject({ target: 'harpoons', condition: 'additionalAttackAgainstAir' });
    expect(get('ability-barrage-blast-radius').effects[0]).toMatchObject({ target: 'mortars', stat: 'blastRadius' });
    expect(get('ability-barrage-projectile-speed').effects[0]).toMatchObject({ target: 'mortars', stat: 'projectileSpeed' });
    expect(get('ability-barrage-correction').effects[0]).toMatchObject({ condition: 'additionalAttackLitOnImpact' });
  });

  it('keeps seal non-damaging, strongest-only and first-entry limited', () => {
    expect(get('ability-seal-unlock').rules).toMatchObject({ damage: false, illumination: false,
      stacking: 'strongestSlowOnly', entry: 'oncePerEnemyPerCastWithoutBoundaryRefresh',
      stopsStationaryPreparationOrBossAbilities: false });
    expect(get('ability-seal-entry').effects[0]).toMatchObject({ stat: 'entrySlow', condition: 'oncePerEnemyPerCast' });
  });

  it('protects bodies separately from field absorption and never heals or refills shields', () => {
    expect(get('ability-bastion-unlock').rules).toMatchObject({ healing: false, shieldRefill: false,
      shieldRegenerationBonus: false, reduction: 'oncePerHitWithoutFieldAndBodyDoubleReduction',
      combinedReductionCap: 'pendingBelowImmunity' });
    expect(get('ability-bastion-mechanisms').effects[0]).toMatchObject({ target: 'deviceBodies', condition: 'duringBastionWithoutFieldAbsorption' });
    expect(get('ability-bastion-fade').effects[0]).toMatchObject({ stat: 'residualProtection', condition: 'afterMainPhase' });
  });
});

describe('ability draft structural validation', () => {
  it('rejects incomplete catalogs, duplicates, invalid families and wrong ranks', () => {
    expect(() => validateCampaignAbilityDraft(CAMPAIGN_ABILITY_DRAFT.slice(1))).toThrow(/40/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-power-1', { id: 'ability-overload-unlock' }))).toThrow(/duplicate/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-power-1', { family: 'radius' }))).toThrow(/family/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-guidance', { rank: 2 }))).toThrow(/rank/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-power-1',
      { abilityId: 'flash' as CampaignAbilityDraftNode['abilityId'] }))).toThrow(/unknown ability/);
  });

  it('rejects unknown references, cross-ability prerequisites and cycles', () => {
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-power-1',
      { requires: ['missing-node' as CampaignAbilityNodeId] }))).toThrow(/unknown dependency/);
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-power-1',
      { requires: ['ability-overload-unlock'] }))).toThrow(/cross ability/);
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-power-1',
      { requires: ['ability-seal-power-2'] }))).toThrow(/cycle/);
  });

  it('rejects broken rank chains, missing unlock prerequisites and weapon specialization gates', () => {
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-power-2', { requires: ['ability-seal-unlock'] }))).toThrow(/previous rank/);
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-entry', { requires: [] }))).toThrow(/own unlock/);
    for (const prerequisite of ['ability-barrage-blast-radius', 'ability-barrage-projectile-speed', 'ability-barrage-air-intercept'] as const) {
      expect(() => validateCampaignAbilityDraft(changed('ability-barrage-correction', { requires: [prerequisite] }))).toThrow(/specialization gate/);
      expect(() => validateCampaignAbilityDraft(changed('ability-barrage-power-1',
        { requires: ['ability-barrage-unlock', prerequisite] }))).toThrow(/specialization gate/);
    }
  });

  it('rejects invented effects, mismatched targets and extra attacks', () => {
    expect(() => validateCampaignAbilityDraft(changed('ability-barrage-correction',
      { effects: get('ability-seal-entry').effects }))).toThrow(/semantics/);
    expect(() => validateCampaignAbilityDraft(changed('ability-barrage-unlock', {
      rules: { ...get('ability-barrage-unlock').rules, attacks: 'twoAdditionalAttacks' },
    }))).toThrow(/rules/);
    expect(() => validateCampaignAbilityDraft(changed('ability-barrage-unlock', {
      rules: { ...get('ability-barrage-unlock').rules, cannonsHitAir: true },
    }))).toThrow(/rules/);
    expect(() => validateCampaignAbilityDraft(changed('ability-seal-entry', {
      effects: [{ ...get('ability-seal-entry').effects[0]!, condition: 'afterLeavingArea' }],
    }))).toThrow(/semantics/);
  });

  it('rejects unapproved chapter placement, economy and numeric effect values', () => {
    expect(() => validateCampaignAbilityDraft(changed('ability-bastion-unlock', { chapter: 4 }))).toThrow(/chapter/);
    expect(() => validateCampaignAbilityDraft(changed('ability-bastion-power-1', { chapter: 5 }))).toThrow(/chapter/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-unlock',
      { price: 100 as unknown as 'pending' }))).toThrow(/pending/);
    expect(() => validateCampaignAbilityDraft(changed('ability-overload-unlock',
      { effectValues: 1.5 as unknown as 'pending' }))).toThrow(/pending/);
  });

  it('does not depend on node or effect property order', () => {
    const nodes = [...CAMPAIGN_ABILITY_DRAFT].reverse().map(n => ({ ...n,
      effects: n.effects.map(e => ({ stat: e.stat, target: e.target, kind: e.kind,
        ...('condition' in e ? { condition: e.condition } : {}) })),
    }));
    expect(() => validateCampaignAbilityDraft(nodes)).not.toThrow();
  });
});
