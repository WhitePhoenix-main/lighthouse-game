import { describe, expect, it } from 'vitest';
import { LighthouseApplication } from '../src/application/gameApplication';
import type { ApplicationView, UpgradeStatus } from '../src/contracts';
import { NIGHT_CONFIG } from '../src/content/night';
import { CAMPAIGN_TREE_DRAFT } from '../src/content/campaignTreeDraft';
import { screenContent, upgradeValue } from '../src/presentation/screens';
import { createSkillTreeState, matchingSkills } from '../src/presentation/skill-tree/skillTree';
import { buildSkillGraph, buildUnifiedSkillGraph, type SkillCategory } from '../src/presentation/skill-tree/skillTreeModel';

const categories: readonly SkillCategory[] = ['lighthouse', 'devices', 'lenses', 'abilities'];
function fixture() {
  let writes = 0;
  const app = new LighthouseApplication({ read: () => null, write: () => { writes++; } }, NIGHT_CONFIG,
    () => ({ id: 'presentation-test', seed: 12 }));
  app.view.screen = 'development';
  return { view: app.view, writes: () => writes };
}
function render(view: ApplicationView, category: SkillCategory, selectedId?: string): string {
  return screenContent(view, undefined, false, false, { ...createSkillTreeState(), category, selectedId, inspectorOpen: !!selectedId });
}
const buttons = (html: string): string[] => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
const inspector = (html: string): string => html.match(/<aside\b[^>]*class="skill-inspector"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? '';
function purchase(html: string): string {
  const found = buttons(inspector(html)).filter(button => button.includes('class="skill-purchase-button"'));
  expect(found).toHaveLength(1);
  return found[0]!;
}
function setUpgradeStatus(view: ApplicationView, id: string, status: UpgradeStatus): void {
  view.upgrades = view.upgrades.map(node => node.definition.id === id ? { ...node, status } : node);
}
function setLensStatus(view: ApplicationView, status: UpgradeStatus): void {
  view.lenses = view.lenses.map(lens => ({ ...lens,
    upgrades: lens.upgrades.map(node => node.definition.id === 'expanded-width' ? { ...node, status } : node) }));
}

describe('skill tree presentation regressions', () => {
  it('starts with one unobstructed overview and opens details only on an explicit selection', () => {
    const { view } = fixture();
    const initial = screenContent(view, undefined, false);
    expect(initial).toMatch(/<aside[^>]*class="skill-inspector"[^>]*hidden/);
    expect([...initial.matchAll(/data-skill="([^"]+)"/g)]).toHaveLength(200);
    const selected = screenContent(view, undefined, false, false, { ...createSkillTreeState(), selectedId: 'beam-power-1', inspectorOpen: true });
    expect(selected).not.toMatch(/<aside[^>]*class="skill-inspector"[^>]*hidden/);
    expect(inspector(selected)).toContain('<h2><span class="skill-lettering" data-skill-lettering="Мощность I">');
  });
  it('indexes original and English labels independently of automatic display language', () => {
    const { view } = fixture();
    const nodes = buildUnifiedSkillGraph(view).nodes;
    expect(matchingSkills(nodes, 'мощность')).toContain('beam-power-1');
    expect(matchingSkills(nodes, 'Power')).toContain('beam-power-1');
    expect(matchingSkills(nodes, 'Cannon')).toContain('unlock-cannon');
    expect(matchingSkills(nodes, 'no such skill')).toEqual(new Set());
  });
  it('keeps all real purchases in one graph when focusing any category, without adding planning-only nodes', () => {
    const { view } = fixture();
    const html = render(view, 'lighthouse');
    const actual = [...html.matchAll(/data-skill="([^"]+)"/g)].map(match => match[1]!);
    const expected = [...view.upgrades.map(node => node.definition.id),
      ...view.lenses.flatMap(lens => [...(lens.definition.id === 'basic' ? [] : [`lens-unlock-${lens.definition.id}`]),
        ...lens.upgrades.map(node => node.definition.id)])];
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(actual).size).toBe(actual.length);
    for (const draft of CAMPAIGN_TREE_DRAFT.filter(node => node.source === 'general-draft' || node.source === 'ability-draft')) {
      expect(actual).not.toContain(draft.id);
    }
    for (const category of categories) {
      const focused = render(view, category);
      expect(focused).toContain(`data-category="${category}" aria-pressed="true"`);
      expect([...focused.matchAll(/data-skill="([^"]+)"/g)].map(match => match[1]!).sort()).toEqual(expected.sort());
    }
  });

  it('changes the selected inspector and pressed node without mutating profile or saving purchases', () => {
    const { view, writes } = fixture();
    const profile = structuredClone(view.profile), savedBefore = writes();
    for (const category of categories) {
      for (const node of buildSkillGraph(view, category).nodes) {
        const html = render(view, category, node.id);
        const selected = buttons(html).find(button => button.includes(`data-skill="${node.id}"`))!;
        expect(selected).toContain('aria-pressed="true"');
        expect(inspector(html).match(/<h2>(.*?)<\/h2>/)?.[1]).toContain(node.name);
      }
    }
    expect(view.profile).toEqual(profile);
    expect(writes()).toBe(savedBefore);
  });

  it('shows the selected cannon current/next parameter and every upgrade/night requirement', () => {
    const { view } = fixture();
    const node = view.upgrades.find(node => node.definition.id === 'cannon-speed-2')!;
    const html = inspector(render(view, 'devices', node.definition.id));
    expect(html).toContain(`<span class="skill-before">${upgradeValue(node.definition.effect.stat, node.currentValue)}</span>`);
    expect(html).toContain(`<strong class="skill-after">${upgradeValue(node.definition.effect.stat, node.nextValue)}</strong>`);
    for (const id of node.definition.requires) expect(html).toContain(view.upgrades.find(parent => parent.definition.id === id)!.definition.name);
    const night = view.nights.find(night => night.id === node.definition.requiresNight);
    expect(html).toContain(`Победа: ${night?.name ?? node.definition.requiresNight}`);
  });

  it('explains prerequisites from another category in the selected equipment-slot upgrade', () => {
    const { view } = fixture();
    const html = inspector(render(view, 'lighthouse', 'device-slots-3'));
    expect(html).toContain('Пушки');
    expect(html).toContain('Барьеры');
    expect(html).toContain('Победа:');
    expect(html).toContain('data-met="false"');
    // The single map exposes the same prerequisites as actual inter-category links.
    expect(render(view, 'lighthouse', 'device-slots-3')).toContain('data-from="unlock-cannon" data-to="device-slots-3"');
  });

  it.each(['purchased', 'requires', 'insufficient'] as const)('disables ordinary and lens purchases for %s nodes', status => {
    const { view } = fixture();
    setUpgradeStatus(view, 'cannon-damage-1', status);
    setLensStatus(view, status);
    expect(purchase(render(view, 'devices', 'cannon-damage-1'))).toMatch(/<button\b[^>]*\bdisabled\b/);
    expect(purchase(render(view, 'lenses', 'expanded-width'))).toMatch(/<button\b[^>]*\bdisabled\b/);
  });

  it('enables available purchases and blocks them if saving has failed', () => {
    const { view } = fixture();
    setUpgradeStatus(view, 'cannon-damage-1', 'available');
    setLensStatus(view, 'available');
    view.lenses = view.lenses.map(lens => lens.definition.id === 'expanded' ? { ...lens, canPurchase: true } : lens);
    const selections: readonly [SkillCategory, string][] = [
      ['devices', 'cannon-damage-1'], ['lenses', 'expanded-width'], ['lenses', 'lens-unlock-expanded'],
    ];
    for (const [category, id] of selections) expect(purchase(render(view, category, id))).not.toMatch(/\bdisabled\b/);
    view.error = 'Не удалось сохранить профиль';
    for (const [category, id] of selections) expect(purchase(render(view, category, id))).toMatch(/<button\b[^>]*\bdisabled\b/);
  });

  it('disables already owned and unaffordable lens unlocks', () => {
    const { view } = fixture();
    expect(purchase(render(view, 'lenses', 'lens-unlock-expanded'))).toMatch(/\bdisabled\b/);
    view.lenses = view.lenses.map(lens => lens.definition.id === 'expanded' ? { ...lens, unlocked: true } : lens);
    expect(purchase(render(view, 'lenses', 'lens-unlock-expanded'))).toContain('Изучено');
    expect(purchase(render(view, 'lenses', 'lens-unlock-expanded'))).toMatch(/\bdisabled\b/);
  });

  it('shows both currencies on a lens upgrade map node and inspector, with unlock before upgrade requirements', () => {
    const { view } = fixture();
    const lens = view.lenses.find(lens => lens.definition.id === 'expanded')!;
    const upgrade = lens.upgrades.find(node => node.definition.id === 'expanded-targets')!;
    const html = render(view, 'lenses', upgrade.definition.id);
    const mapNode = buttons(html).find(button => button.includes(`data-skill="${upgrade.definition.id}"`))!;
    const cost = `${upgrade.definition.cost} ◈ + ${upgrade.definition.materialCost} ◉`;
    expect(mapNode).toContain(cost);
    expect(purchase(html)).toContain(cost);
    const requirements = inspector(html).match(/<div class="skill-requirements">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(requirements).toContain('Расширенная');
    expect(requirements).toContain('Широкий сектор');
    expect(requirements.indexOf('Расширенная')).toBeLessThan(requirements.indexOf('Широкий сектор'));
    expect(purchase(render(view, 'lenses', 'lens-unlock-expanded'))).toContain(`${lens.definition.materialCost} ◉`);
  });

  it('highlights only actual links on the selected lens route, including both parents of a merged node', () => {
    const { view } = fixture();
    const graph = buildUnifiedSkillGraph(view);
    const html = render(view, 'lenses', 'basic-paired');
    const paths = html.match(/<path\b[^>]*data-related="true"[^>]*\/>/g) ?? [];
    const expectedEdges = [
      ['basic-power-1', 'basic-power-2'], ['basic-power-1', 'basic-width'],
      ['basic-power-2', 'basic-paired'], ['basic-width', 'basic-paired'],
    ];
    expect(paths).toHaveLength(expectedEdges.length);
    for (const [fromId, toId] of expectedEdges) {
      expect(graph.edges).toContainEqual({ from: fromId, to: toId });
      expect(paths.some(path => path.includes(`data-from="${fromId}" data-to="${toId}"`))).toBe(true);
    }
    const unrelated = buttons(html).find(button => button.includes('data-skill="basic-range"'))!;
    expect(unrelated).toContain('data-related="false"');
    const relatedIds = buttons(html).filter(button => button.includes('data-related="true"'))
      .map(button => button.match(/data-skill="([^"]+)"/)?.[1]);
    expect(relatedIds.sort()).toEqual(['basic-power-1', 'basic-power-2', 'basic-width']);
  });
});
