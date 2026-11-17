import { describe, expect, it } from 'vitest';
import { CAMPAIGN_GENERAL_DRAFT, QUICK_TURN_DRAFT_RANKS, SHIELD_STABILIZATION_DRAFT_RANKS,
  validateCampaignGeneralDraft, type CampaignGeneralDraftNode } from '../src/content/campaignGeneralDraft';
import { UPGRADES } from '../src/content/upgrades';

function changed(index: number, update: (node: CampaignGeneralDraftNode) => CampaignGeneralDraftNode): CampaignGeneralDraftNode[] {
  return CAMPAIGN_GENERAL_DRAFT.map((node, i) => i === index ? update(structuredClone(node)) : structuredClone(node));
}

describe('stage A general candidates remain separate from purchases', () => {
  it('keeps the approved distribution, pending economy and stable legacy references', () => {
    expect(() => validateCampaignGeneralDraft()).not.toThrow();
    expect([1, 2, 3, 4, 5, 6, 7].map(chapter => CAMPAIGN_GENERAL_DRAFT.filter(n => n.chapter === chapter).length))
      .toEqual([0, 2, 1, 2, 3, 4, 4]);
    expect(['light', 'optics', 'hull', 'field', 'engineering'].map(branch => CAMPAIGN_GENERAL_DRAFT.filter(n => n.branch === branch).length))
      .toEqual([4, 4, 4, 2, 2]);
    for (const node of CAMPAIGN_GENERAL_DRAFT) {
      expect(node.price).toBe('pending'); expect(node.unlockNight).toBe('pending');
      expect(node.balanceStatus).toBe('provisional'); expect(node.dependenciesStatus).toBe('provisional');
      expect(UPGRADES.some(old => old.id === (node.id as string))).toBe(false);
    }
  });

  it('does not sum total rank values; geometry is explicitly an extra rank delta', () => {
    const quick = CAMPAIGN_GENERAL_DRAFT.filter(n => n.family === 'quickTurn');
    expect(quick.map(n => n.effect.rankValue)).toEqual(['total', 'total']);
    expect(QUICK_TURN_DRAFT_RANKS.map(r => r.speedBonus)).toEqual([.35, .6]);
    expect(SHIELD_STABILIZATION_DRAFT_RANKS.map(r => r.regenerationBonus)).toEqual([.25, .5]);
    const geometry = CAMPAIGN_GENERAL_DRAFT.filter(n => n.effect.kind === 'beamGeometry');
    expect(geometry.map(n => n.effect.rankValue)).toEqual(['additiveDelta', 'additiveDelta']);
    expect(geometry.map(n => n.requires)).toEqual([['beam-range-5'], ['beam-width-5']]);
  });

  it('states the conditional target and armor boundaries without replacing core beam rules', () => {
    const effects = CAMPAIGN_GENERAL_DRAFT.map(n => n.effect).filter(e => e.kind === 'conditionalBeamDamage');
    expect(effects.map(e => e.bonus)).toEqual([.15, .25, .2, .35]);
    expect(effects.every(e => e.stacking === 'addToCommonBeamBonus' && e.combinedConditionalBonusCap === .5
      && e.damage === 'directBeamOnly' && e.preservesArmorOcclusionAndTargetLimit)).toBe(true);
    expect(effects[0]?.condition).toBe('telegraphedPreparationOnHitZone');
    expect(effects[2]?.condition).toBe('previouslyArmoredHitZoneBrokenBeforeHit');
  });

  it('states first-hit, emergency, suppression and shared-field exclusions', () => {
    const resilience = CAMPAIGN_GENERAL_DRAFT.find(n => n.id === 'hull-onslaught-2')!.effect;
    expect(resilience).toMatchObject({ rankValue: 'total', reduction: .18, durationSeconds: 1.5,
      trigger: 'positiveHullDamageAfterHit', refresh: 'durationOnly', shieldHitsTrigger: false, totalHullReductionCap: .75 });
    expect(CAMPAIGN_GENERAL_DRAFT.find(n => n.id === 'hull-emergency-window-2')!.effect)
      .toMatchObject({ additionalSeconds: 1.5, activationsPerNight: 1, healing: 0, requiresExistingEmergencyProtection: true });
    expect(CAMPAIGN_GENERAL_DRAFT.find(n => n.id === 'engineering-backup-control')!.effect)
      .toMatchObject({ durationMultiplier: .7, minimumDurationSteps: 1, rounding: 'ceil',
        scope: 'finiteTimedSuppression', sourceMaintainedRootExcluded: true });
    expect(CAMPAIGN_GENERAL_DRAFT.find(n => n.id === 'shield-stabilization-1')!.effect)
      .toMatchObject({ immediateShield: 0, scope: 'oneSharedField', nightStartTriggers: false,
        trigger: 'firstPositiveNaturalRegenerationAfterZero', respectsRecoveryDelayAndProtectedDamage: true,
        bonusBudget: 'depleting-hit-absorbed-charge-times-bonus' });
  });
});

describe('candidate validation rejects broken design data', () => {
  it('rejects duplicate identifiers and incomplete catalogs', () => {
    expect(() => validateCampaignGeneralDraft(changed(1, n => ({ ...n, id: 'beam-disruption-1' })))).toThrow(/duplicate/);
    expect(() => validateCampaignGeneralDraft(CAMPAIGN_GENERAL_DRAFT.slice(1))).toThrow(/16/);
  });

  it('rejects wrong chapters even when aggregate chapter counts are preserved', () => {
    const draft = changed(0, n => ({ ...n, chapter: 4 }));
    draft[2] = { ...draft[2]!, chapter: 2 };
    expect(() => validateCampaignGeneralDraft(draft)).toThrow(/chapter/);
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n, chapter: NaN })))).toThrow(/chapter/);
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n, branch: 'hull' })))).toThrow(/branch/);
  });

  it('rejects missing rank chains, unknown references and same-chapter cycles', () => {
    expect(() => validateCampaignGeneralDraft(changed(1, n => ({ ...n, requires: ['beam-power-1'] })))).toThrow(/previous rank/);
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n,
      requires: ['nonexistent' as CampaignGeneralDraftNode['requires'][number]] })))).toThrow(/unknown dependency/);
    const draft = changed(0, n => ({ ...n, requires: ['beam-quick-turn-1'] }));
    draft[4] = { ...draft[4]!, requires: ['beam-disruption-1'] };
    expect(() => validateCampaignGeneralDraft(draft)).toThrow(/cycle/);
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n, requires: ['beam-disruption-2'] })))).toThrow(/later chapter/);
  });

  it('rejects missing sixth-rank and emergency prerequisites', () => {
    for (const index of [6, 7, 10]) {
      expect(() => validateCampaignGeneralDraft(changed(index, n => ({ ...n, requires: ['beam-power-1'] })))).toThrow(/legacy prerequisite/);
    }
  });

  it('rejects non-finite bonuses, immunity, negative time and reversed angle thresholds', () => {
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n, effect: n.effect.kind === 'conditionalBeamDamage'
      ? { ...n.effect, bonus: Infinity } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(8, n => ({ ...n, effect: n.effect.kind === 'onslaughtResilience'
      ? { ...n.effect, totalHullReductionCap: 1 } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(12, n => ({ ...n, effect: n.effect.kind === 'shieldStabilization'
      ? { ...n.effect, rules: { ...n.effect.rules, durationSeconds: -1 } } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(4, n => ({ ...n, effect: n.effect.kind === 'quickTurn'
      ? { ...n.effect, rules: { ...n.effect.rules, fullBonusAngle: Math.PI / 6 } } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(4, n => ({ ...n, effect: n.effect.kind === 'quickTurn'
      ? { ...n.effect, rules: { ...n.effect.rules, cooldownSeconds: .1 } } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(4, n => ({ ...n, effect: n.effect.kind === 'quickTurn'
      ? { ...n.effect, rules: { ...n.effect.rules, fadeInSeconds: NaN } } : n.effect })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(15, n => ({ ...n, effect: n.effect.kind === 'backupControl'
      ? { ...n.effect, durationMultiplier: 0 } : n.effect })))).toThrow(/effect values/);
  });

  it('rejects mixing unrelated families or replacing total values with deltas', () => {
    expect(() => validateCampaignGeneralDraft(changed(0, n => ({ ...n, effect: CAMPAIGN_GENERAL_DRAFT[4]!.effect })))).toThrow(/semantics/);
    expect(() => validateCampaignGeneralDraft(changed(6, n => ({ ...n,
      effect: { ...n.effect, rankValue: 'total' } as CampaignGeneralDraftNode['effect'] })))).toThrow(/semantics/);
  });

  it('rejects data bypassing shield recovery or enabling stabilization on night start', () => {
    expect(() => validateCampaignGeneralDraft(changed(12, n => ({ ...n,
      effect: { ...n.effect, nightStartTriggers: true } as unknown as CampaignGeneralDraftNode['effect'] })))).toThrow(/effect values/);
    expect(() => validateCampaignGeneralDraft(changed(12, n => ({ ...n,
      effect: { ...n.effect, bonusBudget: undefined } as unknown as CampaignGeneralDraftNode['effect'] })))).toThrow(/effect values/);
  });
});
