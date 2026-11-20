import type { DeviceDefinition, DeviceKind, DevicePlacement, NightConfig } from '../contracts';

export type DeviceVariantId = 'siege-cannon' | 'long-harpoon';

export const DEVICE_VARIANTS = {
  'siege-cannon': { kind: 'cannon', damageMultiplier: 1.25, rangeMultiplier: 1, attackIntervalMultiplier: 1.25 },
  'long-harpoon': { kind: 'harpoon', damageMultiplier: 0.85, rangeMultiplier: 1.15, attackIntervalMultiplier: 1 },
} as const satisfies Record<DeviceVariantId, {
  kind: DeviceKind; damageMultiplier: number; rangeMultiplier: number; attackIntervalMultiplier: number;
}>;

/** Apply the instance's trade-off to the already upgraded definition of its base type. */
export function effectiveWeaponDefinition(config: Pick<NightConfig, 'devices'>,
  device: Readonly<Pick<DevicePlacement, 'kind' | 'variantId'>>): Readonly<DeviceDefinition> {
  const definition = config.devices.definitions[device.kind];
  if (device.variantId === undefined) return definition;
  const variant = DEVICE_VARIANTS[device.variantId];
  if (variant?.kind !== device.kind) return definition;
  return { ...definition, damage: definition.damage * variant.damageMultiplier,
    range: definition.range * variant.rangeMultiplier, attackInterval: definition.attackInterval * variant.attackIntervalMultiplier };
}
