import type { DeviceKind, LensId, UpgradeDefinition } from '../contracts';
import { UPGRADES } from './upgrades';
import { LENSES, LENS_UPGRADES } from './lenses';
import { CAMPAIGN_GENERAL_DRAFT, type CampaignGeneralBranch } from './campaignGeneralDraft';
import { CAMPAIGN_ABILITY_DRAFT } from './campaignAbilityDraft';

export type CampaignTreeCategory = 'general' | 'device' | 'lens' | 'ability';
export interface CampaignTreeDraftNode {
  readonly id: string;
  /** Original ownership id. Lens unlocks live in unlockedLenses, not purchasedUpgrades. */
  readonly sourceId: string;
  readonly name: string;
  readonly category: CampaignTreeCategory;
  readonly branch: string;
  readonly source: 'existing-upgrade' | 'existing-lens-unlock' | 'existing-lens-upgrade' | 'general-draft' | 'ability-draft';
  readonly requires: readonly string[];
}

const deviceUnlocks: Readonly<Record<string, DeviceKind>> = {
  'unlock-cannon': 'cannon', 'unlock-barrier': 'barrier', 'unlock-generator': 'generator',
  'unlock-trap': 'light-trap', 'unlock-harpoon': 'harpoon', 'unlock-mortar': 'mortar',
  'unlock-bell': 'bell', 'unlock-repair-lamp': 'repair-lamp',
};
const devicePrefixes: readonly [string, DeviceKind][] = [
  ['cannon-', 'cannon'], ['barrier-', 'barrier'], ['generator-', 'generator'], ['trap-', 'light-trap'],
  ['harpoon-', 'harpoon'], ['mortar-', 'mortar'], ['bell-', 'bell'], ['repair-', 'repair-lamp'],
];

function classify(node: UpgradeDefinition): { category: CampaignTreeCategory; branch: string } {
  const id = node.id;
  if (id === 'unlock-flash' || id.startsWith('flash-')) return { category: 'ability', branch: 'flash' };
  let general: CampaignGeneralBranch | undefined;
  if (id.startsWith('device-') || id.startsWith('engineering-')) general = 'engineering';
  else if (id.startsWith('beam-width-') || id.startsWith('beam-range-') || id.startsWith('beam-turn-')) general = 'optics';
  else if (id.startsWith('beam-') || id.startsWith('paired-light')) general = 'light';
  else if (id.startsWith('lighthouse-') || id.startsWith('hull-')) general = 'hull';
  else if (id.startsWith('shield-')) general = 'field';
  if (general) return { category: 'general', branch: general };
  const device = deviceUnlocks[id] ?? devicePrefixes.find(([prefix]) => id.startsWith(prefix))?.[1];
  if (device) return { category: 'device', branch: device };
  throw new Error(`Unclassified existing upgrade: ${id}`);
}

/** Planning id only. Saved lens ownership keeps its original LensId. */
export const campaignLensUnlockId = (lensId: LensId): string => `lens-unlock-${lensId}`;

function createTreeDraft(): CampaignTreeDraftNode[] {
  return [
    ...UPGRADES.map(node => ({ id: node.id, sourceId: node.id, name: node.name, ...classify(node),
      source: 'existing-upgrade' as const, requires: [...node.requires] })),
    ...LENSES.filter(lens => lens.id !== 'basic').map(lens => ({
      id: campaignLensUnlockId(lens.id), sourceId: lens.id, name: lens.name,
      category: 'lens' as const, branch: lens.id, source: 'existing-lens-unlock' as const, requires: [],
    })),
    ...LENS_UPGRADES.map(node => ({ id: node.id, sourceId: node.id, name: node.name,
      category: 'lens' as const, branch: node.lensId, source: 'existing-lens-upgrade' as const,
      requires: [...(node.lensId === 'basic' ? [] : [campaignLensUnlockId(node.lensId)]), ...node.requires] })),
    ...CAMPAIGN_GENERAL_DRAFT.map(node => ({ id: node.id, sourceId: node.id, name: node.name,
      category: 'general' as const, branch: node.branch, source: 'general-draft' as const, requires: [...node.requires] })),
    ...CAMPAIGN_ABILITY_DRAFT.map(node => ({ id: node.id, sourceId: node.id, name: node.name,
      category: 'ability' as const, branch: node.abilityId, source: 'ability-draft' as const, requires: [...node.requires] })),
  ];
}

/** Stage A structural plan, not a purchase catalog. All 200 existing purchases are retained. */
export const CAMPAIGN_TREE_DRAFT: readonly CampaignTreeDraftNode[] = createTreeDraft();

export function validateCampaignTreeDraft(nodes: readonly CampaignTreeDraftNode[] = CAMPAIGN_TREE_DRAFT): void {
  const fail = (message: string): never => { throw new Error(`Campaign tree draft: ${message}`); };
  if (nodes.length !== 256) fail('expected 256 nodes');
  const byId = new Map<string, CampaignTreeDraftNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) fail(`duplicate id ${node.id}`);
    byId.set(node.id, node);
    if (new Set(node.requires).size !== node.requires.length) fail(`duplicate requirement ${node.id}`);
  }
  for (const [category, count] of Object.entries({ general: 96, device: 64, lens: 40, ability: 56 })) {
    if (nodes.filter(node => node.category === category).length !== count) fail(`category count ${category}`);
  }
  for (const [branch, count] of Object.entries({ light: 20, optics: 20, hull: 20, field: 18, engineering: 18 })) {
    if (nodes.filter(node => node.category === 'general' && node.branch === branch).length !== count) fail(`general branch count ${branch}`);
  }
  for (const branch of Object.values(deviceUnlocks)) {
    if (nodes.filter(node => node.category === 'device' && node.branch === branch).length !== 8) fail(`device branch count ${branch}`);
  }
  for (const lens of LENSES) {
    if (nodes.filter(node => node.category === 'lens' && node.branch === lens.id).length !== 5) fail(`lens branch count ${lens.id}`);
  }
  for (const [branch, count] of Object.entries({ flash: 16, overload: 10, seal: 10, barrage: 10, bastion: 10 })) {
    if (nodes.filter(node => node.category === 'ability' && node.branch === branch).length !== count) fail(`ability branch count ${branch}`);
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail(`dependency cycle ${id}`);
    if (visited.has(id)) return;
    const node = byId.get(id);
    if (!node) fail(`unknown dependency ${id}`);
    visiting.add(id); node!.requires.forEach(visit); visiting.delete(id); visited.add(id);
  };
  nodes.forEach(node => visit(node.id));
  // Checking against fresh source metadata also rejects silent substitution or loss of a legacy node.
  for (const expected of createTreeDraft()) {
    const actual = byId.get(expected.id);
    if (!actual || actual.sourceId !== expected.sourceId || actual.source !== expected.source
      || actual.category !== expected.category || actual.branch !== expected.branch
      || actual.requires.length !== expected.requires.length
      || expected.requires.some(id => !actual.requires.includes(id))) fail(`source or dependency changed ${expected.id}`);
  }
}

validateCampaignTreeDraft();
