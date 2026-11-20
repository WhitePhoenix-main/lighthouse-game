import type { BattleState, DeviceState, EnemyState, NightConfig } from '../contracts';
import type { CampaignCastEventType, CampaignCastRules, CampaignCastTarget, CampaignEnemyCast, CampaignEnemyState } from '../campaignCombatTypes';
import type { CampaignSummonKind } from '../campaignEnemyKinds';
import { isLandCircle, isLandPath } from '../content/terrain';
import { abilityTicks } from './abilityEffects';
import { applyTimedDeviceSuppression } from './campaignGeneralEffects';
import { damageDevice } from './deviceDamage';
import { emitCombatEvent } from './events';
import { damageLighthouse } from './lighthouse';
import { hitShield, isProtected } from './shield';

const EPSILON = 1e-9;
const RECOGNITION_SECONDS = .8;

type Point = { x: number; y: number };

function canAct(enemy: EnemyState, tick: number): boolean {
  return enemy.health > 0 && tick >= (enemy.stunnedUntilTick ?? 0);
}

function within(a: Point, b: Point, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius + EPSILON;
}

function isLiveDevice(device: DeviceState): boolean {
  return device.health > 0 && !device.consumed;
}

function isWeapon(device: DeviceState): boolean {
  return device.kind === 'cannon' || device.kind === 'harpoon' || device.kind === 'mortar';
}

function isExposed(state: BattleState, config: NightConfig, device: DeviceState): boolean {
  return isLiveDevice(device) && (state.shield.current <= 0 || !isProtected(device, config));
}

function nearestDevice(enemy: EnemyState, devices: readonly DeviceState[]): DeviceState | undefined {
  let nearest: DeviceState | undefined;
  let best = Infinity;
  for (const device of devices) {
    const distance = Math.hypot(enemy.x - device.x, enemy.y - device.y);
    if (!nearest || distance < best - EPSILON || (Math.abs(distance - best) <= EPSILON && device.id < nearest.id)) {
      nearest = device;
      best = distance;
    }
  }
  return nearest;
}

/** A cast reserves movement and ordinary attacks through the player's last response step. */
export function activeCampaignCast(enemy: EnemyState): CampaignEnemyCast | undefined {
  return enemy.campaign?.cast;
}

export function campaignDeviceTarget(state: BattleState, config: NightConfig, enemy: EnemyState): DeviceState | undefined {
  const definition = config.enemies[enemy.kind];
  if (definition.campaign?.kind !== 'hunt-device') return undefined;
  return nearestDevice(enemy, state.devices.filter(device => {
    if (!isLiveDevice(device) || device.kind === 'barrier') return false;
    if (definition.movement !== 'ground') return true;
    const dx = device.x - enemy.x, dy = device.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const contact = distance > EPSILON ? Math.max(0, 1 - (definition.radius + config.devices.definitions[device.kind].radius) / distance) : 0;
    return isLandPath(config.terrain, enemy, { x: enemy.x + dx * contact, y: enemy.y + dy * contact }, definition.radius);
  }));
}

function activeRoot(enemy: EnemyState, tick: number): CampaignEnemyState['root'] {
  const root = enemy.campaign?.root;
  return root && tick < root.untilTick && canAct(enemy, tick) ? root : undefined;
}

/** Roots are source-maintained and never extend the timed-suppression field. */
export function campaignDeviceRooted(state: Readonly<BattleState>, deviceId: number): boolean {
  return state.enemies.some(enemy => activeRoot(enemy, state.tick)?.deviceId === deviceId);
}

export function campaignMovementMultiplier(state: BattleState, config: NightConfig, enemy: EnemyState): number {
  if (activeRoot(enemy, state.tick)) return 0;
  let multiplier = 1;
  for (const source of state.enemies) {
    if (source === enemy || state.tick >= (source.campaign?.hasteUntilTick ?? 0) || !canAct(source, state.tick)) continue;
    const rules = config.enemies[source.kind].campaign;
    if (rules?.kind === 'haste' && within(source, enemy, rules.radius)) multiplier = Math.max(multiplier, rules.multiplier);
  }
  return multiplier;
}

/** Direct light only. Flash, burn, devices and ordinary armor keep their own rules. */
export function campaignBeamDamageMultiplier(enemy: EnemyState): number {
  return enemy.campaign?.mirror?.beamMultiplier ?? 1;
}

function alliesInRange(state: BattleState, enemy: EnemyState, radius: number): EnemyState[] {
  return state.enemies.filter(ally => ally !== enemy && ally.health > 0 && within(enemy, ally, radius));
}

function selectCastTarget(state: BattleState, config: NightConfig, enemy: EnemyState, rules: CampaignCastRules): CampaignCastTarget | undefined {
  const origin = { x: 0, y: 0 };
  switch (rules.kind) {
    case 'heal':
      return alliesInRange(state, enemy, rules.radius).some(ally => ally.health < config.enemies[ally.kind].health)
        ? { x: enemy.x, y: enemy.y, radius: rules.radius } : undefined;
    case 'haste':
      return alliesInRange(state, enemy, rules.radius).length > 0 ? { x: enemy.x, y: enemy.y, radius: rules.radius } : undefined;
    case 'mirror':
      return { x: enemy.x, y: enemy.y };
    case 'siege':
      return within(enemy, origin, rules.range) ? origin : undefined;
    case 'bombard': {
      const device = nearestDevice(enemy, state.devices.filter(device => isExposed(state, config, device) && within(enemy, device, rules.range)));
      if (device) return { x: device.x, y: device.y, deviceId: device.id, radius: rules.radius };
      return within(enemy, origin, rules.range) ? { ...origin, radius: rules.radius } : undefined;
    }
    case 'root':
    case 'suppress': {
      const device = nearestDevice(enemy, state.devices.filter(device => isWeapon(device) && isExposed(state, config, device)
        && within(enemy, device, rules.range)));
      return device ? { x: device.x, y: device.y, deviceId: device.id } : undefined;
    }
  }
}

function targetWeapon(state: BattleState, config: NightConfig, target: CampaignCastTarget): DeviceState | undefined {
  return state.devices.find(device => device.id === target.deviceId && isWeapon(device) && isExposed(state, config, device));
}

function emitCast(state: BattleState, enemy: EnemyState, cast: CampaignEnemyCast, type: CampaignCastEventType): void {
  emitCombatEvent(state, { type, enemyId: enemy.id, enemyKind: enemy.kind, x: enemy.x, y: enemy.y, cast });
}

function finishCast(state: BattleState, config: NightConfig, enemy: EnemyState, rules: CampaignCastRules, resolved: boolean): void {
  const campaign = enemy.campaign!;
  const cast = campaign.cast!;
  delete campaign.cast;
  campaign.readyTick = state.tick + abilityTicks(rules.cooldown, config);
  enemy.attackCooldown = Math.max(enemy.attackCooldown, config.enemies[enemy.kind].attackInterval);
  emitCast(state, enemy, cast, resolved ? 'campaign-cast-resolved' : 'campaign-cast-cancelled');
}

/** Begin preparations after input/stuns and before movement. Impact runs after player damage. */
export function updateCampaignEnemies(state: BattleState, config: NightConfig): void {
  for (const enemy of state.enemies) {
    const rules = config.enemies[enemy.kind].campaign;
    if (!rules || rules.kind === 'split' || rules.kind === 'hunt-device') continue;
    const campaign = enemy.campaign ??= {};
    if (campaign.mirror && state.tick >= campaign.mirror.untilTick) delete campaign.mirror;
    if (campaign.root && !activeRoot(enemy, state.tick)) delete campaign.root;
    if (campaign.hasteUntilTick !== undefined && (state.tick >= campaign.hasteUntilTick || !canAct(enemy, state.tick)))
      delete campaign.hasteUntilTick;
    if (campaign.cast) {
      if (!canAct(enemy, state.tick) || ((rules.kind === 'root' || rules.kind === 'suppress') && !targetWeapon(state, config, campaign.cast.target)))
        finishCast(state, config, enemy, rules, false);
      continue;
    }
    if (!canAct(enemy, state.tick) || state.tick < (campaign.readyTick ?? 0) || Math.hypot(enemy.x, enemy.y) > config.beam.range + EPSILON) continue;
    const target = selectCastTarget(state, config, enemy, rules);
    if (!target) continue;
    let windup = rules.windup;
    if ('range' in rules && config.beam.damagePerSecond > 0 && config.beam.turnSpeed > 0) {
      const halfTurn = Math.PI / config.beam.turnSpeed;
      const armorMultiplier = Math.max(EPSILON, (config.lens?.armorMultiplier ?? 1) + (config.progression?.beamArmorBonus ?? 0));
      const neutralization = (enemy.health + enemy.armor / armorMultiplier) / config.beam.damagePerSecond;
      windup = Math.max(windup, RECOGNITION_SECONDS + halfTurn + neutralization);
    }
    const cast = { kind: rules.kind, startedTick: state.tick, impactTick: state.tick + abilityTicks(windup, config), target };
    campaign.cast = cast;
    emitCast(state, enemy, cast, 'campaign-cast-started');
  }
}

function bombard(state: BattleState, config: NightConfig, enemy: EnemyState, target: CampaignCastTarget, radius: number, damage: number): void {
  const hitsLighthouse = within(target, { x: 0, y: 0 }, radius + config.lighthouseRadius);
  const hits = state.devices.filter(device => isLiveDevice(device)
    && within(target, device, radius + config.devices.definitions[device.kind].radius));
  // One blast meets the field once. Bodies protected at impact stay protected for that blast.
  const hadShield = state.shield.current > 0;
  const protectedBodies = hadShield ? hits.filter(device => isProtected(device, config)) : [];
  if (hadShield && (hitsLighthouse || protectedBodies.length)) hitShield(state, config, damage, enemy.x, enemy.y, true);
  if (!hadShield && hitsLighthouse) damageLighthouse(state, config, damage, true);
  for (const device of hits) {
    if (!protectedBodies.includes(device)) damageDevice(state, config, device, damage, false, true, 'area');
  }
}

function resolveCast(state: BattleState, config: NightConfig, enemy: EnemyState, rules: CampaignCastRules, cast: CampaignEnemyCast): boolean {
  const campaign = enemy.campaign!;
  const damage = config.enemies[enemy.kind].attackDamage;
  switch (rules.kind) {
    case 'heal': {
      let healed = false;
      for (const ally of alliesInRange(state, enemy, rules.radius)) {
        const maximum = config.enemies[ally.kind].health;
        if (ally.health >= maximum) continue;
        ally.health = Math.min(maximum, ally.health + rules.amount);
        healed = true;
      }
      return healed;
    }
    case 'haste':
      campaign.hasteUntilTick = state.tick + 1 + abilityTicks(rules.duration, config);
      return true;
    case 'mirror':
      campaign.mirror = { untilTick: state.tick + 1 + abilityTicks(rules.duration, config), beamMultiplier: rules.beamMultiplier };
      return true;
    case 'siege':
      if (state.shield.current > 0) hitShield(state, config, damage, enemy.x, enemy.y, true);
      else damageLighthouse(state, config, damage, true);
      return true;
    case 'bombard':
      bombard(state, config, enemy, cast.target, rules.radius, damage);
      return true;
    case 'root':
    case 'suppress': {
      const device = targetWeapon(state, config, cast.target);
      if (!device) return false;
      if (rules.kind === 'root') campaign.root = { deviceId: device.id, untilTick: state.tick + 1 + abilityTicks(rules.duration, config) };
      else applyTimedDeviceSuppression(state, config, device, { kind: 'timed', durationSeconds: rules.duration });
      return true;
    }
  }
}

/** Run after beam and device damage, before removing dead enemies and resolving melee. */
export function resolveCampaignEnemyCasts(state: BattleState, config: NightConfig): void {
  for (const enemy of state.enemies) {
    const cast = activeCampaignCast(enemy);
    if (!cast) continue;
    const rules = config.enemies[enemy.kind].campaign;
    if (!rules || rules.kind === 'split' || rules.kind === 'hunt-device') continue;
    if (!canAct(enemy, state.tick)) finishCast(state, config, enemy, rules, false);
    else if (state.tick >= cast.impactTick) finishCast(state, config, enemy, rules, resolveCast(state, config, enemy, rules, cast));
  }
}

export type SummonCampaignEnemy = (kind: CampaignSummonKind, x: number, y: number) => void;

/** The caller supplies fresh ids and owns wave accounting, payouts and victory gating. */
export function campaignEnemyDefeated(state: BattleState, config: NightConfig, enemy: EnemyState, summon: SummonCampaignEnemy): void {
  const rules = config.enemies[enemy.kind].campaign;
  if (enemy.health > 0 || rules?.kind !== 'split' || enemy.campaign?.splitResolved) return;
  (enemy.campaign ??= {}).splitResolved = true;
  const distance = Math.hypot(enemy.x, enemy.y);
  const tangent = distance > EPSILON ? { x: -enemy.y / distance, y: enemy.x / distance } : { x: 0, y: 1 };
  const child = config.enemies[rules.child];
  for (const direction of [-1, 1]) {
    const landing = { x: enemy.x + tangent.x * rules.offset * direction, y: enemy.y + tangent.y * rules.offset * direction };
    const point = child.movement !== 'ground' || isLandCircle(config.terrain, landing, child.radius) ? landing : enemy;
    summon(rules.child, point.x, point.y);
  }
  emitCombatEvent(state, { type: 'campaign-enemy-split', enemyId: enemy.id, enemyKind: enemy.kind,
    childKind: rules.child, x: enemy.x, y: enemy.y });
}
