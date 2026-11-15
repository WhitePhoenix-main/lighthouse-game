import { validateLensOwnership } from './lenses';
import type { LensId, LensUpgradeId, DeviceKind, NightConfig, Profile, UpgradeAvailability, UpgradeDefinition, UpgradeId, UpgradeNodeView, UpgradeStat } from '../contracts';
import { LENSES, LENS_UPGRADES } from '../content/lenses';
import { getBossRules } from '../content/boss';
import { UPGRADES } from '../content/upgrades';
import { NIGHT_CATALOG } from '../content/nights';
import { DEVICE_KINDS, LEGACY_DEVICE_KINDS } from './devices';
const nightIds = ['first-light', 'broken-shore', 'winged-tide', 'rescue-trial', 'abyss-warden', 'far-shore'];
const deviceKinds = DEVICE_KINDS;
const stats: readonly UpgradeStat[] = ['damagePerSecond', 'halfAngle', 'range', ...deviceKinds, 'flash', 'typeSlots', 'pairedDamageBonus',
  'turnSpeed', 'lighthouseHealth', 'shieldCapacity', 'shieldRegeneration', 'flashDamage', 'flashCooldownReduction',
  'cannonDamage', 'cannonIntervalReduction', 'cannonRange', 'harpoonDamage', 'harpoonIntervalReduction', 'harpoonRange',
  'mortarDamage', 'mortarBlastRadius', 'mortarProjectileSpeed', 'mortarIntervalReduction', 'mortarArmorMultiplier',
  'bellRadius', 'bellDuration', 'bellIntervalReduction', 'bellDamageReduction', 'bellFirstPulseReduction',
  'repairAmount', 'repairRange', 'repairCharges', 'repairDamageReduction', 'repairEmergency',
  'cannonManualBonus', 'cannonArmorMultiplier', 'barrierHealth', 'barrierDamageReduction', 'barrierChargeReduction',
  'barrierBreakSlowReduction', 'barrierRepairReduction', 'generatorHealth', 'generatorDamageReduction', 'generatorResidualSeconds', 'generatorLastStand', 'harpoonSlowReduction', 'harpoonFlyingMultiplier',
  'trapDamage', 'trapRadius', 'trapHealth', 'trapArmorMultiplier', 'trapCharges'];
export function validateUpgradeDefinitions(nodes: readonly UpgradeDefinition[]): void {
  const byId = new Map<UpgradeId, UpgradeDefinition>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`Повторный идентификатор улучшения: ${node.id}`);
    if (!Number.isSafeInteger(node.cost) || node.cost <= 0) throw new Error(`Неверная цена улучшения: ${node.id}`);
    if (!Number.isFinite(node.effect.amount) || node.effect.amount <= 0 || !stats.includes(node.effect.stat)) throw new Error(`Неверный эффект улучшения: ${node.id}`);
    if (!['power', 'width', 'range', 'devices', 'defense', 'synergy'].includes(node.branch) || !Number.isSafeInteger(node.tier) || node.tier < 1
      || (node.requiresNight !== undefined && !nightIds.includes(node.requiresNight))) throw new Error(`Неверная ветвь или условие улучшения: ${node.id}`);
    byId.set(node.id, node);
  }
  const visited = new Set<UpgradeId>(); const visiting = new Set<UpgradeId>();
  const visit = (id: UpgradeId): void => {
    if (visiting.has(id)) throw new Error(`Цикл зависимостей улучшений: ${id}`);
    if (visited.has(id)) return;
    const node = byId.get(id);
    if (!node) throw new Error(`Неизвестная зависимость улучшения: ${id}`);
    visiting.add(id); for (const dependency of node.requires) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}
validateUpgradeDefinitions(UPGRADES);
function getDefinition(id: string): UpgradeDefinition {
  const definition = UPGRADES.find(node => node.id === id);
  if (!definition) throw new Error(`Неизвестное улучшение: ${id}`);
  return definition;
}
const legacyUnlocks = new Set<UpgradeId>(['unlock-cannon', 'unlock-barrier', 'unlock-generator', 'unlock-trap', 'unlock-flash']);
export function validatePurchasedUpgrades(purchasedIds: readonly string[], legacyEquipment = false): asserts purchasedIds is readonly UpgradeId[] {
  const purchased = new Set(purchasedIds);
  if (purchased.size !== purchasedIds.length) throw new Error('Повторная покупка улучшения в сохранении');
  for (const id of purchasedIds) {
    const node = getDefinition(id);
    for (const dependency of node.requires) if (!purchased.has(dependency) && !(legacyEquipment && legacyUnlocks.has(dependency))) throw new Error(`Для ${node.name} требуется ${getDefinition(dependency).name}`);
  }
}
export function getUpgradeAvailability(profile: Readonly<Profile>, id: UpgradeId): UpgradeAvailability {
  validatePurchasedUpgrades(profile.purchasedUpgrades, profile.legacyEquipment);
  const node = getDefinition(id);
  if (profile.legacyEquipment && legacyUnlocks.has(id)) return { status: 'purchased', reason: 'Оснащение сохранено из старого профиля' };
  if (profile.purchasedUpgrades.includes(id)) return { status: 'purchased', reason: 'Уже куплено' };
  const missing = node.requires.filter(dependency => !profile.purchasedUpgrades.includes(dependency) && !(profile.legacyEquipment && legacyUnlocks.has(dependency)));
  if (missing.length) return { status: 'requires', reason: `Требуется: ${missing.map(dependency => getDefinition(dependency).name).join(', ')}` };
  if (node.requiresNight && !profile.wonNightIds.includes(node.requiresNight)) return { status: 'requires', reason: `Требуется победа в ночи: ${NIGHT_CATALOG.find(night => night.id === node.requiresNight)!.name}` };
  if (profile.resources < node.cost) return { status: 'insufficient', reason: `Не хватает ресурсов: ${node.cost - profile.resources}` };
  return { status: 'available', reason: `Можно купить за ${node.cost}` };
}
export function calculateNightConfig(base: NightConfig, purchasedIds: readonly UpgradeId[], legacyEquipment = false, loadout?: { lensId: LensId; upgrades: readonly LensUpgradeId[]; bossLevel?: number }): NightConfig {
  validatePurchasedUpgrades(purchasedIds, legacyEquipment);
  const config = structuredClone(base);
  const unlocked = new Set<DeviceKind>(legacyEquipment ? LEGACY_DEVICE_KINDS : base.availableDevices ?? deviceKinds);
  if (legacyEquipment) config.flash.enabled = true;
  for (const node of UPGRADES) {
    if (!purchasedIds.includes(node.id)) continue;
    const {stat, amount} = node.effect;
    if (stat === 'range' || stat === 'halfAngle' || stat === 'damagePerSecond' || stat === 'turnSpeed') config.beam[stat] += amount;
    else if (stat === 'flash') config.flash.enabled = true;
    else if (stat === 'typeSlots') config.devices.typeSlots += amount;
    else if (stat === 'pairedDamageBonus') config.pairedDamageBonus = (config.pairedDamageBonus ?? 0) + amount;
    else if (stat === 'lighthouseHealth') config.lighthouseHealth += amount;
    else if (stat === 'shieldCapacity') config.shield.capacityPerGenerator += amount;
    else if (stat === 'shieldRegeneration') config.shield.regenerationPerSecond += amount;
    else if (stat === 'flashDamage') config.flash.damage += amount;
    else if (stat === 'flashCooldownReduction') config.flash.cooldown -= amount;
    else if (stat === 'cannonDamage') config.devices.definitions.cannon.damage += amount;
    else if (stat === 'cannonIntervalReduction') config.devices.definitions.cannon.attackInterval -= amount;
    else if (stat === 'cannonRange') config.devices.definitions.cannon.range += amount;
    else if (stat === 'harpoonDamage') config.devices.definitions.harpoon.damage += amount;
    else if (stat === 'harpoonIntervalReduction') config.devices.definitions.harpoon.attackInterval -= amount;
    else if (stat === 'harpoonRange') config.devices.definitions.harpoon.range += amount;
    else if (stat === 'mortarDamage') config.devices.definitions.mortar.damage += amount;
    else if (stat === 'mortarBlastRadius') config.devices.mortar.blastRadius += amount;
    else if (stat === 'mortarProjectileSpeed') config.devices.mortar.projectileSpeed += amount;
    else if (stat === 'mortarIntervalReduction') config.devices.definitions.mortar.attackInterval -= amount;
    else if (stat === 'mortarArmorMultiplier') config.devices.mortar.armorMultiplier += amount;
    else if (stat === 'bellRadius') config.devices.definitions.bell.range += amount;
    else if (stat === 'bellDuration') config.devices.bell.duration += amount;
    else if (stat === 'bellIntervalReduction') config.devices.definitions.bell.attackInterval -= amount;
    else if (stat === 'bellDamageReduction') config.devices.bell.incomingDamageMultiplier -= amount;
    else if (stat === 'bellFirstPulseReduction') config.devices.bell.firstPulseSlowMultiplier -= amount;
    else if (stat === 'repairAmount') config.devices.repairLamp.healAmount += amount;
    else if (stat === 'repairRange') config.devices.definitions['repair-lamp'].range += amount;
    else if (stat === 'repairCharges') config.devices.repairLamp.charges += amount;
    else if (stat === 'repairDamageReduction') config.devices.repairLamp.incomingDamageMultiplier -= amount;
    else if (stat === 'repairEmergency') config.devices.repairLamp.emergencyEnabled = true;
    else if (stat === 'cannonManualBonus') config.devices.cannon.manualDamageBonus += amount;
    else if (stat === 'cannonArmorMultiplier') config.devices.cannon.armorMultiplier += amount;
    else if (stat === 'barrierHealth') config.devices.definitions.barrier.health += amount;
    else if (stat === 'barrierDamageReduction') config.devices.barrier.incomingDamageMultiplier -= amount;
    else if (stat === 'barrierChargeReduction') config.devices.barrier.chargeDamageMultiplier -= amount;
    else if (stat === 'barrierBreakSlowReduction') config.devices.barrier.breakSlowMultiplier -= amount;
    else if (stat === 'barrierRepairReduction') config.devices.barrier.repairCostMultiplier -= amount;
    else if (stat === 'generatorHealth') config.devices.definitions.generator.health += amount;
    else if (stat === 'generatorDamageReduction') config.devices.generator.incomingDamageMultiplier -= amount;
    else if (stat === 'generatorResidualSeconds') config.devices.generator.residualSeconds += amount;
    else if (stat === 'generatorLastStand') config.devices.generator.lastStandEnabled = true;
    else if (stat === 'harpoonSlowReduction') config.devices.harpoon.slowMultiplier -= amount;
    else if (stat === 'harpoonFlyingMultiplier') config.devices.harpoon.flyingDamageMultiplier += amount;
    else if (stat === 'trapDamage') config.devices.trap.damage += amount;
    else if (stat === 'trapRadius') config.devices.trap.blastRadius += amount;
    else if (stat === 'trapHealth') config.devices.definitions['light-trap'].health += amount;
    else if (stat === 'trapArmorMultiplier') config.devices.trap.armorMultiplier += amount;
    else if (stat === 'trapCharges') config.devices.trap.charges += amount;
    else unlocked.add(stat);
  }
  if (base.availableDevices !== undefined || legacyEquipment) config.availableDevices = [...unlocked];
  if (loadout) {
    validateLensOwnership(LENSES.map(lens => lens.id), loadout.upgrades, loadout.lensId);
    const lens = LENSES.find(item => item.id === loadout.lensId);
    if (!lens) throw new Error('Неизвестная линза.');
    config.beam.damagePerSecond *= lens.damageMultiplier;
    config.beam.halfAngle *= lens.widthMultiplier; config.beam.range *= lens.rangeMultiplier;
    config.beam.maxTargets = lens.maxTargets;
    config.lens = { id: lens.id, slowMultiplier: lens.slowMultiplier, armorMultiplier: lens.armorMultiplier,
      ...(lens.focus ? { focus: { ...lens.focus } } : {}), ...(lens.burn ? { burn: { ...lens.burn } } : {}),
      ...(lens.resonance ? { resonance: { ...lens.resonance } } : {}) };
    for (const node of LENS_UPGRADES) {
      if (node.lensId !== lens.id || !loadout.upgrades.includes(node.id)) continue;
      const {stat, amount} = node.effect;
      if (stat === 'slowMultiplier' || stat === 'armorMultiplier') config.lens[stat] += amount;
      else if (stat === 'pairedDamageBonus') config.pairedDamageBonus = (config.pairedDamageBonus ?? 0) + amount;
      else if (stat === 'focusDamageBonus') {
        if (!config.lens.focus) throw new Error('У линзы нет непрерывного фокуса.');
        config.lens.focus.damageBonus += amount;
      }
      else if (stat === 'burnDamagePerSecond' || stat === 'burnDuration') {
        if (!config.lens.burn) throw new Error('У линзы нет остаточного горения.');
        config.lens.burn[stat === 'burnDuration' ? 'seconds' : 'damagePerSecond'] += amount;
      }
      else if (stat === 'resonanceDamageBonus') {
        if (!config.lens.resonance) throw new Error('У линзы нет резонанса.');
        config.lens.resonance.damageBonus += amount;
      }
      else config.beam[stat] += amount;
    }
    if (config.boss && loadout.bossLevel !== undefined) config.boss = getBossRules(loadout.bossLevel);
  }
  if (config.flash.cooldown <= 0 || config.devices.definitions.cannon.attackInterval <= 0 || config.devices.definitions.harpoon.attackInterval <= 0 || config.devices.definitions.mortar.attackInterval <= 0 || config.devices.definitions.bell.attackInterval <= 0)
    throw new Error('Улучшения обнулили интервал действия.');
  const bell = config.devices.bell;
  if (![bell.duration, bell.slowMultiplier, bell.firstPulseSlowMultiplier, bell.incomingDamageMultiplier].every(value => Number.isFinite(value) && value > 0)
    || bell.slowMultiplier > 1 || bell.firstPulseSlowMultiplier > bell.slowMultiplier || bell.incomingDamageMultiplier > 1)
    throw new Error('Улучшения выводят параметры колокола за допустимые границы.');
  const repair = config.devices.repairLamp;
  if (!Number.isSafeInteger(repair.charges) || repair.charges < 1
    || ![repair.healAmount, repair.incomingDamageMultiplier, repair.emergencyMultiplier, repair.emergencyThreshold,
      config.devices.definitions['repair-lamp'].attackInterval, config.devices.definitions['repair-lamp'].range].every(value => Number.isFinite(value) && value > 0)
    || repair.incomingDamageMultiplier > 1 || repair.emergencyThreshold > 1 || repair.emergencyMultiplier < 1)
    throw new Error('Неверные параметры боевого ремонта.');
  const { cannon, barrier, generator } = config.devices;
  if (![cannon.manualDamageBonus, generator.residualSeconds].every(value => Number.isFinite(value) && value >= 0)
    || !Number.isFinite(cannon.armorMultiplier) || cannon.armorMultiplier < 1
    || ![barrier.incomingDamageMultiplier, barrier.chargeDamageMultiplier, barrier.breakSlowMultiplier,
      barrier.repairCostMultiplier, generator.incomingDamageMultiplier].every(value => Number.isFinite(value) && value > 0 && value <= 1)
    || ![barrier.breakSlowSeconds, barrier.breakSlowRadius, config.devices.definitions.barrier.health,
      config.devices.definitions.generator.health].every(value => Number.isFinite(value) && value > 0))
    throw new Error('Неверные параметры улучшений устройств.');
  const { harpoon, trap } = config.devices;
  if (!Number.isFinite(harpoon.slowMultiplier) || harpoon.slowMultiplier <= 0 || harpoon.slowMultiplier > 1
    || ![harpoon.flyingDamageMultiplier, trap.armorMultiplier].every(value => Number.isFinite(value) && value >= 1)
    || ![harpoon.slowSeconds, trap.damage, trap.blastRadius, trap.triggerRadius, trap.rearmSeconds].every(value => Number.isFinite(value) && value > 0)
    || !Number.isSafeInteger(trap.charges) || trap.charges < 1 || trap.charges > 2)
    throw new Error('Неверные параметры гарпуна или ловушки.');
  return config;
}
function statValue(config: NightConfig, stat: UpgradeStat): number {
  if (stat === 'range' || stat === 'halfAngle' || stat === 'damagePerSecond' || stat === 'turnSpeed') return config.beam[stat];
  if (stat === 'typeSlots') return config.devices.typeSlots;
  if (stat === 'pairedDamageBonus') return config.pairedDamageBonus ?? 0;
  if (stat === 'flash') return config.flash.enabled === false ? 0 : 1;
  if (stat === 'lighthouseHealth') return config.lighthouseHealth;
  if (stat === 'shieldCapacity') return config.shield.capacityPerGenerator;
  if (stat === 'shieldRegeneration') return config.shield.regenerationPerSecond;
  if (stat === 'flashDamage') return config.flash.damage;
  if (stat === 'flashCooldownReduction') return config.flash.cooldown;
  if (stat === 'cannonDamage') return config.devices.definitions.cannon.damage;
  if (stat === 'cannonIntervalReduction') return config.devices.definitions.cannon.attackInterval;
  if (stat === 'cannonRange') return config.devices.definitions.cannon.range;
  if (stat === 'harpoonDamage') return config.devices.definitions.harpoon.damage;
  if (stat === 'harpoonIntervalReduction') return config.devices.definitions.harpoon.attackInterval;
  if (stat === 'harpoonRange') return config.devices.definitions.harpoon.range;
  if (stat === 'mortarDamage') return config.devices.definitions.mortar.damage;
  if (stat === 'mortarBlastRadius') return config.devices.mortar.blastRadius;
  if (stat === 'mortarProjectileSpeed') return config.devices.mortar.projectileSpeed;
  if (stat === 'mortarIntervalReduction') return config.devices.definitions.mortar.attackInterval;
  if (stat === 'mortarArmorMultiplier') return config.devices.mortar.armorMultiplier;
  if (stat === 'bellRadius') return config.devices.definitions.bell.range;
  if (stat === 'bellDuration') return config.devices.bell.duration;
  if (stat === 'bellIntervalReduction') return config.devices.definitions.bell.attackInterval;
  if (stat === 'bellDamageReduction') return config.devices.bell.incomingDamageMultiplier;
  if (stat === 'bellFirstPulseReduction') return config.devices.bell.firstPulseSlowMultiplier;
  if (stat === 'repairAmount') return config.devices.repairLamp.healAmount;
  if (stat === 'repairRange') return config.devices.definitions['repair-lamp'].range;
  if (stat === 'repairCharges') return config.devices.repairLamp.charges;
  if (stat === 'repairDamageReduction') return config.devices.repairLamp.incomingDamageMultiplier;
  if (stat === 'repairEmergency') return config.devices.repairLamp.emergencyEnabled ? 1 : 0;
  if (stat === 'cannonManualBonus') return config.devices.cannon.manualDamageBonus;
  if (stat === 'cannonArmorMultiplier') return config.devices.cannon.armorMultiplier;
  if (stat === 'barrierHealth') return config.devices.definitions.barrier.health;
  if (stat === 'barrierDamageReduction') return config.devices.barrier.incomingDamageMultiplier;
  if (stat === 'barrierChargeReduction') return config.devices.barrier.chargeDamageMultiplier;
  if (stat === 'barrierBreakSlowReduction') return config.devices.barrier.breakSlowMultiplier;
  if (stat === 'barrierRepairReduction') return config.devices.barrier.repairCostMultiplier;
  if (stat === 'generatorHealth') return config.devices.definitions.generator.health;
  if (stat === 'generatorDamageReduction') return config.devices.generator.incomingDamageMultiplier;
  if (stat === 'generatorResidualSeconds') return config.devices.generator.residualSeconds;
  if (stat === 'generatorLastStand') return config.devices.generator.lastStandEnabled ? 1 : 0;
  if (stat === 'harpoonSlowReduction') return config.devices.harpoon.slowMultiplier;
  if (stat === 'harpoonFlyingMultiplier') return config.devices.harpoon.flyingDamageMultiplier;
  if (stat === 'trapDamage') return config.devices.trap.damage;
  if (stat === 'trapRadius') return config.devices.trap.blastRadius;
  if (stat === 'trapHealth') return config.devices.definitions['light-trap'].health;
  if (stat === 'trapArmorMultiplier') return config.devices.trap.armorMultiplier;
  if (stat === 'trapCharges') return config.devices.trap.charges;
  return config.availableDevices === undefined || config.availableDevices.includes(stat) ? 1 : 0;
}
export function createUpgradeViews(profile: Readonly<Profile>, base: NightConfig): UpgradeNodeView[] {
  const config = calculateNightConfig(base, profile.purchasedUpgrades, profile.legacyEquipment);
  return UPGRADES.map(node => {
    const availability = getUpgradeAvailability(profile, node.id);
    const currentValue = statValue(config, node.effect.stat);

    // Unmet prerequisite nodes still describe their local effect, without granting prerequisites.
    return { ...availability, definition: structuredClone(node), currentValue,
      nextValue: availability.status === 'purchased' ? currentValue : node.effect.stat === 'flash' || deviceKinds.includes(node.effect.stat as DeviceKind) ? 1
        : currentValue + (node.effect.stat.endsWith('Reduction') ? -node.effect.amount : node.effect.amount) };
  });
}



