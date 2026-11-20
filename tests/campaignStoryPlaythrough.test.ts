import { describe, expect, it } from 'vitest';
import { CampaignGameStore } from '../src/application/campaignGameStore';
import { decodeCampaignProfile } from '../src/application/campaignProfileCodec';
import type { CampaignAbilityId } from '../src/application/campaignProfileTypes';
import { checkDraft, checkPlacement } from '../src/application/placement';
import { CAMPAIGN_PURCHASE_DRAFT } from '../src/content/campaignPurchaseDraft';
import { campaignChapterFor, campaignFirstRewards, CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { DEVICE_RULES } from '../src/content/devices';
import type { DeviceKind, DevicePlacement, LensId, NightConfig, NightDefinition } from '../src/contracts';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, rechargeCost, repairCost,
  remainingTrapCharges, trapChargeCapacity } from '../src/progression/devices';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { campaignStoryDriver } from './helpers/campaignStoryDriver';

const seed = 42;
const purchaseLimit = 115;
const firstChapterField = ['cannon', 'barrier', 'light-trap', 'cannon'] as const;
const builds = {
  control: {
    lens: 'slowing', ability: 'seal',
    field: ['cannon', 'generator', 'bell', 'barrier', 'cannon', 'generator', 'bell', 'barrier'],
  },
  artillery: {
    lens: 'focused', ability: 'barrage',
    field: ['cannon', 'harpoon', 'mortar', 'light-trap', 'cannon', 'harpoon', 'mortar', 'light-trap'],
  },
} as const satisfies Record<string, { lens: LensId; ability: CampaignAbilityId; field: readonly DeviceKind[] }>;
type Build = (typeof builds)[keyof typeof builds];

function memorySave(initial: string | null = null) {
  let raw = initial;
  const storage = { read: () => raw, write: (value: string) => { raw = value; } };
  return {
    open() {
      const game = new CampaignGameStore(storage);
      game.load();
      return game;
    },
    profile: () => decodeCampaignProfile(raw!),
    fork: () => memorySave(raw),
  };
}

function develop(game: CampaignGameStore, build: Build, chapter: number) {
  const priority = ['beam-power-1', 'unlock-cannon', 'beam-width-1', 'beam-power-2', 'paired-light',
    'unlock-barrier', 'beam-turn-1', 'beam-range-1', 'lighthouse-health-1', 'unlock-flash', 'beam-range-2',
    `lens-unlock-${build.lens}`, `ability-${build.ability}-unlock`, `ability-${build.ability}-power-1`,
    'unlock-generator', 'unlock-harpoon', 'unlock-bell', 'unlock-mortar', 'unlock-trap',
    'device-slots-3', 'device-slots-4', 'device-objects-1', 'device-objects-2', 'device-objects-3', 'device-objects-4'];
  const branches = new Set<string>([build.lens, build.ability, ...build.field, 'basic', 'flash', 'barrier']);
  const order = new Map(priority.map((id, index) => [id, index]));
  const ranked = CAMPAIGN_PURCHASE_DRAFT.filter(node => node.category === 'general' || branches.has(node.branch))
    .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity)
      || a.shards - b.shards || a.pearls - b.pearls || a.id.localeCompare(b.id));
  const views = game.presentationView(true).purchases;
  const owned = new Set(views.filter(view => view.purchased).map(view => view.node.id));
  const limit = Math.min(purchaseLimit, 70 + 8 * (chapter - 1));
  // Leave enough working capital for service and extra copies of the field devices.
  const reserve = 12 + 8 * (chapter - 1);
  while (owned.size < limit) {
    const profile = game.current.profile;
    const node = ranked.find(node => !owned.has(node.id) && node.requires.every(id => owned.has(id))
      && node.winsBeforePurchase <= profile.wonNightIds!.length && node.pearls <= profile.bossMaterials
      && node.shards <= Math.max(0, profile.resources - reserve));
    if (!node) break;
    game.purchaseNode(node.id);
    owned.add(node.id);
  }
  const lens = game.current.profile.unlockedLenses.includes(build.lens) ? build.lens : 'basic';
  game.selectLens(lens);
  const abilities = game.presentationView(false).abilities;
  const ability = [build.ability, 'flash' as const].find(id => abilities.some(item => item.id === id && item.available));
  game.selectAbility(ability ?? null);
}

function fieldPosition(config: NightConfig, placements: readonly DevicePlacement[], kind: DeviceKind, copy: number) {
  const routes = config.terrain?.groundRoutes;
  const route = kind === 'mortar' || kind === 'light-trap' ? routes?.south : routes?.north;
  const other = route === routes?.north ? routes?.south : routes?.north;
  const front = (copy % 2 ? other : route)?.direction;
  const routeAngle = front ? Math.atan2(front.y, front.x) : Math.PI;
  const desiredAngle = kind === 'generator' || kind === 'harpoon' ? (copy % 2 ? Math.PI / 2 : -Math.PI / 2) : routeAngle;
  const radius = { cannon: 122, barrier: 122, generator: 56, bell: 93, mortar: 128,
    harpoon: 100, 'light-trap': 162, 'repair-lamp': 62 }[kind];
  // Keep guns just off the dry approach, while blockers/traps sit on it.
  const offset = kind === 'cannon' || kind === 'mortar' ? .24 : 0;
  for (const reach of [radius, radius - 18, radius + 18, radius - 32, radius + 32, 65, 100]) {
    for (const turn of [0, .18, -.18, .36, -.36, .65, -.65, 1, -1, 1.6, -1.6, Math.PI]) {
      const angle = desiredAngle + offset + turn;
      const point = { x: Math.round(Math.cos(angle) * reach), y: Math.round(Math.sin(angle) * reach) };
      if (checkPlacement(config, placements, kind, point.x, point.y).valid) return point;
    }
  }
  return undefined;
}

function prepareField(game: CampaignGameStore, config: NightConfig, desired: readonly DeviceKind[]) {
  const placements: DevicePlacement[] = [];
  const costs = { repair: 0, recharge: 0, instances: 0 };
  for (const kind of desired) {
    const profile = game.current.profile;
    if (!config.availableDevices?.includes(kind)) continue;
    const copy = placements.filter(item => item.kind === kind).length;
    const point = fieldPosition(config, placements, kind, copy);
    if (!point) continue;
    let device = profile.devices.find(item => item.kind === kind && !placements.some(placed => placed.id === item.id));
    if (!device) {
      if (profile.resources < config.devices.definitions[kind].cost) continue;
      game.purchaseDevice(kind, profile.nextDeviceId);
      costs.instances += profile.resources - game.current.profile.resources;
      device = game.current.profile.devices.find(item => item.id === profile.nextDeviceId)!;
    }
    const repair = repairCost(device, profile.purchasedUpgrades);
    const recharge = rechargeCost(device, profile.purchasedUpgrades);
    if (repair + recharge > game.current.profile.resources) continue;
    let balance = game.current.profile.resources;
    if (device.health < DEVICE_RULES.definitions[kind].health) game.repairDevice(device.id);
    costs.repair += balance - game.current.profile.resources;
    balance = game.current.profile.resources;
    if (kind === 'light-trap' && remainingTrapCharges(device) < trapChargeCapacity(profile.purchasedUpgrades)) game.rechargeDevice(device.id);
    costs.recharge += balance - game.current.profile.resources;
    placements.push({ id: device.id, kind, ...point });
  }
  expect(checkDraft(config, placements)).toMatchObject({ valid: true });
  const balance = game.current.profile.resources;
  game.savePlacements(placements, config);
  const profile = game.current.profile;
  const saved = deviceDeployments(profile);
  expect(profile.resources).toBe(balance);
  expect(saved).toEqual(expect.arrayContaining(placements.map(item => expect.objectContaining(item))));
  expect(saved).toHaveLength(placements.length);
  return costs;
}

function attempt(game: CampaignGameStore, night: NightDefinition, label: string, early = false) {
  const config = game.calculateConfig(night.config);
  const before = game.current.profile;
  const snapshot = deviceDeployments(before);
  const id = `${label}-${night.id}`;
  const first = game.firstRewards(night.id, true);
  game.begin({ id, nightId: night.id, seed, placementCost: 0, deviceSnapshot: snapshot, lensId: before.selectedLensId }, config);
  expect(game.current.activeAttempt).toMatchObject({ id, seed, deviceSnapshot: snapshot });
  const state = createBattle(config, seed, undefined, battleDeviceDeployments(before, config.devices.definitions));
  const drive = campaignStoryDriver(config, early);
  let peak = state.enemies.length;
  let lowestHull = state.lighthouseHealth;
  let casts = 0;
  let overlappingTicks = 0;
  let idleBeamTicks = 0;
  let shortestWarning = Infinity;
  let lastEventId = 0;
  const deadline = config.waveInterval * (config.waves.length - 1)
    + Math.max(...config.waves.map(wave => (wave.enemies.length - 1) * wave.spawnInterval)) + 180;
  while (state.outcome === 'playing' && state.elapsed < deadline) {
    stepBattle(state, config, drive(state));
    peak = Math.max(peak, state.enemies.length);
    lowestHull = Math.min(lowestHull, state.lighthouseHealth);
    if (state.waves.filter(wave => wave.started && !wave.completed).length > 1) overlappingTicks++;
    if (!state.litEnemyIds.length && !state.litTentacleIds.length) idleBeamTicks++;
    const warning = state.boss?.campaign?.telegraph;
    if (warning) shortestWarning = Math.min(shortestWarning, (warning.resolveTick - warning.startedTick) * config.stepSeconds);
    if (state.nextEventId - 1 !== lastEventId) {
      for (let index = state.events.length - 1; index >= 0 && state.events[index]!.id > lastEventId; index--) {
        const type = state.events[index]!.type;
        if (type === 'flash-used' || type === 'ability-used') casts++;
      }
      lastEventId = state.nextEventId - 1;
    }
  }
  const metrics = {
    night: night.id, outcome: state.outcome, seconds: +state.elapsed.toFixed(1),
    hull: +state.lighthouseHealth.toFixed(1), minHull: +lowestHull.toFixed(1), maxHull: config.lighthouseHealth,
    peak, kills: state.kills, waves: state.waves.filter(wave => wave.completed).length,
    overlapSeconds: +(overlappingTicks * config.stepSeconds).toFixed(1),
    noLightPercent: +(100 * idleBeamTicks / state.tick).toFixed(1),
    shortestWarning: Number.isFinite(shortestWarning) ? +shortestWarning.toFixed(1) : null,
    casts, earlyWaves: state.waves.filter(wave => wave.startedEarly).length, bonus: state.earnedBonus,
    bossHP: state.boss ? +state.boss.health.toFixed(1) : null,
    lens: config.lens?.id, ability: config.ability?.abilityId ?? (config.flash.enabled ? 'flash' : null),
    field: snapshot.map(device => device.kind).join(','),
  };
  if (state.outcome !== 'victory') console.error(`[campaign ${label}]`, JSON.stringify(metrics));
  if (state.outcome === 'playing') throw new Error(`${id}: exceeded ${deadline}s with ${state.enemies.length} enemies left`);
  const victory = state.outcome === 'victory';
  const reward = state.earnedResources + state.earnedBonus + state.earnedRescue + (victory ? config.victoryReward : 0);
  const devices = normalizedDeviceResults(state.devices, snapshot, config.devices.definitions);
  game.settle(id, state.outcome, reward, state.encountered, devices);
  const after = game.current.profile;
  expect(game.current.activeAttempt).toBeNull();
  expect(after.resources - before.resources).toBe(reward + (victory ? first.firstWinShards : 0));
  expect(after.bossMaterials - before.bossMaterials).toBe(victory ? first.firstWinPearls : 0);
  expect(deviceDeployments(after)).toEqual(devices);
  expect(after.encountered).toEqual([...new Set([...before.encountered, ...state.encountered])]);
  if (victory) expect(metrics.waves).toBe(config.waves.length);
  return { ...metrics, outcome: state.outcome, shards: after.resources - before.resources, pearls: after.bossMaterials - before.bossMaterials,
    balance: after.resources, pearlBalance: after.bossMaterials };
}

describe('live 56-night campaign from an empty save', () => {
  it.each(Object.entries(builds))('%s build', (name, build) => {
    const save = memorySave();
    let game = save.open();
    expect(game.hasProfile).toBe(false);
    game.ensureProfile();
    expect(save.profile()).toMatchObject({ shards: 0, pearls: 0, purchasedNodeIds: [], wonNightIds: [], inventory: [] });
    expect(CAMPAIGN_NIGHT_CATALOG).toHaveLength(56);
    const totals = { repair: 0, recharge: 0, pearls: 0, casts: 0, peak: 0, damagedNights: 0 };
    let chapterRows = [];
    for (const [index, night] of CAMPAIGN_NIGHT_CATALOG.entries()) {
      const story = campaignChapterFor(night.id);
      const chapter = story.chapterIndex + 1;
      game.selectNight(night.id);
      if (story.night.position === 1) game.acknowledgeIntro();
      if (chapter === 5 && story.night.position === 1) {
        const unlocks = game.presentationView(true).purchases.filter(item => item.node.id.startsWith('unlock-')
          || item.node.id.startsWith('lens-unlock-') || item.node.id.endsWith('-unlock'));
        expect(unlocks).toHaveLength(20); // eight devices, seven paid lenses, five abilities
        for (const item of unlocks) expect(item.node.winsBeforePurchase, item.node.id).toBeLessThanOrEqual(index);
      }
      if (index > 0) develop(game, build, chapter);
      const config = game.calculateConfig(night.config);
      const desired = chapter === 1 ? firstChapterField : build.field;
      const costs = prepareField(game, config, desired);
      const preparedSave = [1, 4, 7].includes(chapter) && story.night.bossNight ? save.fork() : null;
      const nodes = save.profile().purchasedNodeIds.length;
      if (index === 0) expect(save.profile()).toMatchObject({ purchasedNodeIds: [], inventory: [], selectedLensId: 'basic', selectedAbilityId: null });
      expect(game.firstRewards(night.id, true)).toEqual(campaignFirstRewards(night.id));
      const result = attempt(game, night, name);
      chapterRows.push({ ...result, ...costs, nodes });
      totals.repair += costs.repair;
      totals.recharge += costs.recharge;
      totals.pearls += result.pearls;
      totals.casts += result.ability === build.ability ? result.casts : 0;
      totals.peak = Math.max(totals.peak, result.peak);
      totals.damagedNights += Number(result.minHull < result.maxHull);
      if (story.night.bossNight || result.outcome !== 'victory') {
        console.log(`[campaign ${name} chapter ${chapter}]`, JSON.stringify(chapterRows));
        chapterRows = [];
      }
      expect(result.outcome, `${name}: ${night.id} ${JSON.stringify(result)}`).toBe('victory');
      expect(result.earlyWaves).toBe(0);
      expect(game.current.profile.wonNightIds).toEqual(CAMPAIGN_NIGHT_CATALOG.slice(0, index + 1).map(entry => entry.id));
      if (!story.night.bossNight) continue;

      // Replay in a fork of the actual winning save. Service uses only that fork's balance.
      const reached = save.profile();
      const replay = save.fork().open();
      const replayCosts = prepareField(replay, config, desired);
      const repeat = attempt(replay, night, `${name}-repeat`);
      console.log(`[campaign ${name} replay]`, JSON.stringify({ ...repeat, ...replayCosts }));
      expect(repeat.outcome, `${name}: replay ${night.id}`).toBe('victory');
      expect(repeat.pearls).toBe(0);
      expect(repeat.shards).toBe(result.shards - campaignFirstRewards(night.id).firstWinShards);
      expect(replay.current.profile.wonNightIds).toEqual(reached.wonNightIds);
      if (preparedSave) {
        const comparison = attempt(preparedSave.open(), night, `${name}-early`, true);
        console.log(`[campaign ${name} early chapter ${chapter}]`, JSON.stringify({ ...comparison, ...costs }));
        expect(comparison.earlyWaves, `${name}: early ${night.id}`).toBeGreaterThan(0);
        if (comparison.outcome === 'victory') {
          expect(comparison.shards - result.shards).toBe(comparison.bonus);
          expect(comparison.pearls).toBe(result.pearls);
        }
      }
      expect(save.profile()).toEqual(reached);
      const previous = game.current;
      game = save.open();
      expect(game.current).toEqual(previous);
    }
    const final = save.profile();
    expect(final.completedNights).toBe(56);
    expect(final.purchasedNodeIds.length).toBeLessThanOrEqual(purchaseLimit);
    expect(final.selectedLensId).toBe(build.lens);
    expect(totals.casts).toBeGreaterThan(0);
    console.log(`[campaign ${name} total]`, JSON.stringify({ ...totals, nodes: final.purchasedNodeIds.length,
      shardBalance: final.shards, pearlBalance: final.pearls }));
  }, 90_000);
});
