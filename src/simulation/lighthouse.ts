import type { BattleState, NightConfig } from '../contracts';
import { delayShieldRecovery } from './shield';
import { emitCombatEvent } from './events';
import { bastionDamage } from './abilityEffects';

/** One damage path for creatures and boss zones; emergency protection is not resurrection. */
export function damageLighthouse(state: BattleState, config: NightConfig, amount: number, heavy = false): void {
  if (state.lighthouseHealth <= 0 || amount <= 0) return;
  const rules = config.progression;
  const existing = amount * (1 - (rules?.lighthouseDamageReduction ?? 0))
    * (heavy ? 1 - (rules?.lighthouseHeavyReduction ?? 0) : 1);
  let damage = bastionDamage(state, config, amount, existing, 'lighthouse', heavy);
  if (!state.emergencyUsed && (rules?.lighthouseEmergencyReduction ?? 0) > 0
    && state.lighthouseHealth - damage <= config.lighthouseHealth * .25) {
    state.emergencyUsed = true;
    state.emergencyUntilTick = state.tick + Math.ceil(2 / config.stepSeconds - 1e-9);
  }
  if (state.tick < (state.emergencyUntilTick ?? 0)) damage = bastionDamage(state, config, amount,
    existing * (1 - (rules?.lighthouseEmergencyReduction ?? 0)), 'lighthouse', heavy);
  const before = state.lighthouseHealth;
  state.lighthouseHealth = Math.max(0, before - damage);
  if (before > state.lighthouseHealth) {
    delayShieldRecovery(state, config);
    emitCombatEvent(state, { type: 'lighthouse-hit', damage: before - state.lighthouseHealth, x: 0, y: 0 });
  }
}

export function healLighthouseAfterWave(state: BattleState, config: NightConfig): void {
  if (state.lighthouseHealth > 0) state.lighthouseHealth = Math.min(config.lighthouseHealth,
    state.lighthouseHealth + (config.progression?.lighthouseWaveRepair ?? 0));
}
