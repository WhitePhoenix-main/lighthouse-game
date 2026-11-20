import type { CampaignBossAction, CampaignBossPartState, CampaignBossPhase, CampaignBossRules, CampaignBossState, CampaignBossTelegraph } from '../campaignCombatTypes';
import type { BattleState, BossState, DeviceState, EnemyKind, NightConfig, TentacleState } from '../contracts';
import { abilityTicks } from './abilityEffects';
import { applyTimedDeviceSuppression } from './campaignGeneralEffects';
import { damageDevice } from './deviceDamage';
import { damageLighthouse } from './lighthouse';
import { hitShield, isProtected } from './shield';

interface Point { x: number; y: number }

export function createCampaignBoss(rules: CampaignBossRules, config: NightConfig): { campaign: CampaignBossState; tentacles: TentacleState[] } {
  const campaign: CampaignBossState = {
    phase: 1,
    parts: rules.parts.map((part, index) => ({
      id: part.id, zoneId: -1001 - index, health: part.health ?? null, maxHealth: part.health ?? null, moves: part.moves ?? false,
    })),
    actionIndex: 0,
    readyTick: 0,
    coreDamageMultiplier: 1,
  };
  enterPhase(campaign, rules.phases[0]!, 1, 0, config);
  const tentacles = rules.parts.map(({ x, y }, index) => ({ id: campaign.parts[index]!.zoneId, x, y, attackCooldown: 0 }));
  return { campaign, tentacles };
}

export function campaignPartAt(boss: BossState, position: Point & { id?: number }): CampaignBossPartState | undefined {
  if (!boss.campaign) return undefined;
  if (position.id !== undefined && position.id <= -1001) {
    return boss.campaign.parts.find(part => part.zoneId === position.id);
  }
  // Impact points from area weapons have no zone ID. Damage the nearest living zone once.
  let nearest: CampaignBossPartState | undefined;
  let distance = Infinity;
  for (const zone of boss.tentacles) {
    const part = boss.campaign.parts.find(part => part.zoneId === zone.id);
    if (!part || part.health === 0) continue;
    const candidate = Math.hypot(zone.x - position.x, zone.y - position.y);
    if (candidate >= distance) continue;
    nearest = part;
    distance = candidate;
  }
  return nearest;
}

export function clearCampaignTelegraph(boss: BossState, campaign: CampaignBossState): void {
  const warning = campaign.telegraph;
  if (!warning) return;
  const zone = boss.tentacles.find(zone => zone.id === warning.sourceZoneId);
  if (zone) delete zone.telegraphedPreparationUntilTick;
  delete campaign.telegraph;
}

function scheduleNext(campaign: CampaignBossState, phase: CampaignBossPhase, tick: number, config: NightConfig): void {
  const next = phase.actions[campaign.actionIndex];
  campaign.readyTick = tick + (next ? abilityTicks(next.waitSeconds, config) : 0);
}

function enterPhase(campaign: CampaignBossState, phase: CampaignBossPhase, phaseNumber: number,
  tick: number, config: NightConfig): void {
  campaign.phase = phaseNumber;
  if (phase.stance) campaign.stance = phase.stance;
  else delete campaign.stance;
  campaign.coreDamageMultiplier = phase.coreDamageMultiplier ?? 1;
  campaign.actionIndex = 0;
  scheduleNext(campaign, phase, tick, config);
}

function targetWeapon(state: BattleState, config: NightConfig, source: Point): DeviceState | undefined {
  return state.devices.filter(device => device.health > 0 && !device.consumed
    && (device.kind === 'cannon' || device.kind === 'harpoon' || device.kind === 'mortar')
    && !(state.shield.current > 0 && isProtected(device, config)))
    .sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y) || a.id - b.id)[0];
}

function announce(action: CampaignBossAction, source: TentacleState, state: BattleState, config: NightConfig): CampaignBossTelegraph | undefined {
  const warning = { kind: action.kind, sourceZoneId: source.id, startedTick: state.tick,
    resolveTick: state.tick + abilityTicks(action.warningSeconds, config) };
  if (action.kind === 'summon') return { ...warning, ...action.center, radius: action.radius };
  if (action.kind === 'strike') return { ...warning, x: 0, y: 0, radius: config.lighthouseRadius };
  const target = targetWeapon(state, config, source);
  if (action.kind === 'salvo') return { ...warning, x: target?.x ?? 0, y: target?.y ?? 0, radius: action.radius };
  if (target) return { ...warning, x: target.x, y: target.y, radius: config.devices.definitions[target.kind].radius, targetDeviceId: target.id };
  return undefined;
}

type Summon = (kind: EnemyKind, x: number, y: number) => void;

function resolve(action: CampaignBossAction, warning: CampaignBossTelegraph, state: BattleState, config: NightConfig, summon: Summon): void {
  if (action.kind === 'summon') {
    for (const enemy of action.enemies) summon(enemy.kind, enemy.x, enemy.y);
    return;
  }
  if (action.kind === 'root') {
    const device = state.devices.find(device => device.id === warning.targetDeviceId);
    if (device && !(state.shield.current > 0 && isProtected(device, config))) {
      applyTimedDeviceSuppression(state, config, device, { kind: 'timed', durationSeconds: action.durationSeconds });
    }
    return;
  }
  if (action.kind === 'strike') {
    if (state.shield.current > 0) hitShield(state, config, action.damage, warning.x, warning.y, true);
    else damageLighthouse(state, config, action.damage, true);
    return;
  }
  const withinSalvo = (point: Point, radius: number) => Math.hypot(point.x - warning.x, point.y - warning.y) <= warning.radius + radius + 1e-9;
  const devices = state.devices.filter(device => device.health > 0 && !device.consumed
    && withinSalvo(device, config.devices.definitions[device.kind].radius));
  const shieldActive = state.shield.current > 0;
  const hitsLighthouse = withinSalvo({ x: 0, y: 0 }, config.lighthouseRadius);
  // A single impact can break the shared field, but cannot hit through the field it just broke.
  if (shieldActive && (hitsLighthouse || devices.some(device => isProtected(device, config)))) {
    hitShield(state, config, action.damage, warning.x, warning.y, true);
  }
  if (!shieldActive && hitsLighthouse) damageLighthouse(state, config, action.damage, true);
  for (const device of devices.sort((a, b) => a.id - b.id)) {
    if (!shieldActive || !isProtected(device, config)) damageDevice(state, config, device, action.damage, false, true, 'area');
  }
}

/** Run once after all damage systems, before checking the night's outcome. */
export function tickCampaignBoss(state: BattleState, config: NightConfig, summon: Summon): void {
  const boss = state.boss, rules = config.boss, campaign = boss?.campaign;
  if (!boss || !rules?.campaign || !campaign) return;
  if (boss.health <= 0) {
    clearCampaignTelegraph(boss, campaign);
    if (boss.tentacles.length) boss.tentacles = [];
    return;
  }
  if (state.lighthouseHealth <= 0 || state.outcome !== 'playing') {
    clearCampaignTelegraph(boss, campaign);
    return;
  }

  const phases = rules.campaign.phases;
  let phaseNumber = campaign.phase;
  while (phaseNumber < phases.length && boss.health <= rules.health * phases[phaseNumber]!.healthFraction) phaseNumber++;
  const phase = phases[phaseNumber - 1]!;
  if (phaseNumber !== campaign.phase) {
    clearCampaignTelegraph(boss, campaign);
    enterPhase(campaign, phase, phaseNumber, state.tick, config);
  }
  const action = phase.actions[campaign.actionIndex];
  if (!action) return;
  const sourcePart = campaign.parts.find(part => part.id === action.source && part.health !== 0);
  const source = boss.tentacles.find(zone => zone.id === sourcePart?.zoneId);
  const warning = campaign.telegraph;
  if (source && state.tick < boss.stunnedUntilTick) {
    if (warning) {
      warning.resolveTick++;
      source.telegraphedPreparationUntilTick = warning.resolveTick + 1;
    }
    return;
  }
  if (source && warning && state.tick < warning.resolveTick) return;
  if (source && !warning && state.tick < campaign.readyTick) return;
  if (source && !warning) {
    const nextWarning = announce(action, source, state, config);
    if (nextWarning) {
      campaign.telegraph = nextWarning;
      // Weapons still hit a preparing source on the impact tick, before this function resolves it.
      source.telegraphedPreparationUntilTick = nextWarning.resolveTick + 1;
      return;
    }
  } else if (source && warning && (boss.id !== 'abyss-warden' || !state.litTentacleIds.includes(source.id))) {
    resolve(action, warning, state, config, summon);
  }
  clearCampaignTelegraph(boss, campaign);
  campaign.actionIndex++;
  scheduleNext(campaign, phase, state.tick, config);
}
