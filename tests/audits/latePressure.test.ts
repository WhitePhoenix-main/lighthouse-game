import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { NightId, LensId, EnemyState } from '../../src/contracts';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { LENS_UPGRADES } from '../../src/content/lenses';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { deviceDeployments, battleDeviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../../src/progression/devices';
import { SaveRepository, decodeSave } from '../../src/application/saves';
import { checkDraft } from '../../src/application/placement';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { auditBattle } from '../helpers/balance200Policy';
import { pressureBuild } from '../helpers/latePressureBuilds';
import { specs } from '../helpers/lateBuilds';

const late: NightId[] = ['armored-front', 'sky-siege', 'cross-current'];
const builds = [...specs, { ...specs[1]!, name: 'armor', lens: 'armor-breaker' as const }];
const seeds = [7, 42, 137, 271, 733, 2026];
function fullConfig(id: NightId, lensId: LensId = 'basic') {
  return calculateNightConfig(NIGHT_CATALOG.find(n => n.id === id)!.config, UPGRADES.map(n => n.id), false,
    { lensId, upgrades: LENS_UPGRADES.map(n => n.id) });
}

describe('late pressure and reaction windows', () => {
  it.each(['armored-front', 'cross-current'] as NightId[])('%s allows a delayed half-turn to stop one charge, but ignoring it hurts', id => {
    const config = fullConfig(id);
    config.waves = [{ id: 'charge', enemies: ['minotaur'], spawnInterval: 100 }];
    const run = (react: boolean) => {
      const state = createBattle(config, 42);
      state.waves[0]!.spawned = 1;
      state.beamAngle = state.desiredBeamAngle = Math.PI;
      const enemy: EnemyState = { id: 1, kind: 'minotaur', x: 295, y: 0, health: config.enemies.minotaur.health,
        armor: 0, waveIndex: 0, attackCooldown: 0, chargePhase: 'ready' };
      state.enemies = [enemy]; state.nextEnemyId = 2;
      let charging = false;
      while (state.elapsed < 8.5 && state.outcome === 'playing') {
        stepBattle(state, config, react && state.tick === 30 ? [{ type: 'aim', angle: 0 }] : []);
        charging ||= enemy.chargePhase === 'charging';
        if (state.elapsed < 5.5) expect(state.lighthouseHealth).toBe(config.lighthouseHealth);
      }
      return { state, charging };
    };
    const timely = run(true), ignored = run(false);
    expect(timely.state.outcome).toBe('victory');
    expect(timely.charging).toBe(false);
    expect(timely.state.lighthouseHealth).toBe(config.lighthouseHealth);
    expect(ignored.charging).toBe(true);
    expect(ignored.state.lighthouseHealth).toBeLessThan(config.lighthouseHealth);
    expect(ignored.state.lighthouseHealth).toBeGreaterThan(config.lighthouseHealth * .5);
  });

  it('keeps armor piercing useful on the reinforced shell', () => {
    const times: number[] = [];
    for (const lens of ['armor-breaker', 'focused'] as LensId[]) {
      const config = fullConfig('armored-front', lens);
      config.enemies.turtle.speed = 0;
      config.waves = [{ id: 'shell', enemies: ['turtle'], spawnInterval: 100 }];
      const state = createBattle(config, 42); state.waves[0]!.spawned = 1; state.beamAngle = state.desiredBeamAngle = 0;
      state.enemies = [{ id: 1, kind: 'turtle', x: 180, y: 0, health: config.enemies.turtle.health,
        armor: config.enemies.turtle.armor, waveIndex: 0, attackCooldown: 0 }];
      while (state.outcome === 'playing' && state.elapsed < 30) stepBattle(state, config, []);
      expect(state.outcome).toBe('victory'); times.push(state.elapsed);
    }
    expect(times[0]).toBeLessThan(times[1]!);
  });

  it('settles a real late defeat once, preserving purchases, wounds and paid maintenance', () => {
    const b = pressureBuild(specs[0]!, 5000), p = b.save.profile;
    p.wonNightIds = p.wonNightIds.filter(id => !late.includes(id));
    let raw = JSON.stringify(b.save);
    const repo = new SaveRepository({ read: () => raw, write: v => { raw = v; } }); repo.load();
    const config = calculateNightConfig(NIGHT_CATALOG.find(n => n.id === 'armored-front')!.config,
      p.purchasedUpgrades, false, { lensId: 'basic', upgrades: p.lensUpgrades });
    const snapshot = deviceDeployments(p);
    repo.begin({ id: 'late-defeat', seed: 7, nightId: 'armored-front', placementCost: 0, lensId: 'basic' });
    const result = auditBattle(config, 7, battleDeviceDeployments(p, config.devices.definitions), { flash: true });
    expect(result.outcome).toBe('defeat'); expect(result.victoryReward).toBe(0);
    const devices = normalizedDeviceResults(result.devices, snapshot, config.devices.definitions);
    repo.settle('late-defeat', 'defeat', result.reward, result.encountered, devices);
    const settled = repo.current; repo.settle('late-defeat', 'defeat', result.reward, result.encountered, devices); repo.load();
    expect(repo.current).toEqual(settled);
    expect(settled.profile.resources).toBe(p.resources + result.reward);
    expect(settled.profile.wonNightIds).toEqual(p.wonNightIds);
    expect(settled.profile.purchasedUpgrades).toEqual(p.purchasedUpgrades);
    expect(settled.profile.bossMaterials).toBe(p.bossMaterials);
    for (const d of devices) expect(settled.profile.devices.find(v => v.id === d.id)!.health).toBe(d.health);
    const damaged = settled.profile.devices.find(d => d.health === 0)!;
    expect(damaged).toBeDefined();
    const bill = repairCost(damaged, p.purchasedUpgrades);
    const before = repo.current.profile.resources;
    repo.repairDevice(damaged.id); repo.load();
    expect(repo.current.profile.resources).toBe(before - bill);
    expect(bill).toBeGreaterThan(0);
  });
});

it('compares prepared and delayed builds including maintenance and losses', () => {
  const rows: { budget: number | string; name: string; id: NightId; seed: number; mode: string; cost: number;
    objects: number; win: boolean; seconds: number; damage: number; health: number; reward: number;
    repair: number; rearm: number; net: number; peak: number }[] = [];
  for (const budget of [5000, 10000, Infinity]) for (const spec of builds) for (const id of late) for (const seed of seeds) {
    const modes = Number.isFinite(budget) ? ['prepared'] : ['prepared', 'delayed'];
    for (const mode of modes) {
      const b = pressureBuild(spec, budget), p = b.save.profile;
      expect(decodeSave(JSON.stringify(b.save))).toEqual(b.save);
      expect(b.cost).toBeLessThanOrEqual(budget);
      const config = calculateNightConfig(NIGHT_CATALOG.find(n => n.id === id)!.config, p.purchasedUpgrades, false,
        { lensId: spec.lens, upgrades: p.lensUpgrades });
      const snapshot = deviceDeployments(p);
      expect(checkDraft(config, snapshot).valid).toBe(true);
      const r = auditBattle(config, seed, battleDeviceDeployments(p, config.devices.definitions),
        { flash: true, reactionSeconds: mode === 'delayed' ? 2.1 : .7 });
      expect(r.outcome).not.toBe('playing');
      if (r.outcome === 'victory') { expect(r.reward).toBe(260); expect(r.seconds).toBeGreaterThanOrEqual(120); if(!Number.isFinite(budget) && mode === 'prepared') expect(r.seconds).toBeLessThanOrEqual(240); }
      else expect(r.victoryReward).toBe(0);
      const normalized = normalizedDeviceResults(r.devices, snapshot, config.devices.definitions);
      let repair = 0, rearm = 0;
      for (const d of normalized) {
        const body = { ...p.devices.find(v => v.id === d.id)!, health: d.health, consumed: d.consumed, trapCharges: d.trapCharges };
        repair += repairCost(body, p.purchasedUpgrades); rearm += rechargeCost(body, p.purchasedUpgrades);
      }
      rows.push({ budget: Number.isFinite(budget) ? budget : 'full', name: spec.name, id, seed, mode, cost: b.cost,
        objects: snapshot.length, win: r.outcome === 'victory', seconds: r.seconds, damage: r.damageTaken, health: r.health,
        reward: r.reward, repair, rearm, net: r.reward - repair - rearm, peak: r.peak });
    }
  }
  mkdirSync('test-results/balance', {recursive:true});writeFileSync('test-results/balance/late-pressure.json', JSON.stringify({ rules: 'prototype-21-late-pressure', rows }, null, 2));
  expect(rows).toHaveLength(432);
  const full = rows.filter(r => r.budget === 'full'), ready = full.filter(r => r.mode === 'prepared'), slow = full.filter(r => r.mode === 'delayed');
  for (const id of late) {
    const group = ready.filter(r => r.id === id);
    expect(group.filter(r => r.damage > 0).length).toBeGreaterThanOrEqual(6);
    expect(group.filter(r => r.win).length).toBeGreaterThanOrEqual(18);
    expect(group.filter(r => r.win).every(r => r.net > 0)).toBe(true);
  }
  expect(ready.filter(r => r.win).length).toBeGreaterThan(slow.filter(r => r.win).length);
  expect(ready.reduce((s, r) => s + r.damage, 0)).toBeLessThan(slow.reduce((s, r) => s + r.damage, 0));
}, 120000);
