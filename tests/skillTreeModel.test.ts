import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import type { ApplicationView } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { CAMPAIGN_TREE_DRAFT } from '../src/content/campaignTreeDraft';
import { buildSkillGraph, buildUnifiedSkillGraph, skillAncestors, type SkillCategory } from '../src/presentation/skill-tree/skillTreeModel';

const categories: readonly SkillCategory[] = ['lighthouse', 'devices', 'lenses', 'abilities'];
function initialView(): ApplicationView {
  return new LighthouseApplication({ read: () => null, write: () => {} }, NIGHT_CONFIG,
    () => ({ id: 'graph-test', seed: 1 })).view;
}

describe('skill tree view model', () => {
  it('includes every real purchase exactly once and excludes planning-only purchases', () => {
    const view = initialView();
    const nodes = categories.flatMap(category => [...buildSkillGraph(view, category).nodes]);
    const expectedIds = [
      ...view.upgrades.map(node => node.definition.id),
      ...view.lenses.filter(lens => lens.definition.id !== 'basic').map(lens => `lens-unlock-${lens.definition.id}`),
      ...view.lenses.flatMap(lens => lens.upgrades.map(node => node.definition.id)),
    ];
    expect(nodes.map(node => node.id).sort()).toEqual(expectedIds.sort());
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
    const planned = CAMPAIGN_TREE_DRAFT.filter(node => node.source === 'general-draft' || node.source === 'ability-draft');
    expect(planned.every(node => !nodes.some(actual => actual.id === node.id))).toBe(true);
    expect(buildSkillGraph(view, 'lighthouse').branches.map(branch => branch.id))
      .toEqual(['light', 'optics', 'hull', 'field', 'engineering']);
    expect(buildSkillGraph(view, 'devices').branches).toHaveLength(8);
    expect(buildSkillGraph(view, 'lenses').branches).toHaveLength(8);
    expect(buildSkillGraph(view, 'abilities').branches.map(branch => branch.id)).toEqual(['flash']);
  });

  it('keeps source availability, prices and all prerequisites instead of recomputing game rules', () => {
    const view = initialView();
    const graphNodes = categories.flatMap(category => [...buildSkillGraph(view, category).nodes]);
    for (const source of view.upgrades) {
      const node = graphNodes.find(node => node.id === source.definition.id)!;
      expect(node).toMatchObject({ sourceId: source.definition.id, status: source.status, reason: source.reason,
        cost: source.definition.cost, currency: 'resources', requires: source.definition.requires });
    }
    // This requirement crosses categories and must remain available in the card.
    expect(graphNodes.find(node => node.id === 'unlock-flash')!.requires).toContain('unlock-barrier');
  });

  it.each(categories)('retains all internal dependency edges and places children below parents: %s', category => {
    const graph = buildSkillGraph(initialView(), category);
    const ids = new Set(graph.nodes.map(node => node.id));
    expect(graph.edges).toEqual(graph.nodes.flatMap(node => node.requires.filter(id => ids.has(id))
      .map(from => ({ from, to: node.id }))));
    for (const edge of graph.edges) {
      const parent = graph.nodes.find(node => node.id === edge.from)!;
      const child = graph.nodes.find(node => node.id === edge.to)!;
      expect(child.y - parent.y).toBeGreaterThanOrEqual(140);
    }
    if (category === 'devices') expect(graph.edges).toContainEqual({ from: 'unlock-barrier', to: 'unlock-generator' });
  });

  it.each(categories)('has no overlapping buttons or labels, including branch boundaries: %s', category => {
    const graph = buildSkillGraph(initialView(), category);
    for (const [index, node] of graph.nodes.entries()) {
      expect(node.x - 56).toBeGreaterThanOrEqual(0);
      expect(node.x + 56).toBeLessThanOrEqual(graph.width);
      expect(node.y).toBeGreaterThan(100);
      expect(node.y + 100).toBeLessThanOrEqual(graph.height);
      for (const other of graph.nodes.slice(index + 1)) {
        // Conservative 112 x 128 bounding box includes the button and its label.
        expect(Math.abs(node.x - other.x) >= 112 || Math.abs(node.y - other.y) >= 128).toBe(true);
      }
    }
  });

  it('does not move nodes when ownership, prices, status or input ordering changes', () => {
    const view = initialView();
    const changed = structuredClone(view);
    changed.upgrades = [...changed.upgrades].reverse().map(node => ({ ...node, status: 'purchased',
      reason: 'changed', definition: { ...node.definition, cost: 999 } }));
    changed.lenses = changed.lenses.map(lens => ({ ...lens, unlocked: true, canPurchase: false,
      upgrades: [...lens.upgrades].reverse().map(node => ({ ...node, status: 'purchased' })) }));
    const coordinates = (value: ApplicationView, category: SkillCategory) => buildSkillGraph(value, category).nodes
      .map(node => ({ id: node.id, x: node.x, y: node.y, tier: node.tier })).sort((a, b) => a.id.localeCompare(b.id));
    for (const category of categories) expect(coordinates(changed, category)).toEqual(coordinates(view, category));
  });

  it('adds paid lens unlock prerequisites and preserves the real lens upgrade chain', () => {
    const view = initialView();
    const nodes = buildSkillGraph(view, 'lenses').nodes;
    expect(nodes.some(node => node.id === 'lens-unlock-basic')).toBe(false);
    for (const lens of view.lenses) {
      if (lens.definition.id !== 'basic') expect(nodes.find(node => node.id === `lens-unlock-${lens.definition.id}`))
        .toMatchObject({ kind: 'lens-unlock', sourceId: lens.definition.id, cost: lens.definition.materialCost,
          currency: 'materials', status: lens.unlocked ? 'purchased' : lens.canPurchase ? 'available' : 'insufficient' });
      for (const source of lens.upgrades) {
        const node = nodes.find(node => node.id === source.definition.id)!;
        expect(node.requires).toEqual([...(lens.definition.id === 'basic' ? [] : [`lens-unlock-${lens.definition.id}`]),
          ...source.definition.requires]);
        expect(node).toMatchObject({ status: source.status, reason: source.reason, cost: source.definition.cost });
      }
    }
    expect(skillAncestors(nodes, 'basic-paired')).toEqual(new Set(['basic-power-1', 'basic-power-2', 'basic-width']));
    expect(skillAncestors(nodes, 'expanded-power-2')).toEqual(new Set([
      'lens-unlock-expanded', 'expanded-width', 'expanded-targets', 'expanded-power-1',
    ]));
    expect(skillAncestors(nodes, 'missing')).toEqual(new Set());
    expect(skillAncestors(buildSkillGraph(view, 'abilities').nodes, 'unlock-flash')).toEqual(new Set(['unlock-barrier']));
  });
});

describe('four directions from the lighthouse', () => {
  it('unites all 200 real purchases and every actual edge, including cross-category gates', () => {
    const view = initialView();
    const graph = buildUnifiedSkillGraph(view);
    const classified = categories.flatMap(category => [...buildSkillGraph(view, category).nodes]);
    expect(graph.nodes).toHaveLength(200);
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(200);
    expect(graph.nodes.map(node => node.id).sort()).toEqual(classified.map(node => node.id).sort());
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const expected = graph.nodes.flatMap(node => node.requires.filter(id => byId.has(id))
      .map(from => ({ from, to: node.id })));
    expect(graph.edges).toEqual(expected);
    expect(graph.edges).toHaveLength(219);
    expect(graph.edges.every(edge => edge.from !== 'lighthouse-center')).toBe(true);
    const crossing = expected.filter(edge => byId.get(edge.from)!.category !== byId.get(edge.to)!.category);
    expect(crossing.length).toBeGreaterThan(0);
    for (const edge of crossing) expect(graph.edges).toContainEqual(edge);
    expect(graph.edges).toContainEqual({ from: 'unlock-barrier', to: 'unlock-flash' });
    expect(graph.edges).toContainEqual({ from: 'unlock-generator', to: 'shield-capacity-1' });
    expect(graph.edges).toContainEqual({ from: 'unlock-cannon', to: 'device-slots-3' });
  });

  it('preserves all source statuses, reasons, prices, icons and prerequisites', () => {
    const view = initialView();
    const graph = buildUnifiedSkillGraph(view);
    for (const category of categories) for (const source of buildSkillGraph(view, category).nodes) {
      const { x: _x, y: _y, ...reference } = source;
      expect(graph.nodes.find(node => node.id === source.id)).toMatchObject(reference);
    }
  });

  it('separates four directions, their families and a free lighthouse center', () => {
    const graph = buildUnifiedSkillGraph(initialView());
    expect(graph.width).toBe(4500);
    expect(graph.height).toBe(3600);
    expect(graph.center).toEqual({ x: 2250, y: 1800 });
    for (const [index, node] of graph.nodes.entries()) {
      expect(node.x - 28).toBeGreaterThanOrEqual(0);
      expect(node.x + 28).toBeLessThanOrEqual(graph.width);
      expect(node.y - 28).toBeGreaterThanOrEqual(0);
      expect(node.y + 28).toBeLessThanOrEqual(graph.height);
      expect(Math.hypot(node.x - graph.center.x, node.y - graph.center.y)).toBeGreaterThanOrEqual(200);
      for (const other of graph.nodes.slice(index + 1)) {
        expect(Math.hypot(node.x - other.x, node.y - other.y)).toBeGreaterThanOrEqual(128);
      }
    }
    expect(graph.regions.map(region => region.id).sort()).toEqual([...categories].sort());
    expect(new Set(graph.branches.map(branch => branch.id)).size).toBe(graph.branches.length);
    expect(graph.branches).toHaveLength(22);
    expect(graph.branches.map(branch => branch.id)).toContain('devices:generator');
    expect(graph.branches.map(branch => branch.id)).toContain('lenses:basic');
    const average = (category: SkillCategory, axis: 'x' | 'y') => {
      const members = graph.nodes.filter(node => node.category === category);
      return members.reduce((sum, node) => sum + node[axis], 0) / members.length;
    };
    expect(average('lighthouse', 'y')).toBeLessThan(graph.center.y);
    expect(average('devices', 'x')).toBeLessThan(graph.center.x);
    expect(average('lenses', 'x')).toBeGreaterThan(graph.center.x);
    expect(average('abilities', 'y')).toBeGreaterThan(graph.center.y);
  });

  it('grows actual mini branches outward and keeps chains and forks in their family', () => {
    const graph = buildUnifiedSkillGraph(initialView());
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const outward = {
      lighthouse: { x: 0, y: -1 }, devices: { x: -1, y: 0 },
      lenses: { x: 1, y: 0 }, abilities: { x: 0, y: 1 },
    };
    for (const node of graph.nodes) {
      const direction = outward[node.category];
      expect((node.x - graph.center.x) * direction.x + (node.y - graph.center.y) * direction.y)
        .toBeGreaterThanOrEqual(350);
    }
    const internal = graph.edges.filter(edge => {
      const parent = byId.get(edge.from)!, child = byId.get(edge.to)!;
      return parent.category === child.category && parent.branch === child.branch;
    });
    for (const edge of internal) {
      const parent = byId.get(edge.from)!, child = byId.get(edge.to)!;
      const direction = outward[child.category];
      expect((child.x - parent.x) * direction.x + (child.y - parent.y) * direction.y)
        .toBeGreaterThanOrEqual(148);
    }
    // Real cannon children fan across distinct lanes; a linear lens stays a simple chain.
    const cannonChildren = internal.filter(edge => edge.from === 'cannon-damage-1').map(edge => byId.get(edge.to)!);
    expect(cannonChildren).toHaveLength(3);
    expect(new Set(cannonChildren.map(node => node.y)).size).toBe(3);
    const expanded = graph.nodes.filter(node => node.branch === 'expanded');
    expect(new Set(expanded.map(node => node.y)).size).toBe(1);
    expect(new Set(expanded.map(node => node.x)).size).toBe(5);
  });

  it('places family and direction labels in reserved space clear of all buttons', () => {
    const graph = buildUnifiedSkillGraph(initialView());
    const labels = [...graph.branches, ...graph.regions];
    for (const label of labels) {
      expect(label.x).toBeGreaterThanOrEqual(130);
      expect(label.x).toBeLessThanOrEqual(graph.width - 130);
      expect(label.y).toBeGreaterThanOrEqual(50);
      expect(label.y).toBeLessThanOrEqual(graph.height - 50);
      for (const node of graph.nodes) {
        // A conservative title rectangle plus button radius, also covering large text.
        expect(Math.abs(label.x - node.x) >= 170 || Math.abs(label.y - node.y) >= 94).toBe(true);
      }
    }
    for (const [index, label] of labels.entries()) for (const other of labels.slice(index + 1)) {
      expect(Math.abs(label.x - other.x) >= 260 || Math.abs(label.y - other.y) >= 90).toBe(true);
    }
  });

  it('keeps coordinates and branch labels stable through purchases, text settings and arbitrary input order', () => {
    const view = initialView();
    const changed = structuredClone(view);
    changed.settings = { ...changed.settings, textSize: 'large' };
    changed.upgrades = [...changed.upgrades].reverse().map(node => ({ ...node, status: 'purchased',
      reason: 'changed', definition: { ...node.definition, cost: 999 } }));
    changed.lenses = [...changed.lenses].reverse().map(lens => ({ ...lens, unlocked: true, canPurchase: false,
      upgrades: [...lens.upgrades].reverse().map(node => ({ ...node, status: 'purchased' })) }));
    const before = buildUnifiedSkillGraph(view), after = buildUnifiedSkillGraph(changed);
    const positions = (graph: typeof before) => graph.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(positions(after)).toEqual(positions(before));
    expect(after.branches).toEqual(before.branches);
    expect(after.regions).toEqual(before.regions);
    expect(after.edges).toEqual(before.edges);
  });
});
