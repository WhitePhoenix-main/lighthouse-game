/** Stage A design candidates only. This catalog does not change live purchases or saves.
 * Qualitative effects follow GAME_DESIGN. Candidate numbers and prices are in
 * campaignAbilityBalance/campaignAbilityEconomy; pending fields here describe
 * the unapproved live purchase policy, not the absence of candidate tuning.
 * Dependencies are a minimal provisional graph, not an approved purchase policy.
 */
export type CampaignAbilityDraftId = 'overload' | 'seal' | 'barrage' | 'bastion';
type RankedSuffix = `${'power' | 'recovery'}-${1 | 2}`;
type AbilitySuffixes = {
  overload: 'unlock' | RankedSuffix | `duration-${1 | 2}` | 'drive' | 'armor' | 'guidance';
  seal: 'unlock' | RankedSuffix | `radius-${1 | 2}` | 'duration' | 'lingering' | 'entry';
  barrage: 'unlock' | RankedSuffix | 'armor' | 'air-intercept' | 'blast-radius' | 'projectile-speed' | 'correction';
  bastion: 'unlock' | RankedSuffix | `duration-${1 | 2}` | 'mechanisms' | 'heavy-impact' | 'fade';
};
export type CampaignAbilityNodeId = {
  [A in CampaignAbilityDraftId]: `ability-${A}-${AbilitySuffixes[A]}`
}[CampaignAbilityDraftId];

export interface CampaignAbilityQualitativeEffect {
  readonly kind: 'unlock' | 'increase' | 'reduce' | 'enable';
  readonly target: 'ability' | 'beam' | 'eligibleWeapons' | 'sealTargets'
    | 'defense' | 'deviceBodies' | 'harpoons' | 'mortars';
  readonly stat: 'damage' | 'radius' | 'cooldown'
    | 'armorDamage' | 'directDamageAndTurnSpeed' | 'directDamage'
    | 'duration' | 'turnSpeed' | 'slowArea' | 'slowStrength' | 'lingeringSlow'
    | 'entrySlow' | 'additionalAttack' | 'blastRadius' | 'projectileSpeed'
    | 'damageReduction' | 'residualProtection';
  readonly condition?: 'duringOverload' | 'beamSelectedDuringOverload'
    | 'additionalAttack' | 'additionalAttackAgainstAir' | 'additionalAttackLitOnImpact'
    | 'oncePerEnemyPerCast' | 'afterLeavingArea' | 'duringBastionWithoutFieldAbsorption'
    | 'telegraphedHeavyAttacksAndDashes' | 'afterMainPhase';
}

type AbilityRules = Readonly<Record<string, string | boolean>>;
export interface CampaignAbilityDraftNode {
  readonly id: CampaignAbilityNodeId;
  readonly abilityId: CampaignAbilityDraftId;
  readonly family: string;
  readonly rank: 1 | 2;
  readonly kind: 'unlock' | 'upgrade';
  readonly name: string;
  readonly chapter: number | 'pending';
  readonly unlockNight: 'pending';
  readonly price: 'pending';
  readonly effectValues: 'pending';
  readonly balanceStatus: 'pending';
  readonly dependenciesStatus: 'provisional';
  readonly requires: readonly CampaignAbilityNodeId[];
  readonly effects: readonly CampaignAbilityQualitativeEffect[];
  readonly rules: AbilityRules;
}

// Existing flash nodes remain in the live catalog with all sixteen purchases intact.
const abilities = ['overload', 'seal', 'barrage', 'bastion'] as const;
const openingChapter: Record<CampaignAbilityDraftId, number> = { overload: 2, seal: 3, barrage: 4, bastion: 5 };
const rules: Record<CampaignAbilityDraftId, AbilityRules> = {
  overload: { beamGeometry: 'preserveLensSectorRangeOcclusionAndTargetLimit', burningBonus: false,
    guidance: 'onlyActuallySelectedBeamTargets', mandatoryBeamShutdown: false },
  seal: { damage: false, illumination: false, stacking: 'strongestSlowOnly',
    entry: 'oncePerEnemyPerCastWithoutBoundaryRefresh', stopsStationaryPreparationOrBossAbilities: false },
  barrage: { attacks: 'oneAdditionalAttackPerEligibleWeapon', preservesWeaponRangesAndTargets: true,
    cannonsHitAir: false, mortarsHitSeaHull: false, destroyedOrSuppressedWeaponsParticipate: false,
    nonWeaponsParticipate: false, bossDamage: 'respectSharedHealthOwnerRules',
    targeting: 'pendingInputControls', normalFiringCycle: 'resetFiredWeaponsToFullCooldown',
    noEligibleAttack: 'doNotConsumeReadiness' },
  bastion: { scope: 'lighthouseDevicesAndSharedField', reduction: 'oncePerHitWithoutFieldAndBodyDoubleReduction',
    mechanismBonus: 'bodyOnlyWhenFieldDoesNotAbsorb', combinedReductionCap: 'pendingBelowImmunity',
    healing: false, shieldRefill: false, shieldRegenerationBonus: false },
};

interface FamilySpec {
  readonly family: string;
  readonly name: string;
  readonly ranks: 1 | 2;
  readonly effects: readonly CampaignAbilityQualitativeEffect[];
}
const effect = (kind: CampaignAbilityQualitativeEffect['kind'], target: CampaignAbilityQualitativeEffect['target'],
  stat: CampaignAbilityQualitativeEffect['stat'], condition?: CampaignAbilityQualitativeEffect['condition']): CampaignAbilityQualitativeEffect =>
  condition === undefined ? { kind, target, stat } : { kind, target, stat, condition };
const family = (id: string, name: string, ranks: 1 | 2,
  ...effects: CampaignAbilityQualitativeEffect[]): FamilySpec => ({ family: id, name, ranks, effects });
const recovery = (): FamilySpec => family('recovery', 'Быстрое восстановление', 2, effect('reduce', 'ability', 'cooldown'));

const layout: Record<CampaignAbilityDraftId, readonly FamilySpec[]> = {
  overload: [
    family('unlock', 'Открытие перегрузки', 1, effect('unlock', 'beam', 'directDamageAndTurnSpeed')),
    family('power', 'Мощность перегрузки', 2, effect('increase', 'beam', 'directDamage', 'duringOverload')),
    family('duration', 'Продолжительная перегрузка', 2, effect('increase', 'ability', 'duration')),
    recovery(),
    family('drive', 'Ускоренный привод', 1, effect('increase', 'beam', 'turnSpeed', 'duringOverload')),
    family('armor', 'Прожигающий свет', 1, effect('increase', 'beam', 'armorDamage', 'duringOverload')),
    family('guidance', 'Световое наведение', 1, effect('increase', 'eligibleWeapons', 'damage', 'beamSelectedDuringOverload')),
  ],
  seal: [
    family('unlock', 'Открытие печати', 1, effect('unlock', 'sealTargets', 'slowArea')),
    family('power', 'Сила сдерживания', 2, effect('increase', 'sealTargets', 'slowStrength')),
    family('radius', 'Обширная печать', 2, effect('increase', 'ability', 'radius')),
    recovery(),
    family('duration', 'Устойчивая печать', 1, effect('increase', 'ability', 'duration')),
    family('lingering', 'Остаточные путы', 1, effect('enable', 'sealTargets', 'lingeringSlow', 'afterLeavingArea')),
    family('entry', 'Входной импульс', 1, effect('enable', 'sealTargets', 'entrySlow', 'oncePerEnemyPerCast')),
  ],
  barrage: [
    family('unlock', 'Открытие залпа', 1, effect('unlock', 'eligibleWeapons', 'additionalAttack')),
    family('power', 'Сила залпа', 2, effect('increase', 'eligibleWeapons', 'damage', 'additionalAttack')),
    recovery(),
    family('armor', 'Бронебойный залп', 1, effect('increase', 'eligibleWeapons', 'armorDamage', 'additionalAttack')),
    family('air-intercept', 'Воздушный перехват', 1, effect('increase', 'harpoons', 'damage', 'additionalAttackAgainstAir')),
    family('blast-radius', 'Широкий разрыв', 1, effect('increase', 'mortars', 'blastRadius', 'additionalAttack')),
    family('projectile-speed', 'Быстрый навес', 1, effect('increase', 'mortars', 'projectileSpeed', 'additionalAttack')),
    family('correction', 'Световая корректировка', 1, effect('increase', 'eligibleWeapons', 'damage', 'additionalAttackLitOnImpact')),
  ],
  bastion: [
    family('unlock', 'Открытие бастиона', 1, effect('unlock', 'defense', 'damageReduction')),
    family('power', 'Сила защиты', 2, effect('increase', 'defense', 'damageReduction')),
    family('duration', 'Продолжительный бастион', 2, effect('increase', 'ability', 'duration')),
    recovery(),
    family('mechanisms', 'Защита механизмов', 1, effect('increase', 'deviceBodies', 'damageReduction', 'duringBastionWithoutFieldAbsorption')),
    family('heavy-impact', 'Упор против тяжёлого удара', 1, effect('increase', 'defense', 'damageReduction', 'telegraphedHeavyAttacksAndDashes')),
    family('fade', 'Мягкое угасание', 1, effect('enable', 'defense', 'residualProtection', 'afterMainPhase')),
  ],
};

function nodeId(ability: CampaignAbilityDraftId, spec: FamilySpec, rank: 1 | 2): CampaignAbilityNodeId {
  return `ability-${ability}-${spec.family}${spec.ranks === 2 ? `-${rank}` : ''}` as CampaignAbilityNodeId;
}

export const CAMPAIGN_ABILITY_DRAFT: readonly CampaignAbilityDraftNode[] = abilities.flatMap(abilityId =>
  layout[abilityId].flatMap(spec => Array.from({ length: spec.ranks }, (_, i): CampaignAbilityDraftNode => {
    const rank = (i + 1) as 1 | 2;
    const isUnlock = spec.family === 'unlock';
    return {
      id: nodeId(abilityId, spec, rank), abilityId, family: spec.family, rank,
      kind: isUnlock ? 'unlock' : 'upgrade', name: `${spec.name}${spec.ranks === 2 ? ` ${rank === 1 ? 'I' : 'II'}` : ''}`,
      chapter: isUnlock ? openingChapter[abilityId] : 'pending', unlockNight: 'pending', price: 'pending',
      effectValues: 'pending', balanceStatus: 'pending', dependenciesStatus: 'provisional',
      requires: isUnlock ? [] : [rank === 2 ? nodeId(abilityId, spec, 1) : `ability-${abilityId}-unlock`],
      effects: spec.effects, rules: rules[abilityId],
    };
  })));

/** Order-independent comparison also rejects unexpected effect/rule properties. */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

/** Structural validation only: no prices, battle effects, purchases or save migrations are performed. */
export function validateCampaignAbilityDraft(nodes: readonly CampaignAbilityDraftNode[] = CAMPAIGN_ABILITY_DRAFT): void {
  const fail = (message: string): never => { throw new Error(`Campaign ability draft: ${message}`); };
  if (nodes.length !== 40) fail('expected 40 nodes');
  const byId = new Map<CampaignAbilityNodeId, CampaignAbilityDraftNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) fail(`duplicate id ${node.id}`);
    byId.set(node.id, node);
    if (!abilities.includes(node.abilityId)) fail(`unknown ability ${node.id}`);
    const spec = layout[node.abilityId].find(s => s.family === node.family);
    if (!spec || ![1, 2].includes(node.rank) || node.rank > spec.ranks
      || node.id !== nodeId(node.abilityId, spec, node.rank)) fail(`invalid family/rank/id ${node.id}`);
    const isUnlock = node.family === 'unlock';
    if (node.kind !== (isUnlock ? 'unlock' : 'upgrade')
      || node.chapter !== (isUnlock ? openingChapter[node.abilityId] : 'pending')) fail(`invalid kind/chapter ${node.id}`);
    if (node.price !== 'pending' || node.unlockNight !== 'pending' || node.effectValues !== 'pending'
      || node.balanceStatus !== 'pending' || node.dependenciesStatus !== 'provisional') fail(`invalid pending status ${node.id}`);
    if (!sameData(node.effects, spec!.effects) || !sameData(node.rules, rules[node.abilityId])) fail(`invalid effect semantics/rules ${node.id}`);
  }
  for (const ability of abilities) {
    const group = nodes.filter(n => n.abilityId === ability);
    if (group.length !== 10 || group.filter(n => n.kind === 'unlock').length !== 1) fail(`expected 10 nodes/one unlock for ${ability}`);
  }
  for (const node of nodes) {
    for (const dependency of node.requires) {
      const parent = byId.get(dependency);
      if (!parent) fail(`unknown dependency ${dependency}`);
      if (parent!.abilityId !== node.abilityId) fail(`cross ability dependency ${node.id}`);
    }
  }
  const visited = new Set<CampaignAbilityNodeId>(), active = new Set<CampaignAbilityNodeId>();
  const visit = (id: CampaignAbilityNodeId): void => {
    if (active.has(id)) fail(`dependency cycle ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id)!.requires) visit(dependency);
    active.delete(id); visited.add(id);
  };
  for (const node of nodes) visit(node.id);
  for (const node of nodes) {
    const spec = layout[node.abilityId].find(s => s.family === node.family)!;
    const required = node.rank === 2 ? nodeId(node.abilityId, spec, 1) : `ability-${node.abilityId}-unlock`;
    if (node.kind === 'unlock') {
      if (node.requires.length !== 0) fail(`unlock has prerequisites ${node.id}`);
    } else if (node.requires.length !== 1 || node.requires[0] !== required) {
      fail(`expected only ${node.rank === 2 ? 'previous rank' : 'own unlock'}; foreign specialization gate ${node.id}`);
    }
  }
}
