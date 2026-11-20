import type { BattleState, DeviceState, NightConfig } from '../contracts';
import { abilityTicks } from './abilityEffects';

export function conditionalBeamBonus(config: NightConfig, preparing: boolean, exposed: boolean): number {
  const disruption = config.campaignGeneral?.preparationDisruption;
  const vulnerability = config.campaignGeneral?.exposedVulnerability;
  const preparation = preparing && disruption?.kind === 'conditionalBeamDamage'
    && disruption.condition === 'telegraphedPreparationOnHitZone' ? disruption : undefined;
  const exposure = exposed && vulnerability?.kind === 'conditionalBeamDamage'
    && vulnerability.condition === 'previouslyArmoredHitZoneBrokenBeforeHit' ? vulnerability : undefined;
  return Math.min((preparation?.bonus ?? 0) + (exposure?.bonus ?? 0),
    preparation?.combinedConditionalBonusCap ?? Infinity, exposure?.combinedConditionalBonusCap ?? Infinity);
}

export function damageWithCappedReduction(raw: number, existing: number, reduction: number, totalCap: number): number {
  return Math.min(existing, Math.max(raw * (1 - totalCap), existing * (1 - reduction)));
}

type DeviceSuppression = { kind: 'timed'; durationSeconds: number } | { kind: 'source-maintained-root' };

/** This timer handles finite suppression; any root remains under its source's control. */
export function applyTimedDeviceSuppression(state: BattleState, config: NightConfig, device: DeviceState,
  suppression: DeviceSuppression): void {
  if (suppression.kind !== 'timed' || !Number.isFinite(suppression.durationSeconds) || suppression.durationSeconds <= 0
    || device.health <= 0 || device.consumed) return;
  const backup = config.campaignGeneral?.backupControl;
  const steps = backup?.kind === 'backupControl'
    ? Math.max(backup.minimumDurationSteps, abilityTicks(suppression.durationSeconds * backup.durationMultiplier, config))
    : Math.max(1, abilityTicks(suppression.durationSeconds, config));
  device.suppressedUntilTick = Math.max(device.suppressedUntilTick ?? 0, state.tick + steps);
}
