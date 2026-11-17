/* Presentation-only scene: no purchases, placement commands or combat simulation. */
(function (root) {
  'use strict';
  const geometry = root.PreparationCameraGeometry;
  class PreparationWorldPreview {
    constructor(viewport, scene, onChange) {
      this.viewport = viewport;
      this.scene = scene;
      this.onChange = onChange;
      this.mode = 'overview';
      this.selected = null;
      this.images = {};
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'world-canvas';
      this.canvas.setAttribute('aria-label', 'Карта берега с областями маяка и выбранного устройства');
      viewport.prepend(this.canvas);
      this.targets = scene.objects.filter(o => o.kind !== 'pier').map(object => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'world-hit'; button.dataset.world = object.id;
        button.setAttribute('aria-label', (object.name || 'Маяк') + ': показать область');
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => this.select(this.selected === object ? null : object));
        viewport.append(button);
        return { object, button };
      });
      this.ready = Promise.all(Object.entries(scene.assets).map(([key, url]) => new Promise(resolve => {
        const image = new Image(); this.images[key] = image;
        image.onload = () => { this.render(); resolve(); };
        image.onerror = () => { this.canvas.setAttribute('aria-label', 'Не удалось загрузить графику карты'); resolve(); };
        image.src = url;
      })));
      this.observer = new ResizeObserver(() => this.render());
      this.observer.observe(viewport);
      root.addEventListener('resize', () => this.render());
      this.render();
    }
    select(object) { this.selected = object; this.render(); this.onChange?.(this); }
    setMode(mode) { this.mode = mode; this.render(); this.onChange?.(this); }
    render() {
      const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
      if (width <= 48 || height <= 48) return;
      const scene = this.scene, p = scene.projectionY;
      const camera = geometry.cameraFor(scene, this.selected, this.mode, width, height);
      this.camera = camera;
      const dpr = root.devicePixelRatio || 1;
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = width + 'px'; this.canvas.style.height = height + 'px';
      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      const terrain = geometry.projectBounds(scene.terrain, p);
      const terrainPoint = geometry.projectedToScreen({ x: terrain.minX, y: terrain.minY }, camera);
      const image = this.images.terrain;
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, terrainPoint.x, terrainPoint.y, (terrain.maxX - terrain.minX) * camera.zoom, (terrain.maxY - terrain.minY) * camera.zoom);
      const covered = geometry.contains(terrain, geometry.visibleBounds(camera));
      this.viewport.dataset.terrainCoverage = String(covered);
      // A world circle sampled through the exact same projection as every object.
      const circle = (center, radius, color, dash, lineWidth = 1.5) => {
        ctx.beginPath();
        for (let i = 0; i <= 192; i++) {
          const angle = i / 192 * Math.PI * 2;
          const point = geometry.worldToScreen({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, camera, p);
          if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
      };
      circle({ x: 0, y: 0 }, scene.rules.spawnRadius, '#bdd4d0a6', [3, 7], 2);
      circle({ x: 0, y: 0 }, scene.rules.beamRange, '#f2d78cbf', [7, 5]);
      const area = geometry.selectedArea(scene, this.selected);
      if (area) circle(area.center, area.radius, '#8fe4ec', area.type === 'body' ? [] : [3, 4], 2);
      // Ground depth ordering; sprite height is presentation height, not projected twice.
      for (const object of [...scene.objects].sort((a, b) => a.y - b.y)) {
        const sprite = scene.sprites[object.kind], source = this.images[sprite.asset];
        const bounds = geometry.spriteBounds(object, sprite, p);
        const point = geometry.projectedToScreen({ x: bounds.minX, y: bounds.minY }, camera);
        if (source?.complete && source.naturalWidth) {
          const f = sprite.frame;
          ctx.drawImage(source, f.x, f.y, f.width, f.height, point.x, point.y, (bounds.maxX - bounds.minX) * camera.zoom, (bounds.maxY - bounds.minY) * camera.zoom);
        }
        if (object.maxHealth) {
          const barWidth = Math.max(22, 34 * camera.zoom), x = point.x + (bounds.maxX - bounds.minX) * camera.zoom / 2 - barWidth / 2, y = point.y - 7;
          ctx.fillStyle = '#101f26'; ctx.fillRect(x - 1, y - 1, barWidth + 2, 5);
          ctx.fillStyle = object.health < object.maxHealth ? '#e4b97a' : '#a8c5a0'; ctx.fillRect(x, y, barWidth * object.health / object.maxHealth, 3);
        }
      }
      for (const { object, button } of this.targets) {
        const sprite = geometry.spriteBounds(object, scene.sprites[object.kind], p);
        const top = geometry.projectedToScreen({ x: sprite.minX, y: sprite.minY }, camera);
        const hitWidth = Math.max(44, (sprite.maxX - sprite.minX) * camera.zoom, object.radius * 2 * camera.zoom);
        const hitHeight = Math.max(44, (sprite.maxY - sprite.minY) * camera.zoom);
        button.style.left = (top.x + (sprite.maxX - sprite.minX) * camera.zoom / 2) + 'px';
        button.style.top = (top.y + (sprite.maxY - sprite.minY) * camera.zoom / 2) + 'px';
        button.style.width = hitWidth + 'px'; button.style.height = hitHeight + 'px';
        button.setAttribute('aria-pressed', String(this.selected === object));
      }
      if (!covered) {
        ctx.fillStyle = '#182a31'; ctx.fillRect(8, height - 28, width - 16, 20);
        ctx.fillStyle = '#ffd3a1'; ctx.font = '11px monospace'; ctx.fillText('Недостаточный запас текстуры карты', 14, height - 14);
      }
    }
  }
  root.PreparationWorldPreview = PreparationWorldPreview;
})(globalThis);
