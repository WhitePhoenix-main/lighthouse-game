// Authoring-only native input verification. Uses an external Playwright installation.
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = (process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const directory = path.resolve('test-results/menu-buttons');

(async () => {
  await fs.mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : {}) });
  const report = [];
  async function check(name, run, options = {}) {
    const context = await browser.newContext({ viewport: options.touch ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      hasTouch: !!options.touch, isMobile: !!options.touch, reducedMotion: options.reduce ? 'reduce' : 'no-preference', locale: 'ru-RU' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    let entry;
    try {
      await page.goto(`${base}/tests/browser/menu-frame.html`);
      await page.locator('.menu-hotspot').first().waitFor();
      await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()));
        window.__buttonCheck = { events: [], departures: [], frames: [] };
        const data = window.__buttonCheck;
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup']) {
          document.addEventListener(type, event => data.events.push({ type, time: performance.now(), trusted: event.isTrusted,
            key: event.key, repeat: event.repeat, pointerId: event.pointerId, action: event.target.closest?.('.menu-hotspot')?.dataset.action }), true);
        }
        let inMenu = true;
        new MutationObserver(() => {
          const button = document.querySelector('.play-hotspot');
          if (inMenu && !button) data.departures.push(performance.now());
          inMenu = !!button;
          if (button?.classList.contains('is-menu-pressing')) data.frames.push({ time: performance.now(),
            position: button.querySelector('.menu-button-frame').style.backgroundPositionX,
            transform: button.querySelector('.menu-button-label-art').style.transform });
        }).observe(document.querySelector('[data-overlay]'), { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
      });
      const play = page.getByRole('button', { name: 'Играть', exact: true });
      const settings = page.getByRole('button', { name: 'Настройки', exact: true });
      const bounds = await play.boundingBox();
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const mouseDown = async () => { await page.mouse.move(center.x, center.y); await page.mouse.down(); };
      const menuPresent = () => page.locator('.avalon-menu').count();
      const read = () => play.evaluate(button => ({ pressed: button.classList.contains('is-menu-pressing'),
        position: button.querySelector('.menu-button-frame').style.backgroundPositionX,
        transform: getComputedStyle(button.querySelector('.menu-button-label-art')).transform,
        scale: Number.parseFloat(getComputedStyle(button).getPropertyValue('--menu-scale')) }));
      const departed = async () => { await page.locator('.reference-game-menu').waitFor();
        await page.waitForTimeout(550);
        assert.equal((await page.evaluate(() => window.__buttonCheck.departures)).length, 1, 'Exactly one menu departure'); };
      const blur = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
      const focus = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
      let cdp;
      const touch = async (type, points = []) => {
        cdp ??= await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ radiusX: 2, radiusY: 2, ...point })) });
      };
      const point = { ...center, id: 1 };
      await run({ page, play, settings, center, mouseDown, menuPresent, read, departed, blur, focus, touch, point });
      assert.deepEqual(errors, [], 'No browser/network errors');
      const evidence = await page.evaluate(() => window.__buttonCheck);
      const nativeEvents = evidence.events.filter(event => event.type === 'click' || event.type === 'pointerdown' || event.type === 'keydown');
      assert(nativeEvents.length > 0 && nativeEvents.every(event => event.trusted), 'Inputs must be trusted browser events');
      entry = { name, passed: true, evidence };
      console.log(`PASS ${name}`);
    } catch (error) {
      entry = { name, passed: false, error: String(error), errors,
        evidence: await page.evaluate(() => window.__buttonCheck).catch(() => null) };
      await page.screenshot({ path: path.join(directory, `${name}-failure.png`) }).catch(() => {});
      console.error(`FAIL ${name}: ${error}`);
    } finally { report.push(entry); await context.close(); }
  }

  try {
    await check('mouse-short-click', async ({ page, play, mouseDown, departed, menuPresent }) => {
      assert.equal(await play.evaluate(button => button.tagName), 'BUTTON');
      await mouseDown(); await page.waitForTimeout(20); await page.mouse.up();
      assert.equal(await menuPresent(), 1, 'Short click must not navigate immediately');
      await page.waitForTimeout(240);
      assert.equal(await menuPresent(), 1, 'Press sequence still visible before 480 ms');
      await departed();
      const data = await page.evaluate(() => window.__buttonCheck);
      const start = data.events.find(event => event.type === 'pointerdown').time;
      assert(data.departures[0] - start >= 460, 'One complete 480 ms press precedes transition');
    });
    await check('mouse-hold', async ({ page, mouseDown, read, menuPresent, departed }) => {
      const idle = await read();
      await mouseDown(); await page.waitForTimeout(550);
      const held = await read();
      assert(held.pressed && Math.abs(Number.parseFloat(held.position) - 400 / 7) < .01);
      const offsetY = Number(held.transform.slice(7, -1).split(',')[5]);
      assert(Math.abs(offsetY - 2 * held.scale) < .1, `Visible label shifts by 2 world pixels: ${JSON.stringify({ idle, held })}`);
      assert.equal(await menuPresent(), 1);
      await page.screenshot({ path: path.join(directory, 'mouse-held.png') });
      await page.mouse.up();
      assert.equal(await menuPresent(), 1);
      await departed();
    });
    await check('mouse-double-click', async ({ page, center, departed }) => {
      await page.mouse.dblclick(center.x, center.y, { delay: 40 });
      await departed();
    });
    await check('settings-native-click', async ({ page, settings, menuPresent }) => {
      assert.equal(await settings.evaluate(button => button.tagName), 'BUTTON');
      await settings.click();
      assert.equal(await menuPresent(), 1);
      await page.locator('.reference-settings').waitFor();
      assert.equal((await page.evaluate(() => window.__buttonCheck.departures)).length, 1);
    });
    await check('mouse-release-outside', async ({ page, mouseDown, read, menuPresent, play, departed }) => {
      await mouseDown(); await page.waitForTimeout(350);
      await page.mouse.move(8, 8); await page.mouse.up(); await page.waitForTimeout(600);
      assert.equal(await menuPresent(), 1); assert.equal((await read()).pressed, false);
      await play.click(); await departed();
    });
    for (const key of ['Enter', 'Space']) await check(`keyboard-${key.toLowerCase()}`, async ({ page, play, menuPresent, departed }) => {
      await play.focus(); await page.keyboard.press(key);
      assert.equal(await menuPresent(), 1);
      await departed();
    });
    await check('keyboard-space-hold', async ({ page, play, read, departed, menuPresent }) => {
      await play.focus(); await page.keyboard.down('Space'); await page.waitForTimeout(550);
      assert.equal(await menuPresent(), 1); assert((await read()).pressed);
      await page.keyboard.up('Space'); await departed();
    });
    await check('keyboard-enter-repeat', async ({ page, play, departed }) => {
      await play.focus(); await page.keyboard.down('Enter'); await page.keyboard.down('Enter');
      await page.waitForTimeout(400); await page.keyboard.up('Enter'); await departed();
    });
    await check('mouse-blur-hold', async ({ page, mouseDown, blur, focus, read, menuPresent, play, departed }) => {
      await mouseDown(); await page.waitForTimeout(380); await blur();
      await page.mouse.up(); await page.waitForTimeout(600);
      assert.equal(await menuPresent(), 1); assert.equal((await read()).pressed, false);
      await focus(); await play.click(); await departed();
    });
    await check('space-blur-without-keyup', async ({ page, play, blur, focus, read, menuPresent, departed }) => {
      await play.focus(); await page.keyboard.down('Space'); await page.waitForTimeout(380); await blur();
      await page.waitForTimeout(600); await focus();
      assert.equal(await menuPresent(), 1); assert.equal((await read()).pressed, false);
      // No keyup is sent: a new pointer gesture must still work after resume.
      await play.click(); await departed();
    });
    await check('confirmed-enter-pause-without-keyup', async ({ page, play, blur, focus, read, departed, menuPresent }) => {
      await play.focus(); await page.keyboard.down('Enter'); await page.waitForTimeout(140); await blur();
      const paused = await read(); await page.waitForTimeout(650);
      assert.equal(await menuPresent(), 1); assert.deepEqual(await read(), paused);
      await focus(); await departed();
    });
    await check('confirmed-click-pause', async ({ page, play, blur, focus, read, menuPresent, departed }) => {
      await play.click(); await page.waitForTimeout(130); await blur();
      const paused = await read(); await page.waitForTimeout(650);
      assert.equal(await menuPresent(), 1); assert.deepEqual(await read(), paused);
      await focus(); await departed();
    });
    await check('reduced-motion', async ({ page, play, departed }) => {
      await play.click(); await page.locator('.reference-game-menu').waitFor();
      const data = await page.evaluate(() => window.__buttonCheck);
      const start = data.events.find(event => event.type === 'click').time;
      assert(data.departures[0] - start < 150, 'Reduced motion has no 480 ms delay');
      await departed();
    }, { reduce: true });
    await check('touch-short-tap', async ({ page, touch, point, menuPresent, departed }) => {
      await touch('touchStart', [point]); await page.waitForTimeout(25); await touch('touchEnd');
      assert.equal(await menuPresent(), 1); await departed();
    }, { touch: true });
    await check('touch-hold', async ({ page, touch, point, read, menuPresent, departed }) => {
      await touch('touchStart', [point]); await page.waitForTimeout(500);
      assert.equal(await menuPresent(), 1); assert(Math.abs(Number.parseFloat((await read()).position) - 400 / 7) < .01);
      await page.screenshot({ path: path.join(directory, 'touch-held.png') });
      await touch('touchEnd'); await departed();
    }, { touch: true });
    await check('touch-blur-hold', async ({ page, touch, point, blur, focus, read, menuPresent, departed }) => {
      await touch('touchStart', [point]); await page.waitForTimeout(380); await blur();
      await page.waitForTimeout(600); await focus();
      assert.equal(await menuPresent(), 1); assert.equal((await read()).pressed, false);
      await touch('touchEnd'); await page.waitForTimeout(550);
      assert.equal(await menuPresent(), 1, 'A stale release after focus must not confirm an action');
      await touch('touchStart', [{ ...point, id: 7 }]); await touch('touchEnd'); await departed();
    }, { touch: true });
    for (const kind of ['move-outside', 'cancel']) await check(`touch-${kind}`, async ({ page, touch, point, read, menuPresent, departed }) => {
      await touch('touchStart', [point]); await page.waitForTimeout(350);
      if (kind === 'move-outside') { await touch('touchMove', [{ ...point, x: 10, y: 10 }]); await touch('touchEnd'); }
      else await touch('touchCancel');
      await page.waitForTimeout(600);
      assert.equal(await menuPresent(), 1); assert.equal((await read()).pressed, false);
      await touch('touchStart', [{ ...point, id: 7 }]); await touch('touchEnd'); await departed();
    }, { touch: true });
    await check('touch-two-fingers', async ({ page, settings, touch, point, read, menuPresent, departed }) => {
      const rect = await settings.boundingBox();
      const other = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 2 };
      await touch('touchStart', [point]); await touch('touchStart', [point, other]);
      await page.waitForTimeout(350); await touch('touchEnd', [point]); await touch('touchEnd');
      await page.waitForTimeout(600);
      const data = await page.evaluate(() => window.__buttonCheck);
      assert(data.departures.length <= 1, 'Second finger never creates a second transition');
      if (await menuPresent()) {
        assert.equal((await read()).pressed, false, 'No stranded press after multi-touch');
        await touch('touchStart', [{ ...point, id: 8 }]); await touch('touchEnd'); await departed();
      } else assert.equal(await page.locator('.reference-game-menu').count(), 1, 'Secondary finger must not activate settings');
    }, { touch: true });
  } finally {
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({ base, generatedAt: new Date().toISOString(), checks: report }, null, 2));
    await browser.close();
  }
  assert(report.every(entry => entry.passed), `${report.filter(entry => !entry.passed).length} native menu button checks failed`);
  console.log(`Verified ${report.length} isolated native input scenarios. Report: ${directory}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
