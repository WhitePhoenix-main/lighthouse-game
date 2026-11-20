import { describe, expect, it } from 'vitest';
import { CampaignGameStore } from '../src/application/campaignGameStore';
import { decodeCampaignProfile, emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { campaignRewardLedger } from '../src/application/campaignRewards';
import { LighthouseApplication } from '../src/application/gameApplication';
import { emptySave } from '../src/application/saves';
import { memorySettingsStore } from '../src/application/settings';
import { ABILITY_BASE_RULES } from '../src/content/campaignAbilityBalance';
import { CAMPAIGN_STORY_DRAFT } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_REWARD_CATALOG } from '../src/content/campaignRewards';
import { CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { effectiveWeaponDefinition } from '../src/content/campaignVariants';
import { DEVICE_RULES } from '../src/content/devices';
import { NIGHT_CONFIG } from '../src/content/night';
import type { BattleState, DevicePlacement, NightConfig } from '../src/contracts';
import { purchaseCampaignDevice, repairCampaignDevice } from '../src/progression/campaignProgression';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost } from '../src/progression/devices';
import { calculateNightConfig } from '../src/progression/upgrades';
import { createBattle, stepBattle } from '../src/simulation/battle';

const SEED = 42;
const cannon: DevicePlacement = { id: 1, kind: 'cannon', x: 150, y: 0 };
const harpoon: DevicePlacement = { id: 1, kind: 'harpoon', x: 150, y: 0 };
const siegeCannon: DevicePlacement = { ...cannon, variantId: 'siege-cannon' };
const longHarpoon: DevicePlacement = { ...harpoon, variantId: 'long-harpoon' };

function combatConfig(enemy: 'ghost' | 'bat', health: number, spawnRadius: number, count = 1): NightConfig {
  const config = calculateNightConfig(NIGHT_CONFIG, [
    'unlock-cannon', 'cannon-damage-1', 'cannon-speed-1', 'unlock-harpoon', 'harpoon-damage-1', 'harpoon-range-1',
  ]);
  config.beam.damagePerSecond = 0;
  config.spawnRadius = spawnRadius;
  config.enemies[enemy].health = health;
  config.waves = [{ id: 'variants-test', enemies: Array(count).fill(enemy), fronts: Array(count).fill('north'), spawnInterval: 0.2 }];
  return config;
}

function battle(config: NightConfig, placement: DevicePlacement): BattleState {
  return createBattle(config, SEED, undefined, [placement]);
}

function finish(config: NightConfig, placement: DevicePlacement): BattleState {
  const state = battle(config, placement);
  while (state.outcome === 'playing' && state.tick < 300) stepBattle(state, config, []);
  expect(state.outcome).toBe('victory');
  return state;
}

describe('campaign weapon variants', () => {
  it('claims, buys, deploys, fires and reloads a purchased variant through the campaign application', () => {
    const unlockNight = CAMPAIGN_REWARD_CATALOG['siege-cannon'].ordinaryVictoryNightId;
    const unlockIndex = CAMPAIGN_STORY_DRAFT.findIndex(night => night.id === unlockNight);
    const wonNightIds = CAMPAIGN_STORY_DRAFT.slice(0, unlockIndex + 1).map(night => night.id);
    const base = { ...emptyCampaignProfile(), rewards: campaignRewardLedger({}), wonNightIds, completedNights: wonNightIds.length, shards: 100,
      purchasedNodeIds: ['unlock-cannon', 'cannon-damage-1'], nextDeviceId: 2,
      inventory: [{ id: 1, kind: 'cannon', health: 35, consumed: false }] };
    let raw = JSON.stringify(base);
    const store = { read: () => raw, write: (value: string) => { raw = value; } };
    const catalog = CAMPAIGN_NIGHT_CATALOG.map(night => {
      if (night.id !== 'first-light') return night;
      const config = structuredClone(night.config);
      config.beam.damagePerSecond = 0;
      config.spawnRadius = 38;
      config.enemies.ghost.health = 23;
      config.waves = [{ id: 'variant-integration', enemies: ['ghost'], fronts: ['north'], spawnInterval: 1 }];
      return { ...night, config };
    });
    const open = () => new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'variant-battle', seed: SEED }),
      memorySettingsStore(), catalog, new CampaignGameStore(store));
    const game = open();
    game.openGameMenu();
    game.continueGame();
    game.acknowledgeIntro();
    game.claimCampaignReward('siege-cannon');
    expect(game.view.error).toBeNull();
    expect(game.view.screen).toBe('preparation');
    expect(decodeCampaignProfile(raw)).toMatchObject({ inventory: base.inventory, rewards: { unlockedIds: ['siege-cannon'] } });
    game.purchaseDevice('cannon', 'siege-cannon');
    expect(decodeCampaignProfile(raw).shards).toBe(base.shards - DEVICE_RULES.definitions.cannon.cost);
    game.selectDevice('cannon');
    game.placeDevice(-125, 0, 2);
    game.start();
    expect(decodeCampaignProfile(raw).activeAttempt?.devices).toMatchObject([{ id: 2, variantId: 'siege-cannon' }]);
    game.advance(1000 / 30);
    expect(game.view.result).toMatchObject({ outcome: 'victory', saved: true });
    expect(open().view.profile.devices).toMatchObject([
      { id: 1, health: 35, position: null }, { id: 2, variantId: 'siege-cannon', position: { x: -125, y: 0 } },
    ]);
  });

  it('buys a separately unlocked instance at base price, with idempotency tied to the variant', () => {
    const base = { ...emptyCampaignProfile(), shards: 100, purchasedNodeIds: ['unlock-cannon'] };
    expect(() => purchaseCampaignDevice(base, 'cannon', 1, 'siege-cannon')).toThrow(/Вариант устройства не открыт/);
    expect(() => purchaseCampaignDevice(base, 'cannon', 1, 'long-harpoon', ['long-harpoon'])).toThrow(/не подходит/);
    expect(() => purchaseCampaignDevice(base, 'harpoon', 1, 'long-harpoon', ['long-harpoon'])).toThrow(/Тип устройства не открыт/);

    const bought = purchaseCampaignDevice(base, 'cannon', 1, 'siege-cannon', ['siege-cannon']);
    const device = bought.inventory[0]!;
    const definition = DEVICE_RULES.definitions.cannon;
    expect(device).toEqual({ id: 1, kind: 'cannon', variantId: 'siege-cannon', health: definition.health, consumed: false });
    expect(bought.shards).toBe(base.shards - definition.cost);
    expect(purchaseCampaignDevice(bought, 'cannon', 1, 'siege-cannon', ['siege-cannon'])).toBe(bought);
    expect(() => purchaseCampaignDevice(bought, 'cannon', 1)).toThrow(/Идентификатор уже занят/);

    const damaged = { ...bought, inventory: [{ ...device, health: definition.health / 2 }] };
    const another = purchaseCampaignDevice(damaged, 'cannon', 2, 'siege-cannon', ['siege-cannon']);
    expect(another.shards).toBe(bought.shards - definition.cost);
    expect(another.inventory[0]).toEqual(damaged.inventory[0]);
    expect(another.inventory[1]).toEqual({ ...device, id: 2 });
    const repaired = repairCampaignDevice(damaged, device.id);
    expect(repaired.inventory).toEqual([device]);
    expect(repaired.shards).toBe(damaged.shards - repairCost({ ...damaged.inventory[0]!, position: null }));
  });

  it('carries variants and existing damage through the owned device, combat and normalized snapshots', () => {
    const config = combatConfig('ghost', 34, 220);
    config.devices.definitions.cannon.health = 84;
    const profile = emptySave().profile;
    profile.devices = [
      { id: 1, kind: 'cannon', variantId: 'siege-cannon', position: { x: 150, y: 0 }, health: 35, consumed: false },
      { id: 2, kind: 'light-trap', position: { x: 100, y: 50 }, health: 17, consumed: true, trapCharges: 0 },
    ];
    const snapshot = deviceDeployments(profile);
    const state = createBattle(config, SEED, undefined, battleDeviceDeployments(profile, config.devices.definitions));
    const device = state.devices[0]!;
    expect(device).toMatchObject({ variantId: 'siege-cannon', startHealth: 42, health: 42 });
    expect(normalizedDeviceResults(state.devices, snapshot, config.devices.definitions)).toEqual(snapshot);

    device.health = 21;
    expect(normalizedDeviceResults(state.devices, snapshot, config.devices.definitions))
      .toEqual([{ ...snapshot[0], health: 17.5 }, snapshot[1]]);
    const normalize = (result: typeof device) => normalizedDeviceResults([result], snapshot, config.devices.definitions);
    expect(() => normalize({ ...device, variantId: undefined })).toThrow(/стартовому снимку/);
    expect(() => normalize({ ...device, health: 43 })).toThrow(/превышает стартовую/);
  });

  it('intercepts a tougher target faster with siege cannon and clears two weak targets faster with a normal cannon', () => {
    const tough = combatConfig('ghost', 23, 220);
    expect(effectiveWeaponDefinition(tough, siegeCannon).damage).toBe(25);
    expect(finish(tough, siegeCannon).elapsed).toBeLessThan(finish(tough, cannon).elapsed);

    const weak = combatConfig('ghost', 12, 220, 2);
    const standard = finish(weak, cannon);
    const siege = finish(weak, siegeCannon);
    expect(standard.kills).toBe(2);
    expect(siege.kills).toBe(standard.kills);
    expect(standard.elapsed).toBeLessThan(siege.elapsed);
  });

  it('intercepts distant air earlier with long harpoon and saves hull damage with a normal harpoon at close range', () => {
    const far = combatConfig('bat', 20, 340);
    expect(effectiveWeaponDefinition(far, longHarpoon).range).toBeCloseTo(225 * 1.15);
    expect(finish(far, longHarpoon).elapsed).toBeLessThan(finish(far, harpoon).elapsed);

    const near = combatConfig('bat', 17, 80);
    const standard = finish(near, { ...harpoon, x: 80 });
    const long = finish(near, { ...longHarpoon, x: 80 });
    expect(standard.elapsed).toBeLessThan(long.elapsed);
    expect(standard.devices[0]!.health).toBe(near.devices.definitions.harpoon.health);
    expect(long.devices[0]!.health).toBe(standard.devices[0]!.health - near.enemies.bat.attackDamage);
  });

  it('uses upgraded siege damage and reload for a manual target and for a Barrage during cooldown', () => {
    const config = combatConfig('ghost', 100, 220);
    config.devices.cannon.manualDamageBonus = 0.25;
    config.ability = { ...ABILITY_BASE_RULES.barrage, damageBonus: 0.15 };
    const state = battle(config, siegeCannon);
    const target = state.enemies[0]!;
    stepBattle(state, config, [{ type: 'cannon-target', deviceId: siegeCannon.id, enemyId: target.id }]);
    expect(target.health).toBeCloseTo(100 - 25 * 1.25);
    expect(state.devices[0]!.attackCooldown).toBeCloseTo(0.7 * 1.25);

    stepBattle(state, config, [{ type: 'use-ability', target: { x: target.x, y: target.y, enemyId: target.id } }]);
    expect(target.health).toBeCloseTo(100 - 25 * 1.25 - 25 * 1.15);
    expect(state.devices[0]!.attackCooldown).toBeCloseTo(0.7 * 1.25);
    expect(state.ability!.readyTick).toBeGreaterThan(state.tick);
  });

  it('extends manual and Barrage target reach for long harpoon while keeping the flying damage multiplier', () => {
    const config = combatConfig('bat', 100, 295);
    config.devices.harpoon.flyingDamageMultiplier = 1.2;
    config.ability = { ...ABILITY_BASE_RULES.barrage, airDamageBonus: 0.2 };
    const standard = battle(config, { ...harpoon, x: 85 });
    const long = battle(config, { ...longHarpoon, x: 85 });
    const target = long.enemies[0]!;
    const manual = { type: 'cannon-target', deviceId: harpoon.id, enemyId: target.id } as const;
    stepBattle(standard, config, [manual]);
    stepBattle(long, config, [manual]);
    expect(standard.enemies[0]!.health).toBe(100);
    expect(target.health).toBeCloseTo(100 - 18 * 0.85 * 1.2);

    const barrage = { type: 'use-ability', target: { x: target.x, y: target.y, enemyId: target.id } } as const;
    stepBattle(standard, config, [barrage]);
    stepBattle(long, config, [barrage]);
    expect(standard.ability!.readyTick).toBe(0);
    expect(target.health).toBeCloseTo(100 - 18 * 0.85 * 1.2 - 18 * 0.85 * 1.2 * 1.2);
    expect(long.ability!.readyTick).toBeGreaterThan(long.tick);
  });
});
