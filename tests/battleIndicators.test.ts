import { describe, expect, it } from 'vitest';
import { battleBarStyle, clampBarFraction, enemyBarDensity, enemyBarRequest } from '../src/presentation/battle/battleIndicators';
import { layoutIndicators, overlaps } from '../src/presentation/battle/indicatorLayout';
import { battleEnemyBounds } from '../src/presentation/battle/battleArtwork';
import { enemiesInDrawOrder, frontEnemyAt } from '../src/presentation/battle/enemyDepth';
import { tentacleStatus } from '../src/presentation/battle/nightPresentation';
import { translate } from '../src/presentation/shared/localization';
import { createWorldCamera } from '../src/presentation/shared/world/worldGeometry';
import { emptyCampaignProfile } from '../src/application/campaignProfileCodec';
import { CAMPAIGN_NIGHT_CATALOG } from '../src/content/campaignRuntime';
import { calculateCampaignLoadout } from '../src/progression/campaignProgression';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectBeamTargets } from '../src/simulation/beam';
import { beamLightGeometry, lighthouseLantern } from '../src/presentation/battle/battleBeam';

describe('readable battle health at phone zoom', () => {
  it('keeps health and armor readable even when the body is only 12 pixels wide', () => {
    const style = battleBarStyle(true, false, 12);
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.fillHeight).toBeGreaterThanOrEqual(6);
    expect(style.height).toBe(style.padding * 2 + style.fillHeight * 2 + style.gap);
    expect(battleBarStyle(true, true, 12).fillHeight).toBeGreaterThan(style.fillHeight);
  });
  it('sets compact phone bars from the visible silhouette and emphasizes the active target', () => {
    const passive = enemyBarDensity(720, false), priority = enemyBarDensity(720, true);
    expect(battleBarStyle(true, false, 12, false, passive)).toEqual({ width: 24, fillHeight: 3, gap: 2, padding: 1, height: 10 });
    expect(battleBarStyle(false, false, 43, false, passive).width).toBe(34);
    expect(battleBarStyle(false, false, 27, false, priority)).toMatchObject({ width: 32, fillHeight: 4 });
    expect(battleBarStyle(false, true, 27, false, passive)).toMatchObject({ width: 54, fillHeight: 8 });
    expect(enemyBarDensity(1280, false)).toBe('standard');
  });
  it('keeps enlarged mixed bars separate and inside a 390px phone field', () => {
    const bodies = Array.from({ length: 8 }, (_, index) => ({ x: 170 + index % 2 * 6, y: 280 + index * 2, width: 24, height: 34 }));
    const requests = bodies.map((body, id) => enemyBarRequest(id, body, battleBarStyle(id % 2 === 0, true, body.width)));
    const placed = layoutIndicators(requests, { width: 390, height: 600 }, bodies);
    for (const bar of placed) {
      expect(bar.width).toBe(requests.find(source => source.id === bar.id)!.width);
      expect(bar.x).toBeGreaterThanOrEqual(3);
      expect(bar.x + bar.width).toBeLessThanOrEqual(387);
      expect(bar.y).toBeGreaterThanOrEqual(3);
      expect(placed.filter(other => other.id !== bar.id).some(other => overlaps(bar, other))).toBe(false);
    }
  });
  it('does not draw depleted armor as health or overflow the backing strip', () => {
    expect(clampBarFraction(0, 100)).toBe(0);
    expect(clampBarFraction(-10, 100)).toBe(0);
    expect(clampBarFraction(110, 100)).toBe(1);
    expect(clampBarFraction(40, 0)).toBe(0);
    expect(clampBarFraction(45, 100)).toBe(.45);
  });
});

describe('battle target readability', () => {
  it('runs lantern light through the lit silhouette in both view orientations', () => {
    const config = CAMPAIGN_NIGHT_CATALOG[0]!.config;
    for (const [width, height] of [[1280, 720], [360, 640]] as const) {
      const camera = createWorldCamera(config, width, height, { mode: 'battle' });
      const origin = lighthouseLantern(camera);
      const contact = { x: origin.x - 106 * camera.zoom, y: origin.y + 38 * camera.zoom };
      const light = beamLightGeometry(camera, config.beam, Math.PI, origin, contact);
      const progress = (contact.x - origin.x) / (light.end.x - origin.x);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
      expect(origin.y + progress * (light.end.y - origin.y)).toBeCloseTo(contact.y);
    }
  });

  it('selects the enemy drawn in front when later spawns overlap its sprite on a phone', () => {
    const night = CAMPAIGN_NIGHT_CATALOG.find(night => night.id === 'misty-shore-04')!;
    const config = calculateCampaignLoadout(night.config, emptyCampaignProfile());
    const battle = createBattle(config, 42);
    for (let tick = 0; tick < 681; tick++) {
      stepBattle(battle, config, tick === 10 || tick === 20 ? [{ type: 'callWave' }] : []);
    }
    const camera = createWorldCamera(config, 390, 540, { mode: 'battle' });
    const bounds = (enemy: (typeof battle.enemies)[number]) => battleEnemyBounds(enemy, config, camera);
    const overlapping = battle.enemies.filter(enemy => enemy.id === 12 || enemy.id === 20);
    expect(overlapping.map(enemy => enemy.id)).toEqual([12, 20]);
    expect(enemiesInDrawOrder(overlapping).map(enemy => enemy.id)).toEqual([20, 12]);
    const [front, back] = overlapping.map(bounds);
    const left = Math.max(front!.x, back!.x), right = Math.min(front!.x + front!.width, back!.x + back!.width);
    const top = Math.max(front!.y, back!.y), bottom = Math.min(front!.y + front!.height, back!.y + back!.height);
    expect(right).toBeGreaterThan(left);
    expect(bottom).toBeGreaterThan(top);
    const x = (left + right) / 2, y = (top + bottom) / 2;
    expect(frontEnemyAt(battle.enemies, x, y, bounds)?.id).toBe(12);
    expect(frontEnemyAt(overlapping.filter(enemy => enemy.id === 20), x, y, bounds)?.id).toBe(20);
  });

  it('shows that a boss part is blocked while it is preparing an attack, in both languages', () => {
    const config = CAMPAIGN_NIGHT_CATALOG.find(night => night.id === 'ash-colossus')!.config;
    const battle = createBattle(config, 42);
    const core = battle.boss!.tentacles[0]!;
    battle.enemies = [{ id: 1, kind: 'turtle', x: -130, y: 0, health: 100, armor: 100, waveIndex: 0, attackCooldown: 0 }];
    const selection = selectBeamTargets(battle.enemies, config, Math.PI, null, battle.boss);
    battle.blockedTentacleIds = selection.blockedTentacles ?? [];
    expect(battle.blockedTentacleIds).toContain(core.id);
    expect(tentacleStatus(core, battle, config)).toBe('Сердце · ПЕРЕКРЫТО');
    battle.boss!.campaign!.telegraph = { kind: 'strike', sourceZoneId: core.id, x: 0, y: 0, radius: 0,
      startedTick: 0, resolveTick: 180 };
    expect(tentacleStatus(core, battle, config)).toBe('Сердце · ПЕРЕКРЫТО · УДАР ПО МАЯКУ · 6.0 с');
    expect(translate(tentacleStatus(core, battle, config, 'en'), 'en')).toBe('Core · BLOCKED · LIGHTHOUSE STRIKE · 6.0 s');
  });
});
