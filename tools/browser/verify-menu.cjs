// Optional authoring check: Playwright and its browser are external, never shipped with the game.
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const ambientLayers = require('../../sprites/ambient-manifest.json').layers;
const buttonLabels = require('../../sprites/menu-buttons-v2/manifest.json');
assert(Array.isArray(ambientLayers) && ambientLayers.length > 0, 'Ambient manifest must contain layers');
const base = (process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
(async () => {
  // Source-mask coverage is an optional authoring check, independent of runtime QA.
  // The historical mask report is not included in a source checkout.
  if (process.env.LIGHTHOUSE_AMBIENT_COVERAGE_PATH) {
    const report = JSON.parse(await fs.readFile(process.env.LIGHTHOUSE_AMBIENT_COVERAGE_PATH, 'utf8'));
    for (const kind of ['sky', 'water']) {
      const coverage = report.coverage?.[kind];
      assert(coverage?.eligiblePixels > 0, `Missing ${kind} coverage report`);
      assert(coverage.coveredPixels <= coverage.eligiblePixels);
      assert(coverage.ratio > 0.95 && coverage.coveredPixels / coverage.eligiblePixels > 0.95, `Incomplete ${kind} ambient coverage`);
    }
  } else {
    console.log('Source-mask coverage not requested; set LIGHTHOUSE_AMBIENT_COVERAGE_PATH to check an authoring report.');
  }
  const browser = await chromium.launch({ headless: true, ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : {}) });
  try {
    await fs.mkdir('test-results/menu-layers', { recursive: true });
    for (const [name, width, height, language, size, touch] of [
      ['desktop', 1672, 941, 'ru', 'normal', false],
      ['portrait', 390, 844, 'ru', 'normal', true],
      ['landscape', 844, 390, 'ru', 'normal', true],
      ['portrait-large-en', 390, 844, 'en', 'large', true],
      ['landscape-large', 844, 390, 'ru', 'large', true],
      ['small-portrait', 320, 568, 'ru', 'large', true],
      ['tablet-portrait', 768, 1024, 'ru', 'normal', true],
      ['ultrawide', 2560, 1080, 'ru', 'normal', false],
      ['small-landscape', 568, 320, 'ru', 'large', true]
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: 'ru-RU' });
      try {
        const page = await context.newPage();
        const errors = [];
        if (name === 'desktop') await page.addInitScript(() => {
          window.menuPulseEvents = [];
          new MutationObserver(records => {
            for (const record of records) {
              const element = record.target;
              if (!element.matches?.('.menu-window-glow') || !element.dataset.windowPulse) continue;
              const ticket = Number(element.dataset.windowPulse);
              if (window.menuPulseEvents.some(event => event.ticket === ticket)) continue;
              window.menuPulseEvents.push({ ticket, index: [...document.querySelectorAll('.menu-window-glow')].indexOf(element), time: performance.now(), duration: Number(element.dataset.windowDurationMs) });
            }
          }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-window-pulse'] });
        });
        page.on('pageerror', error => errors.push(String(error)));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        page.on('requestfailed', request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
        await page.goto(`${base}/tests/browser/menu-frame.html?language=${language}&size=${size}`);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode()));
          await Promise.all([...document.querySelectorAll('.menu-sprite, .menu-button-frame, .menu-button-label-art')].map(async element => {
            const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage);
            if (!match) throw new Error(`Missing sprite background: ${element.className}`);
            const image = new Image(); image.src = match[1]; await image.decode();
            if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Empty sprite: ${image.src}`);
          }));
        });
        await page.locator('.menu-title-ready').waitFor();
        const read = () => page.evaluate(labelBounds => {
          const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
          const image = document.querySelector('img.menu-background');
          return {
            orientation: document.querySelector('.avalon-menu').dataset.orientation,
            fontLoaded: document.fonts.check('24px "Avalon Menu"'),
            effects: [...document.querySelectorAll('.menu-sprite.menu-decoration')].map(element => {
              const style = getComputedStyle(element);
              return { animation: style.animationName, position: style.backgroundPositionX, playState: style.animationPlayState, timing: style.animationTimingFunction, duration: style.animationDuration, delay: style.animationDelay, iterations: style.animationIterationCount, fill: style.animationFillMode, direction: style.animationDirection, window: element.matches('.menu-window-glow'), staticBody: element.matches('.menu-ship, .menu-sail'), title: element.matches('.menu-title-sprite'), glow: element.matches('.menu-ship-glow'), bounds: rect(element), transform: style.transform, id: element.dataset.menuAmbient, worldRect: element.dataset.worldRect };
            }),
            scenery: { scene: rect(document.querySelector('.menu-scenery')), background: rect(image), menu: rect(document.querySelector('.avalon-menu')) },
            moon: rect(document.querySelector('.menu-moon')), moonHalo: rect(document.querySelector('.menu-moon-halo')),
            naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            buttons: [...document.querySelectorAll('.menu-hotspot')].map(button => {
              const r = rect(button), label = rect(button.querySelector('.menu-button-label-art'));
              const ink = labelBounds[document.documentElement.lang === 'en' ? 'en' : 'ru'][button.dataset.menuRect === 'settings' ? 1 : 0];
              return { ...r, labelWidth: label.width * ink.width / 240, labelHeight: label.height * ink.height / 48, text: button.innerText };
            })
          };
        }, buttonLabels);
        const readMotion = () => page.evaluate(() => ({
          fog: [...document.querySelectorAll('.menu-fog-veil')].map(element => {
            const style = getComputedStyle(element);
            return { transform: style.transform, animation: style.animationName, state: style.animationPlayState, pointer: style.pointerEvents };
          }),
          windows: [...document.querySelectorAll('.menu-window-glow')].map(element => ({
            opacity: getComputedStyle(element).opacity,
            pulse: element.dataset.windowPulse,
            duration: getComputedStyle(element).animationDuration,
            position: getComputedStyle(element).backgroundPositionX,
            animation: getComputedStyle(element).animationName,
            times: element.getAnimations().filter(animation => !(animation instanceof CSSAnimation)).map(animation => Number(animation.currentTime))
          }))
        }));
        const checkLayout = async (w, h) => {
          const state = await read();
          assert.equal(state.fontLoaded, true);
          assert.equal(state.naturalWidth, 640);
          assert.equal(state.naturalHeight, 640);
          assert(Math.abs(state.scenery.scene.width - state.scenery.scene.height) < 1, `${name}: scenery must be square`);
          // Cover intentionally crops decoration, but must not leave unpainted viewport bands.
          for (const [layer, r] of Object.entries(state.scenery)) {
            assert(r.x <= 1 && r.y <= 1 && r.x + r.width >= w - 1 && r.y + r.height >= h - 1, `${name}: ${layer} leaves an empty band at ${w}x${h}: ${JSON.stringify(state.scenery)}, orientation=${state.orientation}`);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, `${name}: page overflow`);
          assert.equal(state.buttons.length, 2);
          for (const button of state.buttons) {
            assert(button.x >= -1 && button.y >= 0 && button.x + button.width <= w + 1 && button.y + button.height <= h + 1, `${name}: offscreen ${JSON.stringify(button)}`);
            assert(button.width >= 44 && button.height >= 44, `${name}: target below 44px`);
            assert(button.labelWidth <= button.width - 8 && button.labelHeight < button.height, `${name}: overflowing label ${JSON.stringify(button)}`);
          }
          return state;
        };
        const checkAnchors = state => {
          const scene = state.scenery.scene, scale = scene.width / 640;
          const center = r => [r.x + r.width / 2, r.y + r.height / 2];
          center(state.moonHalo).forEach((value, i) => assert(Math.abs(value - center(state.moon)[i]) < 1, `${name}: moon halo detached from its source`));
          assert(state.moonHalo.width > state.moon.width, `${name}: moon halo must extend past the lunar disc`);
          const ambient = state.effects.filter(effect => effect.id);
          assert.equal(ambient.length, ambientLayers.length);
          assert.equal(new Set(ambient.map(effect => effect.id)).size, ambientLayers.length);
          for (const layer of ambientLayers) {
            const effect = ambient.find(effect => effect.id === layer.id);
            assert(effect, `${name}: missing ambient ${layer.id}`);
            assert.equal(effect.worldRect, layer.rect.join(','), `${name}: ambient metadata ${layer.id}`);
            assert.equal(effect.transform, 'none', `${name}: ambient transform ${layer.id}`);
            const actual = [effect.bounds.x, effect.bounds.y, effect.bounds.width, effect.bounds.height];
            const expected = [scene.x + layer.rect[0] * scale, scene.y + layer.rect[1] * scale, layer.rect[2] * scale, layer.rect[3] * scale];
            actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < 1, `${name}: ${layer.id} detached from scenery`));
          }
        };
        const state = await checkLayout(width, height);
        checkAnchors(state);
        const ambientAssets = await page.locator('.menu-ambient').evaluateAll(async elements => Promise.all(elements.map(async element => {
          const style = getComputedStyle(element), image = new Image();
          image.src = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)[1]; await image.decode();
          return { id: element.dataset.menuAmbient, src: image.src, width: image.naturalWidth, height: image.naturalHeight, size: style.backgroundSize };
        })));
        for (const layer of ambientLayers) {
          const asset = ambientAssets.find(asset => asset.id === layer.id);
          assert(asset, `${name}: missing ambient asset ${layer.id}`);
          assert(new URL(asset.src).pathname.endsWith(`/images/menu-sprites/${layer.file}`));
          assert.deepEqual([asset.width, asset.height], [layer.rect[2] * layer.frames, layer.rect[3]]);
          assert.equal(asset.size, `${layer.frames * 100}% 100%`);
        }
        const title = page.locator('h1.menu-title');
        assert.equal(await title.getAttribute('aria-label'), language === 'en' ? 'Light of Avalon' : 'Свет Авалона');
        assert.equal((await title.innerText()).trim(), '');
        await title.focus();
        assert.equal(await title.evaluate(element => document.activeElement === element), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('[data-action="game-menu"]').evaluate(element => document.activeElement === element), true);
        const titleSprite = await page.locator('.menu-title-sprite').evaluate(async element => {
          const style = getComputedStyle(element), image = new Image();
          image.src = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)[1]; await image.decode();
          const r = element.getBoundingClientRect();
          return { src: image.src, width: image.naturalWidth, height: image.naturalHeight, size: style.backgroundSize, ratio: r.width / r.height };
        });
        assert(new URL(titleSprite.src).pathname.endsWith('/images/menu-sprites/title.png'));
        assert.deepEqual([titleSprite.width, titleSprite.height], [1920, 80]);
        assert.equal(titleSprite.size, '800% 100%');
        assert(Math.abs(titleSprite.ratio - 3) < 0.01);
        const fixed = await page.locator('.menu-window-glow, .menu-lantern-halo').evaluateAll(elements => elements.map(element => {
          const scene = element.closest('.menu-scenery').getBoundingClientRect(), r = element.getBoundingClientRect(), scale = scene.width / 640;
          return { halo: element.classList.contains('menu-lantern-halo'), rect: [(r.x - scene.x) / scale, (r.y - scene.y) / scale, r.width / scale, r.height / scale], blend: getComputedStyle(element).mixBlendMode };
        }));
        const expectedFixed = [[271,66,240,240], ...[[406,238],[386,252],[371,276],[412,286],[394,300]].map(([x,y]) => [x-18,y-18,36,36])];
        fixed.sort((a,b) => Number(b.halo) - Number(a.halo));
        assert.equal(fixed.length, expectedFixed.length);
        fixed.forEach((effect, i) => {
          effect.rect.forEach((value,j) => assert(Math.abs(value - expectedFixed[i][j]) < 0.1, `${name}: halo/window world rect`));
          if (!effect.halo) assert.equal(effect.blend, 'screen');
        });
        const haloStyle = await page.locator('.menu-lantern-halo').evaluate(element => {
          const style = getComputedStyle(element); return { opacity: Number(style.opacity), filter: style.filter, duration: style.animationDuration };
        });
        assert(haloStyle.opacity >= 0 && haloStyle.opacity <= 1, `${name}: halo opacity outside pulse range`);
        assert(haloStyle.filter.includes('blur('), `${name}: halo must have a soft edge`);
        assert.equal(haloStyle.duration.split(', ').length, 2);
        assert(haloStyle.duration.split(', ').every(duration => duration === '7.8s'));
        assert.deepEqual(await page.locator('.menu-lantern-halo').evaluate(element => getComputedStyle(element).animationName.split(', ')), ['menu-lantern-pulse', 'menu-lantern-brightness']);
        const shipLights = await page.locator('.menu-ship-glow').evaluateAll(elements => elements.map(element => {
          const scene = element.closest('.menu-scenery').getBoundingClientRect(), r = element.getBoundingClientRect(), scale = scene.width / 640;
          return { rect: [(r.x - scene.x) / scale, (r.y - scene.y) / scale, r.width / scale, r.height / scale], image: getComputedStyle(element).backgroundImage, size: getComputedStyle(element).backgroundSize };
        }));
        assert.equal(shipLights.length, 2);
        shipLights.forEach((light, i) => {
          const [x,y] = [[521,365],[537,368]][i];
          light.rect.forEach((value,j) => assert(Math.abs(value - [x-10,y-10,20,20][j]) < 0.1, `${name}: ship light anchor`));
          assert(light.image.includes('/images/menu-sprites/window-glow.png'));
          assert.equal(light.size, '1200% 100%');
        });
        assert.equal(state.effects.length, 13 + ambientLayers.length, `${name}: title, moon, ship, sail, two ship lights, halo, five windows and ambient layers`);
        state.effects.filter(effect => effect.animation !== 'none' && !effect.title).forEach(effect => assert(effect.timing.startsWith('steps('), `${name}: sprite animation must use frame steps`));
        assert.equal(state.effects.filter(effect => effect.staticBody).length, 2);
        state.effects.filter(effect => effect.staticBody).forEach(effect => {
          assert.equal(effect.animation, 'none');
          assert.equal(effect.position, '0%');
        });
        assert.equal(state.effects.filter(effect => effect.glow).length, 2);
        const titleEffect = state.effects.find(effect => effect.title);
        assert.equal(await page.locator('.menu-title-ready').count(), 1);
        assert(titleEffect.duration.split(', ').every(duration => duration === '20.72s'));
        assert(titleEffect.delay.split(', ').every(delay => delay === '3s'));
        assert(titleEffect.iterations.split(', ').every(count => count === 'infinite'));
        assert(titleEffect.direction.split(', ').every(direction => direction === 'normal'));
        assert(titleEffect.fill.split(', ').every(fill => fill === 'none'));
        assert.equal(await page.locator('.menu-scenery .menu-window-glow').count(), 5);
        assert.equal(await page.locator('.menu-fog-bank').count(), 2);
        const initialMotion = await readMotion();
        assert.equal(initialMotion.fog.length, 2);
        initialMotion.fog.forEach(fog => assert.equal(fog.pointer, 'none'));
        initialMotion.windows.forEach(window => assert.equal(window.animation, 'none'));
        for (const selector of ['.menu-moon', '.menu-ship', '.menu-sail', '.menu-lantern-halo']) assert.equal(await page.locator(`.menu-scenery ${selector}.menu-sprite.menu-decoration`).count(), 1);
        assert.equal(await page.locator('.menu-moon-halo').count(), 1);
        assert.equal(await page.locator('.menu-moon').evaluate(element => getComputedStyle(element).animationDuration), '14s');
        assert.equal(await page.locator('.menu-cloud-light, .menu-moon-light').count(), 0);
        const positions = state.effects.map(effect => new Set([effect.position]));
        const slowestFrameMs = Math.max(...state.effects.filter(effect => effect.animation !== 'none').map(effect => parseFloat(effect.duration) * 1000 / Number(/steps\((\d+)/.exec(effect.timing)?.[1] || 1)), ...ambientLayers.map(layer => layer.frameMs));
        const observationMs = Math.min(2500, Math.max(1500, slowestFrameMs * 1.2));
        for (let elapsed = 0; elapsed < observationMs; elapsed += 100) {
          await page.waitForTimeout(Math.min(100, observationMs - elapsed));
          const sample = await read();
          checkAnchors(sample);
          sample.effects.forEach((effect, i) => {
            positions[i].add(effect.position);
            assert.deepEqual(effect.bounds, state.effects[i].bounds, `${name}: sprite moved between frames`);
          });
        }
        positions.forEach((seen, i) => {
          const effect = state.effects[i];
          if (effect.staticBody) assert.equal(seen.size, 1, `${name}: moving ship/sail body`);
          // The halo may stay on one frame during its authored hold or five-second dark interval.
          else if (!effect.title && !effect.window && !effect.animation.includes('menu-lantern-pulse')) assert(seen.size > 1, `${name}: unchanged sprite frame ${i}`);
        });
        (await readMotion()).fog.forEach((fog, i) => assert.notEqual(fog.transform, initialMotion.fog[i].transform, `${name}: fog does not drift`));
        if (name === 'desktop') {
          await page.waitForFunction(() => window.menuPulseEvents.length >= 5, undefined, { timeout: 36000 });
          const events = await page.evaluate(() => window.menuPulseEvents.slice(0, 5));
          assert.equal(new Set(events.map(event => event.index)).size, 5, 'Window shuffled bag must visit all five windows');
          events.forEach((event, i) => {
            assert.equal(event.duration, 4200, 'Window pulse must use the 4.2-second profile');
            if (i) assert(event.time - events[i-1].time >= 5180, 'Window pulses started faster than 5.2 seconds');
          });
          const lighting = await page.evaluate(async () => {
            const element = [...document.querySelectorAll('.menu-window-glow')].find(element => element.getAnimations().filter(animation => !(animation instanceof CSSAnimation)).length === 2);
            if (!element) throw new Error('No active two-timeline window cue for single-flash regression');
            const animations = element.getAnimations();
            const saved = animations.map(animation => ({ time: animation.currentTime, state: animation.playState }));
            const duration = Number(animations[0].effect.getTiming().duration);
            const timings = animations.map(animation => animation.effect.getTiming());
            const image = new Image(); image.src = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage)[1]; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const frameWidth = canvas.width / 12;
            const energy = Array.from({ length: 12 }, (_, frame) => {
              let sum = 0;
              for (let y = 0; y < canvas.height; y++) for (let x = frame * frameWidth; x < (frame + 1) * frameWidth; x++) {
                const i = (y * canvas.width + x) * 4;
                sum += pixels[i+3] / 255 * (pixels[i] + pixels[i+1] + pixels[i+2]);
              }
              return sum;
            });
            animations.forEach(animation => animation.pause());
            const samples = [];
            for (let i = 0; i <= 64; i++) {
              const time = (duration - 1) * i / 64;
              animations.forEach(animation => { animation.currentTime = time; });
              const style = getComputedStyle(element), frame = Math.round(parseFloat(style.backgroundPositionX) * 11 / 100);
              samples.push({ time, frame, opacity: Number(style.opacity), energy: (energy[frame] || 0) * Number(style.opacity) });
            }
            animations.forEach((animation, i) => { animation.currentTime = saved[i].time; if (saved[i].state === 'running') animation.play(); });
            const title = document.querySelector('.menu-title-sprite');
            const titleAnimations = title.getAnimations({ subtree: true });
            const titleSaved = titleAnimations.map(animation => animation.currentTime);
            // Synchronous seeks need no pause()/play(): play() would override CSS lifecycle control.
            titleAnimations.forEach(animation => { animation.currentTime = 3000; });
            const titleStart = { filter: getComputedStyle(title).filter, shine: getComputedStyle(title, '::after').opacity };
            titleAnimations.forEach(animation => { animation.currentTime = 3000 + 720 * .45; });
            const titlePeak = { filter: getComputedStyle(title).filter, shine: getComputedStyle(title, '::after').opacity };
            titleAnimations.forEach((animation, i) => { animation.currentTime = titleSaved[i]; });
            const halo = document.querySelector('.menu-lantern-halo'), haloAnimations = halo.getAnimations();
            const haloSaved = haloAnimations.map(animation => animation.currentTime);
            const haloSamples = [0, 841, 2240, 2660, 2772, 2801, 5300, 7799, 8641].map(time => {
              haloAnimations.forEach(animation => { animation.currentTime = time; });
              const style = getComputedStyle(halo); return { opacity: Number(style.opacity), position: parseFloat(style.backgroundPositionX) };
            });
            haloAnimations.forEach((animation, i) => { animation.currentTime = haloSaved[i]; });
            return { duration, timings, samples, titleStart, titlePeak, haloSamples, haloAnimationCount: haloAnimations.length };
          });
          assert.equal(lighting.timings.length, 2);
          lighting.timings.forEach(timing => {
            assert.equal(timing.duration, lighting.duration);
            assert.equal(timing.iterations, 1);
            assert.equal(timing.duration, 4200);
          });
          assert.equal(lighting.samples[0].frame, 0);
          assert.equal(lighting.samples.at(-1).frame, 11);
          lighting.samples.forEach((sample, i) => {
            if (i) assert(sample.frame >= lighting.samples[i-1].frame, 'Window sprite reversed/repeated during one cue');
          });
          const peak = Math.max(...lighting.samples.map(sample => sample.energy));
          assert(peak > 0, 'Window cue has no visible light');
          const peakSample = lighting.samples.find(sample => sample.energy === peak);
          assert(Math.abs(peakSample.time - 504) < 100, 'Window must reach its peak near 504ms');
          let falling = false;
          for (let i = 1; i < lighting.samples.length; i++) {
            const delta = lighting.samples[i].energy - lighting.samples[i-1].energy;
            if (delta < -peak * .002) falling = true;
            if (falling) assert(delta <= peak * .002, 'Window contains a secondary brightness flash');
          }
          assert.notEqual(lighting.titlePeak.filter, lighting.titleStart.filter, 'Title brightness never changes');
          assert(Number(lighting.titlePeak.shine) > Number(lighting.titleStart.shine), 'Title shine never appears');
          const halo = lighting.haloSamples;
          assert.equal(lighting.haloAnimationCount, 2, 'Halo must seek both sprite and brightness timelines');
          assert.equal(halo[0].opacity, 0, 'Halo must begin dark');
          assert.equal(halo[1].opacity, 1, 'Halo must reach full brightness at 840ms');
          assert.equal(halo[2].opacity, 1, 'Halo must hold its peak before the final fade');
          assert(halo[2].opacity > halo[3].opacity && halo[3].opacity > halo[4].opacity, 'Halo must fade in its final 200ms');
          halo.slice(5, 8).forEach(sample => assert.equal(sample.opacity, 0, 'Halo must remain dark for five seconds'));
          assert.equal(halo[8].opacity, 1, 'Halo must light again after the dark interval');
          halo.slice(0, 8).forEach((sample, i) => { if (i) assert(sample.position >= halo[i-1].position, 'Halo frame sequence reversed'); });
        }
        let lastTitleTime = 0;
        const checkTitleContinues = async () => {
          const times = await page.locator('.menu-title-sprite').evaluate(element => element.getAnimations({ subtree: true }).map(animation => Number(animation.currentTime)));
          assert.equal(times.length, 4, `${name}: title sprite, light and shine timelines`);
          times.forEach(time => assert(time >= lastTitleTime - 1, `${name}: title animation restarted`));
          lastTitleTime = times[0];
        };
        await checkTitleContinues();
        await page.waitForTimeout(800);
        await checkTitleContinues();
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const frozen = (await read()).effects;
        const frozenMotion = await readMotion();
        frozen.forEach(effect => assert(effect.playState.split(', ').every(state => state === 'paused')));
        await page.waitForTimeout(name === 'desktop' ? 7800 : 180);
        assert.deepEqual((await read()).effects, frozen, `${name}: sprite frames changed while paused`);
        assert.deepEqual(await readMotion(), frozenMotion, `${name}: fog/windows changed while paused`);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        (await read()).effects.forEach(effect => assert(effect.playState.split(', ').every(state => state === 'running')));
        const resumedMotion = await readMotion();
        resumedMotion.windows.forEach((window, i) => {
          if (window.pulse === frozenMotion.windows[i].pulse && window.times.length) {
            assert(window.times[0] >= frozenMotion.windows[i].times[0] - 1, `${name}: resumed pulse restarted`);
            assert(window.times[0] - frozenMotion.windows[i].times[0] < 250, `${name}: resumed pulse caught up elapsed wall time`);
          }
        });
        await page.waitForTimeout(250);
        const progressedMotion = await readMotion();
        const activePulse = resumedMotion.windows.findIndex(window => window.times.length && window.times[0] < 2100);
        if (activePulse >= 0 && progressedMotion.windows[activePulse].pulse === resumedMotion.windows[activePulse].pulse) {
          assert(progressedMotion.windows[activePulse].times[0] > resumedMotion.windows[activePulse].times[0], `${name}: resumed pulse did not progress`);
          // Both the sprite and brightness timelines must advance after resuming.
          assert.equal(progressedMotion.windows[activePulse].times.length, 2);
        }
        await checkTitleContinues();
        await page.setViewportSize({ width: height, height: width });
        await page.waitForFunction(() => {
          const menu = document.querySelector('.avalon-menu');
          const bounds = menu.getBoundingClientRect();
          return menu.dataset.orientation === (bounds.height >= bounds.width ? 'portrait' : 'landscape');
        });
        checkAnchors(await checkLayout(height, width));
        await checkTitleContinues();
        await page.waitForTimeout(800);
        await checkTitleContinues();
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const menu = document.querySelector('.avalon-menu'), bounds = menu.getBoundingClientRect();
          return menu.dataset.orientation === (bounds.height >= bounds.width ? 'portrait' : 'landscape');
        });
        await checkLayout(width, height);
        await page.screenshot({ path: `test-results/menu-layers/${name}.png` });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        // matchMedia listeners run after the CSS media query itself changes.
        await page.waitForFunction(() => [...document.querySelectorAll('.menu-window-glow')].every(element =>
          element.getAnimations().every(animation => animation instanceof CSSAnimation)
          && Math.abs(Number(getComputedStyle(element).opacity) - 0.32) < 0.001));
        (await read()).effects.forEach(effect => assert.equal(effect.animation, 'none'));
        const reducedMotion = await readMotion();
        reducedMotion.fog.forEach(fog => assert.equal(fog.animation, 'none'));
        reducedMotion.windows.forEach(window => {
          assert(Math.abs(Number(window.opacity) - 0.32) < 0.001);
          assert.equal(window.times.length, 0);
          assert(Math.abs(parseFloat(window.position) - 600 / 11) < 0.01, 'Reduced motion must use the brightest window frame');
        });
        if (name === 'desktop') {
          await page.waitForTimeout(7800);
          assert.deepEqual(await readMotion(), reducedMotion, 'Reduced motion must not start new window pulses');
        }
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        if (touch) await page.locator('[data-action="settings"]').tap(); else await page.locator('[data-action="settings"]').click();
        await page.locator('.reference-settings').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('.avalon-menu').waitFor();
        if (touch) await page.locator('[data-action="game-menu"]').tap(); else await page.locator('[data-action="game-menu"]').click();
        await page.locator('.reference-game-menu').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('.avalon-menu').waitFor();
        await page.setViewportSize({ width: height, height: width });
        await page.waitForFunction(() => {
          const menu = document.querySelector('.avalon-menu');
          const bounds = menu.getBoundingClientRect();
          return menu.dataset.orientation === (bounds.height >= bounds.width ? 'portrait' : 'landscape');
        });
        const rotated = await checkLayout(height, width);
        assert.equal(rotated.orientation, width > height ? 'portrait' : 'landscape');
        checkAnchors(rotated);
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`${name}: PASS (assets, scenery coverage, native labels, manifest-backed animated sprites, pause, reduced motion, mouse/touch navigation, rotation)`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
