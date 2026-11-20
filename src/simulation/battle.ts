import { isLandPath, landSpawnAngle } from '../content/terrain';
import { damageLighthouse, healLighthouseAfterWave } from './lighthouse';
import { finishingLightMultiplier } from './lightSupport';
import type { BattleCommand, BattleState, DeviceDeployment, DevicePlacement, EnemyKind, NightConfig, RandomSource, WaveDefinition } from '../contracts';
import { angleDifference, selectBeamTargets } from './beam';
import { advanceBeamTurn } from './beamTurning';
import { damageEnemy, fireCannons, moveEnemies } from './devices';
import { attackTentacles, createBoss, damageBoss, moveTentacles } from './boss';
import { tickCampaignBoss } from './campaignBoss';
import { emitCombatEvent } from './events';
import { triggerTraps, useFlash } from './abilities';
import { hitShield, isProtected, updateShield } from './shield';
import { updateBurning } from './burning';
import { updateMortars } from './mortar';
import { updateBells } from './bell';
import { updateRepairLamps } from './repair';
import { damageDevice } from './deviceDamage';
import { createSelectedAbility, useSelectedAbility } from './selectedAbility';
import { overloadBeamMultipliers } from './abilityEffects';
import { updateSeal } from './seal';
import { applyTimedDeviceSuppression, conditionalBeamBonus } from './campaignGeneralEffects';
import { selectGroundSpawn } from './groundRoutes';
import { activeCampaignCast, campaignBeamDamageMultiplier, campaignEnemyDefeated,
  resolveCampaignEnemyCasts, updateCampaignEnemies } from './campaignEnemies';


const injectedRandom = new WeakMap<BattleState, RandomSource>();
const EPSILON = 1e-9;

function nextRandom(state: BattleState): number {
  // Mulberry32's counter is serialized with the state; no ambient randomness.
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  const source = injectedRandom.get(state);
  if (source) return source.next();
  let value = state.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function startWave(state: BattleState, config: NightConfig, early: boolean): void {
  const index = state.waves.findIndex(wave => !wave.started);
  if (index < 0) return;
  const wave = state.waves[index]!;
  wave.started = true;
  wave.startedEarly = early;
  wave.nextSpawnAt = state.elapsed;
  wave.earlyBonus = early ? Math.floor(Math.max(0, state.nextWaveAt - state.elapsed) * config.earlyBonusPerSecond) : 0;
  state.nextWaveAt = index + 1 < config.waves.length ? state.elapsed + config.waveInterval : Infinity;
  emitCombatEvent(state, { type: 'wave-started', waveIndex: index, bonus: wave.earlyBonus, early, x: 0, y: 0 });
}

function addEnemy(state: BattleState, config: NightConfig, kind: EnemyKind, waveIndex: number,
    point: { x: number; y: number; waypoints?: readonly { x: number; y: number }[] }, reinforcement = false): void {
  const enemy = config.enemies[kind];
  state.enemies.push({ id: state.nextEnemyId++, kind, waveIndex, x: point.x, y: point.y,
    ...(point.waypoints ? { groundWaypoints: point.waypoints, groundWaypointIndex: 0 } : {}),
    health: enemy.health, armor: enemy.armor, attackCooldown: 0, ...(enemy.charge ? { chargePhase: 'ready' as const } : {}),
    ...(reinforcement ? { reinforcement: true } : {}) });
  if (!state.encountered.includes(kind)) state.encountered.push(kind);
  const wave = state.waves[waveIndex];
  if (reinforcement && wave) wave.reinforcements = (wave.reinforcements ?? 0) + 1;
}

function spawnPoint(config: NightConfig, kind: EnemyKind, sample: number, front?: NonNullable<WaveDefinition['fronts']>[number]) {
  const enemy = config.enemies[kind], terrain = config.terrain;
  const land = terrain && enemy.spawnSide === 'land';
  const groundSpawn = land && selectGroundSpawn(terrain, config.spawnRadius, enemy.radius, sample, front);
  if (groundSpawn) return groundSpawn;
  const edge = land ? Math.acos(Math.max(-1, Math.min(1, (terrain.shoreX - enemy.radius) / config.spawnRadius))) : 0;
  const south = front === 'south';
  const north = front === 'north';
  const angle = land && (terrain.shoreline || terrain.groundSpawn === 'dry-approach')
    ? landSpawnAngle(terrain, config.spawnRadius, enemy.radius, south ? sample * .42 : north ? .58 + sample * .42 : sample)
    : front && !land ? (south ? .72 : -.72) + (sample - .5) * .76 : edge + sample * (Math.PI * 2 - edge * 2);
  return { x: Math.cos(angle) * config.spawnRadius, y: Math.sin(angle) * config.spawnRadius };
}

function addReinforcement(state: BattleState, config: NightConfig, kind: EnemyKind, x: number, y: number, waveIndex = -1): void {
  const enemy = config.enemies[kind];
  const point = enemy.movement === 'ground' && !isLandPath(config.terrain, { x, y }, { x: 0, y: 0 }, enemy.radius)
    ? spawnPoint(config, kind, .5, y > 0 ? 'south' : 'north') : { x, y };
  addEnemy(state, config, kind, waveIndex, point, true);
}

function spawnDue(state: BattleState, config: NightConfig): void {
  state.waves.forEach((wave, waveIndex) => {
    const definition = config.waves[waveIndex]!;
    while (wave.started && wave.spawned < definition.enemies.length && wave.nextSpawnAt <= state.elapsed + EPSILON) {
      const kind = definition.enemies[wave.spawned]!;
      // Uniform permitted arc, with the full ground body on land; no rejection loop.
      addEnemy(state, config, kind, waveIndex, spawnPoint(config, kind, nextRandom(state), definition.fronts?.[wave.spawned]));
      wave.spawned++;
      const offsets = definition.spawnOffsets;
      wave.nextSpawnAt += offsets?.[wave.spawned] === undefined
        ? definition.spawnInterval : offsets[wave.spawned]! - offsets[wave.spawned - 1]!;
    }
  });
}

export function createBattle(config: NightConfig, seed: number, random?: RandomSource, placements: readonly (DevicePlacement | DeviceDeployment)[] = []): BattleState {
  const devices = placements.map(device => ({ ...device,
    health: 'health' in device ? device.health : config.devices.definitions[device.kind].health,
    startHealth: 'health' in device ? device.health : config.devices.definitions[device.kind].health,
    ...(device.kind === 'repair-lamp' ? { repairCharges: config.devices.repairLamp.charges, emergencyRepairUsed: false } : {}),
    // Old deployments carry one paid charge; only bare synthetic placements use
    // today's full magazine. Applying an upgrade must never mint paid charges.
    ...(device.kind === 'light-trap' ? { trapCharges: 'consumed' in device
      ? device.consumed ? 0 : device.trapCharges ?? 1 : config.devices.trap.charges, trapReadyTick: 0 } : {}),
    consumed: device.kind === 'light-trap' && 'trapCharges' in device && device.trapCharges === 0
      ? true : 'consumed' in device ? device.consumed : false,
    attackCooldown: 0, lastShot: null, priority: 'nearest' as const, targetId: null }));
  const shieldCapacity = devices.filter(device => device.kind === 'generator' && device.health > 0).length * config.shield.capacityPerGenerator;
  const state: BattleState = {
    ...(config.ability ? { ability: createSelectedAbility(config)! } : {}),
    events: [], nextEventId: 1,
    tick: 0, elapsed: 0, outcome: 'playing', seed: seed >>> 0, rngState: seed >>> 0,
    lighthouseHealth: config.lighthouseHealth, beamAngle: -Math.PI / 2, desiredBeamAngle: -Math.PI / 2,
    focus: { targetId: null, ticks: 0 }, resonance: { ticks: 0 }, enemies: [],
    devices, mortarProjectiles: [], nextProjectileId: 1,
    shield: { current: shieldCapacity, maximum: shieldCapacity, recoveryRemaining: 0 },
    flash: { cooldownRemaining: 0, lastUsedTick: null },
    ship: config.ship ? { x: config.ship.x, y: config.ship.y, radius: config.ship.radius, progress: 0, remaining: config.ship.deadline, status: 'waiting', lit: false } : null, earnedRescue: 0,
    boss: createBoss(config), litTentacleIds: [], blockedTentacleIds: [],
    waves: config.waves.map(() => ({ started: false, startedEarly: false, spawned: 0, defeated: 0, completed: false, nextSpawnAt: 0, earlyBonus: 0 })),
    nextWaveAt: 0, nextEnemyId: 1, litEnemyIds: [], blockedEnemyIds: [], earnedResources: 0, earnedBonus: 0, kills: 0, encountered: [],
  };
  if (random) injectedRandom.set(state, random);
  startWave(state, config, false);
  spawnDue(state, config);
  return state;
}

export function stepBattle(state: BattleState, config: NightConfig, commands: readonly BattleCommand[]): void {
  if (state.outcome !== 'playing') return;
  state.flash.cooldownRemaining = Math.max(0, state.flash.cooldownRemaining - config.stepSeconds);
  updateShield(state, config);
  const barrages: Extract<BattleCommand, { type: 'use-ability' }>[] = [];
  for (const command of commands) {
    if (command.type === 'aim' && Number.isFinite(command.angle)) state.desiredBeamAngle = angleDifference(command.angle, 0);
    if (command.type === 'callWave') startWave(state, config, true);
    if (command.type === 'flash') useFlash(state, config);
    if (command.type === 'use-ability') {
      if (config.ability?.abilityId === 'barrage') barrages.push(command);
      else useSelectedAbility(state, config, command);
    }
    if (command.type === 'cannon-priority' || command.type === 'cannon-target') {
      const cannon = state.devices.find(device => device.id === command.deviceId && (device.kind === 'cannon' || device.kind === 'harpoon' || device.kind === 'mortar') && device.health > 0 && !device.consumed);
      if (!cannon) continue;
      if (command.type === 'cannon-priority' && ['nearest', 'strongest', 'weakest'].includes(command.priority)) cannon.priority = command.priority;
      if (command.type === 'cannon-target' && (command.enemyId === null || state.enemies.some(enemy => enemy.id === command.enemyId && enemy.health > 0 && (cannon.kind === 'harpoon' || config.enemies[enemy.kind].movement !== 'flying')) || (state.boss && state.boss.health > 0 && state.boss.tentacles.some(zone => zone.id === command.enemyId)))) cannon.targetId = command.enemyId;
    }
  }
  if (state.elapsed + EPSILON >= state.nextWaveAt) startWave(state, config, false);
  spawnDue(state, config);
  const dt = config.stepSeconds;
  advanceBeamTurn(state, config);
  updateCampaignEnemies(state, config);
  updateBells(state, config);
  updateSeal(state, config);
  const beforeMovement = selectBeamTargets(state.enemies, config, state.beamAngle, state.ship, state.boss);
  const contacts = moveEnemies(state, config, beforeMovement.lit);
  const tentacleContacts = moveTentacles(state, config, beforeMovement.litTentacles ?? []);
  triggerTraps(state, config);
  const selection = selectBeamTargets(state.enemies, config, state.beamAngle, state.ship, state.boss);
  state.litEnemyIds = selection.lit.filter(id => id > 0);
  state.blockedEnemyIds = selection.blocked.filter(id => id > 0);
  state.litTentacleIds = selection.litTentacles ?? [];
  state.blockedTentacleIds = selection.blockedTentacles ?? [];
  if (state.ship && config.ship) {
    const ship = state.ship;
    ship.lit = ship.status === 'waiting' && selection.shipLit === true;
    if (ship.status === 'waiting') {
      // A partially expired final step contributes only its remaining valid time.
      if (ship.lit) ship.progress = Math.min(config.ship.rescueSeconds, ship.progress + Math.min(dt, ship.remaining));
      ship.remaining = Math.max(0, ship.remaining - dt);
      if (ship.progress + EPSILON >= config.ship.rescueSeconds) {
        ship.status = 'rescued'; ship.lit = false; state.earnedRescue += config.ship.reward;
        emitCombatEvent(state, { type: 'ship-rescued', x: ship.x, y: ship.y });
      } else if (ship.remaining <= EPSILON) {
        ship.status = 'lost'; ship.lit = false; ship.remaining = 0;
        emitCombatEvent(state, { type: 'ship-lost', x: ship.x, y: ship.y });
      }
    }
  }
  const focus = config.lens?.focus;
  const focusId = focus ? selection.lit[0] ?? selection.litTentacles?.[0] ?? null : null;
  state.focus = focusId === null ? { targetId: null, ticks: 0 }
    : { targetId: focusId, ticks: state.focus.targetId === focusId ? state.focus.ticks + 1 : 1 };
  // The first complete hold interval uses base damage; the following step gains the bonus.
  const focusMultiplier = focus && state.focus.ticks > Math.ceil(focus.seconds / dt - EPSILON) ? 1 + focus.damageBonus : 1;
  const paired = selection.lit.length + (selection.litTentacles?.length ?? 0) >= 2;
  const resonance = config.lens?.resonance;
  // Keep holding the group even as its members change; ships and residual burn never count.
  state.resonance.ticks = resonance && paired ? state.resonance.ticks + 1 : 0;
  const resonanceBonus = resonance && state.resonance.ticks > Math.ceil(resonance.seconds / dt - EPSILON) ? resonance.damageBonus : 0;
  const beamFactors = overloadBeamMultipliers(state, config, (paired ? 1 + (config.pairedDamageBonus ?? 0) : 1) + resonanceBonus);
  for (const enemy of state.enemies) {
    if (selection.lit.includes(enemy.id)) {
      const definition = config.enemies[enemy.kind];
      const bonus = conditionalBeamBonus(config, enemy.chargePhase === 'windup' || !!activeCampaignCast(enemy),
        definition.armor > 0 && enemy.armor === 0);
      const healthFactor = beamFactors.health + bonus;
      const beamMultiplier = healthFactor * focusMultiplier;
      // Keep armor damage independent of the conditional HP bonus, including on overflow.
      const armorRatio = beamFactors.armor === healthFactor ? 1 : beamFactors.armor / healthFactor;
      damageEnemy(enemy, config.beam.damagePerSecond * dt * beamMultiplier * campaignBeamDamageMultiplier(enemy)
        * finishingLightMultiplier(config, enemy.health, definition.health), state,
        ((config.lens?.armorMultiplier ?? 1) + (config.progression?.beamArmorBonus ?? 0)) * armorRatio);
    }
  }
  const bossFinisher = state.boss && config.boss ? finishingLightMultiplier(config, state.boss.health, config.boss.health) : 1;
  const zones = state.boss?.tentacles ?? [];
  // A direct hit can remove the selected zone before the shared boss burn is applied.
  const litBossZone = zones.find(zone => selection.litTentacles?.includes(zone.id));
  for (const zone of zones) {
    if (selection.litTentacles?.includes(zone.id)) {
      const bonus = conditionalBeamBonus(config, state.tick < (zone.telegraphedPreparationUntilTick ?? 0), false);
      const beamMultiplier = (beamFactors.health + bonus) * focusMultiplier;
      damageBoss(state, config.beam.damagePerSecond * dt * beamMultiplier * bossFinisher, zone);
    }
  }
  for (const command of barrages) useSelectedAbility(state, config, command);
  fireCannons(state, config);
  updateMortars(state, config);
  updateBurning(state, config, litBossZone);
  resolveCampaignEnemyCasts(state, config);
  for (const enemy of state.enemies) {
    const definition = config.enemies[enemy.kind];
    if (enemy.health <= 0) {
      state.kills++;
      if (!enemy.reinforcement) state.earnedResources += definition.reward;
      const wave = state.waves[enemy.waveIndex];
      if (wave) wave.defeated++;
      campaignEnemyDefeated(state, config, enemy, (kind, x, y) => addReinforcement(state, config, kind, x, y, enemy.waveIndex));
    }
  }
  state.enemies = state.enemies.filter(enemy => enemy.health > 0);
  for (const enemy of state.enemies) {
    if (enemy.attackCooldown > EPSILON || state.tick < (enemy.stunnedUntilTick ?? 0) || enemy.chargePhase === 'windup' || activeCampaignCast(enemy)) continue;
    const definition = config.enemies[enemy.kind];
    const device = contacts.get(enemy.id);
    const charging = enemy.chargePhase === 'charging';
    const protectedAtImpact = state.shield.current > 0;
    const attackDamage = definition.attackDamage * (charging && device ? definition.charge?.damageMultiplier ?? 1 : 1);
    if (device === 'shield') {
      // Another attacker may have exhausted the field earlier in this step.
      if (state.shield.current <= 0) continue;
      hitShield(state, config, attackDamage, enemy.x, enemy.y, charging);
    } else if (device) {
      if (device.health <= 0 || device.consumed) continue;
      if (state.shield.current > 0 && isProtected(device, config)) continue;
      damageDevice(state, config, device, attackDamage, charging);
      const suppression = definition.campaignAttack?.suppressionSeconds;
      if (suppression && !enemy.suppressionUsed && device.health > 0 && !device.consumed
        && (device.kind === 'cannon' || device.kind === 'harpoon' || device.kind === 'mortar')) {
        applyTimedDeviceSuppression(state, config, device, { kind: 'timed', durationSeconds: suppression });
        enemy.suppressionUsed = true;
      }
    } else if (Math.hypot(enemy.x, enemy.y) <= config.lighthouseRadius + definition.radius + EPSILON) {
      damageLighthouse(state, config, definition.attackDamage, charging);
    } else continue;
    if (charging) {
      enemy.chargePhase = 'spent';
      const area = definition.campaignAttack?.impactArea;
      if (area) for (const nearby of state.devices) {
        if (nearby !== device && !(protectedAtImpact && isProtected(nearby, config))
          && Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y) <= area.radius) {
          damageDevice(state, config, nearby, definition.attackDamage * area.damageMultiplier, false, true, 'area');
        }
      }
      emitCombatEvent(state, { type: 'charge-impact', enemyId: enemy.id, enemyKind: enemy.kind, x: enemy.x, y: enemy.y });
    }
    enemy.attackCooldown = definition.attackInterval;
  }
  attackTentacles(state, config, tentacleContacts);
  tickCampaignBoss(state, config, (kind, x, y) => addReinforcement(state, config, kind, x, y));
  updateRepairLamps(state, config);
  state.waves.forEach((wave, index) => {
    if (wave.started && !wave.completed && wave.defeated === config.waves[index]!.enemies.length + (wave.reinforcements ?? 0)) {
      wave.completed = true;
      healLighthouseAfterWave(state, config);
      state.earnedBonus += wave.earlyBonus;
      emitCombatEvent(state, { type: 'wave-completed', waveIndex: index, bonus: wave.earlyBonus, early: wave.startedEarly, x: 0, y: 0 });
    }
  });
  state.tick++;
  state.elapsed = state.tick * dt;
  if (state.lighthouseHealth <= 0) state.outcome = 'defeat';
  else if ((!state.boss || state.boss.health <= 0) && state.enemies.length === 0 && state.waves.every(wave => wave.completed)) state.outcome = 'victory';
  if (state.outcome !== 'playing' && state.ship?.status === 'waiting') {
    state.ship.status = 'lost'; state.ship.lit = false;
    emitCombatEvent(state, { type: 'ship-lost', x: state.ship.x, y: state.ship.y });
  }
}
