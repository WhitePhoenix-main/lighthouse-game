import type { ApplicationView, UpgradeNodeView } from '../../contracts';
import { buildUnifiedSkillGraph, skillAncestors, type SkillCategory, type SkillGraphNode } from './skillTreeModel';
import { skillSprite } from './skillTreeArtwork';
import { lensProperties, lensUpgradeEffect } from '../shared/lenses';
import { translate } from '../shared/localization';

export interface SkillTreeState {
  category: SkillCategory | 'all';
  selectedId?: string;
  branch: string;
  query: string;
  zoom: number;
  inspectorOpen: boolean;
}
export const createSkillTreeState = (): SkillTreeState => ({ category: 'all', branch: 'all', query: '', zoom: .55, inspectorOpen: false });
export const SKILL_MIN_ZOOM = .06;
export const SKILL_MAX_ZOOM = 1.5;
export const SKILL_INTERACTION_ZOOM = .35;
const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const statuses = { purchased: 'Изучено', available: 'Доступно для изучения', requires: 'Нужно открыть', insufficient: 'Не хватает ресурсов' };
export const skillCategories: readonly { id: SkillCategory; name: string; icon: string }[] = [
  { id: 'lighthouse', name: 'Маяк', icon: 'hull' }, { id: 'devices', name: 'Устройства', icon: 'engineering' },
  { id: 'lenses', name: 'Линзы', icon: 'lens' }, { id: 'abilities', name: 'Способности', icon: 'flash' },
];
export const skillLettering = (text: string): string => `<span class="skill-lettering" data-skill-lettering="${escape(text)}"><span class="skill-label-fallback">${escape(text)}</span><canvas aria-hidden="true"></canvas></span>`;
export const isSkillMilestone = (node: SkillGraphNode): boolean => node.kind === 'lens-unlock' || node.sourceId.startsWith('unlock-');

/** Match both languages while displaying one stable, common map. */
export function matchingSkills(nodes: readonly SkillGraphNode[], query: string): Set<string> {
  const normalized = query.trim().toLocaleLowerCase();
  return new Set(nodes.filter(n => !normalized || (n.name + ' ' + n.branchName + ' ' + translate(n.name + ' ' + n.branchName, 'en')).toLocaleLowerCase().includes(normalized)).map(n => n.id));
}

/** Angular, clipped connections like the reference; these represent actual prerequisites only. */
function connection(from: SkillGraphNode, to: SkillGraphNode): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const bend = Math.abs(dx) > Math.abs(dy)
    ? { x: to.x - Math.sign(dx) * diagonal, y: from.y }
    : { x: from.x, y: to.y - Math.sign(dy) * diagonal };
  const startDirection = Math.hypot(bend.x - from.x, bend.y - from.y) > 1 ? bend : to;
  const endDirection = Math.hypot(to.x - bend.x, to.y - bend.y) > 1 ? bend : from;
  const startAngle = Math.atan2(startDirection.y - from.y, startDirection.x - from.x);
  const endAngle = Math.atan2(endDirection.y - to.y, endDirection.x - to.x);
  const startRadius = isSkillMilestone(from) ? 40 : 30, endRadius = isSkillMilestone(to) ? 40 : 30;
  return `M${from.x + Math.cos(startAngle) * startRadius} ${from.y + Math.sin(startAngle) * startRadius}L${bend.x} ${bend.y}L${to.x + Math.cos(endAngle) * endRadius} ${to.y + Math.sin(endAngle) * endRadius}`;
}

export function skillTree(view: ApplicationView, state: SkillTreeState, details: (node: UpgradeNodeView) => string): string {
  const graph = buildUnifiedSkillGraph(view);
  const selected = graph.nodes.find(n => n.id === state.selectedId);
  const ancestors = selected ? skillAncestors(graph.nodes, selected.id) : new Set<string>();
  const matches = matchingSkills(graph.nodes, state.query);
  const hasQuery = !!state.query.trim();
  const focused = (n: SkillGraphNode): boolean => (state.category === 'all' || n.category === state.category) && (state.branch === 'all' || `${n.category}:${n.branch}` === state.branch);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const edges = graph.edges.map(e => {
    const from = byId.get(e.from)!, to = byId.get(e.to)!;
    const purchased = from.status === 'purchased' && to.status === 'purchased';
    const related = selected && ancestors.has(from.id) && (ancestors.has(to.id) || to.id === selected.id);
    return `<path d="${connection(from, to)}" data-from="${from.id}" data-to="${to.id}" data-state="${purchased ? 'purchased' : from.status === 'purchased' ? 'available' : 'locked'}" data-related="${!!related}" data-focused="${focused(from) && focused(to)}" data-cross-category="${from.category !== to.category}"/>`;
  }).join('');
  const nodes = graph.nodes.map(n => {
    const cost = n.status === 'purchased' ? 'Изучено' : `${n.cost} ${n.currency === 'materials' ? '◉' : '◈'}${n.kind === 'lens-upgrade' ? lensMaterialCost(view, n.sourceId) : ''}`;
    return `<button class="skill-node ${n.status}" data-tree-action="select" data-skill="${n.id}" ${n.kind === 'upgrade' ? `data-action="select-upgrade" data-upgrade="${n.sourceId}"` : ''} data-status="${n.status}" data-milestone="${isSkillMilestone(n)}" data-branch="${n.category}:${n.branch}" data-related="${ancestors.has(n.id)}" data-match="${!hasQuery || matches.has(n.id)}" data-search-match="${hasQuery && matches.has(n.id)}" data-focused="${focused(n)}" data-focus-key="skill:${n.id}" aria-pressed="${n.id === selected?.id}" aria-label="${escape(n.name)} · ${statuses[n.status]} · ${cost}" title="${escape(n.name)} · ${cost}" ${state.zoom < SKILL_INTERACTION_ZOOM ? 'tabindex="-1"' : ''} style="left:${n.x}px;top:${n.y}px"><span class="skill-node-medallion">${skillSprite(n.icon)}</span><span class="skill-node-rank">${n.tier}</span><span class="skill-node-mark">${n.status === 'purchased' ? '✓' : ''}</span><span class="skill-node-name">${escape(n.name)}</span><span class="skill-node-cost">${cost}</span></button>`;
  }).join('');
  const bought = graph.nodes.filter(n => n.status === 'purchased').length;
  return `<section class="skill-tree-screen" data-category="${state.category}" data-overview="${state.zoom < SKILL_INTERACTION_ZOOM}" data-detail="${state.zoom >= .55 && state.category !== 'all'}">
    <header class="skill-header"><button class="skill-back" data-action="back" ${view.error ? 'disabled' : ''}>${skillLettering('Назад')}</button><div class="skill-title"><span class="skill-eyebrow">ИСКУССТВО СВЕТА</span><h1 tabindex="-1">${skillLettering('Древо улучшений')}</h1></div><div class="skill-wallet"><span class="skill-wallet-item">${skillSprite('shard')}<span><small>Осколки</small><strong>${skillLettering(String(view.profile.resources))}</strong></span></span><span class="skill-wallet-item">${skillSprite('pearl')}<span><small>Жемчуг глубин</small><strong>${skillLettering(String(view.profile.bossMaterials))}</strong></span></span></div></header>
    <div class="skill-workspace"><main class="skill-map-panel"><div class="skill-map-toolbar"><nav class="skill-focus-filters" aria-label="Ветви развития"><button class="skill-focus-filter" data-tree-action="category" data-category="all" aria-pressed="${state.category === 'all'}">${skillLettering('Всё древо')}</button>${skillCategories.map(c => `<button class="skill-focus-filter" data-tree-action="category" data-category="${c.id}" aria-pressed="${c.id === state.category}">${skillSprite(c.icon)}${skillLettering(c.name)}</button>`).join('')}</nav><div class="skill-map-tools"><select class="skill-branch-filter" data-tree-branch aria-label="Ветвь"><option value="all">Все ветви</option>${graph.branches.filter(b => state.category === 'all' || b.id.startsWith(state.category + ':')).map(b => `<option value="${b.id}" ${b.id === state.branch ? 'selected' : ''}>${escape(b.name)}</option>`).join('')}</select><label class="skill-search">${skillSprite('search')}<input data-tree-search type="search" placeholder="Найти улучшение" aria-label="Найти улучшение" value="${escape(state.query)}"></label></div></div>
    <div class="skill-viewport" tabindex="0" aria-label="Карта улучшений. Перетаскивайте для перемещения; используйте кнопки масштаба."><div class="skill-canvas-frame" style="width:${graph.width * state.zoom}px;height:${graph.height * state.zoom}px"><div class="skill-canvas" style="width:${graph.width}px;height:${graph.height}px;--skill-zoom:${state.zoom}"><svg class="skill-connections" width="${graph.width}" height="${graph.height}" aria-hidden="true">${edges}</svg>${graph.branches.map(b => `<div class="skill-branch-label" data-focused="${(state.category === 'all' || b.id.startsWith(state.category + ':')) && (state.branch === 'all' || b.id === state.branch)}" style="left:${b.x}px;top:${b.y}px">${skillLettering(b.name)}</div>`).join('')}${graph.regions.map(r => `<button class="skill-region-label" data-tree-action="category" data-category="${r.id}" data-focus-key="tree:region:${r.id}" style="left:${r.x}px;top:${r.y}px">${skillSprite(r.icon)}${skillLettering(r.name)}</button>`).join('')}<div class="skill-root" style="left:${graph.center.x}px;top:${graph.center.y}px">${skillSprite('lighthouse')}${skillLettering('Маяк')}<small>${bought} / ${graph.nodes.length}</small></div>${nodes}</div></div>${hasQuery && !matches.size ? '<p class="skill-empty" role="status">Улучшения не найдены</p>' : ''}</div>
    <div class="skill-map-footer"><div class="skill-legend"><span><i class="learned"></i>Изучено</span><span><i class="ready"></i>Доступно</span><span><i class="locked"></i>Закрыто</span></div><p class="skill-map-hint">${state.zoom < SKILL_INTERACTION_ZOOM ? 'Нажмите карту, чтобы приблизить' : 'Перетаскивайте карту · Выберите узел, чтобы узнать больше'}</p><div class="skill-zoom-controls"><button class="skill-overview-button" data-tree-action="overview" data-focus-key="tree:overview" aria-label="Обзор всего древа">${skillLettering('Обзор')}</button><button data-tree-action="zoom-out" data-focus-key="tree:zoom-out" aria-label="Уменьшить масштаб" ${state.zoom <= SKILL_MIN_ZOOM ? 'disabled' : ''}>−</button><output>${Math.round(state.zoom * 100)}%</output><button data-tree-action="zoom-in" data-focus-key="tree:zoom-in" aria-label="Увеличить масштаб" ${state.zoom >= SKILL_MAX_ZOOM ? 'disabled' : ''}>+</button><button data-tree-action="center" data-focus-key="tree:center" aria-label="К выбранному узлу">⌖</button></div></div></main>
    <aside class="skill-inspector" id="upgrade-details" aria-live="polite" aria-atomic="true" ${!state.inspectorOpen || !selected ? 'hidden' : ''}><button class="skill-inspector-close" data-tree-action="close-inspector" data-focus-key="tree:close" aria-label="Закрыть карточку">×</button>${selected ? inspector(view, selected, graph.nodes, details) : ''}</aside></div>
    <footer class="skill-screen-footer"><small>${bought} / ${graph.nodes.length} изучено</small><p>Каждая искра делает ночь короче.</p><small>Покупки сохраняются. Цены и эффекты предварительные.</small></footer></section>`;
}

function inspector(view: ApplicationView, node: SkillGraphNode, nodes: readonly SkillGraphNode[], details: (node: UpgradeNodeView) => string): string {
  const content = inspectorContent(view, node, nodes, details);
  const actionStart = content.indexOf('<button class="skill-purchase-button"');
  return `<div class="skill-inspector-body">${content.slice(0, actionStart)}</div><div class="skill-inspector-actions">${content.slice(actionStart)}</div>`;
}

function inspectorContent(view: ApplicationView, node: SkillGraphNode, nodes: readonly SkillGraphNode[], details: (node: UpgradeNodeView) => string): string {
  const intro = `<div class="skill-inspector-heading">ВЫБРАННОЕ УЛУЧШЕНИЕ</div><div class="skill-inspector-emblem">${skillSprite(node.icon)}</div><div class="skill-inspector-branch">${escape(node.branchName)} · ${node.tier}</div>`;
  if (node.kind === 'upgrade') return intro + details(view.upgrades.find(n => n.definition.id === node.sourceId)!);
  const lens = view.lenses.find(l => node.kind === 'lens-unlock' ? l.definition.id === node.sourceId : l.upgrades.some(n => n.definition.id === node.sourceId))!;
  const upgrade = lens.upgrades.find(n => n.definition.id === node.sourceId);
  const cost = upgrade ? `${upgrade.definition.cost} ◈${upgrade.definition.materialCost ? ` + ${upgrade.definition.materialCost} ◉` : ''}` : `${lens.definition.materialCost} ◉`;
  const requirements = node.requires.map(id => {
    const parent = nodes.find(n => n.id === id);
    return `<li data-met="${parent?.status === 'purchased'}">${parent?.status === 'purchased' ? '✓' : '◇'} <button class="skill-requirement-link" data-tree-action="reveal" data-skill-target="${id}">${escape(parent?.name ?? id)}</button></li>`;
  }).join('');
  return `${intro}<h2>${escape(node.name)}</h2><span class="skill-state" data-status="${node.status}">${statuses[node.status]}</span><p class="skill-effect">${escape(upgrade ? upgrade.definition.description + ' ' + lensUpgradeEffect(upgrade.definition) : lens.definition.description)}</p>${!upgrade ? `<p class="skill-reason">${escape(lensProperties(lens.definition))}</p>` : ''}<div class="skill-requirements"><h3>Требования</h3><ul>${requirements || '<li data-met="true">Без предыдущих улучшений</li>'}</ul></div><p class="skill-reason">${escape(node.reason)}</p><button class="skill-purchase-button" data-action="${upgrade ? 'purchase-lens-upgrade' : 'purchase-lens'}" ${upgrade ? `data-lens-upgrade="${upgrade.definition.id}"` : `data-lens="${lens.definition.id}"`} ${node.status !== 'available' || view.error ? 'disabled' : ''}>${node.status === 'purchased' ? '✓ Изучено' : `Изучить · ${cost}`}</button><small class="skill-permanent-note">Постоянное улучшение · сохранится между ночами</small>`;
}

function lensMaterialCost(view: ApplicationView, id: string): string {
  const cost = view.lenses.flatMap(l => l.upgrades).find(n => n.definition.id === id)?.definition.materialCost ?? 0;
  return cost ? ' + ' + cost + ' ◉' : '';
}
