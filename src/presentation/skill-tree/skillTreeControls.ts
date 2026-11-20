import type { ApplicationView } from '../../contracts';
import { buildUnifiedSkillGraph } from './skillTreeModel';
import { matchingSkills, skillCategories, SKILL_MIN_ZOOM, SKILL_MAX_ZOOM, SKILL_INTERACTION_ZOOM, type SkillTreeState } from './skillTree';

type Point = { x: number; y: number };

/** One camera for the whole tree. Focus filters never replace the graph or change purchases. */
export function mountSkillTreeControls(root: HTMLElement, state: SkillTreeState, view: () => ApplicationView, render: () => void) {
  let camera: Point | undefined;
  let initialized = false;
  let cameraMode: 'all' | 'focus' | 'manual' = 'all';
  let geometry = { width: 0, height: 0, left: 0, top: 0, anchor: { x: 0, y: 0 }, zoom: 1, axisX: 1 };
  let suppressClick = false;
  let drag: { pointer: number; x: number; y: number; left: number; top: number; moved: boolean; element: HTMLElement } | null = null;
  const viewport = (): HTMLElement | null => root.querySelector('.skill-viewport');
  const portraitLayout = window.matchMedia('(max-width: 650px) and (orientation: portrait)');
  const compactLayout = window.matchMedia('(max-width: 650px) and (orientation: portrait), (max-height: 500px) and (orientation: landscape)');
  const minimumZoom = () => compactLayout.matches ? .03 : SKILL_MIN_ZOOM;
  const wideLayout = window.matchMedia('(min-width: 1200px) and (min-aspect-ratio: 8/5)');
  const horizontalScale = () => wideLayout.matches ? 1.24 : 1;
  let projection: { upgrades: ApplicationView['upgrades']; lenses: ApplicationView['lenses']; textSize: string; map: ReturnType<typeof buildUnifiedSkillGraph> } | undefined;
  const graph = () => {
    const current = view();
    if (!projection || projection.upgrades !== current.upgrades || projection.lenses !== current.lenses || projection.textSize !== current.settings.textSize)
      projection = { upgrades: current.upgrades, lenses: current.lenses, textSize: current.settings.textSize, map: buildUnifiedSkillGraph(current) };
    return projection.map;
  };
  let pinch: { distance: number; zoom: number; world: Point } | undefined;
  // Live gesture geometry stays outside treeState: Phaser observes that state every frame.
  let gestureZoom: number | undefined;
  function usableHeight(element: HTMLElement): number {
    const zoomControls = root.querySelector('.skill-zoom-controls')?.getBoundingClientRect();
    return zoomControls ? Math.max(0, Math.min(element.clientHeight, zoomControls.top - element.getBoundingClientRect().top)) : element.clientHeight;
  }
  function visibleAnchor(element: HTMLElement): Point {
    const portraitInspector = portraitLayout.matches && state.inspectorOpen;
    return { x: element.clientWidth * (portraitInspector ? .55 : .5), y: usableHeight(element) * (portraitInspector ? .42 : .5) };
  }
  function sameSize(element: HTMLElement): boolean {
    return element.clientWidth === geometry.width && element.clientHeight === geometry.height;
  }
  function sameLayout(element: HTMLElement, anchor: Point): boolean {
    return sameSize(element) && horizontalScale() === geometry.axisX && anchor.x === geometry.anchor.x && anchor.y === geometry.anchor.y;
  }
  function capture(): void {
    const element = viewport();
    // A viewport can clamp its scroll offsets during resize before the camera is restored.
    if (element && sameSize(element)) camera = { x: element.scrollLeft, y: element.scrollTop };
  }
  function trackScroll(event: Event): void {
    if (event.target instanceof HTMLElement && event.target.matches('.skill-viewport')) capture();
  }
  function worldAt(offsetX: number, offsetY: number): Point {
    return { x: offsetX / (geometry.zoom * geometry.axisX), y: offsetY / geometry.zoom };
  }
  function cameraWorld(scroll: Point, anchor = geometry.anchor): Point {
    return worldAt(scroll.x + anchor.x - geometry.left, scroll.y + anchor.y - geometry.top);
  }
  function scaleCanvas(): void {
    const element = viewport(), frame = root.querySelector<HTMLElement>('.skill-canvas-frame'), canvas = root.querySelector<HTMLElement>('.skill-canvas');
    if (!element || !frame || !canvas) return;
    const map = graph();
    const zoom = gestureZoom ?? state.zoom, axisX = horizontalScale();
    const overview = zoom < SKILL_INTERACTION_ZOOM;
    const availableHeight = compactLayout.matches && overview ? usableHeight(element) : element.clientHeight;
    frame.style.width = `${map.width * zoom * axisX}px`;
    frame.style.height = `${map.height * zoom}px`;
    frame.style.marginTop = `${Math.max(0, (availableHeight - map.height * zoom) / 2)}px`;
    canvas.style.setProperty('--skill-zoom', String(zoom));
    canvas.style.setProperty('--skill-axis-x', String(axisX));
    root.querySelector<HTMLElement>('.skill-tree-screen')!.dataset.overview = String(overview);
    root.querySelector<HTMLElement>('.skill-tree-screen')!.dataset.detail = String(zoom >= .55 && state.category !== 'all');
    root.querySelectorAll<HTMLElement>('.skill-node').forEach(node => { node.tabIndex = zoom < SKILL_INTERACTION_ZOOM ? -1 : 0; });
    const output = root.querySelector('output'); if (output) output.textContent = `${Math.round(zoom * 100)}%`;
    const minus = root.querySelector<HTMLButtonElement>('[data-tree-action="zoom-out"]'), plus = root.querySelector<HTMLButtonElement>('[data-tree-action="zoom-in"]');
    if (minus) minus.disabled = zoom <= minimumZoom();
    if (plus) plus.disabled = zoom >= SKILL_MAX_ZOOM;
    geometry = { width: element.clientWidth, height: element.clientHeight, left: frame.offsetLeft, top: frame.offsetTop, anchor: visibleAnchor(element), zoom, axisX };
  }
  function centerPoint(x: number, y: number, anchor = geometry.anchor): void {
    const element = viewport();
    if (!element) return;
    element.scrollLeft = x * geometry.zoom * geometry.axisX + geometry.left - anchor.x;
    element.scrollTop = y * geometry.zoom + geometry.top - anchor.y;
    capture();
  }
  function center(id = state.selectedId): void {
    const map = graph();
    const node = map.nodes.find(n => n.id === id);
    centerPoint(node?.x ?? map.center.x, node?.y ?? map.center.y);
  }
  function fit(kind: 'all' | 'focus', redraw = true): void {
    const element = viewport(); if (!element) return;
    const map = graph();
    const nodes = kind === 'all' ? map.nodes : map.nodes.filter(n => (state.category === 'all' || n.category === state.category) && (state.branch === 'all' || `${n.category}:${n.branch}` === state.branch));
    if (!nodes.length) return;
    const left = Math.min(...nodes.map(n => n.x)) - 90, right = Math.max(...nodes.map(n => n.x)) + 90;
    const top = Math.min(...nodes.map(n => n.y)) - 90, bottom = Math.max(...nodes.map(n => n.y)) + 90;
    cameraMode = kind;
    const availableHeight = compactLayout.matches ? usableHeight(element) - 12 : element.clientHeight - 90;
    state.zoom = Math.max(minimumZoom(), Math.min(kind === 'all' ? .85 : 1, (element.clientWidth - 36) / ((right - left) * horizontalScale()), availableHeight / (bottom - top)));
    const mobileFocus = kind === 'focus' && compactLayout.matches;
    if (mobileFocus) state.zoom = Math.max(.55, state.zoom);
    if (redraw) render();
    scaleCanvas();
    if (mobileFocus) {
      const nearest = (status: string) => nodes.filter(n => n.status === status).sort((a, b) => Math.hypot(a.x - map.center.x, a.y - map.center.y) - Math.hypot(b.x - map.center.x, b.y - map.center.y))[0];
      const anchor = nearest('available') ?? nearest('purchased') ?? nodes[0]!;
      centerPoint(anchor.x, anchor.y);
    } else centerPoint((left + right) / 2, (top + bottom) / 2);
  }
  function reflow(element: HTMLElement): void {
    if (cameraMode !== 'manual') { fit(cameraMode, false); return; }
    const point = cameraWorld(camera ?? { x: element.scrollLeft, y: element.scrollTop });
    scaleCanvas();
    centerPoint(point.x, point.y);
  }
  function restore(): void {
    const element = viewport(); if (!element) return;
    if (!initialized) {
      initialized = true;
      fit('all', false);
      return;
    }
    if (!sameLayout(element, visibleAnchor(element))) { reflow(element); return; }
    scaleCanvas();
    if (camera) { element.scrollLeft = camera.x; element.scrollTop = camera.y; }
    capture();
  }
  function applyZoom(value: number, point: Point, anchor: Point, redraw = true): void {
    cameraMode = 'manual';
    const zoom = Math.max(minimumZoom(), Math.min(SKILL_MAX_ZOOM, Math.round(value * 100) / 100));
    if (redraw) { gestureZoom = undefined; state.zoom = zoom; render(); }
    else gestureZoom = zoom;
    scaleCanvas();
    centerPoint(point.x, point.y, anchor);
  }
  function zoom(change: number, target?: Point): void {
    const element = viewport();
    if (!element) return;
    const anchor = visibleAnchor(element);
    applyZoom(state.zoom + change, target ?? cameraWorld({ x: element.scrollLeft, y: element.scrollTop }, anchor), anchor);
  }
  function stepZoom(direction: 1 | -1, target?: Point): void {
    const next = compactLayout.matches ? state.zoom * 1.4 ** direction : state.zoom + direction * .1;
    zoom(next - state.zoom, target);
  }
  function select(id: string | undefined, recenter = false): void {
    if (!id || !graph().nodes.some(n => n.id === id)) return;
    cameraMode = 'manual'; state.selectedId = id; state.inspectorOpen = true; render();
    if (recenter || portraitLayout.matches) { center(id); return; }
    const node = root.querySelector<HTMLElement>(`[data-skill="${id}"]`), element = viewport();
    if (node && element) {
      const bounds = element.getBoundingClientRect(), rect = node.getBoundingClientRect();
      const controls = root.querySelector('.skill-zoom-controls')?.getBoundingClientRect();
      const coversNode = controls && rect.bottom > controls.top && rect.top < controls.bottom && rect.right > controls.left && rect.left < controls.right;
      if (rect.left < bounds.left || rect.right > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom || coversNode) center(id);
    }
  }
  function click(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      if (event.target instanceof Element && event.target.closest('.skill-viewport')) { event.stopPropagation(); event.preventDefault(); return; }
    }
    if (!(event.target instanceof Element) || view().screen !== 'development') return;
    const target = event.target.closest<HTMLElement>('[data-tree-action]');
    if (!target) {
      const element = viewport(), frame = root.querySelector<HTMLElement>('.skill-canvas-frame');
      if (state.zoom < SKILL_INTERACTION_ZOOM && element?.contains(event.target) && frame) {
        event.stopPropagation();
        const bounds = frame.getBoundingClientRect();
        const point = worldAt(event.clientX - bounds.left, event.clientY - bounds.top);
        if (compactLayout.matches) stepZoom(1, point);
        else zoom(.65 - state.zoom, point);
      }
      return;
    }
    if (target instanceof HTMLButtonElement && target.disabled) return;
    event.stopPropagation();
    const action = target.dataset.treeAction;
    if (action === 'select') select(target.dataset.skill);
    if (action === 'reveal') {
      const node = graph().nodes.find(n => n.id === target.dataset.skillTarget);
      if (!node) return;
      state.category = node.category; state.branch = 'all'; state.query = '';
      state.zoom = Math.max(.65, state.zoom); select(node.id, true);
    }
    if (action === 'category') {
      const category = target.dataset.category === 'all' ? 'all' : skillCategories.find(c => c.id === target.dataset.category)?.id;
      if (!category) return;
      state.category = category; state.branch = 'all'; state.query = ''; state.inspectorOpen = false;
      render(); fit(category === 'all' ? 'all' : 'focus');
      const tab = root.querySelector<HTMLElement>(`.skill-focus-filter[data-category="${category}"]`);
      tab?.focus({ preventScroll: true });
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (action === 'close-inspector') { state.inspectorOpen = false; render(); root.querySelector<HTMLElement>(`[data-skill="${state.selectedId}"]`)?.focus({ preventScroll: true }); }
    if (action === 'zoom-in') stepZoom(1);
    if (action === 'zoom-out') stepZoom(-1);
    if (action === 'center') { if (state.zoom < .45) zoom(.65 - state.zoom); center(); }
    if (action === 'overview') { state.category = 'all'; state.branch = 'all'; state.query = ''; state.inspectorOpen = false; render(); fit('all'); }
  }
  function search(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-tree-search]')) return;
    if (event instanceof InputEvent && event.isComposing) return;
    if (state.query === event.target.value) return;
    const start = event.target.selectionStart, end = event.target.selectionEnd;
    state.query = event.target.value;
    const map = graph(), matches = matchingSkills(map.nodes, state.query);
    const match = map.nodes.find(n => matches.has(n.id));
    if (match && state.query.trim()) { cameraMode = 'manual'; state.zoom = Math.max(.65, state.zoom); }
    render();
    const input = root.querySelector<HTMLInputElement>('[data-tree-search]'); input?.focus({ preventScroll: true });
    if (start !== null && end !== null) input?.setSelectionRange(start, end);
    if (match && state.query.trim()) center(match.id);
  }
  function branch(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.matches('[data-tree-branch]')) return;
    state.branch = event.target.value; state.inspectorOpen = false; render(); fit(state.branch === 'all' && state.category === 'all' ? 'all' : 'focus');
    root.querySelector<HTMLElement>('[data-tree-branch]')?.focus({ preventScroll: true });
  }
  function down(event: PointerEvent): void {
    suppressClick = false;
    const element = viewport();
    if (!element || !(event.target instanceof Node) || !element.contains(event.target) || event.button !== 0) return;
    cameraMode = 'manual';
    if (event.pointerType !== 'mouse') return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false, element };
  }
  function move(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; drag.element.setPointerCapture(event.pointerId); drag.element.classList.add('is-dragging'); }
    if (drag.moved) { drag.element.scrollLeft = drag.left - dx; drag.element.scrollTop = drag.top - dy; event.preventDefault(); }
  }
  function up(): void {
    if (!drag) return;
    suppressClick = drag.moved; drag.element.classList.remove('is-dragging');
    if (drag.element.hasPointerCapture(drag.pointer)) drag.element.releasePointerCapture(drag.pointer);
    capture(); drag = null;
  }
  function key(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.isComposing) { event.stopPropagation(); return; }
    if (event.key === 'Escape' && state.inspectorOpen && view().screen === 'development') { event.preventDefault(); event.stopPropagation(); state.inspectorOpen = false; render(); root.querySelector<HTMLElement>(`[data-skill="${state.selectedId}"]`)?.focus({ preventScroll: true }); return; }
    if (!event.target.closest('.skill-viewport, .skill-directions')) return;
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault(); event.stopPropagation(); stepZoom(event.key === '-' ? -1 : 1);
      viewport()?.focus({ preventScroll: true }); return;
    }
    const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[event.key];
    if (!direction) return;
    const map = graph(), currentId = event.target.dataset.skill ?? state.selectedId;
    const current = map.nodes.find(n => n.id === currentId) ?? map.center;
    const next = map.nodes.filter(n => (state.category === 'all' || n.category === state.category) && (state.branch === 'all' || `${n.category}:${n.branch}` === state.branch) && (n.x - current.x) * direction[0] + (n.y - current.y) * direction[1] > 1)
      .sort((a, b) => Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y))[0];
    event.preventDefault();
    if (next) { if (state.zoom < .55) zoom(.65 - state.zoom); select(next.id, true); root.querySelector<HTMLElement>(`[data-skill="${next.id}"]`)?.focus({ preventScroll: true }); }
  }
  function wheel(event: WheelEvent): void {
    const element = viewport(), frame = root.querySelector<HTMLElement>('.skill-canvas-frame');
    if (!element || !frame || !(event.target instanceof Node) || !element.contains(event.target)) return;
    if (!event.ctrlKey) {
      if (event.deltaX || event.deltaY) cameraMode = 'manual';
      return;
    }
    if (!event.deltaY) return;
    event.preventDefault();
    const bounds = frame.getBoundingClientRect(), box = element.getBoundingClientRect();
    applyZoom(state.zoom + (event.deltaY < 0 ? .1 : -.1), worldAt(event.clientX - bounds.left, event.clientY - bounds.top), { x: event.clientX - box.left, y: event.clientY - box.top });
  }
  function touchStart(event: TouchEvent): void {
    const element = viewport(), frame = root.querySelector<HTMLElement>('.skill-canvas-frame');
    if (event.touches.length !== 2 || !element || !frame || !(event.target instanceof Node) || !element.contains(event.target)) return;
    event.preventDefault();
    const a = event.touches[0]!, b = event.touches[1]!, bounds = frame.getBoundingClientRect();
    pinch = { distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), zoom: state.zoom,
      world: worldAt((a.clientX + b.clientX) / 2 - bounds.left, (a.clientY + b.clientY) / 2 - bounds.top) };
  }
  function touchMove(event: TouchEvent): void {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const element = viewport(); if (!element) return;
    const a = event.touches[0]!, b = event.touches[1]!, bounds = element.getBoundingClientRect();
    applyZoom(pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.distance, pinch.world,
      { x: (a.clientX + b.clientX) / 2 - bounds.left, y: (a.clientY + b.clientY) / 2 - bounds.top }, false);
  }
  function touchEnd(): void {
    if (!pinch) return;
    state.zoom = gestureZoom ?? state.zoom; gestureZoom = undefined;
    pinch = undefined; suppressClick = true; capture(); render();
  }
  root.addEventListener('click', click); root.addEventListener('input', search); root.addEventListener('compositionend', search); root.addEventListener('change', branch);
  root.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('keydown', key);
  root.addEventListener('wheel', wheel, { passive: false });
  root.addEventListener('scroll', trackScroll, true);
  root.addEventListener('touchstart', touchStart, { passive: false }); root.addEventListener('touchmove', touchMove, { passive: false });
  root.addEventListener('touchend', touchEnd); root.addEventListener('touchcancel', touchEnd);
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  function resize(): void {
    const element = viewport();
    if (!element || !initialized || sameLayout(element, visibleAnchor(element))) return;
    reflow(element);
  }
  return { capture, restore, resize, destroy() {
    root.removeEventListener('click', click); root.removeEventListener('input', search); root.removeEventListener('compositionend', search); root.removeEventListener('change', branch);
    root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move); root.removeEventListener('keydown', key);
    root.removeEventListener('wheel', wheel);
    root.removeEventListener('scroll', trackScroll, true);
    root.removeEventListener('touchstart', touchStart); root.removeEventListener('touchmove', touchMove);
    root.removeEventListener('touchend', touchEnd); root.removeEventListener('touchcancel', touchEnd);
    window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
  } };
}
