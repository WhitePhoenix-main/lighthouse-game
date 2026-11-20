import type { QuickTurnRules, ShieldStabilizationRules, UpgradeId } from '../contracts';
import { UPGRADES } from './upgrades';

/** Provisional general effects used by the active campaign loadout. */
export type CampaignGeneralBranch = 'light' | 'optics' | 'hull' | 'field' | 'engineering';
export type CampaignGeneralFamily = 'preparationDisruption' | 'exposedVulnerability' | 'quickTurn'
  | 'range' | 'width' | 'onslaughtResilience' | 'emergencyWindow' | 'shieldStabilization'
  | 'bombardmentProtection' | 'backupControl';
export type CampaignGeneralDraftId = 'beam-disruption-1' | 'beam-disruption-2'
  | 'beam-exposed-1' | 'beam-exposed-2' | 'beam-quick-turn-1' | 'beam-quick-turn-2'
  | 'beam-range-6' | 'beam-width-6' | 'hull-onslaught-1' | 'hull-onslaught-2'
  | 'hull-emergency-window-1' | 'hull-emergency-window-2'
  | 'shield-stabilization-1' | 'shield-stabilization-2'
  | 'engineering-bombardment' | 'engineering-backup-control';

export type CampaignGeneralEffect =
  | { kind: 'conditionalBeamDamage'; rankValue: 'total'; condition: 'telegraphedPreparationOnHitZone' | 'previouslyArmoredHitZoneBrokenBeforeHit';
      bonus: number; stacking: 'addToCommonBeamBonus'; combinedConditionalBonusCap: number;
      damage: 'directBeamOnly'; preservesArmorOcclusionAndTargetLimit: true }
  | { kind: 'quickTurn'; rankValue: 'total'; rules: QuickTurnRules;
      trigger: 'readyAndAngleAtLeastFullBonus'; stop: 'angleAtMostNormalOrDuration';
      blending: 'smoothstepAngleTimesSmoothstepElapsedTimesSmoothstepRemainingTime'; cooldownFrom: 'activationStart' }
  | { kind: 'beamGeometry'; rankValue: 'additiveDelta'; stat: 'range' | 'halfAngle'; amount: number;
      preservesOcclusionAndTargetLimit: true }
  | { kind: 'onslaughtResilience'; rankValue: 'total'; reduction: number; durationSeconds: number;
      totalHullReductionCap: number; stacking: 'multiplicativeWithExistingThenCap';
      trigger: 'positiveHullDamageAfterHit'; refresh: 'durationOnly'; shieldHitsTrigger: false }
  | { kind: 'emergencyWindow'; rankValue: 'total'; additionalSeconds: number;
      activationsPerNight: 1; healing: 0; requiresExistingEmergencyProtection: true }
  | { kind: 'shieldStabilization'; rankValue: 'total'; rules: ShieldStabilizationRules;
      trigger: 'firstPositiveNaturalRegenerationAfterZero'; nightStartTriggers: false;
      immediateShield: 0; scope: 'oneSharedField'; respectsRecoveryDelayAndProtectedDamage: true;
      bonusBudget: 'depleting-hit-absorbed-charge-times-bonus' }
  | { kind: 'bombardmentProtection'; rankValue: 'total'; reduction: number; totalDeviceReductionCap: number;
      stacking: 'multiplicativeWithExistingThenCap'; damage: 'areaDamageToDeviceBodiesOnly' }
  | { kind: 'backupControl'; rankValue: 'total'; durationMultiplier: number; minimumDurationSteps: 1;
      rounding: 'ceil'; scope: 'finiteTimedSuppression'; sourceMaintainedRootExcluded: true };

export interface CampaignGeneralDraftNode {
  readonly id: CampaignGeneralDraftId;
  readonly name: string;
  readonly family: CampaignGeneralFamily;
  readonly branch: CampaignGeneralBranch;
  readonly rank: number;
  readonly chapter: number;
  readonly balanceStatus: 'provisional';
  readonly price: 'pending';
  readonly unlockNight: 'pending';
  readonly dependenciesStatus: 'provisional';
  readonly requires: readonly (CampaignGeneralDraftId | UpgradeId)[];
  readonly effect: CampaignGeneralEffect;
}

export const QUICK_TURN_DRAFT_RANKS: readonly QuickTurnRules[] = [.35, .6].map(speedBonus => ({
  speedBonus, normalSpeedAngle: Math.PI / 3, fullBonusAngle: 2 * Math.PI / 3,
  durationSeconds: .9, fadeInSeconds: .15, fadeOutSeconds: .2, cooldownSeconds: 3,
}));
export const SHIELD_STABILIZATION_DRAFT_RANKS: readonly ShieldStabilizationRules[] = [.25, .5]
  .map(regenerationBonus => ({ regenerationBonus, durationSeconds: 2 }));

function node(id: CampaignGeneralDraftId, name: string, family: CampaignGeneralFamily,
  branch: CampaignGeneralBranch, rank: number, chapter: number,
  requires: CampaignGeneralDraftNode['requires'], effect: CampaignGeneralEffect): CampaignGeneralDraftNode {
  return { id, name, family, branch, rank, chapter, requires, effect, balanceStatus: 'provisional',
    price: 'pending', unlockNight: 'pending', dependenciesStatus: 'provisional' };
}
function conditional(condition: 'telegraphedPreparationOnHitZone' | 'previouslyArmoredHitZoneBrokenBeforeHit', bonus: number): CampaignGeneralEffect {
  return { kind: 'conditionalBeamDamage', rankValue: 'total', condition, bonus,
    stacking: 'addToCommonBeamBonus', combinedConditionalBonusCap: .5, damage: 'directBeamOnly',
    preservesArmorOcclusionAndTargetLimit: true };
}
function quickTurn(rank: number): CampaignGeneralEffect {
  return { kind: 'quickTurn', rankValue: 'total', rules: QUICK_TURN_DRAFT_RANKS[rank - 1]!,
    trigger: 'readyAndAngleAtLeastFullBonus', stop: 'angleAtMostNormalOrDuration',
    blending: 'smoothstepAngleTimesSmoothstepElapsedTimesSmoothstepRemainingTime', cooldownFrom: 'activationStart' };
}
function resilience(reduction: number): CampaignGeneralEffect {
  return { kind: 'onslaughtResilience', rankValue: 'total', reduction, durationSeconds: 1.5,
    totalHullReductionCap: .75, stacking: 'multiplicativeWithExistingThenCap',
    trigger: 'positiveHullDamageAfterHit', refresh: 'durationOnly', shieldHitsTrigger: false };
}
function emergency(additionalSeconds: number): CampaignGeneralEffect {
  return { kind: 'emergencyWindow', rankValue: 'total', additionalSeconds,
    activationsPerNight: 1, healing: 0, requiresExistingEmergencyProtection: true };
}
function stabilization(rank: number): CampaignGeneralEffect {
  return { kind: 'shieldStabilization', rankValue: 'total', rules: SHIELD_STABILIZATION_DRAFT_RANKS[rank - 1]!,
    trigger: 'firstPositiveNaturalRegenerationAfterZero', nightStartTriggers: false, immediateShield: 0,
    scope: 'oneSharedField', respectsRecoveryDelayAndProtectedDamage: true,
    bonusBudget: 'depleting-hit-absorbed-charge-times-bonus' };
}

export const CAMPAIGN_GENERAL_DRAFT: readonly CampaignGeneralDraftNode[] = [
  node('beam-disruption-1', 'Срыв подготовки I', 'preparationDisruption', 'light', 1, 2,
    ['beam-power-1'], conditional('telegraphedPreparationOnHitZone', .15)),
  node('beam-disruption-2', 'Срыв подготовки II', 'preparationDisruption', 'light', 2, 6,
    ['beam-disruption-1'], conditional('telegraphedPreparationOnHitZone', .25)),
  node('beam-exposed-1', 'Открытая уязвимость I', 'exposedVulnerability', 'light', 1, 4,
    ['beam-armor-1'], conditional('previouslyArmoredHitZoneBrokenBeforeHit', .2)),
  node('beam-exposed-2', 'Открытая уязвимость II', 'exposedVulnerability', 'light', 2, 7,
    ['beam-exposed-1'], conditional('previouslyArmoredHitZoneBrokenBeforeHit', .35)),
  node('beam-quick-turn-1', 'Быстрый разворот I', 'quickTurn', 'optics', 1, 2, ['beam-turn-1'], quickTurn(1)),
  node('beam-quick-turn-2', 'Быстрый разворот II', 'quickTurn', 'optics', 2, 4, ['beam-quick-turn-1'], quickTurn(2)),
  node('beam-range-6', 'Дальность VI', 'range', 'optics', 6, 6, ['beam-range-5'],
    { kind: 'beamGeometry', rankValue: 'additiveDelta', stat: 'range', amount: 10, preservesOcclusionAndTargetLimit: true }),
  node('beam-width-6', 'Ширина VI', 'width', 'optics', 6, 7, ['beam-width-5'],
    { kind: 'beamGeometry', rankValue: 'additiveDelta', stat: 'halfAngle', amount: Math.PI / 180, preservesOcclusionAndTargetLimit: true }),
  node('hull-onslaught-1', 'Стойкость под натиском I', 'onslaughtResilience', 'hull', 1, 3,
    ['lighthouse-health-1'], resilience(.1)),
  node('hull-onslaught-2', 'Стойкость под натиском II', 'onslaughtResilience', 'hull', 2, 5,
    ['hull-onslaught-1'], resilience(.18)),
  node('hull-emergency-window-1', 'Аварийное окно I', 'emergencyWindow', 'hull', 1, 6,
    ['hull-emergency-1'], emergency(.75)),
  node('hull-emergency-window-2', 'Аварийное окно II', 'emergencyWindow', 'hull', 2, 7,
    ['hull-emergency-window-1'], emergency(1.5)),
  node('shield-stabilization-1', 'Стабилизация поля I', 'shieldStabilization', 'field', 1, 5,
    ['unlock-generator', 'shield-regeneration-1'], stabilization(1)),
  node('shield-stabilization-2', 'Стабилизация поля II', 'shieldStabilization', 'field', 2, 7,
    ['shield-stabilization-1'], stabilization(2)),
  node('engineering-bombardment', 'Защита от обстрела', 'bombardmentProtection', 'engineering', 1, 5,
    ['unlock-cannon'], { kind: 'bombardmentProtection', rankValue: 'total', reduction: .25,
      totalDeviceReductionCap: .75, stacking: 'multiplicativeWithExistingThenCap', damage: 'areaDamageToDeviceBodiesOnly' }),
  node('engineering-backup-control', 'Резервное управление', 'backupControl', 'engineering', 1, 6,
    ['unlock-cannon'], { kind: 'backupControl', rankValue: 'total', durationMultiplier: .7,
      minimumDurationSteps: 1, rounding: 'ceil', scope: 'finiteTimedSuppression', sourceMaintainedRootExcluded: true }),
];

const familyLayout: Record<CampaignGeneralFamily, { branch: CampaignGeneralBranch; chapters: readonly number[]; firstRank: number }> = {
  preparationDisruption: { branch: 'light', chapters: [2, 6], firstRank: 1 },
  exposedVulnerability: { branch: 'light', chapters: [4, 7], firstRank: 1 },
  quickTurn: { branch: 'optics', chapters: [2, 4], firstRank: 1 },
  range: { branch: 'optics', chapters: [6], firstRank: 6 },
  width: { branch: 'optics', chapters: [7], firstRank: 6 },
  onslaughtResilience: { branch: 'hull', chapters: [3, 5], firstRank: 1 },
  emergencyWindow: { branch: 'hull', chapters: [6, 7], firstRank: 1 },
  shieldStabilization: { branch: 'field', chapters: [5, 7], firstRank: 1 },
  bombardmentProtection: { branch: 'engineering', chapters: [5], firstRank: 1 },
  backupControl: { branch: 'engineering', chapters: [6], firstRank: 1 },
};

/** Validate the candidate catalog, including dependency traversal through unchanged legacy nodes. */
export function validateCampaignGeneralDraft(nodes: readonly CampaignGeneralDraftNode[] = CAMPAIGN_GENERAL_DRAFT): void {
  const fail = (message: string): never => { throw new Error(`Campaign general draft: ${message}`); };
  if (nodes.length !== 16) fail('expected 16 nodes');
  const graph = new Map<string, { readonly requires: readonly string[] }>(UPGRADES.map(item => [item.id, item]));
  const byId = new Map<string, CampaignGeneralDraftNode>();
  const positive = (value: number, max = Infinity): boolean => Number.isFinite(value) && value > 0 && value <= max;
  for (const item of nodes) {
    if (graph.has(item.id)) fail(`duplicate id ${item.id}`);
    graph.set(item.id, item); byId.set(item.id, item);
    const layout = familyLayout[item.family];
    if (!layout || item.branch !== layout.branch || !Number.isSafeInteger(item.rank)
      || layout.chapters[item.rank - layout.firstRank] !== item.chapter) fail(`invalid chapter/branch/rank ${item.id}`);
    if (item.balanceStatus !== 'provisional' || item.dependenciesStatus !== 'provisional'
      || item.price !== 'pending' || item.unlockNight !== 'pending') fail(`invalid draft status ${item.id}`);
    const e = item.effect;
    const expectedKind = ({ preparationDisruption: 'conditionalBeamDamage', exposedVulnerability: 'conditionalBeamDamage',
      quickTurn: 'quickTurn', range: 'beamGeometry', width: 'beamGeometry', onslaughtResilience: 'onslaughtResilience',
      emergencyWindow: 'emergencyWindow', shieldStabilization: 'shieldStabilization',
      bombardmentProtection: 'bombardmentProtection', backupControl: 'backupControl' } as const)[item.family];
    if (e.kind !== expectedKind || e.rankValue !== (e.kind === 'beamGeometry' ? 'additiveDelta' : 'total')) fail(`invalid effect semantics ${item.id}`);
    let valid = false;
    switch (e.kind) {
      case 'conditionalBeamDamage': valid = positive(e.bonus, 1) && positive(e.combinedConditionalBonusCap, 1)
        && e.bonus <= e.combinedConditionalBonusCap
        && e.stacking === 'addToCommonBeamBonus' && e.damage === 'directBeamOnly'
        && e.preservesArmorOcclusionAndTargetLimit === true
        && e.condition === (item.family === 'preparationDisruption' ? 'telegraphedPreparationOnHitZone' : 'previouslyArmoredHitZoneBrokenBeforeHit'); break;
      case 'quickTurn': {
        const r = e.rules;
        valid = positive(r.speedBonus, 1) && positive(r.normalSpeedAngle, Math.PI)
          && positive(r.fullBonusAngle, Math.PI) && r.fullBonusAngle > r.normalSpeedAngle
          && positive(r.durationSeconds) && positive(r.fadeInSeconds, r.durationSeconds)
          && positive(r.fadeOutSeconds, r.durationSeconds) && r.fadeInSeconds + r.fadeOutSeconds <= r.durationSeconds
          && positive(r.cooldownSeconds) && r.cooldownSeconds > r.durationSeconds
          && e.trigger === 'readyAndAngleAtLeastFullBonus' && e.stop === 'angleAtMostNormalOrDuration'
          && e.blending === 'smoothstepAngleTimesSmoothstepElapsedTimesSmoothstepRemainingTime'
          && e.cooldownFrom === 'activationStart'; break;
      }
      case 'beamGeometry': valid = positive(e.amount, e.stat === 'halfAngle' ? Math.PI / 2 : Infinity)
        && e.stat === (item.family === 'range' ? 'range' : 'halfAngle') && e.preservesOcclusionAndTargetLimit === true; break;
      case 'onslaughtResilience': valid = positive(e.reduction, 1) && positive(e.durationSeconds)
        && positive(e.totalHullReductionCap) && e.totalHullReductionCap < 1 && e.reduction <= e.totalHullReductionCap
        && e.stacking === 'multiplicativeWithExistingThenCap' && e.trigger === 'positiveHullDamageAfterHit'
        && e.refresh === 'durationOnly' && e.shieldHitsTrigger === false; break;
      case 'emergencyWindow': valid = positive(e.additionalSeconds) && e.activationsPerNight === 1 && e.healing === 0
        && e.requiresExistingEmergencyProtection === true; break;
      case 'shieldStabilization': valid = positive(e.rules.regenerationBonus, 1) && positive(e.rules.durationSeconds) && e.immediateShield === 0
        && e.trigger === 'firstPositiveNaturalRegenerationAfterZero' && e.nightStartTriggers === false
        && e.scope === 'oneSharedField' && e.respectsRecoveryDelayAndProtectedDamage === true
        && e.bonusBudget === 'depleting-hit-absorbed-charge-times-bonus'; break;
      case 'bombardmentProtection': valid = positive(e.reduction, 1) && positive(e.totalDeviceReductionCap)
        && e.totalDeviceReductionCap < 1 && e.reduction <= e.totalDeviceReductionCap
        && e.stacking === 'multiplicativeWithExistingThenCap' && e.damage === 'areaDamageToDeviceBodiesOnly'; break;
      case 'backupControl': valid = positive(e.durationMultiplier) && e.durationMultiplier < 1 && e.minimumDurationSteps === 1
        && e.rounding === 'ceil' && e.scope === 'finiteTimedSuppression' && e.sourceMaintainedRootExcluded === true; break;
    }
    if (!valid) fail(`invalid effect values ${item.id}`);
    if (!item.requires.length || new Set(item.requires).size !== item.requires.length) fail(`invalid requirements ${item.id}`);
  }
  const chapters = [0, 2, 1, 2, 3, 4, 4];
  chapters.forEach((count, i) => { if (nodes.filter(n => n.chapter === i + 1).length !== count) fail(`chapter distribution ${i + 1}`); });
  for (const [branch, count] of Object.entries({ light: 4, optics: 4, hull: 4, field: 2, engineering: 2 })) {
    if (nodes.filter(n => n.branch === branch).length !== count) fail(`branch distribution ${branch}`);
  }
  for (const [family, layout] of Object.entries(familyLayout)) {
    if (nodes.filter(n => n.family === family).length !== layout.chapters.length) fail(`family distribution ${family}`);
  }
  for (const item of nodes) {
    if (item.rank === 2) {
      const previous = nodes.find(n => n.family === item.family && n.rank === 1);
      if (!previous || !item.requires.includes(previous.id)) fail(`missing previous rank ${item.id}`);
    }
    if (item.family === 'range' && !item.requires.includes('beam-range-5')
      || item.family === 'width' && !item.requires.includes('beam-width-5')
      || item.family === 'emergencyWindow' && item.rank === 1 && !item.requires.includes('hull-emergency-1')) fail(`missing legacy prerequisite ${item.id}`);
    for (const dependency of item.requires) {
      if (!graph.has(dependency)) fail(`unknown dependency ${dependency}`);
      const prior = byId.get(dependency);
      if (prior && prior.chapter > item.chapter) fail(`dependency in later chapter ${item.id}`);
    }
  }
  const visited = new Set<string>(); const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail(`dependency cycle ${id}`);
    if (visited.has(id)) return;
    const entry = graph.get(id);
    if (!entry) fail(`unknown dependency ${id}`);
    visiting.add(id); for (const dependency of entry!.requires) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const item of nodes) visit(item.id);
}

validateCampaignGeneralDraft();
