import type { CampaignSummonKind, EnemyKind } from './campaignEnemyKinds';

interface Point { x: number; y: number }

interface PartRules extends Point {
  id: string;
  /** The core has shared boss health only and stays targetable until death. */
  health?: number;
  moves?: boolean;
}

type CampaignBossStance = 'guarded' | 'exposed';

interface ActionTiming {
  source: string;
  waitSeconds: number;
  warningSeconds: number;
}

export type CampaignBossAction = ActionTiming & (
  | { kind: 'strike'; damage: number }
  | { kind: 'salvo'; radius: number; damage: number }
  | { kind: 'root'; durationSeconds: number }
  | { kind: 'summon'; center: Point; radius: number; enemies: readonly (Point & { kind: EnemyKind })[] }
);

export interface CampaignBossPhase {
  /** Descending inclusive thresholds. The first phase starts at full health. */
  healthFraction: number;
  stance?: CampaignBossStance;
  coreDamageMultiplier?: number;
  actions: readonly CampaignBossAction[];
}

export interface CampaignBossRules {
  parts: readonly PartRules[];
  phases: readonly CampaignBossPhase[];
}

export interface CampaignBossPartState {
  id: string;
  zoneId: number;
  health: number | null;
  maxHealth: number | null;
  moves: boolean;
}

export interface CampaignBossTelegraph extends Point {
  kind: CampaignBossAction['kind'];
  sourceZoneId: number;
  radius: number;
  startedTick: number;
  resolveTick: number;
  targetDeviceId?: number;
}

export interface CampaignBossState {
  phase: number;
  stance?: CampaignBossStance;
  parts: CampaignBossPartState[];
  telegraph?: CampaignBossTelegraph;
  coreDamageMultiplier: number;
  actionIndex: number;
  readyTick: number;
}

interface CastRules { windup: number; cooldown: number }
/** The authored windup is a floor. Slower loadouts may receive extra response time. */
interface RangedCastRules extends CastRules { range: number }

export type CampaignEnemyRules =
  | ({ kind: 'heal'; radius: number; amount: number } & CastRules)
  | ({ kind: 'root'; duration: number } & RangedCastRules)
  | ({ kind: 'siege' } & RangedCastRules)
  | ({ kind: 'haste'; radius: number; duration: number; multiplier: number } & CastRules)
  | ({ kind: 'bombard'; radius: number } & RangedCastRules)
  | ({ kind: 'mirror'; duration: number; beamMultiplier: number } & CastRules)
  | ({ kind: 'suppress'; duration: number } & RangedCastRules)
  | { kind: 'split'; child: CampaignSummonKind; offset: number }
  | { kind: 'hunt-device' };

export type CampaignCastRules = Exclude<CampaignEnemyRules, { kind: 'split' | 'hunt-device' }>;

export type CampaignCastTarget = Point & { deviceId?: number; radius?: number };

export interface CampaignEnemyCast {
  kind: CampaignCastRules['kind'];
  startedTick: number;
  impactTick: number;
  target: CampaignCastTarget;
}

export interface CampaignEnemyState {
  cast?: CampaignEnemyCast;
  readyTick?: number;
  root?: { deviceId: number; untilTick: number };
  hasteUntilTick?: number;
  mirror?: { untilTick: number; beamMultiplier: number };
  splitResolved?: boolean;
}

export type CampaignCastEventType = 'campaign-cast-started' | 'campaign-cast-resolved' | 'campaign-cast-cancelled';
export type CampaignEnemyEventData = Point & {
  enemyId: number;
  enemyKind: EnemyKind;
} & (
  { [Type in CampaignCastEventType]: { type: Type; cast: CampaignEnemyCast } }[CampaignCastEventType]
  | { type: 'campaign-enemy-split'; childKind: CampaignSummonKind }
);
