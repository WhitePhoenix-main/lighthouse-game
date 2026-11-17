import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({});
for (const file of ['scene-data.js', 'camera-geometry.js']) vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context);
const scene = context.PREPARATION_SCENE;
const g = context.PreparationCameraGeometry;
const sizes = [[360, 360], [390, 390], [844, 280], [1280, 400]];
function assertFits(camera, bounds) {
  const a = g.projectedToScreen({ x: bounds.minX, y: bounds.minY }, camera);
  const b = g.projectedToScreen({ x: bounds.maxX, y: bounds.maxY }, camera);
  const e = 1e-7;
  assert.ok(a.x >= 24 - e && a.y >= 24 - e && b.x <= camera.width - 24 + e && b.y <= camera.height - 24 + e, JSON.stringify({ camera, a, b }));
}

test('the concept reads the base night data and actual device areas', () => {
  assert.equal(scene.source.nightId, 'broken-shore');
  assert.equal(scene.source.profileUpgrades.length, 0);
  assert.equal(scene.rules.spawnRadius, 365);
  assert.equal(scene.rules.beamRange, 300);
  assert.equal(scene.rules.worldRadius, 400);
  const cannon = scene.objects.find(o => o.kind === 'cannon');
  assert.equal(cannon.range, scene.deviceDefinitions.cannon.range);
  assert.equal(cannon.range, 160);
  const barrier = scene.objects.find(o => o.kind === 'barrier');
  assert.equal(g.selectedArea(scene, barrier).radius, scene.deviceDefinitions.barrier.radius);
  assert.equal(g.selectedArea(scene, barrier).radius, 26);
  const shield = g.selectedArea(scene, { kind: 'generator', x: -200, y: 80, radius: 18 });
  assert.equal(shield.center.x, 0); assert.equal(shield.center.y, 0);
  assert.equal(shield.radius, scene.rules.shieldRadius);
  assert.equal(g.selectedArea(scene, scene.objects.find(o => o.kind === 'pier')), null);
});

for (const [width, height] of sizes) {
  test(`${width}×${height}: overview contains complete circles and source sprite bounds`, () => {
    for (const selected of [null, ...scene.objects.filter(o => o.kind !== 'pier')]) {
      const camera = g.cameraFor(scene, selected, 'overview', width, height);
      assertFits(camera, g.circleBounds({ x: 0, y: 0 }, scene.rules.spawnRadius, scene.projectionY));
      assertFits(camera, g.circleBounds({ x: 0, y: 0 }, scene.rules.beamRange, scene.projectionY));
      for (const object of scene.objects) assertFits(camera, g.spriteBounds(object, scene.sprites[object.kind], scene.projectionY));
      const area = g.selectedArea(scene, selected);
      if (area) assertFits(camera, g.circleBounds(area.center, area.radius, scene.projectionY));
    }
  });
  test(`${width}×${height}: selecting a border device expands the union and zooms out`, () => {
    const selected = { id: 'test-border', kind: 'cannon', x: -210, y: -210, radius: 16, range: 230 };
    const overview = g.cameraFor(scene, null, 'overview', width, height);
    const camera = g.cameraFor(scene, selected, 'overview', width, height);
    assert.ok(camera.zoom < overview.zoom);
    assertFits(camera, g.circleBounds(selected, selected.range, scene.projectionY));
    assert.ok(camera.bounds.minX < overview.bounds.minX);
    assert.ok(camera.bounds.minY < overview.bounds.minY);
  });
  test(`${width}×${height}: round trips across modes, battle only zooms out, terrain covers the viewport`, () => {
    for (const selected of [null, ...scene.objects.filter(o => o.kind !== 'pier')]) {
      const overview = g.cameraFor(scene, selected, 'overview', width, height);
      for (const mode of ['overview', 'close', 'battle']) {
        const camera = g.cameraFor(scene, selected, mode, width, height);
        for (const object of scene.objects) {
          const roundTrip = g.screenToWorld(g.worldToScreen(object, camera, scene.projectionY), camera, scene.projectionY);
          assert.ok(Math.abs(roundTrip.x - object.x) < 1e-7 && Math.abs(roundTrip.y - object.y) < 1e-7);
        }
        if (mode === 'battle') {
          assert.ok(camera.zoom <= overview.zoom);
          assertFits(camera, overview.bounds);
          assertFits(camera, g.circleBounds({ x: 0, y: 0 }, scene.rules.worldRadius, scene.projectionY));
        }
        assert.ok(g.contains(g.projectBounds(scene.terrain, scene.projectionY), g.visibleBounds(camera)), `Недостаточный запас текстуры: ${width}×${height}, ${mode}`);
      }
    }
  });
}

test('sprite artwork keeps frame aspect and is anchored to its projected ground coordinate', () => {
  for (const object of scene.objects) {
    const sprite = scene.sprites[object.kind], bounds = g.spriteBounds(object, sprite, scene.projectionY);
    assert.ok(Math.abs((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY) - sprite.frame.width / sprite.frame.height) < 1e-7);
    assert.ok(Math.abs(bounds.minY + (bounds.maxY - bounds.minY) * sprite.anchorY - object.y * scene.projectionY) < 1e-7);
  }
});

test('all modes share one immutable texture set, renderer and geometry path', () => {
  const renderer = readFileSync(new URL('world-preview.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../camera-demo.html', import.meta.url), 'utf8');
  assert.equal((renderer.match(/new Image\(/g) || []).length, 1);
  assert.ok(renderer.includes('Object.entries(scene.assets)'));
  assert.ok(renderer.includes('geometry.cameraFor(scene, this.selected, this.mode, width, height)'));
  assert.ok(renderer.includes('geometry.spriteBounds(object, sprite, p)'));
  assert.ok(!html.includes('shared-map-v1.png'));
  assert.ok(!renderer.includes("mode === 'battle'"));
  assert.ok(html.includes('./pixel-lettering.js'));
});

test('renderer measures the viewport, applies DPR and never reloads assets on selection, resize or mode change', () => {
  const sources = [], draws = [];
  const context2d = new Proxy({}, { get: (_, key) => (...args) => { if (key === 'drawImage') draws.push(args); } });
  const makeElement = () => ({ style: {}, dataset: {}, children: [], attributes: {},
    append(child) { this.children.push(child); }, prepend(child) { this.children.unshift(child); },
    setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {}, getContext() { return context2d; }
  });
  const viewport = Object.assign(makeElement(), { clientWidth: 360, clientHeight: 360 });
  const sandbox = vm.createContext({
    PreparationCameraGeometry: g, devicePixelRatio: 2,
    document: { createElement: makeElement }, addEventListener() {},
    ResizeObserver: class { observe() {} },
    Image: class { constructor() { this.complete = true; this.naturalWidth = 1536; } set src(value) { sources.push(value); } }
  });
  vm.runInContext(readFileSync(new URL('world-preview.js', import.meta.url), 'utf8'), sandbox);
  const preview = new sandbox.PreparationWorldPreview(viewport, scene);
  assert.equal(preview.canvas.width, 720);
  assert.equal(preview.canvas.height, 720);
  preview.select(scene.objects.find(o => o.id === 'upper'));
  for (const mode of ['close', 'battle', 'overview']) preview.setMode(mode);
  viewport.clientWidth = 844; viewport.clientHeight = 280; preview.render();
  assert.equal(preview.camera.width, 844); assert.equal(preview.camera.height, 280);
  assert.equal(preview.canvas.width, 1688); assert.equal(preview.canvas.height, 560);
  assert.deepEqual(sources, Object.values(scene.assets));
  assert.ok(draws.length > 0);
  const selectedTarget = preview.targets.find(target => target.object.id === 'upper');
  assert.equal(selectedTarget.button.attributes['aria-pressed'], 'true');
  const bounds = g.spriteBounds(selectedTarget.object, scene.sprites.cannon, scene.projectionY);
  const screenCenter = g.projectedToScreen({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, preview.camera);
  assert.ok(Math.abs(parseFloat(selectedTarget.button.style.left) - screenCenter.x) < 1e-7);
  assert.ok(Math.abs(parseFloat(selectedTarget.button.style.top) - screenCenter.y) < 1e-7);
});
