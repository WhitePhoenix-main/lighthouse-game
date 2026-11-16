import { CAMPAIGN_ABILITY_DRAFT } from './campaignAbilityDraft';
import type { CampaignAbilityDraftId, CampaignAbilityNodeId } from './campaignAbilityDraft';
import type { AbilityNumericStat, CampaignAbilityNumericNode, CampaignAbilityRulesById } from './campaignAbilityBalanceTypes';

/** Provisional candidates for design checks, not live battle or purchase parameters.
 * Bonuses are additive within an ability and clamped by its stated cap.
 * Radius/range use simulation world units; all times use battle seconds.
 */
export const ABILITY_BASE_RULES: CampaignAbilityRulesById = {
  overload: { abilityId: 'overload', cooldownSeconds: 24, initiallyReady: true,
    durationSeconds: 4, damageBonus: 0.35, turnSpeedBonus: 0.20,
    armorDamageBonus: 0, guidanceDamageBonus: 0, damageBonusCap: 0.75, turnSpeedBonusCap: 0.75 },
  seal: { abilityId: 'seal', cooldownSeconds: 26, initiallyReady: true,
    durationSeconds: 5, targetingRange: 300, radius: 80, speedMultiplier: 0.65,
    minimumSpeedMultiplier: 0.25, lingeringSeconds: 0, entrySeconds: 0, entrySpeedMultiplier: 1 },
  barrage: { abilityId: 'barrage', cooldownSeconds: 30, initiallyReady: true,
    targetingRange: 300, additionalAttacksPerWeapon: 1, damageBonus: 0,
    armorDamageBonus: 0, airDamageBonus: 0, blastRadiusBonus: 0, projectileSpeedBonus: 0,
    litDamageBonus: 0, damageBonusCap: 0.75 },
  bastion: { abilityId: 'bastion', cooldownSeconds: 28, initiallyReady: true,
    durationSeconds: 4, damageReduction: 0.30, mechanismReduction: 0, heavyReduction: 0,
    fadeSeconds: 0, fadeReduction: 0, abilityReductionCap: 0.60, totalReductionCap: 0.75 },
};

type Adjustment = CampaignAbilityNumericNode['adjustments'][number];
const change = (stat: AbilityNumericStat, amount: number): Adjustment => ({ stat, amount });
// The table defines each node's permitted numerical scope as well as candidate deltas.
const adjustments: Record<CampaignAbilityNodeId, readonly Adjustment[]> = {
  'ability-overload-unlock': [],
  'ability-overload-power-1': [change('damageBonus', 0.10)],
  'ability-overload-power-2': [change('damageBonus', 0.10)],
  'ability-overload-duration-1': [change('durationSeconds', 1)],
  'ability-overload-duration-2': [change('durationSeconds', 1)],
  'ability-overload-recovery-1': [change('cooldownSeconds', -2)],
  'ability-overload-recovery-2': [change('cooldownSeconds', -2)],
  'ability-overload-drive': [change('turnSpeedBonus', 0.15)],
  'ability-overload-armor': [change('armorDamageBonus', 0.25)],
  'ability-overload-guidance': [change('guidanceDamageBonus', 0.15)],
  'ability-seal-unlock': [],
  'ability-seal-power-1': [change('speedMultiplier', -0.10)],
  'ability-seal-power-2': [change('speedMultiplier', -0.10)],
  'ability-seal-radius-1': [change('radius', 15)],
  'ability-seal-radius-2': [change('radius', 15)],
  'ability-seal-recovery-1': [change('cooldownSeconds', -2)],
  'ability-seal-recovery-2': [change('cooldownSeconds', -2)],
  'ability-seal-duration': [change('durationSeconds', 2)],
  'ability-seal-lingering': [change('lingeringSeconds', 1)],
  'ability-seal-entry': [change('entrySeconds', 1), change('entrySpeedMultiplier', -0.75)],
  'ability-barrage-unlock': [],
  'ability-barrage-power-1': [change('damageBonus', 0.15)],
  'ability-barrage-power-2': [change('damageBonus', 0.15)],
  'ability-barrage-recovery-1': [change('cooldownSeconds', -2)],
  'ability-barrage-recovery-2': [change('cooldownSeconds', -2)],
  'ability-barrage-armor': [change('armorDamageBonus', 0.25)],
  'ability-barrage-air-intercept': [change('airDamageBonus', 0.25)],
  'ability-barrage-blast-radius': [change('blastRadiusBonus', 0.20)],
  'ability-barrage-projectile-speed': [change('projectileSpeedBonus', 0.25)],
  'ability-barrage-correction': [change('litDamageBonus', 0.15)],
  'ability-bastion-unlock': [],
  'ability-bastion-power-1': [change('damageReduction', 0.05)],
  'ability-bastion-power-2': [change('damageReduction', 0.05)],
  'ability-bastion-duration-1': [change('durationSeconds', 1)],
  'ability-bastion-duration-2': [change('durationSeconds', 1)],
  'ability-bastion-recovery-1': [change('cooldownSeconds', -2)],
  'ability-bastion-recovery-2': [change('cooldownSeconds', -2)],
  'ability-bastion-mechanisms': [change('mechanismReduction', 0.10)],
  'ability-bastion-heavy-impact': [change('heavyReduction', 0.10)],
  'ability-bastion-fade': [change('fadeSeconds', 2), change('fadeReduction', 0.15)],
};

export const ABILITY_NUMERIC_NODES: readonly CampaignAbilityNumericNode[] = CAMPAIGN_ABILITY_DRAFT.map(node => ({
  id: node.id, abilityId: node.abilityId, balanceStatus: 'provisional', adjustments: adjustments[node.id],
}));

const abilityIds = ['overload', 'seal', 'barrage', 'bastion'] as const;
const fail = (message: string): never => { throw new Error(`Campaign ability balance: ${message}`); };
const epsilon = 1e-9;
const range = (value: unknown, min: number, max: number, label: string): void => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min - epsilon || value > max + epsilon)
    fail(`invalid ${label}`);
};

function validateRules(id: CampaignAbilityDraftId, rules: Record<string, unknown>): void {
  if (rules.abilityId !== id || typeof rules.initiallyReady !== 'boolean') fail(`invalid identity/readiness ${id}`);
  range(rules.cooldownSeconds, 1, 180, `${id}.cooldownSeconds`);
  if ('durationSeconds' in rules) range(rules.durationSeconds, 0.1, 30, `${id}.durationSeconds`);
  if ('targetingRange' in rules) range(rules.targetingRange, 1, 1000, `${id}.targetingRange`);
  const bonusKeys = ['damageBonus', 'turnSpeedBonus', 'armorDamageBonus', 'guidanceDamageBonus',
    'airDamageBonus', 'blastRadiusBonus', 'projectileSpeedBonus', 'litDamageBonus'];
  for (const key of bonusKeys) if (key in rules) range(rules[key], 0, 1, `${id}.${key}`);
  if (id === 'overload' || id === 'barrage') {
    range(rules.damageBonusCap, 0.01, 1, `${id}.damageBonusCap`);
    if ((rules.damageBonus as number) > (rules.damageBonusCap as number) + epsilon) fail(`${id} basic damage exceeds cap`);
  }
  if (id === 'overload') {
    range(rules.turnSpeedBonusCap, 0.01, 1, `${id}.turnSpeedBonusCap`);
    if ((rules.turnSpeedBonus as number) > (rules.turnSpeedBonusCap as number) + epsilon) fail('turn speed exceeds cap');
  }
  if (id === 'seal') {
    range(rules.radius, 1, 500, 'seal.radius');
    range(rules.minimumSpeedMultiplier, 0.05, 1, 'seal.minimumSpeedMultiplier');
    range(rules.speedMultiplier, rules.minimumSpeedMultiplier as number, 0.99, 'seal.speedMultiplier');
    range(rules.entrySpeedMultiplier, rules.minimumSpeedMultiplier as number, 1, 'seal.entrySpeedMultiplier');
    range(rules.entrySeconds, 0, rules.durationSeconds as number, 'seal.entrySeconds');
    range(rules.lingeringSeconds, 0, rules.durationSeconds as number, 'seal.lingeringSeconds');
    if ((rules.entrySeconds as number) > 0 && (rules.entrySpeedMultiplier as number) >= (rules.speedMultiplier as number))
      fail('entry impulse must strengthen slow');
  }
  if (id === 'barrage' && rules.additionalAttacksPerWeapon !== 1) fail('barrage must give one additional attack');
  if (id === 'bastion') {
    for (const key of ['damageReduction', 'mechanismReduction', 'heavyReduction', 'fadeReduction'])
      range(rules[key], 0, 0.95, `bastion.${key}`);
    range(rules.damageReduction, 0.01, 0.95, 'bastion.damageReduction');
    range(rules.abilityReductionCap, 0.01, 0.95, 'bastion.abilityReductionCap');
    range(rules.totalReductionCap, rules.abilityReductionCap as number, 0.95, 'bastion.totalReductionCap');
    range(rules.fadeSeconds, 0, 10, 'bastion.fadeSeconds');
    if ((rules.damageReduction as number) > (rules.abilityReductionCap as number) + epsilon
      || (rules.fadeReduction as number) >= (rules.damageReduction as number)) fail('invalid bastion reduction/cap');
    if (((rules.fadeSeconds as number) === 0) !== ((rules.fadeReduction as number) === 0)) fail('unpaired fade');
  }
  const activeSeconds = (rules.durationSeconds as number | undefined) ?? 0;
  const tailSeconds = id === 'bastion' ? rules.fadeSeconds as number : id === 'seal' ? rules.lingeringSeconds as number : 0;
  if ((rules.cooldownSeconds as number) <= activeSeconds + tailSeconds) fail(`${id} cooldown must exceed effect and tail`);
}

/** Validates structure and safe tunable ranges rather than freezing candidate numbers.
 * Every dependency-valid purchase subset is checked, including specializations
 * without optional power/duration upgrades. No live combat effect is executed.
 */
export function validateCampaignAbilityBalance(
  bases: CampaignAbilityRulesById = ABILITY_BASE_RULES,
  nodes: readonly CampaignAbilityNumericNode[] = ABILITY_NUMERIC_NODES,
): void {
  if (Object.keys(bases).length !== abilityIds.length || abilityIds.some(id => !Object.hasOwn(bases, id)))
    fail('expected exactly four bases');
  if (nodes.length !== 40) fail('expected 40 nodes');
  const byId = new Map<CampaignAbilityNodeId, CampaignAbilityNumericNode>();
  for (const node of nodes) {
    const draft = CAMPAIGN_ABILITY_DRAFT.find(candidate => candidate.id === node.id);
    if (!draft || draft.abilityId !== node.abilityId || byId.has(node.id)) fail(`invalid/duplicate id ${node.id}`);
    byId.set(node.id, node);
    if (node.balanceStatus !== 'provisional') fail(`invalid status ${node.id}`);
    const expected = adjustments[node.id];
    if (node.adjustments.length !== expected.length) fail(`invalid stat count ${node.id}`);
    const seen = new Set<string>();
    for (const adjustment of node.adjustments) {
      if (seen.has(adjustment.stat) || !expected.some(item => item.stat === adjustment.stat)) fail(`invalid stat ${node.id}`);
      seen.add(adjustment.stat);
      const negative = adjustment.stat === 'cooldownSeconds' || adjustment.stat === 'speedMultiplier'
        || adjustment.stat === 'entrySpeedMultiplier';
      if (!Number.isFinite(adjustment.amount) || (negative ? adjustment.amount >= 0 : adjustment.amount <= 0))
        fail(`invalid delta ${node.id}.${adjustment.stat}`);
    }
  }
  for (const draft of CAMPAIGN_ABILITY_DRAFT) {
    const node = byId.get(draft.id);
    if (!node) fail(`missing id ${draft.id}`);
    if (draft.rank === 2) {
      const previous = byId.get(draft.requires[0]!)!;
      for (const delta of node!.adjustments) {
        const prior = previous.adjustments.find(item => item.stat === delta.stat);
        if (!prior || Math.abs(delta.amount) + epsilon < Math.abs(prior.amount)) fail(`nonmonotonic rank ${node!.id}`);
      }
    }
  }
  for (const id of abilityIds) {
    const base = bases[id] as unknown as Record<string, unknown>;
    const keys = Object.keys(ABILITY_BASE_RULES[id]);
    if (Object.keys(base).length !== keys.length || keys.some(key => !Object.hasOwn(base, key))) fail(`invalid base shape ${id}`);
    validateRules(id, base);
    // Specializations start disabled. Unlock alone must not grant their effects.
    const disabled = id === 'overload' ? ['armorDamageBonus', 'guidanceDamageBonus']
      : id === 'seal' ? ['lingeringSeconds', 'entrySeconds']
        : id === 'barrage' ? ['armorDamageBonus', 'airDamageBonus', 'blastRadiusBonus', 'projectileSpeedBonus', 'litDamageBonus']
          : ['mechanismReduction', 'heavyReduction', 'fadeSeconds', 'fadeReduction'];
    if (disabled.some(key => base[key] !== 0) || (id === 'seal' && base.entrySpeedMultiplier !== 1)) fail(`enabled base specialization ${id}`);
    const group = nodes.filter(candidate => candidate.abilityId === id);
    for (let mask = 0; mask < 2 ** group.length; mask++) {
      const selected = group.filter((_, index) => (mask & (1 << index)) !== 0);
      const selectedIds = new Set(selected.map(node => node.id));
      if (selected.some(node => CAMPAIGN_ABILITY_DRAFT.find(draft => draft.id === node.id)!.requires
        .some(dependency => !selectedIds.has(dependency)))) continue;
      const vector = { ...base };
      for (const node of selected) for (const delta of node.adjustments)
        vector[delta.stat] = (vector[delta.stat] as number) + delta.amount;
      validateRules(id, vector);
    }
  }
}
