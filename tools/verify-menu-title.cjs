// Authoring-only raster regression: checks the visible title, including later repeats.
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const sharp = require(process.env.LIGHTHOUSE_SHARP_PATH || 'sharp');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const timing = { delay: 3000, pass: 720, pause: 20000 };
const cycle = timing.pass + timing.pause;

function difference(first, second, threshold = 24) {
  assert.equal(first.length, second.length);
  let changed = 0, maximum = 0;
  for (let i = 0; i < first.length; i += 3) {
    const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(first[i + channel] - second[i + channel])));
    if (delta >= threshold) changed++;
    maximum = Math.max(maximum, delta);
  }
  return { fraction: changed / (first.length / 3), maximum };
}

(async () => {
  const directory = 'test-results/menu-title';
  await fs.mkdir(directory, { recursive: true });
  const report = [];
  const browser = await chromium.launch({ headless: true,
    ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : {}) });
  try {
    for (const [name, width, height] of [['desktop', 1280, 720], ['portrait', 390, 844], ['landscape', 844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        await page.goto(base);
        const title = page.locator('.menu-title-sprite.menu-title-ready');
        await title.waitFor();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode()));
          await Promise.all([...document.querySelectorAll('.menu-sprite')].map(async element => {
            const image = new Image();
            image.src = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage)[1];
            await image.decode();
          }));
          // Freeze the scenery too, so pixel differences can only come from the title.
          window.dispatchEvent(new Event('blur'));
        });
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await settle();
        assert.deepEqual(await title.evaluate(element => element.getAnimations({ subtree: true }).map(animation => animation.playState)), Array(4).fill('paused'));
        const timelines = await title.evaluate(element => element.getAnimations({ subtree: true }).map(animation => {
          const { delay, duration, iterations } = animation.effect.getTiming();
          return { delay, duration, repeats: iterations === Infinity };
        }));
        assert.deepEqual(timelines, Array(4).fill({ delay: timing.delay, duration: cycle, repeats: true }));
        const seek = async time => {
          await title.evaluate((element, value) => {
            element.getAnimations({ subtree: true }).forEach(animation => { animation.currentTime = value; });
          }, time);
          await settle();
        };
        const capture = async (time, file) => {
          await seek(time);
          const png = await title.screenshot({ ...(file ? { path: `${directory}/${name}-${file}.png` } : {}), animations: 'allow' });
          return sharp(png).removeAlpha().raw().toBuffer();
        };
        await seek(timing.delay - 1);
        assert.equal(await title.evaluate(element => getComputedStyle(element, '::after').opacity), '0', 'Title must wait three seconds before its first shine');
        const idle = await capture(timing.delay + timing.pass + 1000, 'idle');
        assert.equal(await title.evaluate(element => getComputedStyle(element).backgroundPositionX), '100%');
        const firstPeak = await capture(timing.delay + timing.pass * .45, 'shine');
        const repeatedPeak = await capture(timing.delay + cycle + timing.pass * .45, 'repeat');
        const laterIdle = await capture(timing.delay + cycle - 1);
        const visibility = difference(idle, firstPeak);
        const repeat = difference(idle, repeatedPeak);
        const repeatConsistency = difference(firstPeak, repeatedPeak, 4);
        const idleStability = difference(idle, laterIdle, 4);
        assert(visibility.fraction > .08 && visibility.maximum > 40, `${name}: title shine is barely visible: ${JSON.stringify(visibility)}`);
        assert(repeat.fraction > .08, `${name}: title stopped after the first pass`);
        assert(repeatConsistency.fraction < .005, `${name}: later shine differs from the first pass`);
        assert(idleStability.fraction < .001, `${name}: title does not hold still between passes`);

        if (name === 'portrait') {
          const frames = [];
          let frameInfo;
          // One full repeating cycle: 720ms motion, then a single 20-second still frame.
          const schedule = [...Array.from({ length: 6 }, (_, frame) => ({ time: timing.delay + frame * 120, delay: 120 })),
            { time: timing.delay + timing.pass, delay: timing.pause }];
          for (const frame of schedule) {
            await seek(frame.time);
            const raster = await sharp(await title.screenshot({ animations: 'allow' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
            frames.push(raster.data);
            frameInfo = raster.info;
          }
          await sharp(Buffer.concat(frames), { raw: { width: frameInfo.width, height: frameInfo.height * frames.length, channels: 3, pageHeight: frameInfo.height } })
            .gif({ delay: schedule.map(frame => frame.delay), loop: 0, effort: 3 }).toFile(`${directory}/motion.gif`);
        }

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await settle();
        assert.deepEqual(await title.evaluate(element => ({
          animation: getComputedStyle(element).animationName,
          position: getComputedStyle(element).backgroundPositionX,
          shine: getComputedStyle(element, '::after').opacity
        })), { animation: 'none', position: '100%', shine: '0' });
        assert.deepEqual(errors, []);
        report.push({ name, width, height, visibility, repeat, repeatConsistency, idleStability });
        console.log(`${name}: PASS (visible raster shine, later repeat, stationary pause, reduced motion)`);
      } finally { await context.close(); }
    }
  } finally {
    await fs.writeFile(`${directory}/visibility.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
