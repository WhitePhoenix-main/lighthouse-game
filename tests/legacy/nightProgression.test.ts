import { describe, expect, it } from 'vitest';
import { grantFixtureDevices } from '../helpers/devices';
import type { NightDefinition, NightId, SaveStore, UpgradeDefinition } from '../../src/contracts';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG, validateNightDefinitions } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { calculateNightConfig, createUpgradeViews, getUpgradeAvailability, validateUpgradeDefinitions } from '../../src/progression/upgrades';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { decodeSave, emptySave, SaveRepository } from '../../src/application/saves';
import { checkPlacement } from '../../src/application/placement';
class Store implements SaveStore {
  value: string | null = null; fail = false; writes = 0;
  read() { return this.value; }
  write(value: string) { this.writes++; if (this.fail) throw new Error('quota'); this.value = value; }
}
let seq = 0;
function setup(resources = 0, wonNightIds: NightId[] = [], catalog = NIGHT_CATALOG) {
  const store = new Store(); const save = emptySave();
  save.profile.resources = resources; save.profile.wonNightIds = wonNightIds;
  store.value = JSON.stringify(save);
  const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: `night-${++seq}`, seed: 42 }), undefined, catalog);
  return { app, store };
}
const tinyCatalog = (): NightDefinition[] => NIGHT_CATALOG.map(night => ({ ...night, config: { ...structuredClone(night.config),
  spawnRadius: 90, beam: { ...night.config.beam, halfAngle: Math.PI }, waves: [{ id: 'one', enemies: ['ghost'], spawnInterval: 1 }] } }));
function finish(app: LighthouseApplication) {
  for (let i = 0; i < 200 && app.view.screen === 'battle'; i++) app.advance(1000 / 30);
  expect(app.view.result?.saved).toBe(true);
}
describe('chapter and replay economy', () => {
  it('opens ordinary nights only after unique victories; optional rescue is independent', () => {
    const { app, store } = setup(0, [], tinyCatalog());
    expect(app.view.nights.filter(n => n.available).map(n => n.id)).toEqual(['first-light']);
    app.selectNight('broken-shore'); expect(app.view.selectedNightId).toBe('first-light');
    app.openPreparation(); app.start(); finish(app);
    expect(app.view.result).toMatchObject({ nightId: 'first-light', resources: 1, victoryReward: 72, totalResources: 73 });
    expect(app.view.nights.filter(n => n.available).map(n => n.id)).toEqual(['first-light', 'broken-shore', 'rescue-trial']);
    app.selectNight('rescue-trial'); expect(app.view.screen).toBe('preparation'); expect(app.view.result).toBeNull(); app.start(); finish(app);
    expect(app.view.nights.find(n => n.id === 'winged-tide')?.available).toBe(false);
    app.selectNight('broken-shore'); app.start(); finish(app);
    expect(app.view.nights.find(n => n.id === 'winged-tide')?.available).toBe(true);
    app.selectNight('first-light'); app.start(); finish(app);
    expect(app.view.profile.resources).toBe(4 + 72 + 64 + 84 + 72);
    expect(app.view.profile.wonNightIds).toEqual(['first-light', 'rescue-trial', 'broken-shore']);
    app.retrySave(); expect(decodeSave(store.value!).profile.resources).toBe(296);
  });
  it('keeps battle configuration fixed and disallows selection during battle, pause and errors', () => {
    const { app, store } = setup(0, ['first-light']); app.openPreparation(); app.start();
    const config = app.view.config;
    app.selectNight('broken-shore'); app.pause(); app.selectNight('broken-shore');
    expect(app.view.selectedNightId).toBe('first-light'); expect(app.view.config).toBe(config);
    app.abandonNight('menu'); store.fail = true; app.openDevelopment(); app.purchaseUpgrade('beam-power-1');
    // Insufficient funds do not create an error, so force an actual save failure on start.
    app.openMainMenu(); app.openPreparation(); app.start(); expect(app.view.error).toBeTruthy();
    app.selectNight('broken-shore'); expect(app.view.selectedNightId).toBe('first-light');
  });
  it('preserves owned placement and balance on night change', () => {
    const { app } = setup(100, ['first-light']); app.openDevelopment(); app.purchaseUpgrade('unlock-cannon'); app.back(); app.openPreparation();
    app.selectDevice('cannon'); app.placeDevice(-100, 0); expect(app.view.preparation.placements).toHaveLength(1);
    app.selectNight('broken-shore');
    expect(app.view.preparation.placements).toHaveLength(1); expect(app.view.profile.resources).toBe(65);
    expect(app.view.preparation.reason).toBe('');
    app.start(); expect(app.view.profile.resources).toBe(65);
    expect(decodeSave(JSON.stringify({ ...emptySave(), profile: { ...emptySave().profile, wonNightIds: ['first-light'] }, activeAttempt: { id: 'x', seed: 1, placementCost: 0, deviceSnapshot: [], nightId: 'broken-shore' } })).activeAttempt?.nightId).toBe('broken-shore');
  });
  it('records victory and rewards atomically through failure and repeated settlement', () => {
    const store = new Store(); const initial = emptySave(); initial.profile.wonNightIds = ['first-light']; store.value = JSON.stringify(initial);
    const repo = new SaveRepository(store); repo.load();
    repo.begin({ id: 'one', seed: 1, placementCost: 0, nightId: 'broken-shore' });
    store.fail = true; expect(() => repo.settle('one', 'victory', 15, ['minotaur'])).toThrow();
    expect(repo.current.profile.wonNightIds).toEqual(['first-light']);
    store.fail = false; repo.settle('one', 'victory', 15, ['minotaur']); repo.settle('one', 'victory', 15, ['minotaur']);
    expect(repo.current.profile).toMatchObject({ resources: 15, wonNightIds: ['first-light', 'broken-shore'], completedNights: 1 });
  });
  it('keeps rescue reward on ordinary defeat but discards it on interruption', () => {
    const { app, store } = setup(0, ['first-light']); app.selectNight('rescue-trial'); app.openPreparation(); app.start();
    const battle = app.view.battle! as { earnedRescue: number; outcome: 'defeat' };
    battle.earnedRescue = 12; battle.outcome = 'defeat'; app.advance(0);
    expect(app.view.result).toMatchObject({ rescue: 12, saved: true }); expect(app.view.profile.resources).toBe(12);
    app.openPreparation(); app.start(); (app.view.battle! as { earnedRescue: number }).earnedRescue = 12;
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused', seed: 1 }), undefined, NIGHT_CATALOG);
    expect(reload.view.profile.resources).toBe(12); expect(reload.view.interrupted).toBe(true);
  });
});
describe('equipment tree and land', () => {
  it('opens four devices, flash, slots and paired light through reachable purchases', () => {
    const { app, store } = setup(2000, ['first-light', 'broken-shore', 'winged-tide']); app.openDevelopment();
    for (const node of UPGRADES.slice(0, 14)) { app.purchaseUpgrade(node.id); app.purchaseUpgrade(node.id); }
    expect(app.view.profile.purchasedUpgrades).toHaveLength(14);
    expect(app.view.config.availableDevices).toEqual(['cannon', 'barrier', 'generator', 'light-trap']);
    expect(app.view.config.devices.typeSlots).toBe(4); expect(app.view.config.flash.enabled).toBe(true); expect(app.view.config.pairedDamageBonus).toBe(.2);
    expect(decodeSave(store.value!).profile.resources).toBe(2000 - UPGRADES.slice(0, 14).reduce((sum, node) => sum + node.cost, 0));
  });
  it('checks won night prerequisites and linked branches before funds', () => {
    const profile = emptySave().profile; profile.resources = 2000;
    expect(getUpgradeAvailability(profile, 'unlock-cannon')).toMatchObject({ status: 'requires' });
    profile.wonNightIds = ['first-light'];
    expect(getUpgradeAvailability(profile, 'paired-light').reason).toContain('Мощность');
    profile.purchasedUpgrades = ['beam-power-1', 'beam-width-1'];
    expect(getUpgradeAvailability(profile, 'paired-light').status).toBe('available');
    const views = createUpgradeViews(profile, NIGHT_CATALOG[0]!.config);
    expect(views.find(node => node.definition.id === 'unlock-cannon')).toMatchObject({ currentValue: 0, nextValue: 1 });
  });
  it('never charges legacy players for existing unlocks and lets them buy subsequent slots directly', () => {
    const { store } = setup(300, ['first-light', 'broken-shore', 'winged-tide']);
    const save = decodeSave(store.value!); save.profile.legacyEquipment = true; grantFixtureDevices(save.profile); store.value = JSON.stringify(save);
    const app = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'legacy-slots', seed: 1 }), undefined, NIGHT_CATALOG);
    app.openDevelopment();
    const writes = store.writes;
    for (const id of ['unlock-cannon', 'unlock-barrier', 'unlock-generator', 'unlock-trap', 'unlock-flash'] as const) {
      expect(getUpgradeAvailability(app.view.profile, id)).toMatchObject({ status: 'purchased' }); app.purchaseUpgrade(id);
    }
    expect(store.writes).toBe(writes); expect(app.view.profile.resources).toBe(300);
    app.purchaseUpgrade('device-slots-3'); app.purchaseUpgrade('device-slots-4');
    expect(app.view.config.devices.typeSlots).toBe(4);
    expect(app.view.profile.purchasedUpgrades).toEqual(['device-slots-3', 'device-slots-4']);
    expect(app.view.profile.resources).toBe(140);
    expect(decodeSave(store.value!).profile).toEqual(app.view.profile);
    const reload = new LighthouseApplication(store, NIGHT_CONFIG, () => ({ id: 'unused-slots', seed: 2 }), undefined, NIGHT_CATALOG);
    expect(reload.view.config.devices.typeSlots).toBe(4);
    expect(reload.view.config.availableDevices).toHaveLength(4);
  });
  it('validates unlock restrictions and keeps all device circles on land', () => {
    const base = NIGHT_CATALOG[0]!.config;
    expect(checkPlacement(base, [], 'cannon', -100, 0)).toMatchObject({ valid: false });
    const config = calculateNightConfig(base, ['unlock-cannon']); const radius = config.devices.definitions.cannon.radius;
    expect(checkPlacement(config, [], 'cannon', -radius, 100).valid).toBe(true);
    expect(checkPlacement(config, [], 'cannon', -radius + .01, 100).valid).toBe(false);
    expect(checkPlacement(config, [], 'cannon', 100, 0).reason).toContain('суше');
  });
  it('preserves legacy equipment in production and deep copies all four species', () => {
    const config = calculateNightConfig(NIGHT_CATALOG[0]!.config, [], true);
    expect(config.availableDevices).toHaveLength(4); expect(config.flash.enabled).toBe(true);
    config.enemies.bat.health = 1; config.devices.definitions.cannon.cost = 1;
    expect(NIGHT_CATALOG[0]!.config.enemies.bat.health).not.toBe(1);
    expect(NIGHT_CATALOG[0]!.config.devices.definitions.cannon.cost).not.toBe(1);
  });
  it.each(['stat', 'branch', 'night'])('rejects unknown upgrade %s data', key => {
    const node = structuredClone(UPGRADES[0]!) as unknown as Record<string, unknown>;
    if (key === 'stat') node.effect = { stat: 'unknown', amount: 1 }; else if (key === 'branch') node.branch = 'unknown'; else node.requiresNight = 'unknown';
    expect(() => validateUpgradeDefinitions([node as unknown as UpgradeDefinition])).toThrow();
  });
});
describe('strict save v4 and migrations', () => {
  it.each([1, 2])('migrates v%s repeats to only one known win and preserves identity/cost', version => {
    const old = { version, profile: { resources: 123, completedNights: 99, encountered: ['ghost'], purchasedUpgrades: ['beam-power-1'] }, activeAttempt: { id: 'old', seed: 8, placementCost: 17 }, lastSettled: null };
    const migrated = decodeSave(JSON.stringify(old));
    expect(migrated.profile).toMatchObject({ resources: 123, completedNights: 99, wonNightIds: ['first-light'], legacyEquipment: true, purchasedUpgrades: version === 1 ? [] : ['beam-power-1'] });
    expect(migrated.activeAttempt).toEqual({ ...old.activeAttempt, nightId: 'first-light', lensId: 'basic', legacyRental: true });
  });
  it.each(['kind', 'night', 'flag', 'attempt', 'purchase'])('rejects corrupt v4 %s data', field => {
    const save = JSON.parse(JSON.stringify(emptySave()));
    if (field === 'kind') save.profile.encountered = ['unknown'];
    if (field === 'night') save.profile.wonNightIds = ['unknown'];
    if (field === 'flag') save.profile.legacyEquipment = 1;
    if (field === 'attempt') save.activeAttempt = { id: 'x', seed: 1, placementCost: 1, nightId: 'unknown' };
    if (field === 'purchase') save.profile.purchasedUpgrades = ['unlock-cannon'];
    expect(() => decodeSave(JSON.stringify(save))).toThrow();
  });
  it.each([1, 2])('rejects new species and upgrades in old schema v%s', version => {
    const save = { ...emptySave(), version };
    save.profile.encountered = ['bat']; expect(() => decodeSave(JSON.stringify(save))).toThrow();
    save.profile.encountered = []; save.profile.purchasedUpgrades = ['unlock-cannon'];
    if (version === 2) expect(() => decodeSave(JSON.stringify(save))).toThrow();
  });
  it('rejects impossible victory order and attempts of locked nights', () => {
    for (const nightId of ['broken-shore', 'winged-tide', 'rescue-trial'] as const) {
      const save = emptySave(); save.profile.wonNightIds = [nightId];
      expect(() => decodeSave(JSON.stringify(save))).toThrow('порядок');
      save.profile.wonNightIds = []; save.activeAttempt = { id: 'locked', seed: 1, placementCost: 0, nightId };
      expect(() => decodeSave(JSON.stringify(save))).toThrow('не открыта');
    }
  });
  it('allows zero beam damage for isolated combat and rejects negative or nonfinite damage', () => {
    const catalog = structuredClone(NIGHT_CATALOG);
    catalog[0]!.config.beam.damagePerSecond = 0;
    expect(() => validateNightDefinitions(catalog)).not.toThrow();
    for (const damage of [-1, NaN, Infinity]) {
      catalog[0]!.config.beam.damagePerSecond = damage;
      expect(() => validateNightDefinitions(catalog)).toThrow('правила');
    }
  });
  it('validates duplicate, missing, cyclic and optional mandatory dependencies', () => {
    expect(() => validateNightDefinitions([...NIGHT_CATALOG, NIGHT_CATALOG[0]!])).toThrow('Повторный');
    const missing = structuredClone(NIGHT_CATALOG); missing[0]!.requires = 'winged-tide'; expect(() => validateNightDefinitions(missing)).toThrow('Цикл');
    expect(() => validateNightDefinitions([NIGHT_CATALOG[1]!])).toThrow('зависимость');
    const optional = structuredClone(NIGHT_CATALOG); optional[1]!.requires = 'rescue-trial'; expect(() => validateNightDefinitions(optional)).toThrow('зависимость');
  });
});
