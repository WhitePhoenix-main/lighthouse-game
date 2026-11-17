import type { BattleCommand, DeviceDeployment, DevicePlacement, NightConfig } from '../../src/contracts';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { angleDifference, selectBeamTargets } from '../../src/simulation/beam';

/** Deterministic smoke policy, not a claim about human performance.
 * Decisions every .7s; finish the current victim unless a charging threat is due.
 * No flash, foreknowledge of RNG or future spawns. By default no wave calls;
 * optional earlyCalls requests one remaining wave per initial tick. */
export function measureBattle(config: NightConfig, seed: number, placements: readonly (DevicePlacement | DeviceDeployment)[] = [], options: { earlyCalls?: boolean } = {}) {
  const state = createBattle(config, seed, undefined, placements);
  let targetId: number | null = null, nextDecision = .7;
  let peak = 0, empty = 0, overlap = 0, switches = 0, lastAngle = state.beamAngle;
  for (let tick = 0; tick < 10800 && state.outcome === 'playing'; tick++) {
    const commands: BattleCommand[] = [];
    if (options.earlyCalls && state.waves.some(wave => !wave.started)) commands.push({ type: 'callWave' });
    if (state.elapsed >= nextDecision) {
      nextDecision += .7;
      const available = state.enemies.filter(enemy => selectBeamTargets(state.enemies, config, Math.atan2(enemy.y, enemy.x)).lit.includes(enemy.id));
      const urgent = available.find(enemy => enemy.kind === 'minotaur' && (enemy.chargePhase === 'windup' || enemy.chargePhase === 'charging'));
      const current = available.find(enemy => enemy.id === targetId);
      const target = urgent ?? current ?? available.sort((a, b) => {
        const deadline = (enemy: typeof a) => (Math.hypot(enemy.x, enemy.y) - config.lighthouseRadius - config.enemies[enemy.kind].radius) / config.enemies[enemy.kind].speed;
        return deadline(a) - deadline(b) || a.id - b.id;
      })[0];
      targetId = target?.id ?? null;
      const zone = !target && state.boss && state.boss.health > 0 ? state.boss.tentacles[0] : null;
      const direction = state.ship?.status === 'waiting' ? state.ship : target ?? zone;
      if (direction) {
        const angle = Math.atan2(direction.y, direction.x);
        if (Math.abs(angleDifference(angle, lastAngle)) > Math.PI / 6) switches++;
        lastAngle = angle;
        commands.push({ type: 'aim', angle });
      }
    }
    const zones = [...state.enemies, ...(state.boss && state.boss.health > 0 ? state.boss.tentacles : [])];
    const accessible = zones.some(zone => {
      const selection = selectBeamTargets(state.enemies, config, Math.atan2(zone.y, zone.x), state.ship, state.boss);
      return selection.lit.includes(zone.id) || selection.litTentacles?.includes(zone.id);
    }) || (state.ship?.status === 'waiting' && selectBeamTargets(state.enemies, config, Math.atan2(state.ship.y, state.ship.x), state.ship, state.boss).shipLit === true);
    if (!accessible) empty += config.stepSeconds;
    if (state.waves.filter(wave => wave.started && !wave.completed).length > 1) overlap += config.stepSeconds;
    peak = Math.max(peak, state.enemies.length);
    stepBattle(state, config, commands);
  }
  const victoryReward = state.outcome === 'victory' ? config.victoryReward : 0;
  const reward = state.earnedResources + state.earnedBonus + state.earnedRescue + victoryReward;
  return { killReward: state.earnedResources, victoryReward, bonus: state.earnedBonus, rescueReward: state.earnedRescue,
    devices: state.devices.map(({ id, kind, x, y, health, consumed, trapCharges }) => ({ id, kind, x, y, health, consumed, ...(trapCharges !== undefined ? { trapCharges } : {}) })),
    encountered: state.encountered, kills: state.kills, outcome: state.outcome, seconds: state.elapsed, health: state.lighthouseHealth, reward,
    peak, emptyFraction: empty / state.elapsed, overlapSeconds: overlap, switches,
    rewardPerMinute: reward / state.elapsed * 60, enemiesPerMinute: state.kills / state.elapsed * 60,
    switchesPerMinute: switches / state.elapsed * 60, rescued: state.ship?.status === 'rescued' };
}
