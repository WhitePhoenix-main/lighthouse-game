import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const context = vm.createContext({});
for (const file of ['scene-data.js', 'camera-geometry.js']) vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
const scene = context.PREPARATION_SCENE;
const g = context.PreparationCameraGeometry;
const lettering = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../pixel-lettering.js', import.meta.url), 'utf8') + '\nglobalThis.previewGlyphs = settingsGlyphs;', lettering);
fs.writeFileSync(directory + 'preview-glyphs.json', JSON.stringify(lettering.previewGlyphs) + '\n');
const definitions = [
  { file: 'preview-portrait.png', width: 780, height: 780, padding: 48, mode: 'overview', selected: null },
  { file: 'preview-selected.png', width: 780, height: 780, padding: 48, mode: 'overview', selected: 'lower' },
  { file: 'preview-landscape.png', width: 1280, height: 480, padding: 24, mode: 'overview', selected: null },
  { file: 'preview-battle.png', width: 780, height: 780, padding: 48, mode: 'battle', selected: null },
];
function screenRect(bounds, camera) {
  const point = g.projectedToScreen({ x: bounds.minX, y: bounds.minY }, camera);
  return { x: point.x, y: point.y, width: (bounds.maxX - bounds.minX) * camera.zoom, height: (bounds.maxY - bounds.minY) * camera.zoom };
}
const layouts = definitions.map(definition => {
  const selected = scene.objects.find(object => object.id === definition.selected) ?? null;
  const camera = g.cameraFor(scene, selected, definition.mode, definition.width, definition.height, definition.padding);
  const terrainBounds = g.projectBounds(scene.terrain, scene.projectionY);
  if (!g.contains(terrainBounds, g.visibleBounds(camera))) throw new Error('Terrain does not cover preview');
  const circle = (center, radius, color, dashed = true) => ({ ...screenRect(g.circleBounds(center, radius, scene.projectionY), camera), color, dashed });
  const areas = [circle({ x: 0, y: 0 }, scene.rules.spawnRadius, '#B5CED0'), circle({ x: 0, y: 0 }, scene.rules.beamRange, '#F2D78C')];
  const area = g.selectedArea(scene, selected);
  if (area) areas.push(circle(area.center, area.radius, '#8FE4EC', area.type !== 'body'));
  return {
    ...definition,
    camera: { zoom: camera.zoom, centerX: camera.centerX, centerY: camera.centerY },
    terrain: { asset: scene.assets.terrain.split('/').at(-1), ...screenRect(terrainBounds, camera) },
    areas,
    legend: [
      { label: 'МАЯК · ' + scene.rules.beamRange, color: '#F2D78C' },
      { label: 'ПОЯВЛЕНИЕ · ' + scene.rules.spawnRadius, color: '#B5CED0' },
      ...(area ? [{ label: 'ПУШКА · ' + area.radius, color: '#8FE4EC' }] : []),
    ],
    sprites: [...scene.objects].sort((a, b) => a.y - b.y).map(object => {
      const sprite = scene.sprites[object.kind];
      return { id: object.id, asset: scene.assets[sprite.asset].split('/').at(-1), frame: sprite.frame, ...screenRect(g.spriteBounds(object, sprite, scene.projectionY), camera), health: object.health, maxHealth: object.maxHealth };
    }),
  };
});
fs.writeFileSync(directory + 'preview-layouts.json', JSON.stringify(layouts, null, 2) + '\n');
console.log('Prepared camera-derived layouts: ' + layouts.map(layout => layout.file).join(', '));
