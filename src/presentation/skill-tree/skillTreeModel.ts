import type { ApplicationView, UpgradeStatus } from '../../contracts';
import { CAMPAIGN_TREE_DRAFT } from '../../content/campaignTreeDraft';

export type SkillCategory = 'lighthouse' | 'devices' | 'lenses' | 'abilities';
export interface SkillGraphNode {
  id: string;
  sourceId: string;
  kind: 'upgrade' | 'lens-unlock' | 'lens-upgrade';
  name: string;
  category: SkillCategory;
  branch: string;
  branchName: string;
  icon: string;
  status: UpgradeStatus;
  reason: string;
  cost: number;
  currency: 'resources' | 'materials';
  requires: readonly string[];
  x: number;
  y: number;
  tier: number;
}
export interface SkillGraph {
  nodes: readonly SkillGraphNode[];
  edges: readonly { from: string; to: string }[];
  branches: readonly { id: string; name: string; x: number; y: number }[];
  width: number;
  height: number;
}
export interface UnifiedSkillGraph extends SkillGraph {
  center: { x: number; y: number };
  regions: readonly { id: SkillCategory; name: string; icon: string; x: number; y: number }[];
}

const branchDefinitions = {
  lighthouse: [
    ['light', 'Сила света', 'beam'], ['optics', 'Оптика', 'optics'],
    ['hull', 'Корпус', 'hull'], ['field', 'Поле', 'shield'], ['engineering', 'Инженерия', 'engineering'],
  ],
  devices: [
    ['cannon', 'Пушки', 'cannon'], ['barrier', 'Барьеры', 'barrier'],
    ['generator', 'Генераторы', 'generator'], ['light-trap', 'Ловушки', 'trap'],
    ['harpoon', 'Гарпуны', 'harpoon'], ['mortar', 'Мортиры', 'mortar'],
    ['bell', 'Колокола', 'bell'], ['repair-lamp', 'Ремонтные фонари', 'repair'],
  ],
  abilities: [['flash', 'Вспышка', 'flash']],
} as const;
const categories = { general: 'lighthouse', device: 'devices', lens: 'lenses', ability: 'abilities' } as const;
// Planning-only purchases never enter the graph. The draft supplies thematic labels only.
const upgradeMetadata = new Map(CAMPAIGN_TREE_DRAFT
  .filter(node => node.source === 'existing-upgrade').map(node => [node.id, node]));

/** Pure view projection. Coordinates depend on the dependency graph, never on ownership. */
export function buildSkillGraph(view: ApplicationView, category: SkillCategory): SkillGraph {
  const definitions: readonly (readonly [string, string, string])[] = category === 'lenses'
    ? view.lenses.map(lens => [lens.definition.id, lens.definition.name, 'lens'] as const)
    : branchDefinitions[category];
  const nodes: SkillGraphNode[] = [];
  for (const node of view.upgrades) {
    const definition = node.definition;
    const metadata = upgradeMetadata.get(definition.id);
    if (!metadata) throw new Error(`Skill graph: missing metadata for ${definition.id}`);
    if (categories[metadata.category] !== category) continue;
    const branch = definitions.find(([id]) => id === metadata.branch);
    if (!branch) throw new Error(`Skill graph: missing branch for ${definition.id}`);
    nodes.push({ id: definition.id, sourceId: definition.id, kind: 'upgrade', name: definition.name,
      category, branch: branch[0], branchName: branch[1], icon: branch[2], status: node.status,
      reason: node.reason, cost: definition.cost, currency: 'resources', requires: [...definition.requires],
      x: 0, y: 0, tier: 0 });
  }
  if (category === 'lenses') for (const lens of view.lenses) {
    const definition = lens.definition;
    const unlockId = `lens-unlock-${definition.id}`;
    // Basic lens ownership is free initial equipment, not a purchase.
    if (definition.id !== 'basic') nodes.push({
      id: unlockId, sourceId: definition.id, kind: 'lens-unlock', name: definition.name,
      category, branch: definition.id, branchName: definition.name, icon: 'lens',
      status: lens.unlocked ? 'purchased' : lens.canPurchase ? 'available' : 'insufficient',
      reason: lens.reason, cost: definition.materialCost, currency: 'materials', requires: [], x: 0, y: 0, tier: 0,
    });
    for (const upgrade of lens.upgrades) nodes.push({
      id: upgrade.definition.id, sourceId: upgrade.definition.id, kind: 'lens-upgrade', name: upgrade.definition.name,
      category, branch: definition.id, branchName: definition.name, icon: 'lens',
      status: upgrade.status, reason: upgrade.reason, cost: upgrade.definition.cost, currency: 'resources',
      requires: [...(definition.id === 'basic' ? [] : [unlockId]), ...upgrade.definition.requires],
      x: 0, y: 0, tier: 0,
    });
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error(`Skill graph: dependency cycle at ${id}`);
    visiting.add(id);
    const dependencies = byId.get(id)!.requires.filter(requirement => byId.has(requirement));
    const result = dependencies.length ? Math.max(...dependencies.map(depth)) + 1 : 0;
    visiting.delete(id);
    depths.set(id, result);
    return result;
  }
  nodes.forEach(node => { node.tier = depth(node.id) + 1; });

  // 140 px leaves room for 112 px labels underneath 64 px native buttons.
  const large = view.settings.textSize === 'large';
  const columnStep = large ? 160 : 140, rowStep = large ? 168 : 140, firstRow = 140, margin = 48, branchGap = 48;
  let left = margin;
  const branches: { id: string; name: string; x: number; y: number }[] = [];
  for (const [id, name] of definitions) {
    const members = nodes.filter(node => node.branch === id);
    if (!members.length) continue;
    const rows = new Map<number, SkillGraphNode[]>();
    for (const node of members) {
      const row = rows.get(node.tier) ?? [];
      row.push(node);
      rows.set(node.tier, row);
    }
    const columns = Math.max(...[...rows.values()].map(row => row.length));
    const width = Math.max(180, columns * columnStep);
    const center = left + width / 2;
    branches.push({ id, name, x: center, y: 45 });
    for (const [tier, row] of rows) {
      row.sort((a, b) => a.id.localeCompare(b.id, 'en'));
      row.forEach((node, index) => {
        node.x = center + (index - (row.length - 1) / 2) * columnStep;
        node.y = firstRow + (tier - 1) * rowStep;
      });
    }
    left += width + branchGap;
  }
  return { nodes, branches,
    edges: nodes.flatMap(node => node.requires.filter(id => byId.has(id)).map(from => ({ from, to: node.id }))),
    width: Math.max(360, left - branchGap + margin),
    height: Math.max(400, ...nodes.map(node => node.y + 140)),
  };
}

/** Arrange a family DAG outward, keeping continuing chains in their lanes. */
function layoutFamily(members: SkillGraphNode[], root: { x: number; y: number },
  direction: { x: number; y: number }): number {
  const byId = new Map(members.map(node => [node.id, node]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error('Skill graph: dependency cycle at ' + id);
    visiting.add(id);
    const parents = byId.get(id)!.requires.filter(parent => byId.has(parent));
    const result = parents.length ? 1 + Math.max(...parents.map(depth)) : 0;
    visiting.delete(id);
    depths.set(id, result);
    return result;
  };
  members.forEach(node => depth(node.id));
  const layers = Array.from({ length: Math.max(...depths.values()) + 1 }, (_, tier) =>
    members.filter(node => depth(node.id) === tier));
  const step = 148;
  const breadth = (Math.max(...layers.map(layer => layer.length)) - 1) * step;
  const lanes = new Map<string, number>();
  for (const [tier, layer] of layers.entries()) {
    const preferredLane = (node: SkillGraphNode): number => {
      // Lens unlocks gate every purchase. Only the closest generation steers its lane.
      const parents = node.requires.filter(id => depths.get(id) === tier - 1 && lanes.has(id));
      return parents.length ? parents.reduce((sum, id) => sum + lanes.get(id)!, 0) / parents.length : 0;
    };
    layer.sort((a, b) => preferredLane(a) - preferredLane(b) || a.id.localeCompare(b.id, 'en'));
    const positions = layer.map((node, index) => {
      const preferred = tier === 0 ? (index - (layer.length - 1) / 2) * step : preferredLane(node);
      return Math.max(-breadth / 2 + index * step,
        Math.min(breadth / 2 - (layer.length - 1 - index) * step, preferred));
    });
    // Resolve siblings, then keep each family inside its own strip.
    for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i]!, positions[i - 1]! + step);
    layer.forEach((node, index) => {
      const lane = positions[index]!;
      lanes.set(node.id, lane);
      node.x = root.x + direction.x * tier * step - direction.y * lane;
      node.y = root.y + direction.y * tier * step + direction.x * lane;
    });
  }
  return breadth;
}

/** Four directions from a decorative lighthouse; every line remains a real purchase gate. */
export function buildUnifiedSkillGraph(view: ApplicationView): UnifiedSkillGraph {
  const order: readonly SkillCategory[] = ['lighthouse', 'lenses', 'abilities', 'devices'];
  const groups = order.flatMap(category => {
    const graph = buildSkillGraph(view, category);
    const branchIds = category === 'lighthouse'
      ? ['engineering', 'field', 'hull', 'optics', 'light']
      : category === 'devices'
        ? ['barrier', 'bell', 'repair-lamp', 'generator', 'mortar', 'harpoon', 'light-trap', 'cannon']
        : graph.branches.map(branch => branch.id).sort();
    return branchIds.map(id => ({ category, id, members: graph.nodes.filter(node => node.branch === id)
      .sort((a, b) => a.id.localeCompare(b.id, 'en')) }))
      .filter(group => group.members.length);
  });
  const nodes = groups.flatMap(group => group.members);
  const byId = new Map(nodes.map(node => [node.id, node]));
  // Unite before building edges so gates between categories never disappear.
  const edges = nodes.flatMap(node => node.requires.filter(id => byId.has(id)).map(from => ({ from, to: node.id })));
  const width = 4500, height = 3600;
  const center = { x: width / 2, y: 1800 };
  const branches: { id: string; name: string; x: number; y: number }[] = [];
  const anchors: { category: SkillCategory; id: string; name: string; x: number; y: number;
    direction: { x: number; y: number } }[] = [];
  // Reserve real family breadth instead of filling a global grid with unrelated purchases.
  const lighthouse = groups.filter(group => group.category === 'lighthouse');
  const breadths = lighthouse.map(group => layoutFamily(group.members, { x: 0, y: 0 }, { x: 0, y: -1 }));
  const familyGap = 164;
  const totalBreadth = breadths.reduce((sum, value) => sum + value, 0) + (lighthouse.length - 1) * familyGap;
  let left = center.x - totalBreadth / 2;
  for (const [index, group] of lighthouse.entries()) {
    const root = { x: left + breadths[index]! / 2, y: 1380 - index % 3 * 28 };
    const direction = { x: 0, y: -1 };
    layoutFamily(group.members, root, direction);
    anchors.push({ ...root, category: group.category, id: group.id, name: group.members[0]!.branchName, direction });
    left += breadths[index]! + familyGap;
  }
  for (const category of ['devices', 'lenses', 'abilities'] as const) {
    const families = groups.filter(group => group.category === category);
    for (const [index, group] of families.entries()) {
      const side = category === 'devices' ? -1 : 1;
      // Staggered banks leave broad channels between families and all four directions.
      const outer = index >= 4;
      const root = category === 'abilities' ? { x: center.x, y: 2220 }
        : { x: center.x + side * (outer ? 1510 : 700),
          y: outer ? 650 + (index - 4) * 540 : 1660 + index * 520 };
      const direction = category === 'abilities' ? { x: 0, y: 1 } : { x: side, y: 0 };
      layoutFamily(group.members, root, direction);
      anchors.push({ ...root, category, id: group.id, name: group.members[0]!.branchName, direction });
    }
  }
  // Titles occupy empty space, not a button or another title. This search is cosmetic and deterministic.
  const clearLabel = (x: number, y: number): boolean =>
    x >= 130 && x <= width - 130 && y >= 70 && y <= height - 70
    && nodes.every(node => Math.abs(x - node.x) >= 170 || Math.abs(y - node.y) >= 94)
    && branches.every(label => Math.abs(x - label.x) >= 260 || Math.abs(y - label.y) >= 90);
  for (const anchor of anchors) {
    const candidates = [130, 180, 230, 280, 340, 420].flatMap(distance =>
      [0, -110, 110, -220, 220, -330, 330].map(offset => ({
        x: anchor.x - anchor.direction.x * distance - anchor.direction.y * offset,
        y: anchor.y - anchor.direction.y * distance + anchor.direction.x * offset,
      })));
    const position = candidates.find(candidate => clearLabel(candidate.x, candidate.y));
    if (!position) throw new Error('Skill graph: no title space for ' + anchor.category + ':' + anchor.id);
    branches.push({ id: anchor.category + ':' + anchor.id, name: anchor.name, ...position });
  }
  const regions: UnifiedSkillGraph['regions'] = [
    { id: 'lighthouse', name: 'Маяк', icon: 'beam', x: center.x, y: 60 },
    { id: 'devices', name: 'Устройства', icon: 'engineering', x: 400, y: 2920 },
    { id: 'lenses', name: 'Линзы', icon: 'lens', x: width - 400, y: 2920 },
    { id: 'abilities', name: 'Вспышка', icon: 'flash', x: center.x, y: 3330 },
  ];
  return { nodes, edges, branches, center, width, height, regions };
}

/** Includes external prerequisite ids so the details panel can explain cross-category gates. */
export function skillAncestors(nodes: readonly SkillGraphNode[], id: string): Set<string> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ancestors = new Set<string>();
  const visit = (nodeId: string): void => {
    for (const prerequisite of byId.get(nodeId)?.requires ?? []) {
      if (prerequisite === id || ancestors.has(prerequisite)) continue;
      ancestors.add(prerequisite);
      visit(prerequisite);
    }
  };
  visit(id);
  return ancestors;
}
