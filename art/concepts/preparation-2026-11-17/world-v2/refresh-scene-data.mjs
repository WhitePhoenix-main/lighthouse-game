import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, '../../../..');
const inspection = JSON.parse(fs.readFileSync(path.join(directory, 'asset-inspection.json'), 'utf8'));
const oldScene = JSON.parse(fs.readFileSync(path.join(directory, 'scene-data.json'), 'utf8'));
const server = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });

function rectangle(bounds) {
  if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) throw new Error('Empty sprite bounds');
  return { x: bounds[0], y: bounds[1], width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] };
}
function sprite(asset, bounds, dimension, amount, anchorX, anchorY) {
  const frame = rectangle(bounds);
  const width = dimension === 'width' ? amount : amount * frame.width / frame.height;
  return { asset, frame, width, height: width * frame.height / frame.width, anchorX, anchorY };
}
try {
  const { NIGHT_CATALOG } = await server.ssrLoadModule('/src/content/nights.ts');
  const night = NIGHT_CATALOG.find(entry => entry.id === 'broken-shore');
  if (!night) throw new Error('Missing example night');
  const config = night.config;
  const definitions = Object.fromEntries(Object.entries(config.devices.definitions).map(([id, value]) => [id, { name: value.name, radius: value.radius, range: value.range, health: value.health }]));
  const projectionY = 0.7;
  const terrainHalfWidth = 1500;
  const terrainFile = path.basename(oldScene.assets.terrain);
  const terrainInspection = inspection[terrainFile];
  if (!terrainInspection) throw new Error('Missing terrain inspection: ' + terrainFile);
  const [textureWidth, textureHeight] = terrainInspection.size;
  const terrainHalfHeight = terrainHalfWidth * textureHeight / textureWidth / projectionY;
  const props = inspection['props-atlas.png'].frames;
  const scene = {
    ...oldScene,
    version: 5,
    source: { nightId: night.id, chapter: night.chapter, nightName: night.name, rulesVersion: config.rulesVersion, profileUpgrades: [], note: 'Actual base night configuration; example placements and presentation scales only.' },
    rules: { worldRadius: config.worldRadius, spawnRadius: config.spawnRadius, lighthouseRadius: config.lighthouseRadius, beamRange: config.beam.range, beamHalfAngle: config.beam.halfAngle, placementRadius: config.devices.placementRadius, shieldRadius: config.shield.radius },
    projectionY,
    visualCoastline: { style: 'irregular stepped rock ledges with small headlands and inlets, based on the user reference', gameplayGeometryStatus: 'The actual game still uses a straight shoreX boundary; this image is an art study, not a placement mask.' },
    currentGameLandBoundary: config.terrain ? { ...config.terrain } : null,
    terrain: { minX: -terrainHalfWidth, maxX: terrainHalfWidth, minY: -terrainHalfHeight, maxY: terrainHalfHeight },
    sprites: {
      lighthouse: sprite('lighthouse', inspection['lighthouse-main.png'].alphaBoundingBox, 'height', 190, 0.5, 0.91),
      cannon: sprite('props', props.cannon, 'width', 74, 0.65, 0.97),
      barrier: sprite('props', props.barrier, 'width', 60, 0.5, 0.84),
      pier: sprite('props', props.pier, 'width', 145, 0.24, 0.6),
    },
    objects: [
      { id: 'lighthouse', kind: 'lighthouse', name: 'Маяк', x: 0, y: 0, radius: config.lighthouseRadius },
      { id: 'upper', kind: 'cannon', x: -140, y: -140, ...definitions.cannon, health: definitions.cannon.health, maxHealth: definitions.cannon.health },
      { id: 'lower', kind: 'cannon', x: -140, y: 140, ...definitions.cannon, health: 42, maxHealth: definitions.cannon.health },
      { id: 'barrier', kind: 'barrier', x: -230, y: 0, ...definitions.barrier, health: definitions.barrier.health, maxHealth: definitions.barrier.health },
      { id: 'pier', kind: 'pier', name: 'Причал', x: 0, y: 110, radius: 0 },
    ],
    deviceDefinitions: definitions,
  };
  fs.writeFileSync(path.join(directory, 'scene-data.json'), JSON.stringify(scene, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'scene-data.js'), '// Generated from actual base NIGHT_CATALOG configuration; no profile changes.\nglobalThis.PREPARATION_SCENE = ' + JSON.stringify(scene, null, 2) + ';\n');
  console.log(JSON.stringify({ source: scene.source, rules: scene.rules, terrain: scene.terrain, spriteFrames: Object.keys(scene.sprites) }));
} finally {
  await server.close();
}
