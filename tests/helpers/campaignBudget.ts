import type { DeviceKind, OwnedDevice } from '../../src/contracts';
import { ABILITY_ECONOMY_CHAPTERS } from '../../src/content/campaignAbilityEconomy';
import { CAMPAIGN_PURCHASE_DRAFT, draftFirstWinPearls } from '../../src/content/campaignPurchaseDraft';
import { DEVICE_RULES } from '../../src/content/devices';
import { UPGRADES } from '../../src/content/upgrades';
import { rechargeCost, repairCost, trapChargeCapacity } from '../../src/progression/devices';

const upgrades = new Map<string, (typeof UPGRADES)[number]>(UPGRADES.map(node => [node.id, node]));
const deviceKinds = new Set<string>(Object.keys(DEVICE_RULES.definitions));
const trapCapacityPurchases = UPGRADES.filter(node => node.effect.stat === 'trapCharges').map(node => node.id);

const builds = {
  control: {
    branches: ['seal', 'slowing', 'bell', 'generator', 'barrier', 'light-trap', 'cannon', 'basic', 'flash'],
    field: ['generator', 'bell', 'barrier', 'cannon', 'generator', 'bell', 'barrier', 'cannon'],
  },
  artillery: {
    branches: ['barrage', 'focused', 'mortar', 'harpoon', 'cannon', 'light-trap', 'barrier', 'basic', 'flash'],
    field: ['mortar', 'harpoon', 'cannon', 'light-trap', 'mortar', 'harpoon', 'cannon', 'light-trap'],
  },
} as const satisfies Record<string, { branches: readonly string[]; field: readonly DeviceKind[] }>;

function candidateField(build: keyof typeof builds, chapter: number): readonly DeviceKind[] {
  if (chapter === 1) return ['cannon', 'barrier', 'light-trap', 'cannon'];
  return builds[build].field;
}

function damaged(device: OwnedDevice, healthFraction: number): OwnedDevice {
  return { ...device, health: DEVICE_RULES.definitions[device.kind].health * healthFraction,
    ...(device.kind === 'light-trap' ? { trapCharges: 0, consumed: true } : {}) };
}

function fullRepairReserve(field: readonly DeviceKind[]): number {
  return 3 * field.reduce((total, kind, id) => {
    const device = damaged({ id, kind, health: 0, consumed: false, position: null }, 0);
    return total + repairCost(device) + rechargeCost(device, trapCapacityPurchases);
  }, 0);
}

export function auditCampaignBudget(build: keyof typeof builds, options: {
  purchaseLimit?: number; stress?: { chapter: number; kills: 'none' | 'half' };
} = {}) {
  const priorities: readonly string[] = builds[build].branches;
  const focuses = new Set(['unlock-cannon', 'unlock-barrier', 'unlock-trap', 'device-slots-3', 'device-slots-4',
    'device-objects-1', 'device-objects-2', 'device-objects-3', 'device-objects-4',
    ...priorities.slice(0, 2).flatMap((branch, index) => index === 0
      ? [`ability-${branch}-unlock`, `ability-${branch}-power-1`] : [`lens-unlock-${branch}`]),
    ...CAMPAIGN_PURCHASE_DRAFT.filter(node => node.id.startsWith('unlock-')
      && priorities.includes(node.branch)).map(node => node.id)]);
  const ranked = CAMPAIGN_PURCHASE_DRAFT.filter(node => node.category === 'general' || priorities.includes(node.branch))
    .sort((first, second) => Number(focuses.has(second.id)) - Number(focuses.has(first.id))
      || first.winsBeforePurchase - second.winsBeforePurchase || first.shards - second.shards || first.pearls - second.pearls
      || Number(first.id > second.id) - Number(first.id < second.id));
  const purchases = new Set<string>();
  const liveUpgradeIds: (typeof UPGRADES)[number]['id'][] = [];
  const devices: OwnedDevice[] = [];
  const ledger = { victoryShards: 0, defeatShards: 0, earnedPearls: 0, nodeShards: 0, nodePearls: 0,
    extraInstances: 0, instanceShards: 0, repair: 0, recharge: 0 };
  let wins = 0, shards = 0, pearls = 0;
  const addDevice = (kind: DeviceKind): OwnedDevice => {
    const device: OwnedDevice = { id: devices.length + 1, kind, position: null, consumed: false,
      health: DEVICE_RULES.definitions[kind].health,
      ...(kind === 'light-trap' ? { trapCharges: trapChargeCapacity(liveUpgradeIds) } : {}) };
    devices.push(device);
    return device;
  };
  const restore = (device: OwnedDevice): void => {
    const repair = repairCost(device, liveUpgradeIds), recharge = rechargeCost(device, liveUpgradeIds);
    shards -= repair + recharge;
    if (shards < 0) throw new Error(`Restoration exceeds funds after ${wins} campaign wins`);
    ledger.repair += repair;
    ledger.recharge += recharge;
    device.health = DEVICE_RULES.definitions[device.kind].health;
    if (device.kind === 'light-trap') {
      device.trapCharges = trapChargeCapacity(liveUpgradeIds);
      device.consumed = false;
    }
  };
  const equip = (desired: readonly DeviceKind[], reserve: number): OwnedDevice[] => {
    const limit = (stat: 'typeSlots' | 'maxObjects') => [...purchases].reduce((value, id) => {
      const effect = upgrades.get(id)?.effect;
      return value + (effect?.stat === stat ? effect.amount : 0);
    }, DEVICE_RULES[stat]);
    const maxObjects = limit('maxObjects'), typeSlots = limit('typeSlots');
    const field: OwnedDevice[] = [];
    const fieldKinds = new Set<DeviceKind>();
    for (const kind of desired) {
      if (field.length >= maxObjects) break;
      if ((!fieldKinds.has(kind) && fieldKinds.size >= typeSlots)
        || field.filter(device => device.kind === kind).length >= DEVICE_RULES.perType[kind]) continue;
      const owned = devices.filter(device => device.kind === kind);
      if (owned.length === 0) continue;
      let device = owned.find(candidate => !field.includes(candidate));
      if (!device) {
        const price = DEVICE_RULES.definitions[kind].cost;
        if (price + reserve > shards) continue;
        shards -= price;
        ledger.extraInstances++;
        ledger.instanceShards += price;
        device = addDevice(kind);
      }
      const recharge = rechargeCost(device, liveUpgradeIds);
      if (recharge > 0 && recharge + reserve > shards) continue;
      restore(device);
      fieldKinds.add(kind);
      field.push(device);
    }
    return field;
  };

  const chapters = ABILITY_ECONOMY_CHAPTERS.map(entry => {
    const desired = candidateField(build, entry.chapter);
    const reserve = fullRepairReserve(desired);
    const snapshots = Array.from({ length: entry.nights }, (_, index) => {
      while (purchases.size < (options.purchaseLimit ?? Infinity)) {
        const next = ranked.find(node => !purchases.has(node.id) && node.winsBeforePurchase <= wins
          && node.requires.every(id => purchases.has(id)) && node.shards <= Math.max(0, shards - reserve) && node.pearls <= pearls);
        if (!next) break;
        shards -= next.shards;
        pearls -= next.pearls;
        ledger.nodeShards += next.shards;
        ledger.nodePearls += next.pearls;
        purchases.add(next.id);
        const upgrade = upgrades.get(next.id);
        if (upgrade) liveUpgradeIds.push(upgrade.id);
        const unlockedKind = upgrade?.effect.stat;
        if (unlockedKind && deviceKinds.has(unlockedKind)) addDevice(unlockedKind as DeviceKind);
      }
      const field = equip(desired, reserve);
      const boss = index === entry.nights - 1;
      const before = { shards, pearls, wins, reserve, purchases: [...purchases], field: field.map(device => device.kind) };
      if (boss && options.stress?.chapter === entry.chapter) {
        for (let loss = 0; loss < 3; loss++) {
          const income = options.stress.kills === 'half' ? Math.floor(entry.killBudget / 2) : 0;
          shards += income;
          ledger.defeatShards += income;
          field.forEach(device => restore(Object.assign(device, damaged(device, 0))));
        }
      }
      const afterStressShards = shards;
      const pearlReward = draftFirstWinPearls(entry.chapter, index + 1);
      wins++;
      shards += entry.firstWin;
      pearls += pearlReward;
      ledger.victoryShards += entry.firstWin;
      ledger.earnedPearls += pearlReward;
      field.forEach(device => restore(Object.assign(device, damaged(device, .5))));
      return { before, afterStressShards, after: { shards, pearls, wins } };
    });
    return { chapter: entry.chapter, snapshots, boss: snapshots.at(-1)! };
  });
  return { chapters, ledger, shards, pearls, wins, purchases: [...purchases], instances: devices.length };
}
