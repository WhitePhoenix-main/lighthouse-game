const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');

const url = new URL(process.env.LIGHTHOUSE_TEST_URL || 'http://127.0.0.1:5196/');
assert(['localhost', '127.0.0.1'].includes(url.hostname));
const output = path.resolve(__dirname, '../../../test-results/settings-menu-reference');
const formats = [['desktop', 1280, 720], ['landscape', 720, 360], ['portrait', 360, 640], ['tall', 390, 844]];

async function capture(browser, [name, width, height]) {
  const mobile = name !== 'desktop';
  const context = await browser.newContext({ viewport: { width, height }, locale: 'ru-RU',
    hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
    await page.goto(url.href);
    await page.locator('.menu-title-ready').waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const animation of document.getAnimations()) animation.pause();
    });
    await page.screenshot({ path: path.join(output, `${name}-menu.png`), scale: 'css' });
    const hide = await page.addStyleTag({ content: '.menu-artboard { visibility: hidden !important; }' });
    await page.screenshot({ path: path.join(output, `${name}-coast.png`), scale: 'css' });
    await hide.evaluate(element => element.remove());

    const settings = page.locator('[data-action="settings"]');
    if (mobile) await settings.tap();
    else await settings.click();
    await page.locator('.settings-back').waitFor();
    await page.screenshot({ path: path.join(output, `${name}-current.png`), scale: 'css' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const { createServer } = await import('vite');
  const server = process.env.LIGHTHOUSE_TEST_URL ? undefined : await createServer({
    server: { host: url.hostname, port: Number(url.port), strictPort: true, hmr: false, watch: null },
  });
  try {
    await server?.listen();
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      for (const format of formats) await capture(browser, format);
    } finally {
      await browser.close();
    }
  } finally {
    await server?.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
