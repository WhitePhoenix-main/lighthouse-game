import type { DeviceKind } from '../../src/contracts';
import { DEVICE_RULES } from '../../src/content/devices';
import { NIGHT_CONFIG } from '../../src/content/night';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { trapChargeCapacity } from '../../src/progression/devices';
import { build, specs } from './lateBuilds';

/** Finite budgets reserve money for copies and use purchased deployment capacity. */
export function pressureBuild(spec: typeof specs[number], budget: number) {
  if (!Number.isFinite(budget)) return build(spec, budget);
  const reserve = spec.gear.reduce((sum, kind) => sum + DEVICE_RULES.definitions[kind].cost, 0);
  const result = build(spec, budget - reserve), profile = result.save.profile;
  const config = calculateNightConfig(NIGHT_CONFIG, profile.purchasedUpgrades, false);
  const positions: Record<DeviceKind, { x: number; y: number }> = {
    cannon: spec.name === 'artillery' ? { x: -75, y: 210 } : { x: -180, y: -180 },
    harpoon: { x: -180, y: 180 }, barrier: { x: -235, y: 115 }, generator: { x: -135, y: 0 },
    mortar: { x: -190, y: -165 }, 'light-trap': { x: -200, y: 150 },
    bell: { x: -180, y: 180 }, 'repair-lamp': { x: -135, y: 170 },
  };
  let count = profile.devices.filter(device => device.position).length;
  for (const kind of spec.gear) {
    if (count >= config.devices.maxObjects) break;
    const definition = DEVICE_RULES.definitions[kind];
    profile.devices.push({ id: profile.nextDeviceId++, kind, health: definition.health, consumed: false,
      position: positions[kind], ...(kind === 'light-trap' ? { trapCharges: trapChargeCapacity(profile.purchasedUpgrades) } : {}) });
    result.bodyCost += definition.cost;
    result.cost += definition.cost;
    count++;
  }
  result.unused = budget - result.cost;
  return result;
}
