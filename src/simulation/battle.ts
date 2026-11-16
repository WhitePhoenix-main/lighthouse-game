import { damageLighthouse, healLighthouseAfterWave } from './lighthouse';
import { finishingLightMultiplier } from './lightSupport';
import type { BattleCommand, BattleState, DeviceDeployment, DevicePlacement, NightConfig, RandomSource } from '../contracts';
import { angleDifference, selectBeamTargets } from './beam';
import { advanceBeamTurn } from './beamTurning';
import { damageEnemy, fireCannons, moveEnemies } from './devices';
import { attackTentacles, createBoss, damageBoss, moveTentacles } from './boss';
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

function spawnDue(state: BattleState, config: NightConfig): void {
  state.waves.forEach((wave, waveIndex) => {
    const definition = config.waves[waveIndex]!;
    while (wave.started && wave.spawned < definition.enemies.length && wave.nextSpawnAt <= state.elapsed + EPSILON) {
      const kind = definition.enemies[wave.spawned]!;
      const enemy = config.enemies[kind];
      const sample = nextRandom(state);
      // Uniform permitted arc, with the full ground body on land; no rejection loop.
      const land = config.terrain && enemy.spawnSide === 'land';
      const edge = land ? Math.acos(Math.max(-1, Math.min(1, (config.terrain!.shoreX - enemy.radius) / config.spawnRadius))) : 0;
      const angle = edge + sample * (Math.PI * 2 - edge * 2);
      state.enemies.push({ id: state.nextEnemyId++, kind, waveIndex,
        x: Math.cos(angle) * config.spawnRadius, y: Math.sin(angle) * config.spawnRadius,
        health: enemy.health, armor: enemy.armor, attackCooldown: 0, ...(enemy.charge ? { chargePhase: 'ready' as const } : {}) });
      if (!state.encountered.includes(kind)) state.encountered.push(kind);
      wave.spawned++;
      wave.nextSpawnAt += definition.spawnInterval;
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
      if (command.type === 'cannon-target' && (command.enemyId === null || state.enemies.some(enemy => enemy.id === command.enemyId && enemy.health > 0 && (cannon.kind === 'harpoon' || enemy.kind !== 'bat')) || (state.boss && state.boss.health > 0 && state.boss.tentacles.some(zone => zone.id === command.enemyId)))) cannon.targetId = command.enemyId;
    }
  }
  if (state.elapsed + EPSILON >= state.nextWaveAt) startWave(state, config, false);
  spawnDue(state, config);
  const dt = config.stepSeconds;
  advanceBeamTurn(state, config);
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
  const beamMultiplier = beamFactors.health * focusMultiplier;
  const overloadArmorRatio = beamFactors.armor === beamFactors.health ? 1 : beamFactors.armor / beamFactors.health;
  for (const enemy of state.enemies) {
    if (selection.lit.includes(enemy.id)) {
      damageEnemy(enemy, config.beam.damagePerSecond * dt * beamMultiplier * finishingLightMultiplier(config, enemy.health, config.enemies[enemy.kind].health), state,
        ((config.lens?.armorMultiplier ?? 1) + (config.progression?.beamArmorBonus ?? 0)) * overloadArmorRatio);
    }
  }
  const bossFinisher = state.boss && config.boss ? finishingLightMultiplier(config, state.boss.health, config.boss.health) : 1;
  for (const zone of state.boss?.tentacles ?? []) {
    if (selection.litTentacles?.includes(zone.id)) damageBoss(state, config.beam.damagePerSecond * dt * beamMultiplier * bossFinisher, zone);
  }
  for (const command of barrages) useSelectedAbility(state, config, command);
  fireCannons(state, config);
  updateMortars(state, config);
  updateBurning(state, config);
  for (const enemy of state.enemies) {
    const definition = config.enemies[enemy.kind];
    if (enemy.health <= 0) {
      state.kills++;
      state.earnedResources += definition.reward;
      state.waves[enemy.waveIndex]!.defeated++;
    }
  }
  state.enemies = state.enemies.filter(enemy => enemy.health > 0);
  for (const enemy of state.enemies) {
    if (enemy.attackCooldown > EPSILON || state.tick < (enemy.stunnedUntilTick ?? 0) || enemy.chargePhase === 'windup') continue;
    const definition = config.enemies[enemy.kind];
    const device = contacts.get(enemy.id);
    const charging = enemy.chargePhase === 'charging';
    const attackDamage = definition.attackDamage * (charging && device ? definition.charge?.damageMultiplier ?? 1 : 1);
    if (device === 'shield') {
      // Another attacker may have exhausted the field earlier in this step.
      if (state.shield.current <= 0) continue;
      hitShield(state, config, attackDamage, enemy.x, enemy.y, charging);
    } else if (device) {
      if (device.health <= 0 || device.consumed) continue;
      if (state.shield.current > 0 && isProtected(device, config)) continue;
      damageDevice(state, config, device, attackDamage, charging);
    } else if (Math.hypot(enemy.x, enemy.y) <= config.lighthouseRadius + definition.radius + EPSILON) {
      damageLighthouse(state, config, definition.attackDamage, charging);
    } else continue;
    if (charging) {
      enemy.chargePhase = 'spent';
      emitCombatEvent(state, { type: 'charge-impact', enemyId: enemy.id, enemyKind: enemy.kind, x: enemy.x, y: enemy.y });
    }
    enemy.attackCooldown = definition.attackInterval;
  }
  attackTentacles(state, config, tentacleContacts);
  updateRepairLamps(state, config);
  state.waves.forEach((wave, index) => {
    if (wave.started && !wave.completed && wave.defeated === config.waves[index]!.enemies.length) {
      wave.completed = true;
      healLighthouseAfterWave(state, config);
      state.earnedBonus += wave.earlyBonus;
      emitCombatEvent(state, { type: 'wave-completed', waveIndex: index, bonus: wave.earlyBonus, early: wave.startedEarly, x: 0, y: 0 });
    }
  });
  state.tick++;
  state.elapsed = state.tick * dt;
  if (state.lighthouseHealth <= 0) state.outcome = 'defeat';
  else if ((!state.boss || state.boss.health <= 0) && state.waves.every(wave => wave.completed)) state.outcome = 'victory';
  if (state.outcome !== 'playing' && state.ship?.status === 'waiting') {
    state.ship.status = 'lost'; state.ship.lit = false;
    emitCombatEvent(state, { type: 'ship-lost', x: state.ship.x, y: state.ship.y });
  }
}
