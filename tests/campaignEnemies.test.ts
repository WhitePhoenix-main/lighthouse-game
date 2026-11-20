import { describe, expect, it, vi } from 'vitest';
import type { DevicePlacement, EnemyKind, EnemyState, NightConfig } from '../src/contracts';
import { CAMPAIGN_ENEMIES, CAMPAIGN_ENEMY_KINDS_BY_CHAPTER } from '../src/content/campaignEnemies';
import { CAMPAIGN_GENERAL_DRAFT, type CampaignGeneralDraftId } from '../src/content/campaignGeneralDraft';
import { CAMPAIGN_TERRAIN } from '../src/content/campaignTerrain';
import { NIGHT_CONFIG } from '../src/content/night';
import { isLandCircle, isLandPath } from '../src/content/terrain';
import { createBattle, stepBattle } from '../src/simulation/battle';
import {
  activeCampaignCast, campaignBeamDamageMultiplier, campaignDeviceRooted, campaignDeviceTarget,
  campaignEnemyDefeated, campaignMovementMultiplier, resolveCampaignEnemyCasts, updateCampaignEnemies,
} from '../src/simulation/campaignEnemies';
import { fireDirectWeapon, moveEnemies } from '../src/simulation/devices';

function encounter(kind: EnemyKind, devices: DevicePlacement[] = [], perk?: CampaignGeneralDraftId) {
  const config = structuredClone(NIGHT_CONFIG);
  config.waves = [{ id: 'encounter', enemies: [kind], spawnInterval: 20 }];
  if (perk) {
    const node = CAMPAIGN_GENERAL_DRAFT.find(candidate => candidate.id === perk)!;
    config.campaignGeneral = { [node.family]: node.effect };
  }
  const state = createBattle(config, 7, undefined, devices);
  const enemy = state.enemies[0]!;
  Object.assign(enemy, { x: -250, y: 0 });
  return { state, config, enemy };
}

function ally(config: NightConfig, kind: EnemyKind, id: number, x: number, y: number): EnemyState {
  const { health, armor } = config.enemies[kind];
  return { kind, id, x, y, health, armor, attackCooldown: 0, waveIndex: 0 };
}

describe('campaign enemy catalog and movement', () => {
  it('publishes stable chapter rosters and bilingual entries', () => {
    const chapters = Object.values(CAMPAIGN_ENEMY_KINDS_BY_CHAPTER);
    expect(chapters.map(kinds => kinds.length)).toEqual([3, 3, 3, 3, 2]);
    const kinds = chapters.flat();
    expect(Object.keys(CAMPAIGN_ENEMIES)).toEqual(kinds);
    for (const kind of kinds) {
      expect(CAMPAIGN_ENEMIES[kind]).toMatchObject({ id: kind, nameEn: expect.any(String), descriptionEn: expect.any(String) });
      expect(NIGHT_CONFIG.enemies[kind]).toEqual(CAMPAIGN_ENEMIES[kind]);
    }
  });

  it('pursues a reachable device instead of a closer device across water', () => {
    const { state, config, enemy } = encounter('boarder', [
      { id: 1, kind: 'cannon', x: 65, y: 0 }, { id: 2, kind: 'cannon', x: -150, y: 0 },
    ]);
    const rectangle = (left: number, right: number) => [
      { x: left, y: -60 }, { x: right, y: -60 }, { x: right, y: 60 }, { x: left, y: 60 },
    ];
    config.terrain = { shoreX: 0, landOnlyPlacement: true, landRegions: [rectangle(-200, 20), rectangle(45, 110)] };
    enemy.x = 0;
    expect(campaignDeviceTarget(state, config, enemy)?.id).toBe(2);
    state.devices[1]!.health = 0;
    expect(campaignDeviceTarget(state, config, enemy)).toBeUndefined();
  });

  it.each(['north', 'south'] as const)('reaches siege range on the dry %s approach and stops to telegraph', front => {
    const config = structuredClone(NIGHT_CONFIG);
    config.campaignMapId = 'ashen-plateau';
    config.terrain = CAMPAIGN_TERRAIN['ashen-plateau'];
    config.waves = [{ id: 'siege', enemies: ['siege-beast'], fronts: [front], spawnInterval: 20 }];
    const state = createBattle(config, 21);
    const enemy = state.enemies[0]!;
    const { radius, speed, campaign } = CAMPAIGN_ENEMIES['siege-beast'];
    for (; state.tick < 350 && !activeCampaignCast(enemy); state.tick++) {
      const previous = { x: enemy.x, y: enemy.y };
      updateCampaignEnemies(state, config);
      moveEnemies(state, config);
      expect(isLandPath(config.terrain, previous, enemy, radius)).toBe(true);
    }
    const cast = activeCampaignCast(enemy)!;
    const distance = Math.hypot(enemy.x, enemy.y);
    expect(distance).toBeLessThanOrEqual(campaign.range + 1e-9);
    expect(distance).toBeGreaterThanOrEqual(campaign.range - speed * config.stepSeconds - 1e-9);
    expect(cast.kind).toBe('siege');
    const position = [enemy.x, enemy.y];
    moveEnemies(state, config);
    expect([enemy.x, enemy.y]).toEqual(position);
  });
});

describe('campaign preparations', () => {
  it('allows recognition, a half turn and beam damage, with a finite authored floor for zero DPS', () => {
    const run = (dps: number) => {
      const fixture = encounter('siege-beast');
      const { state, config, enemy } = fixture;
      config.beam.damagePerSecond = dps;
      enemy.x = -266;
      updateCampaignEnemies(state, config);
      expect(activeCampaignCast(enemy)).toBeUndefined();
      enemy.x = -265;
      updateCampaignEnemies(state, config);
      const cast = activeCampaignCast(enemy)!;
      expect(state.events.at(-1)).toMatchObject({ type: 'campaign-cast-started', cast });
      return (cast.impactTick - cast.startedTick) * config.stepSeconds;
    };
    const slow = run(15);
    expect(slow).toBeGreaterThanOrEqual(.8 + 2 + (92 + 28) / 15);
    expect(run(90)).toBeCloseTo(CAMPAIGN_ENEMIES['siege-beast'].campaign.windup);
    expect(run(0)).toBeCloseTo(run(90));
  });

  it('resolves siege against the shield at the deadline and cancels on a last-step kill', () => {
    const placement = [{ id: 1, kind: 'generator', x: -80, y: 0 }] satisfies DevicePlacement[];
    const { state, config, enemy } = encounter('siege-beast', placement);
    const capacity = state.shield.current;
    updateCampaignEnemies(state, config);
    state.tick = activeCampaignCast(enemy)!.impactTick - 1;
    resolveCampaignEnemyCasts(state, config);
    expect(state.shield.current).toBe(capacity);
    state.tick++;
    resolveCampaignEnemyCasts(state, config);
    expect(state.shield.current).toBe(capacity - config.enemies['siege-beast'].attackDamage);
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth);

    const second = encounter('siege-beast');
    updateCampaignEnemies(second.state, second.config);
    second.state.tick = activeCampaignCast(second.enemy)!.impactTick;
    second.enemy.health = 0;
    resolveCampaignEnemyCasts(second.state, second.config);
    expect(second.state.lighthouseHealth).toBe(second.config.lighthouseHealth);
    expect(second.state.events.at(-1)?.type).toBe('campaign-cast-cancelled');
  });

  it('heals living allies up to full hull without restoring armor', () => {
    const { state, config, enemy } = encounter('witch');
    const wounded = { ...ally(config, 'shieldbearer', 2, -241, 25), health: 40, armor: 9 };
    const distant = { ...ally(config, 'shieldbearer', 3, -100, 0), health: 10 };
    const dead = { ...ally(config, 'scavenger', 4, -241, -25), health: 0 };
    state.enemies.push(wounded, distant, dead);
    updateCampaignEnemies(state, config);
    expect(wounded.health).toBe(40);
    state.tick = activeCampaignCast(enemy)!.impactTick;
    resolveCampaignEnemyCasts(state, config);
    expect(wounded).toMatchObject({ health: config.enemies.shieldbearer.health, armor: 9 });
    expect(distant.health).toBe(10);
    expect(dead.health).toBe(0);
  });

  it('binds an exposed weapon until the source is interrupted without extending timed suppression', () => {
    const { state, config, enemy } = encounter('rootweaver', [{ id: 1, kind: 'mortar', x: -180, y: 0 }], 'engineering-backup-control');
    updateCampaignEnemies(state, config);
    state.tick = activeCampaignCast(enemy)!.impactTick;
    expect(campaignDeviceRooted(state, 1)).toBe(false);
    resolveCampaignEnemyCasts(state, config);
    expect(campaignDeviceRooted(state, 1)).toBe(true);
    expect(campaignMovementMultiplier(state, config, enemy)).toBe(0);
    expect(state.devices[0]!.suppressedUntilTick).toBeUndefined();
    enemy.stunnedUntilTick = state.tick + 1;
    expect(campaignDeviceRooted(state, 1)).toBe(false);
    updateCampaignEnemies(state, config);
    state.tick++;
    expect(campaignDeviceRooted(state, 1)).toBe(false);
  });

  it('factors the stage C area protection into real bomber damage on multiple devices', () => {
    const run = (perk?: CampaignGeneralDraftId) => {
      const { state, config, enemy } = encounter('bomber', [
        { id: 1, kind: 'cannon', x: -189, y: 0 }, { id: 2, kind: 'mortar', x: -178, y: 47 },
        { id: 3, kind: 'harpoon', x: -60, y: 0 },
      ], perk);
      state.beamAngle = state.desiredBeamAngle = 0;
      for (const device of state.devices) device.attackCooldown = 30;
      stepBattle(state, config, []);
      const cast = activeCampaignCast(enemy)!;
      expect(cast.target).toMatchObject({ x: -189, y: 0, radius: 63, deviceId: 1 });
      expect(state.events.at(-1)).toMatchObject({ type: 'campaign-cast-started', cast });
      const before = state.devices.map(device => device.health);
      while (state.tick <= cast.impactTick) stepBattle(state, config, []);
      return state.devices.map((device, index) => before[index]! - device.health);
    };
    expect(run()).toEqual([17, 17, 0]);
    expect(run('engineering-bombardment')).toEqual([12.75, 12.75, 0]);
  });

  it('applies a shorter real Snuffer suppression with backup control', () => {
    const run = (perk?: CampaignGeneralDraftId) => {
      const { state, config, enemy } = encounter('snuffer', [{ id: 1, kind: 'cannon', x: -185, y: 0 }], perk);
      state.beamAngle = state.desiredBeamAngle = 0;
      const cannon = state.devices[0]!;
      cannon.attackCooldown = 30;
      stepBattle(state, config, []);
      const cast = activeCampaignCast(enemy)!;
      expect(cast.target.deviceId).toBe(1);
      expect(cannon.suppressedUntilTick).toBeUndefined();
      while (state.tick <= cast.impactTick) stepBattle(state, config, []);
      expect(fireDirectWeapon(state, config, cannon, enemy.id, true)).toBe(false);
      return cannon.suppressedUntilTick! - cast.impactTick;
    };
    expect(run()).toBe(120);
    expect(run('engineering-backup-control')).toBe(84);
  });

  it('gives nearby allies a non-stacking movement boost from living sirens', () => {
    const { state, config, enemy } = encounter('siren');
    const nearby = ally(config, 'boarder', 2, -222, 25);
    const remote = ally(config, 'boarder', 3, -125, 0);
    const otherSiren = ally(config, 'siren', 4, -243, 0);
    state.enemies.push(nearby, remote, otherSiren);
    updateCampaignEnemies(state, config);
    expect(campaignMovementMultiplier(state, config, nearby)).toBe(1);
    state.tick = activeCampaignCast(enemy)!.impactTick;
    resolveCampaignEnemyCasts(state, config);
    expect(campaignMovementMultiplier(state, config, nearby)).toBe(1.35);
    expect(campaignMovementMultiplier(state, config, remote)).toBe(1);
    enemy.health = otherSiren.health = 0;
    expect(campaignMovementMultiplier(state, config, nearby)).toBe(1);
  });

  it('raises a temporary mirror guard only after its telegraph', () => {
    const { state, config, enemy } = encounter('mirror-knight');
    updateCampaignEnemies(state, config);
    expect(activeCampaignCast(enemy)?.kind).toBe('mirror');
    expect(campaignBeamDamageMultiplier(enemy)).toBe(1);
    state.tick = activeCampaignCast(enemy)!.impactTick;
    resolveCampaignEnemyCasts(state, config);
    expect(campaignBeamDamageMultiplier(enemy)).toBe(.45);
    state.tick = enemy.campaign!.mirror!.untilTick;
    updateCampaignEnemies(state, config);
    expect(campaignBeamDamageMultiplier(enemy)).toBe(1);
  });

  it.each([['golem', 'scavenger'], ['brood', 'ghost']] as const)('splits %s into two %s once without granting payouts', (kind, child) => {
    const { state, config, enemy } = encounter(kind);
    config.terrain = { shoreX: 0, landOnlyPlacement: true };
    Object.assign(enemy, { x: -26, y: -50, health: 0 });
    const summon = vi.fn<(kind: EnemyKind, x: number, y: number) => void>();
    campaignEnemyDefeated(state, config, enemy, summon);
    campaignEnemyDefeated(state, config, enemy, summon);
    expect(summon).toHaveBeenCalledTimes(2);
    for (const [id, x, y] of summon.mock.calls) {
      expect(id).toBe(child);
      if (config.enemies[id].movement === 'ground') expect(isLandCircle(config.terrain, { x, y }, config.enemies[id].radius)).toBe(true);
    }
    expect(state.events.at(-1)).toMatchObject({ type: 'campaign-enemy-split', childKind: child });
    expect(state.earnedResources).toBe(0);
    expect(state.waves[0]!.defeated).toBe(0);
  });

  it('keeps the wave open for the fragments and credits the parent reward once', () => {
    const { state, config, enemy } = encounter('golem');
    enemy.health = 0;
    stepBattle(state, config, []);
    expect(state.outcome).toBe('playing');
    expect(state.waves[0]!.completed).toBe(false);
    expect(state.enemies.map(child => child.kind)).toEqual(['scavenger', 'scavenger']);
    expect(new Set(state.enemies.map(child => child.id)).size).toBe(2);
    for (const child of state.enemies) child.health = 0;
    stepBattle(state, config, []);
    expect(state.waves[0]!.completed).toBe(true);
    expect(state.outcome).toBe('victory');
    expect(state.earnedResources).toBe(config.enemies.golem.reward);
  });
});
