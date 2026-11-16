import type { BattleState, NightConfig } from '../contracts';
import { angleDifference } from './beam';
import { activeOverload } from './abilityEffects';

const EPSILON = 1e-9;
const smoothstep = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** One turn budget per fixed step; optional Stage A burst never changes beam selection/damage. */
export function advanceBeamTurn(state: BattleState, config: NightConfig): void {
  const turn = angleDifference(state.desiredBeamAngle, state.beamAngle);
  const distance = Math.abs(turn);
  const rules = config.beam.quickTurn;
  let multiplier = 1;
  if (rules) {
    const burst = state.quickTurn;
    if (distance + EPSILON >= rules.fullBonusAngle && state.tick >= (burst?.readyTick ?? 0)) {
      state.quickTurn = {
        startedTick: state.tick,
        untilTick: state.tick + Math.ceil(rules.durationSeconds / config.stepSeconds - EPSILON),
        readyTick: state.tick + Math.ceil(rules.cooldownSeconds / config.stepSeconds - EPSILON),
      };
    }
    const active = state.quickTurn;
    if (active && distance <= rules.normalSpeedAngle) active.untilTick = Math.min(active.untilTick, state.tick);
    if (active && state.tick < active.untilTick) {
      const angleRamp = smoothstep((distance - rules.normalSpeedAngle) / (rules.fullBonusAngle - rules.normalSpeedAngle));
      const timeRamp = rules.fadeOutSeconds > 0
        ? smoothstep((active.untilTick - state.tick) * config.stepSeconds / rules.fadeOutSeconds) : 1;
      const startRamp = rules.fadeInSeconds > 0
        ? smoothstep((state.tick - active.startedTick) * config.stepSeconds / rules.fadeInSeconds) : 1;
      multiplier += rules.speedBonus * angleRamp * timeRamp * startRamp;
    }
  }
  const overload = activeOverload(state, config);
  if (overload) multiplier = 1 + Math.min(overload.turnSpeedBonusCap, multiplier - 1 + overload.turnSpeedBonus);
  const maxTurn = config.beam.turnSpeed * multiplier * config.stepSeconds;
  state.beamAngle = angleDifference(state.beamAngle + Math.max(-maxTurn, Math.min(maxTurn, turn)), 0);
}
