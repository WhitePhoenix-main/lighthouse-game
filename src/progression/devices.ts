import type { DeviceDeployment, DeviceKind, DeviceRules, OwnedDevice, Profile, UpgradeId } from '../contracts';
import { DEVICE_ECONOMY, DEVICE_RULES } from '../content/devices';
import { UPGRADES } from '../content/upgrades';

/** Legacy ownership never grants devices introduced after the old equipment bundle. */
export const LEGACY_DEVICE_KINDS: readonly DeviceKind[] = ['cannon', 'barrier', 'generator', 'light-trap'];
export const DEVICE_KINDS: readonly DeviceKind[] = [...LEGACY_DEVICE_KINDS, 'harpoon', 'mortar', 'bell', 'repair-lamp'];

export function unlockedDeviceKinds(profile: Readonly<Profile>): DeviceKind[] {
  return DEVICE_KINDS.filter(kind => (profile.legacyEquipment && LEGACY_DEVICE_KINDS.includes(kind)) || UPGRADES.some(node =>
    node.effect.stat === kind && profile.purchasedUpgrades.includes(node.id)));
}

/** Shared pre-rounding multiplier; ammunition and hull condition are unaffected. */
export function engineeringRepairMultiplier(purchasedIds: readonly UpgradeId[]): number {
  return 1 - UPGRADES.reduce((sum, node) => sum +
    (node.effect.stat === 'repairCostReduction' && purchasedIds.includes(node.id) ? node.effect.amount : 0), 0);
}

/** Preliminary integer rounding, capped at 25% of the original purchase price. */
export function repairCost(device: Readonly<OwnedDevice>, purchasedIds: readonly UpgradeId[] = []): number {
  const definition = DEVICE_RULES.definitions[device.kind];
  const missingFraction = Math.max(0, 1 - device.health / definition.health);
  const discount = device.kind === 'barrier' ? UPGRADES.reduce((sum, node) => sum +
    (node.effect.stat === 'barrierRepairReduction' && purchasedIds.includes(node.id) ? node.effect.amount : 0), 0) : 0;
  const maximum = definition.cost * DEVICE_ECONOMY.repairFraction * (1 - discount) * engineeringRepairMultiplier(purchasedIds);
  return Math.min(Math.ceil(maximum * missingFraction), Math.floor(maximum));
}

/** Compatibility fallback for old or synthetic combat deployments; v6 saves validate explicit counts. */
export function remainingTrapCharges(device: Pick<OwnedDevice, 'kind' | 'consumed' | 'trapCharges'>): number {
  return device.kind === 'light-trap' ? device.trapCharges ?? (device.consumed ? 0 : 1) : 0;
}

export function trapChargeCapacity(purchasedIds: readonly UpgradeId[] = []): number {
  return DEVICE_RULES.trap.charges + UPGRADES.reduce((sum, node) => sum +
    (node.effect.stat === 'trapCharges' && purchasedIds.includes(node.id) ? node.effect.amount : 0), 0);
}

export function trapRechargeMultiplier(purchasedIds: readonly UpgradeId[]): number {
  return 1 - UPGRADES.reduce((sum, node) => sum +
    (node.effect.stat === 'rechargeCostReduction' && purchasedIds.includes(node.id) ? node.effect.amount : 0), 0);
}

/** Each missing charge is paid separately; repairing the body never replenishes ammunition. */
export function rechargeCost(device: Readonly<OwnedDevice>, purchasedIds: readonly UpgradeId[] = []): number {
  return device.kind === 'light-trap' ? Math.ceil(Math.max(0, trapChargeCapacity(purchasedIds) - remainingTrapCharges(device))
    * Math.ceil(DEVICE_RULES.definitions[device.kind].cost * DEVICE_ECONOMY.rechargeFraction) * trapRechargeMultiplier(purchasedIds)) : 0;
}

export function deviceDeployments(profile: Readonly<Profile>): DeviceDeployment[] {
  return profile.devices.flatMap(device => device.position === null ? [] : [{
    id: device.id, kind: device.kind, x: device.position.x, y: device.position.y,
    health: device.health, consumed: device.consumed,
    ...(device.kind === 'light-trap' ? { trapCharges: remainingTrapCharges(device) } : {}),
  }]);
}

/** v6 stores base-normalized HP; only combat and presentation use upgraded HP. */
export function actualDeviceHealth(device: Pick<OwnedDevice, 'kind' | 'health'>, definitions: DeviceRules['definitions']): number {
  const base = DEVICE_RULES.definitions[device.kind].health, maximum = definitions[device.kind].health;
  return base === maximum ? device.health : device.health / base * maximum;
}

export function battleDeviceDeployments(profile: Readonly<Profile>, definitions: DeviceRules['definitions']): DeviceDeployment[] {
  return deviceDeployments(profile).map(device => ({ ...device, health: actualDeviceHealth(device, definitions) }));
}

/** Validate actual HP before normalizing, so clamping floating error cannot conceal overhealing. */
export function normalizedDeviceResults(devices: readonly DeviceDeployment[], snapshot: readonly DeviceDeployment[], definitions: DeviceRules['definitions']): DeviceDeployment[] {
  return devices.map(device => {
    const initial = snapshot.find(item => item.id === device.id && item.kind === device.kind);
    if (!initial) throw new Error('Итог устройств не соответствует стартовому снимку.');
    if (device.kind === 'light-trap'
      ? !Number.isSafeInteger(device.trapCharges) || device.trapCharges! < 0
        || device.trapCharges! > remainingTrapCharges(initial) || device.consumed !== (device.trapCharges === 0)
      : device.trapCharges !== undefined)
      throw new Error('Повреждён итог зарядов устройства.');
    const startHealth = actualDeviceHealth(initial, definitions);
    if (!Number.isFinite(device.health) || device.health < 0 || device.health > startHealth)
      throw new Error('Итоговая прочность превышает стартовую или повреждена.');
    const base = DEVICE_RULES.definitions[device.kind].health, maximum = definitions[device.kind].health;
    const health = device.health === startHealth ? initial.health : base === maximum ? device.health
      : Math.min(initial.health, device.health / maximum * base);
    return { id: device.id, kind: device.kind, x: device.x, y: device.y, health, consumed: device.consumed,
      ...(device.kind === 'light-trap' ? { trapCharges: remainingTrapCharges(device) } : {}) };
  });
}
