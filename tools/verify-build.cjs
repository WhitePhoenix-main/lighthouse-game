const assert = require('node:assert/strict');
// External authoring dependency, like verify-menu.cjs; no game runtime dependency.
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const ambientLayers = require('../sprites/ambient-manifest.json').layers;
assert(Array.isArray(ambientLayers) && ambientLayers.length > 0, 'Ambient manifest must contain layers');
const urls = process.argv.slice(2);
if (!urls.length) urls.push(process.env.LIGHTHOUSE_TEST_URL || 'http://127.0.0.1:4173/');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : {}) });
  try {
    for (const url of urls) {
      // A fresh context avoids touching the player's saves or hiding bad paths in cache.
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        page.on('requestfailed', request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
        await page.goto(url);
        await page.locator('.menu-title').waitFor({ timeout: 10000 }).catch(async error => {
          throw new Error(`Menu failed at ${url}: ${JSON.stringify(errors)}; ${await page.locator('body').innerText()}`, { cause: error });
        });
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
        assert.equal(await page.evaluate(() => document.fonts.check('24px "Avalon Menu"')), true);
        const assetBase = new URL('./', page.url());
        const layerBase = new URL('images/menu-layers/', assetBase).href;
        const spriteBase = new URL('images/menu-sprites/', assetBase).href;
        const buttonBase = new URL('images/menu-buttons-v2/', assetBase).href;
        const buttonBackgrounds = await page.locator('.menu-button-frame, .menu-button-label-art').evaluateAll(elements => elements.map(element => {
          const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage);
          return match?.[1];
        }));
        assert.equal(buttonBackgrounds.length, 4, `${url}: missing button art`);
        assert(buttonBackgrounds.every(src => src?.startsWith(buttonBase)), `${url}: button CSS image ignores the document base URL`);
        const imageSources = await page.locator('.avalon-menu img').evaluateAll(images => images.map(image => image.currentSrc));
        assert(imageSources.length > 0, `${url}: missing menu images`);
        assert(imageSources.every(src => src.startsWith(layerBase) || src.startsWith(spriteBase) || src.startsWith(buttonBase)), `${url}: image ignores BASE_URL`);
        assert.equal(await page.locator('img.menu-background').evaluate(image => image.currentSrc), `${spriteBase}background.png`);
        assert.deepEqual(await page.locator('img.menu-background').evaluate(image => [image.naturalWidth, image.naturalHeight]), [640, 640]);
        const spriteSources = await page.locator('.menu-sprite').evaluateAll(elements => elements.map(element => {
          const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage);
          return match?.[1];
        }));
        assert.equal(spriteSources.length, 13 + ambientLayers.length, `${url}: missing sprite layers`);
        assert(spriteSources.every(src => src?.startsWith(spriteBase)), `${url}: CSS image ignores BASE_URL`);
        assert(spriteSources.includes(`${spriteBase}title.png`), `${url}: missing title sprite`);
        assert(spriteSources.includes(`${spriteBase}ship-wake.png`), `${url}: missing ship wake`);
        assert.equal(await page.locator('.menu-ship-wake').evaluate(element => getComputedStyle(element).animationDuration), '1.4s');
        for (const layer of ambientLayers) assert(spriteSources.includes(`${spriteBase}${layer.file}`), `${url}: missing ambient sprite ${layer.id}`);
        const title = page.locator('h1.menu-title');
        assert.equal(await title.getAttribute('aria-label'), 'Свет Авалона');
        assert.equal((await title.innerText()).trim(), '');
        await title.focus();
        assert.equal(await title.evaluate(element => document.activeElement === element), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('[data-action="game-menu"]').evaluate(element => document.activeElement === element), true);
        const titleGeometry = await page.locator('.menu-title-sprite').evaluate(async element => {
          const style = getComputedStyle(element), image = new Image();
          image.src = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)[1]; await image.decode();
          return [image.naturalWidth, image.naturalHeight, style.backgroundSize];
        });
        assert.deepEqual(titleGeometry, [1920, 80, '800% 100%']);
        assert.equal(await page.locator('.menu-window-glow').count(), 5);
        assert.equal(await page.locator('.menu-fog-bank .menu-fog-veil').count(), 2);
        assert.equal(await page.locator('.menu-moon-halo').count(), 1);
        assert.equal(await page.locator('.menu-moon').evaluate(element => getComputedStyle(element).animationDuration), '14s');
        assert.deepEqual(await page.locator('.menu-window-glow').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName)), Array(5).fill('none'));
        assert.deepEqual(await page.locator('.menu-lantern-halo').evaluate(element => getComputedStyle(element).animationDuration.split(', ')), ['7.8s', '7.8s']);
        await page.locator('.menu-title-ready').waitFor();
        assert.equal(await page.locator('.menu-ship-glow').count(), 2);
        for (const selector of ['.menu-ship', '.menu-sail']) {
          assert.deepEqual(await page.locator(selector).evaluate(element => {
            const style = getComputedStyle(element); return [style.animationName, style.backgroundPositionX];
          }), ['none', '0%']);
        }
        await page.locator('[data-action="settings"]').click();
        await page.locator('.reference-settings[data-ready="true"]').waitFor();
        await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
        await page.keyboard.press('Escape');
        await page.locator('.menu-title').waitFor();
        assert.deepEqual(errors, [], url);
        console.log(`${url}: PASS (JavaScript, CSS, images, font, settings, no 404 or page errors)`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
