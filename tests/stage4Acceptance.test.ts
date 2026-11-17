import { describe, expect, it } from 'vitest';
import { NIGHT_CATALOG } from '../src/content/nights';
import { UPGRADES } from '../src/content/upgrades';
import { calculateNightConfig } from '../src/progression/upgrades';
import { createBattle, stepBattle } from '../src/simulation/battle';
import { selectBeamTargets } from '../src/simulation/beam';
import { checkDraft } from '../src/application/placement';
import type { BattleCommand, BattleState, NightConfig } from '../src/contracts';

/** A reproducible steering policy is a smoke check, not a human playtest. */
function defend(state: BattleState, config: NightConfig): BattleCommand[] {
  const commands: BattleCommand[] = [];
  let angle = state.beamAngle, best = -Infinity;
  for (const candidate of state.enemies) {
    const axis = Math.atan2(candidate.y, candidate.x);
    const selection = selectBeamTargets(state.enemies, config, axis);
    const score = selection.lit.reduce((sum, id) => {
      const enemy = state.enemies.find(entry => entry.id === id)!;
      const distance = Math.hypot(enemy.x, enemy.y);
      return sum + 1 + 150 / Math.max(30, distance) + (enemy.kind === 'bat' ? .7 : 0);
    }, 0);
    if (score > best) { best = score; angle = axis; }
  }
  commands.push({ type: 'aim', angle });
  if (state.flash.cooldownRemaining <= 1e-9 && state.enemies.some(enemy => Math.hypot(enemy.x, enemy.y) < config.flash.radius)) commands.push({ type: 'flash' });
  return commands;
}

describe('stage 4 integrated content acceptance', () => {
  it.each([3, 42, 81])('can earn first-night resources with a free initial loadout (seed %s)', seed => {
    const config = NIGHT_CATALOG.find(night => night.id === 'first-light')!.config;
    expect(config.availableDevices).toEqual([]); expect(config.flash.enabled).toBe(false);
    const state = createBattle(config, seed);
    for (let tick = 0; tick < 9000 && state.outcome === 'playing'; tick++) stepBattle(state, config, defend(state, config));
    expect(state.outcome).toBe('victory');
    expect(state.devices).toEqual([]);
    expect(state.earnedResources).toBe(config.waves.reduce((sum, wave) => sum + wave.enemies.reduce((value, kind) => value + config.enemies[kind].reward, 0), 0));
    expect(state.flash.lastUsedTick).toBeNull();
  });

  it('preserves three distinct initial ordinary nights and the optional ship trial', () => {
    const ordinary = NIGHT_CATALOG.filter(night => ['first-light', 'broken-shore', 'winged-tide'].includes(night.id));
    expect(ordinary.map(night => night.id)).toEqual(['first-light', 'broken-shore', 'winged-tide']);
    expect(new Set(ordinary.map(night => night.chapter)).size).toBe(1);
    expect(new Set(ordinary.map(night => JSON.stringify(night.config.waves))).size).toBe(3);
    expect(NIGHT_CATALOG.find(night => night.id === 'rescue-trial')).toMatchObject({ optional: true, config: { ship: { reward: 12 } } });
    expect(ordinary.every(night => !night.config.ship)).toBe(true);
  });

  it.each(['first-light', 'broken-shore', 'winged-tide'] as const)('finishes %s with reachable equipment and deterministic steering', id => {
    const definition = NIGHT_CATALOG.find(night => night.id === id)!;
    const config = calculateNightConfig(definition.config, UPGRADES.map(node => node.id));
    const placements = [
      { id: 1, kind: 'cannon' as const, x: -90, y: -60 },
      { id: 2, kind: 'cannon' as const, x: -90, y: 60 },
      { id: 3, kind: 'generator' as const, x: -60, y: 0 },
      { id: 4, kind: 'light-trap' as const, x: -220, y: 0 },
    ];
    expect(checkDraft(config, placements).valid).toBe(true);
    const state = createBattle(config, 42, undefined, placements);
    for (let tick = 0; tick < 9000 && state.outcome === 'playing'; tick++) stepBattle(state, config, defend(state, config));
    expect(state.outcome).toBe('victory');
    expect(state.lighthouseHealth).toBeGreaterThan(0);
    expect(state.kills).toBe(config.waves.reduce((sum, wave) => sum + wave.enemies.length, 0));
  });
});
