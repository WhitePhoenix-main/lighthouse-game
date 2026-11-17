import { describe, expect, it } from 'vitest';
import type { LensUpgradeDefinition } from '../src/contracts';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { validateLensDefinitions } from '../src/progression/lenses';

describe('lens content validation', () => {
  it('accepts current content including the negative slowing modifier', () => {
    expect(() => validateLensDefinitions()).not.toThrow();
    expect(LENS_UPGRADES.find(node => node.id === 'slowing-control')?.effect.amount).toBe(-.15);
  });
  it('rejects cycles even when all dependency IDs exist', () => {
    const nodes = structuredClone(LENS_UPGRADES);
    nodes[0]!.requires = ['expanded-targets'];
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('Цикл');
  });
  it('rejects missing dependencies and cross-lens dependencies', () => {
    const nodes = structuredClone(LENS_UPGRADES);
    nodes[1]!.requires = ['missing' as never];
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('Неизвестная зависимость');
    nodes[1]!.requires = ['slowing-control'];
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('другой линзе');
  });
  it('rejects duplicate lens IDs, duplicate node IDs and an unknown node owner', () => {
    expect(() => validateLensDefinitions([...LENSES, LENSES[0]!])).toThrow('Повторный');
    expect(() => validateLensDefinitions(LENSES, [...LENS_UPGRADES, LENS_UPGRADES[0]!])).toThrow('Повторный');
    expect(() => validateLensDefinitions(LENSES, [{ ...LENS_UPGRADES[0]!, lensId: 'missing' as never }])).toThrow('линза');
  });
  it.each([-1, .5, Infinity, NaN])('rejects invalid material costs %s', cost => {
    const lenses = structuredClone(LENSES); lenses[1]!.materialCost = cost;
    expect(() => validateLensDefinitions(lenses)).toThrow();
    const nodes = structuredClone(LENS_UPGRADES); nodes[0]!.materialCost = cost;
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow();
  });
  it.each([0, -1, .5, Infinity, NaN])('rejects invalid resource node costs %s', cost => {
    const nodes = structuredClone(LENS_UPGRADES); nodes[0]!.cost = cost;
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('цена');
  });
  it.each([0, -1, Infinity, NaN])('rejects invalid range multiplier %s', value => {
    const lenses = structuredClone(LENSES); lenses[0]!.rangeMultiplier = value;
    expect(() => validateLensDefinitions(lenses)).toThrow('параметры');
  });
  it.each([0, -.1, 1.01, Infinity, NaN])('rejects invalid base slowing multiplier %s', value => {
    const lenses = structuredClone(LENSES); lenses[2]!.slowMultiplier = value;
    expect(() => validateLensDefinitions(lenses)).toThrow('параметры');
  });
  it.each([0, -1, 2.5, Infinity])('rejects invalid base target limit %s', value => {
    const lenses = structuredClone(LENSES); lenses[0]!.maxTargets = value;
    expect(() => validateLensDefinitions(lenses)).toThrow('параметры');
  });
  it.each([
    { stat: 'range', amount: -1 }, { stat: 'damagePerSecond', amount: 0 },
    { stat: 'halfAngle', amount: Infinity }, { stat: 'armorMultiplier', amount: -1 },
    { stat: 'maxTargets', amount: .5 }, { stat: 'unknown', amount: 1 },
    { stat: 'slowMultiplier', amount: NaN },
  ])('rejects invalid node effect $stat/$amount', effect => {
    const nodes = structuredClone(LENS_UPGRADES); nodes[0]!.effect = effect as LensUpgradeDefinition['effect'];
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('эффект');
  });
  it.each([-.6, -1, .5])('rejects an upgrade pushing slowing outside (0, 1]: %s', amount => {
    const nodes = structuredClone(LENS_UPGRADES); nodes[2]!.effect.amount = amount;
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('границы');
  });
  it('checks combined effects rather than only each individual modifier', () => {
    const nodes = structuredClone(LENS_UPGRADES);
    nodes[2]!.effect = { stat: 'slowMultiplier', amount: -.4 };
    nodes[3]!.effect = { stat: 'slowMultiplier', amount: -.3 };
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('границы');
    nodes[2]!.effect = { stat: 'maxTargets', amount: Number.MAX_SAFE_INTEGER };
    nodes[3]!.effect = { stat: 'damagePerSecond', amount: 6 };
    expect(() => validateLensDefinitions(LENSES, nodes)).toThrow('границы');
  });
});
