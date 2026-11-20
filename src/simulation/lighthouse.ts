import type { BattleState, NightConfig } from '../contracts';
import { delayShieldRecovery } from './shield';
import { emitCombatEvent } from './events';
import { abilityTicks, bastionDamage } from './abilityEffects';
import { damageWithCappedReduction } from './campaignGeneralEffects';

/** One damage path for creatures and boss zones; emergency protection is not resurrection. */
export function damageLighthouse(state: BattleState, config: NightConfig, amount: number, heavy = false): void {
  if (state.lighthouseHealth <= 0 || amount <= 0) return;
  const rules = config.progression;
  const existing = amount * (1 - (rules?.lighthouseDamageReduction ?? 0))
    * (heavy ? 1 - (rules?.lighthouseHeavyReduction ?? 0) : 1);
  const onslaught = config.campaignGeneral?.onslaughtResilience;
  const activeOnslaught = onslaught?.kind === 'onslaughtResilience' && state.tick < (state.onslaughtUntilTick ?? 0)
    ? onslaught : undefined;
  const resolveDamage = (previous: number): number => {
    const damage = bastionDamage(state, config, amount, previous, 'lighthouse', heavy);
    return activeOnslaught ? damageWithCappedReduction(amount, damage, activeOnslaught.reduction, activeOnslaught.totalHullReductionCap) : damage;
  };
  let damage = resolveDamage(existing);
  const emergencyReduction = rules?.lighthouseEmergencyReduction ?? 0;
  if (!state.emergencyUsed && emergencyReduction > 0
    && state.lighthouseHealth - damage <= config.lighthouseHealth * .25) {
    const window = config.campaignGeneral?.emergencyWindow;
    const extension = window?.kind === 'emergencyWindow' ? window.additionalSeconds : 0;
    state.emergencyUsed = true;
    state.emergencyUntilTick = state.tick + abilityTicks(2 + extension, config);
  }
  if (state.tick < (state.emergencyUntilTick ?? 0)) damage = resolveDamage(existing * (1 - emergencyReduction));
  const before = state.lighthouseHealth;
  state.lighthouseHealth = Math.max(0, before - damage);
  if (before > state.lighthouseHealth) {
    if (onslaught?.kind === 'onslaughtResilience') state.onslaughtUntilTick = state.tick + abilityTicks(onslaught.durationSeconds, config);
    delayShieldRecovery(state, config);
    emitCombatEvent(state, { type: 'lighthouse-hit', damage: before - state.lighthouseHealth, x: 0, y: 0 });
  }
}

export function healLighthouseAfterWave(state: BattleState, config: NightConfig): void {
  if (state.lighthouseHealth > 0) state.lighthouseHealth = Math.min(config.lighthouseHealth,
    state.lighthouseHealth + (config.progression?.lighthouseWaveRepair ?? 0));
}
