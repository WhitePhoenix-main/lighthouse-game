import type { Profile } from '../../src/contracts';
import { DEVICE_RULES } from '../../src/content/devices';
import { trapChargeCapacity, unlockedDeviceKinds } from '../../src/progression/devices';

/** Explicit ownership for synthetic v6 profiles; production grants through purchases/migration. */
export function grantFixtureDevices(profile: Profile): void {
  for (const kind of unlockedDeviceKinds(profile)) {
    if (profile.devices.some(device => device.kind === kind)) continue;
    profile.devices.push({ id: profile.nextDeviceId++, kind, health: DEVICE_RULES.definitions[kind].health,
      consumed: false, position: null,
      ...(kind === 'light-trap' ? { trapCharges: trapChargeCapacity(profile.purchasedUpgrades) } : {}) });
  }
}
