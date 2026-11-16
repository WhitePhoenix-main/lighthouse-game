import type { BarrageAbilityRules, BastionAbilityRules, CampaignAbilityRules, OverloadAbilityRules, SealAbilityRules } from '../content/campaignAbilityBalanceTypes';

const EPSILON = 1e-9;
function fraction(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid preview fraction');
}

/** Arithmetic envelopes for candidate tuning, not a simulation of a night or player input. */
export function candidateAbilityWindows(rules: CampaignAbilityRules, nightSeconds: number): {
  casts: number; activeSeconds: number; fadeSeconds: number;
} {
  if (!Number.isFinite(nightSeconds) || nightSeconds < 0 || !Number.isFinite(rules.cooldownSeconds) || rules.cooldownSeconds <= 0)
    throw new Error('Invalid candidate ability timing');
  const first = rules.initiallyReady ? 0 : rules.cooldownSeconds;
  const casts = Math.max(0, Math.ceil((nightSeconds - first) / rules.cooldownSeconds - EPSILON));
  const duration = 'durationSeconds' in rules ? rules.durationSeconds : 0;
  const fade = rules.abilityId === 'bastion' ? rules.fadeSeconds : 0;
  let activeSeconds = 0, fadeSeconds = 0;
  for (let index = 0; index < casts; index++) {
    const remaining = nightSeconds - first - index * rules.cooldownSeconds;
    activeSeconds += Math.min(duration, remaining);
    fadeSeconds += Math.min(fade, Math.max(0, remaining - duration));
  }
  return { casts, activeSeconds, fadeSeconds };
}

/** Adds ability/common bonuses once; lens/focus rules and actual target selection are outside this model. */
export function previewOverload(rules: OverloadAbilityRules,
  context: { commonDamageBonus?: number; quickTurnBonus?: number; commonDeviceDamageBonus?: number } = {}): {
  commonBeamDamageMultiplier: number; armoredCommonBeamDamageMultiplier: number;
  turnSpeedMultiplier: number; selectedDeviceMultiplier: number;
} {
  const { commonDamageBonus = 0, quickTurnBonus = 0, commonDeviceDamageBonus = 0 } = context;
  if (![commonDamageBonus, quickTurnBonus, commonDeviceDamageBonus].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid preview bonus');
  return {
    commonBeamDamageMultiplier: 1 + commonDamageBonus + Math.min(rules.damageBonusCap, rules.damageBonus),
    armoredCommonBeamDamageMultiplier: 1 + commonDamageBonus + Math.min(rules.damageBonusCap, rules.damageBonus + rules.armorDamageBonus),
    turnSpeedMultiplier: 1 + Math.min(rules.turnSpeedBonusCap, rules.turnSpeedBonus + quickTurnBonus),
    selectedDeviceMultiplier: 1 + commonDeviceDamageBonus + rules.guidanceDamageBonus,
  };
}

/** The weapon/target must already be eligible. No target, range or boss-zone multiplication is introduced here. */
export function previewBarrageShot(rules: BarrageAbilityRules, weapon: 'cannon' | 'harpoon' | 'mortar',
  airborne: boolean, actuallyLit: boolean, commonDamageBonus = 0): {
    damageMultiplier: number; armoredDamageMultiplier: number; radiusMultiplier: number; projectileSpeedMultiplier: number;
  } {
  if (!Number.isFinite(commonDamageBonus) || commonDamageBonus < 0) throw new Error('Invalid preview bonus');
  const bonus = rules.damageBonus + (weapon === 'harpoon' && airborne ? rules.airDamageBonus : 0)
    + (actuallyLit ? rules.litDamageBonus : 0);
  return { damageMultiplier: 1 + commonDamageBonus + Math.min(rules.damageBonusCap, bonus),
    armoredDamageMultiplier: 1 + commonDamageBonus + Math.min(rules.damageBonusCap, bonus + rules.armorDamageBonus),
    radiusMultiplier: 1 + (weapon === 'mortar' ? rules.blastRadiusBonus : 0),
    projectileSpeedMultiplier: 1 + (weapon === 'mortar' ? rules.projectileSpeedBonus : 0) };
}

/** Source timers/first-entry identity will belong to simulation; this checks only strongest-slow arithmetic. */
export function previewSealSpeed(rules: SealAbilityRules, otherSpeedMultiplier = 1, firstEntry = false): number {
  fraction(otherSpeedMultiplier);
  const entry = firstEntry && rules.entrySeconds > 0 ? rules.entrySpeedMultiplier : 1;
  return Math.min(otherSpeedMultiplier, Math.max(rules.minimumSpeedMultiplier, Math.min(rules.speedMultiplier, entry)));
}

/** One receiving layer per hit. Existing defenses are preserved even when already stronger than the candidate cap. */
export function previewBastionDamage(rules: BastionAbilityRules, existingMultiplier: number,
  receiver: 'lighthouse' | 'device' | 'field', heavy = false, fading = false): number {
  fraction(existingMultiplier);
  const reduction = fading ? rules.fadeReduction
    : rules.damageReduction + (receiver === 'device' ? rules.mechanismReduction : 0) + (heavy ? rules.heavyReduction : 0);
  const abilityReduction = Math.min(rules.abilityReductionCap, reduction);
  return Math.min(existingMultiplier, Math.max(1 - rules.totalReductionCap, existingMultiplier * (1 - abilityReduction)));
}
