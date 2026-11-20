import { describe, expect, it, vi } from 'vitest';
import type { DevicePlacement, NightConfig } from '../src/contracts';
import { getBossRules } from '../src/content/boss';
import { getCampaignBoss } from '../src/content/campaignBosses';
import { CAMPAIGN_CHAPTER_DRAFT } from '../src/content/campaignFoundationDraft';
import { CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { NIGHT_CONFIG } from '../src/content/night';
import { selectBeamTargets } from '../src/simulation/beam';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { damageBoss, moveTentacles } from '../src/simulation/boss';
import { tickCampaignBoss } from '../src/simulation/campaignBoss';

function setup(chapter: number, devices: DevicePlacement[] = []) {
  const bossRules = getCampaignBoss(chapter)!;
  const config: NightConfig = { ...NIGHT_CONFIG, boss: bossRules };
  const state = createBattle(config, 17, undefined, devices);
  const boss = state.boss!;
  const campaign = boss.campaign!;
  const summon = vi.fn();
  const tick = (at: number) => {
    state.tick = at;
    tickCampaignBoss(state, config, summon);
  };
  const part = (id: string) => campaign.parts.find(item => item.id === id)!;
  const zone = (id: string) => boss.tentacles.find(item => item.id === part(id).zoneId)!;
  return { config, state, bossRules, boss, campaign, summon, tick, part, zone };
}

describe('campaign boss simulation', () => {
  it.each(CAMPAIGN_CHAPTER_DRAFT.map((chapter, i) => [i + 1, chapter.bossId] as const))(
    'loads chapter %i boss %s with zones and actions reachable by the base beam', (chapter, id) => {
      const { boss, bossRules, campaign, config } = setup(chapter);
      expect(boss.id).toBe(id);
      expect(campaign.phase).toBe(1);
      expect(boss.tentacles).toHaveLength(bossRules.tentacleCount);
      expect(campaign.parts.filter(part => part.health === null)).toHaveLength(1);
      const sources = new Set(bossRules.campaign.phases.flatMap(phase => phase.actions.map(action => action.source)));
      for (const source of sources) {
        const part = campaign.parts.find(item => item.id === source)!;
        const zone = boss.tentacles.find(item => item.id === part.zoneId)!;
        expect(Math.hypot(zone.x, zone.y)).toBeLessThanOrEqual(config.beam.range);
        expect(selectBeamTargets([], config, Math.atan2(zone.y, zone.x), null, boss).litTentacles).toContain(zone.id);
      }
    },
  );

  it('removes a destroyed Colossus zone before later weapons while the old traversal keeps its remaining zones', () => {
    const { state, boss, campaign, tick, part, zone } = setup(4);
    tick(campaign.readyTick);
    const hammer = zone('hammer'), furnace = zone('furnace');
    expect(campaign.telegraph).toMatchObject({ kind: 'strike', sourceZoneId: hammer.id });
    const due = campaign.telegraph!.resolveTick;
    const previousZones = boss.tentacles;
    state.litTentacleIds = [hammer.id, furnace.id];
    state.blockedTentacleIds = [hammer.id];
    const healthBefore = boss.health;
    for (const visited of previousZones) {
      if (visited.id === hammer.id) damageBoss(state, part('hammer').health!, visited);
      if (visited.id === furnace.id) damageBoss(state, 25, visited);
    }
    expect(boss.tentacles).not.toBe(previousZones);
    expect(previousZones).toHaveLength(3);
    expect(boss.tentacles.map(item => item.id)).toEqual([zone('core').id, furnace.id]);
    expect(part('hammer').health).toBe(0);
    expect(part('furnace').health).toBe(part('furnace').maxHealth! - 25);
    expect(boss.health).toBe(healthBefore - part('hammer').maxHealth! - 25);
    expect(state.litTentacleIds).toEqual([furnace.id]);
    expect(state.blockedTentacleIds).toEqual([]);
    expect(campaign.telegraph).toBeUndefined();
    expect(hammer.telegraphedPreparationUntilTick).toBeUndefined();
    damageBoss(state, 100, hammer);
    expect(boss.health).toBe(healthBefore - part('hammer').maxHealth! - 25);

    damageBoss(state, 300, zone('core'));
    tick(due);
    expect(campaign.phase).toBe(2);
    tick(campaign.readyTick);
    expect(campaign.telegraph?.sourceZoneId).toBe(furnace.id);
    tick(campaign.telegraph!.resolveTick);
    tick(campaign.readyTick);
    expect(campaign.telegraph).toBeUndefined();
    tick(campaign.readyTick);
    expect(campaign.telegraph?.sourceZoneId).toBe(zone('core').id);
  });

  it('delays the Colossus impact by fixed stun ticks and applies it once through the active field', () => {
    const { state, config, boss, campaign, tick } = setup(4, [{ id: 1, kind: 'generator', x: 0, y: -50 }]);
    tick(campaign.readyTick - 1);
    expect(campaign.telegraph).toBeUndefined();
    tick(campaign.readyTick);
    const warning = campaign.telegraph!;
    const initialDeadline = warning.resolveTick;
    expect(boss.tentacles.find(zone => zone.id === warning.sourceZoneId)?.telegraphedPreparationUntilTick).toBe(initialDeadline + 1);
    const capacity = state.shield.current;
    boss.stunnedUntilTick = initialDeadline + 2;
    tick(initialDeadline - 1);
    tick(initialDeadline);
    tick(initialDeadline + 1);
    expect(state.shield.current).toBe(capacity);
    expect(warning.resolveTick).toBe(initialDeadline + 3);
    tick(warning.resolveTick);
    expect(state.shield.current).toBe(capacity - 31);
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth);
    tick(warning.resolveTick + 1);
    expect(state.shield.current).toBe(capacity - 31);
  });

  it('retargets the cannon in the same battle step in which the beam breaks its manual target', () => {
    const { state, config, part, zone } = setup(4, [{ id: 1, kind: 'cannon', x: -180, y: 76 }]);
    const hammer = zone('hammer'), furnace = zone('furnace'), cannon = state.devices[0]!;
    state.enemies = [];
    state.beamAngle = state.desiredBeamAngle = Math.atan2(hammer.y, hammer.x);
    cannon.targetId = hammer.id;
    part('hammer').health = .5;
    stepBattle(state, config, []);
    expect(part('hammer').health).toBe(0);
    expect(cannon.targetId).toBeNull();
    expect(cannon.lastShot).toMatchObject({ x: furnace.x, y: furnace.y });
    expect(part('furnace').health).toBeLessThan(part('furnace').maxHealth!);
  });

  it('skips crossed Fog Heart phases, discards their warnings and stops all pending work on death', () => {
    const { boss, state, tick, campaign, summon, zone } = setup(7);
    tick(campaign.readyTick);
    const summonDeadline = campaign.telegraph!.resolveTick;
    expect(campaign.telegraph?.kind).toBe('summon');
    damageBoss(state, boss.health * .72, zone('core'));
    tick(summonDeadline);
    expect(campaign.phase).toBe(3);
    expect(campaign.telegraph).toBeUndefined();
    expect(zone('rift').telegraphedPreparationUntilTick).toBeUndefined();
    expect(summon).not.toHaveBeenCalled();
    tick(campaign.readyTick);
    const strikeDeadline = campaign.telegraph!.resolveTick;
    expect(campaign.telegraph?.kind).toBe('strike');
    damageBoss(state, boss.health, zone('core'));
    expect(boss.tentacles).toEqual([]);
    expect(campaign.telegraph).toBeUndefined();
    tick(strikeDeadline);
    expect(state.lighthouseHealth).toBe(NIGHT_CONFIG.lighthouseHealth);
    expect(summon).not.toHaveBeenCalled();
  });

  it('emits only the announced Captain groups and exhausts the phase schedule', () => {
    const { campaign, tick, summon } = setup(2);
    tick(campaign.readyTick);
    const firstWarning = campaign.telegraph!;
    tick(firstWarning.resolveTick - 1);
    expect(summon).not.toHaveBeenCalled();
    tick(firstWarning.resolveTick);
    expect(summon.mock.calls).toEqual([['shieldbearer', -235, 174], ['scavenger', -271, 140]]);
    tick(campaign.readyTick);
    const secondWarning = campaign.telegraph!;
    tick(secondWarning.resolveTick);
    for (let offset = 1; offset <= 1000; offset++) tick(secondWarning.resolveTick + offset);
    expect(summon.mock.calls).toEqual([['shieldbearer', -235, 174], ['scavenger', -271, 140], ['ray', 247, -114]]);
    expect(campaign.telegraph).toBeUndefined();
  });

  it('keeps the Captain summons and ordinary waves independent through the battle entry point', () => {
    const night = CAMPAIGN_NIGHT_CATALOG.find(night => night.id === 'drowned-captain')!;
    const config = { ...night.config, beam: { ...night.config.beam, damagePerSecond: 0 } };
    const state = createBattle(config, 27), replay = createBattle(config, 27);
    const boss = state.boss!;
    while (!state.enemies.some(enemy => enemy.waveIndex === -1) && state.tick < 600) {
      stepBattle(state, config, []);
      stepBattle(replay, config, []);
    }
    expect(replay).toEqual(state);
    const group = state.enemies.filter(enemy => enemy.waveIndex === -1);
    expect(group.map(enemy => enemy.kind)).toEqual(['shieldbearer', 'scavenger']);
    expect(state.enemies.some(enemy => enemy.waveIndex === 0)).toBe(true);
    const wavesBefore = structuredClone(state.waves);
    damageBoss(state, boss.health, boss.tentacles[0]!);
    expect(state.waves).toEqual(wavesBefore);
    stepBattle(state, config, []);
    expect(state.outcome).toBe('playing');
    // Eliminate the ordinary schedule first to isolate the summoned enemies' outcome gate.
    state.enemies = group;
    for (const wave of state.waves) wave.completed = true;
    state.nextWaveAt = Infinity;
    stepBattle(state, config, []);
    expect(state.outcome).toBe('playing');
    const resources = state.earnedResources;
    for (const enemy of group) enemy.health = 0;
    stepBattle(state, config, []);
    expect(state.outcome).toBe('victory');
    expect(state.earnedResources).toBe(resources);
  });

  it('locks a Marsh Heart root to its advertised weapon and can be interrupted at the deadline', () => {
    const { state, campaign, tick, zone, part } = setup(3, [
      { id: 2, kind: 'cannon', x: -110, y: 125 }, { id: 1, kind: 'mortar', x: -110, y: -125 },
    ]);
    tick(campaign.readyTick);
    const first = campaign.telegraph!;
    expect(first).toMatchObject({ kind: 'root', targetDeviceId: 1, x: -110, y: -125 });
    state.tick = first.resolveTick;
    damageBoss(state, part('north-root').health!, zone('north-root'));
    tick(first.resolveTick);
    expect(state.devices.every(device => device.suppressedUntilTick === undefined)).toBe(true);
    tick(campaign.readyTick);
    const second = campaign.telegraph!;
    expect(second.targetDeviceId).toBe(2);
    tick(second.resolveTick);
    expect(state.devices[0]!.suppressedUntilTick).toBe(second.resolveTick + 5 / NIGHT_CONFIG.stepSeconds);
    expect(state.devices[1]!.suppressedUntilTick).toBeUndefined();
  });

  it('uses a ship salvo as one shield impact, protecting devices from that same breaking shot', () => {
    const { state, campaign, tick } = setup(5, [
      { id: 1, kind: 'generator', x: 0, y: 50 }, { id: 2, kind: 'cannon', x: -25, y: -48 },
    ]);
    state.shield.current = 1;
    tick(campaign.readyTick);
    const warning = campaign.telegraph!;
    expect(warning).toMatchObject({ kind: 'salvo', x: 0, y: 0 });
    const health = state.devices.map(device => device.health);
    tick(warning.resolveTick);
    expect(state.shield.current).toBe(0);
    expect(state.lighthouseHealth).toBe(NIGHT_CONFIG.lighthouseHealth);
    expect(state.devices.map(device => device.health)).toEqual(health);
    expect(state.events.filter(event => event.type === 'shield-hit')).toHaveLength(1);
  });

  it('switches Keeper stance by phase and applies it only to the core', () => {
    const { state, boss, campaign, bossRules, tick, zone } = setup(6);
    expect(campaign.stance).toBe('guarded');
    damageBoss(state, 100, zone('core'));
    damageBoss(state, 100, zone('north-blade'));
    expect(boss.health).toBe(bossRules.health - 165);
    damageBoss(state, 440, zone('core'));
    tick(1);
    expect(campaign.phase).toBe(2);
    expect(campaign.stance).toBe('exposed');
    const before = boss.health;
    damageBoss(state, 100, zone('core'));
    expect(boss.health).toBeCloseTo(before - 115);
    tick(campaign.readyTick);
    expect(campaign.telegraph?.sourceZoneId).toBe(zone('south-blade').id);
  });

  it('keeps the Warden tentacles mobile and preserves prototype shared health without campaign zones', () => {
    const { config, state, zone } = setup(1);
    const first = zone('north-tentacle');
    const before = Math.hypot(first.x, first.y);
    moveTentacles(state, config, []);
    expect(Math.hypot(first.x, first.y)).toBeLessThan(before);

    const prototype = createBattle({ ...NIGHT_CONFIG, boss: getBossRules(1) }, 17);
    const boss = prototype.boss!;
    const originalZones = boss.tentacles;
    damageBoss(prototype, 80, originalZones[0]!);
    expect(boss.health).toBe(340);
    expect(boss.campaign).toBeUndefined();
    expect(boss.tentacles).toBe(originalZones);
    expect(boss.tentacles).toHaveLength(3);
    expect(getCampaignBoss(0)).toBeUndefined();
    expect(getCampaignBoss(8)).toBeUndefined();
  });

  it('stops the Warden strike with light on its source at the moment of impact', () => {
    const { config, state, campaign, tick } = setup(1);
    tick(campaign.readyTick);
    const warning = campaign.telegraph!;
    expect(warning.kind).toBe('strike');
    state.litTentacleIds = [warning.sourceZoneId];
    tick(warning.resolveTick);
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth);
    expect(campaign.telegraph).toBeUndefined();
    expect(campaign.actionIndex).toBe(1);
  });

  it('keeps the Warden contact threat active between announced strikes', () => {
    const { config, state, zone } = setup(1);
    const tentacle = zone('north-tentacle');
    tentacle.x = config.lighthouseRadius + config.boss!.radius;
    tentacle.y = 0;
    state.beamAngle = state.desiredBeamAngle = Math.PI;
    stepBattle(state, config, []);
    expect(state.boss?.campaign?.telegraph).toBeUndefined();
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth - config.boss!.attackDamage);
    stepBattle(state, config, []);
    expect(state.lighthouseHealth).toBe(config.lighthouseHealth - config.boss!.attackDamage);
  });
});
