// Authoring-only raster check: external Playwright and sharp never enter the game bundle.
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const sharp = require(process.env.LIGHTHOUSE_SHARP_PATH || 'sharp');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.argv[2] || 'http://127.0.0.1:4173/';

function difference(first, second, threshold) {
  let changed = 0, maximum = 0;
  for (let i = 0; i < first.length; i += 3) {
    const delta = Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i + 1] - second[i + 1]), Math.abs(first[i + 2] - second[i + 2]));
    if (delta >= threshold) changed++;
    maximum = Math.max(maximum, delta);
  }
  return { fraction: changed / (first.length / 3), maximum };
}

(async () => {
  await fs.mkdir('test-results/fog', { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : {}) });
  const report = [];
  try {
    for (const [name, width, height] of [['desktop', 1280, 720], ['portrait', 390, 844], ['landscape', 844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, locale: 'ru-RU', deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        await page.goto(base);
        await page.locator('.menu-fog').waitFor();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode()));
          await Promise.all([...document.querySelectorAll('.menu-sprite')].map(async element => {
            const image = new Image();
            image.src = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage)[1];
            await image.decode();
          }));
        });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.menu-title-sprite')).backgroundPositionX === '100%');
        // Freeze unrelated scenery and the window scheduler, then seek only fog timelines.
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const seek = async time => {
          await page.locator('.menu-fog-veil').evaluateAll((elements, value) => {
            for (const element of elements) for (const animation of element.getAnimations()) animation.currentTime = value;
          }, time);
          await settle();
        };
        await seek(0);
        const firstPng = await page.screenshot({ path: `test-results/fog/${name}-0s.png` });
        const first = await sharp(firstPng).removeAlpha().raw().toBuffer();
        await page.locator('.menu-fog').evaluate(element => { element.style.visibility = 'hidden'; });
        const without = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
        await page.locator('.menu-fog').evaluate(element => { element.style.visibility = ''; });
        await seek(4000);
        const later = await sharp(await page.screenshot({ path: `test-results/fog/${name}-4s.png` })).removeAlpha().raw().toBuffer();
        const visibility = difference(first, without, 8);
        const movement = difference(first, later, 5);
        report.push({ name, width, height, visibility, movement });
        assert(visibility.fraction >= .015, `${name}: fog barely affects the rendered image ${JSON.stringify(visibility)}`);
        assert(movement.fraction >= .005, `${name}: motion is imperceptible over four seconds ${JSON.stringify(movement)}`);
        assert.deepEqual(errors, []);
        if (name === 'desktop') {
          const frames = [];
          for (let frame = 0; frame < 12; frame++) {
            await seek(frame * 500);
            frames.push(await sharp(await page.screenshot()).resize(960, 540).removeAlpha().raw().toBuffer());
          }
          await sharp(Buffer.concat(frames), { raw: { width: 960, height: 540 * frames.length, channels: 3, pageHeight: 540 } })
            .gif({ delay: Array(frames.length).fill(500), loop: 0, effort: 3 }).toFile('test-results/fog/motion.gif');
        }
        console.log(`${name}: PASS ${JSON.stringify({ visibility, movement })}`);
      } finally { await context.close(); }
    }
  } finally {
    await fs.writeFile('test-results/fog/visibility.json', JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
