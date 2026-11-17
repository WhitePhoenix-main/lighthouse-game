/* Pure projected-world geometry, shared by the canvas, hit targets and tests. */
(function (root) {
  'use strict';
  const project = (point, projectionY) => ({ x: point.x, y: point.y * projectionY });
  function projectBounds(bounds, projectionY) {
    return { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY * projectionY, maxY: bounds.maxY * projectionY };
  }
  function circleBounds(point, radius, projectionY) {
    return projectBounds({ minX: point.x - radius, maxX: point.x + radius, minY: point.y - radius, maxY: point.y + radius }, projectionY);
  }
  function union(...bounds) {
    const items = bounds.flat().filter(Boolean);
    if (!items.length) throw new Error('Bounds are required');
    return { minX: Math.min(...items.map(b => b.minX)), minY: Math.min(...items.map(b => b.minY)), maxX: Math.max(...items.map(b => b.maxX)), maxY: Math.max(...items.map(b => b.maxY)) };
  }
  function spriteSize(sprite) {
    // Contain the source frame in its presentation box; never stretch the artwork.
    const scale = Math.min(sprite.width / sprite.frame.width, sprite.height / sprite.frame.height);
    return { width: sprite.frame.width * scale, height: sprite.frame.height * scale };
  }
  function spriteBounds(object, sprite, projectionY) {
    const anchor = project(object, projectionY), size = spriteSize(sprite);
    const minX = anchor.x - size.width * sprite.anchorX;
    const minY = anchor.y - size.height * sprite.anchorY;
    return { minX, minY, maxX: minX + size.width, maxY: minY + size.height };
  }
  function selectedArea(scene, selected) {
    if (!selected || selected.kind === 'pier') return null;
    if (selected.kind === 'generator') {
      return { center: { x: 0, y: 0 }, radius: scene.rules.shieldRadius, type: 'shield' };
    }
    if (selected.kind === 'lighthouse') {
      return { center: selected, radius: scene.rules.beamRange, type: 'potential' };
    }
    return { center: selected, radius: selected.range > 0 ? selected.range : selected.radius, type: selected.range > 0 ? 'range' : 'body' };
  }
  function overviewBounds(scene, selected) {
    const origin = { x: 0, y: 0 }, p = scene.projectionY;
    const area = selectedArea(scene, selected);
    return union(circleBounds(origin, scene.rules.beamRange, p), circleBounds(origin, scene.rules.spawnRadius, p),
      scene.objects.map(object => spriteBounds(object, scene.sprites[object.kind], p)),
      area && circleBounds(area.center, area.radius, p));
  }
  function fit(bounds, width, height, padding = 24, maxZoom = Infinity) {
    if (width <= padding * 2 || height <= padding * 2) throw new Error('Viewport is too small for camera padding');
    const zoom = Math.min((width - padding * 2) / (bounds.maxX - bounds.minX), (height - padding * 2) / (bounds.maxY - bounds.minY), maxZoom);
    return { centerX: (bounds.minX + bounds.maxX) / 2, centerY: (bounds.minY + bounds.maxY) / 2, zoom, width, height, padding, bounds };
  }
  function cameraFor(scene, selected, mode, width, height, padding = 24) {
    const bounds = overviewBounds(scene, selected), overview = fit(bounds, width, height, padding);
    if (mode === 'battle') return fit(union(bounds, circleBounds({ x: 0, y: 0 }, scene.rules.worldRadius, scene.projectionY)), width, height, padding, overview.zoom);
    if (mode === 'close') {
      const area = selectedArea(scene, selected);
      const focus = area ? circleBounds(area.center, area.radius, scene.projectionY) : circleBounds({ x: 0, y: 0 }, scene.rules.shieldRadius, scene.projectionY);
      return fit(union(focus, selected ? spriteBounds(selected, scene.sprites[selected.kind], scene.projectionY) : spriteBounds(scene.objects.find(o => o.kind === 'lighthouse'), scene.sprites.lighthouse, scene.projectionY)), width, height, padding);
    }
    return overview;
  }
  function projectedToScreen(point, camera) {
    return { x: (point.x - camera.centerX) * camera.zoom + camera.width / 2, y: (point.y - camera.centerY) * camera.zoom + camera.height / 2 };
  }
  function worldToScreen(point, camera, projectionY) { return projectedToScreen(project(point, projectionY), camera); }
  function screenToWorld(point, camera, projectionY) {
    return { x: (point.x - camera.width / 2) / camera.zoom + camera.centerX, y: ((point.y - camera.height / 2) / camera.zoom + camera.centerY) / projectionY };
  }
  function visibleBounds(camera) {
    return { minX: camera.centerX - camera.width / (2 * camera.zoom), maxX: camera.centerX + camera.width / (2 * camera.zoom), minY: camera.centerY - camera.height / (2 * camera.zoom), maxY: camera.centerY + camera.height / (2 * camera.zoom) };
  }
  function contains(outer, inner, epsilon = 1e-7) {
    return inner.minX >= outer.minX - epsilon && inner.minY >= outer.minY - epsilon && inner.maxX <= outer.maxX + epsilon && inner.maxY <= outer.maxY + epsilon;
  }
  root.PreparationCameraGeometry = { project, projectBounds, circleBounds, union, spriteSize, spriteBounds, selectedArea, overviewBounds, fit, cameraFor, projectedToScreen, worldToScreen, screenToWorld, visibleBounds, contains };
})(globalThis);
