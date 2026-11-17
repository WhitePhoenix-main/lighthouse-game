import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ABILITY_DRAFT } from '../src/content/campaignAbilityDraft';
import { ABILITY_BASE_RULES } from '../src/content/campaignAbilityBalance';
import { calculateCandidateAbility } from '../src/progression/campaignAbilities';
import { candidateAbilityWindows, previewOverload, previewBarrageShot, previewSealSpeed, previewBastionDamage } from '../src/progression/campaignAbilityPreview';

const all = CAMPAIGN_ABILITY_DRAFT.map(node => node.id);

describe('candidate ability arithmetic controls (not gameplay simulation)', () => {
  it('budgets overload common bonuses and armor without multiplying ability bonuses together', () => {
    const rules = calculateCandidateAbility('overload', all)!;
    const modifiers = previewOverload(rules, { commonDamageBonus: .3, quickTurnBonus: .6, commonDeviceDamageBonus: .1 });
    expect(modifiers.commonBeamDamageMultiplier).toBeCloseTo(1.85);
    expect(modifiers.armoredCommonBeamDamageMultiplier).toBeCloseTo(2.05); // .55 + .25 capped at .75.
    expect(modifiers.turnSpeedMultiplier).toBeCloseTo(1.75); // The fast-turn burst shares the temporary turn cap.
    expect(modifiers.selectedDeviceMultiplier).toBeCloseTo(1.25);
    expect(previewOverload(ABILITY_BASE_RULES.overload).commonBeamDamageMultiplier).toBeCloseTo(1.35);
  });

  it('keeps barrage air and mortar specializations independent and caps the armor portion', () => {
    const rules = calculateCandidateAbility('barrage', all)!;
    expect(rules.additionalAttacksPerWeapon).toBe(1);
    const harpoon = previewBarrageShot(rules, 'harpoon', true, true);
    expect(harpoon.damageMultiplier).toBeCloseTo(1.7);
    expect(harpoon.armoredDamageMultiplier).toBeCloseTo(1.75);
    expect(harpoon.radiusMultiplier).toBe(1);
    expect(harpoon.projectileSpeedMultiplier).toBe(1);
    const mortar = previewBarrageShot(rules, 'mortar', false, true);
    expect(mortar.damageMultiplier).toBeCloseTo(1.45);
    expect(mortar.radiusMultiplier).toBeCloseTo(1.2);
    expect(mortar.projectileSpeedMultiplier).toBeCloseTo(1.25);
    expect(previewBarrageShot(rules, 'cannon', false, false).damageMultiplier).toBeCloseTo(1.3);
    expect(previewBarrageShot(rules, 'cannon', false, true, .1).damageMultiplier).toBeCloseTo(1.55);
  });

  it('takes the strongest slow, limits entry to purchased impulse and never multiplies slows', () => {
    const rules = calculateCandidateAbility('seal', all)!;
    expect(previewSealSpeed(rules)).toBeCloseTo(.45);
    expect(previewSealSpeed(rules, .4)).toBe(.4);
    expect(previewSealSpeed(rules, .6, true)).toBe(.25);
    expect(previewSealSpeed(rules, .2, true)).toBe(.2); // The seal cap does not weaken a stronger external source.
    expect(previewSealSpeed(ABILITY_BASE_RULES.seal, 1, true)).toBe(.65);
  });

  it('applies bastion to one receiving layer and caps total defense without weakening existing protection', () => {
    const rules = calculateCandidateAbility('bastion', all)!;
    expect(previewBastionDamage(rules, 1, 'lighthouse')).toBeCloseTo(.6);
    expect(previewBastionDamage(rules, 1, 'field')).toBeCloseTo(.6);
    expect(previewBastionDamage(rules, 1, 'device')).toBeCloseTo(.5);
    expect(previewBastionDamage(rules, 1, 'device', true)).toBeCloseTo(.4);
    expect(previewBastionDamage(rules, .5, 'device', true)).toBe(.25);
    expect(previewBastionDamage(rules, .1, 'device', true)).toBe(.1);
    // Fading has its own weaker reduction and never inherits full-phase conditionals.
    expect(previewBastionDamage(rules, 1, 'device', true, true)).toBe(.85);
  });

  it('measures 2–4 minute upper-bound cast schedules and clips unfinished windows at the night end', () => {
    const rows: object[] = [];
    for (const seconds of [120, 180, 240]) for (const id of ['overload', 'seal', 'barrage', 'bastion'] as const) {
      const base = candidateAbilityWindows(ABILITY_BASE_RULES[id], seconds);
      const full = candidateAbilityWindows(calculateCandidateAbility(id, all)!, seconds);
      expect(full.casts).toBeGreaterThanOrEqual(base.casts);
      expect(full.activeSeconds + full.fadeSeconds).toBeLessThanOrEqual(seconds);
      rows.push({ seconds, id, baseCasts: base.casts, ...full });
    }
    expect(candidateAbilityWindows(calculateCandidateAbility('overload', all)!, 120)).toEqual({ casts: 6, activeSeconds: 36, fadeSeconds: 0 });
    expect(candidateAbilityWindows(calculateCandidateAbility('bastion', all)!, 25)).toEqual({ casts: 2, activeSeconds: 7, fadeSeconds: 2 });
    expect(candidateAbilityWindows(ABILITY_BASE_RULES.overload, 0).casts).toBe(0);
    expect(candidateAbilityWindows({ ...ABILITY_BASE_RULES.overload, initiallyReady: false }, 24).casts).toBe(0);
    console.table(rows);
  });

  it('rejects invalid arithmetic inputs', () => {
    expect(() => candidateAbilityWindows(ABILITY_BASE_RULES.overload, Infinity)).toThrow();
    expect(() => previewOverload(ABILITY_BASE_RULES.overload, { commonDamageBonus: NaN })).toThrow();
    expect(() => previewSealSpeed(ABILITY_BASE_RULES.seal, -1)).toThrow();
    expect(() => previewBastionDamage(ABILITY_BASE_RULES.bastion, 1.1, 'field')).toThrow();
  });
});
