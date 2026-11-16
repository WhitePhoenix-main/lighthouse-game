// Optional local browser QA. Uses isolated in-memory fixtures, never the user's saved profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const base = (process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5174').replace(/\/$/, '');
const output = 'test-results/game-menu';
async function settled(page) {
  await page.waitForFunction(() => {
    const page = document.querySelector('.reference-game-menu');
    return page?.dataset.ready === 'true' && !page.inert && !document.querySelector('[data-game-menu-ghost]');
  });
}
async function open(page, query = '') {
  await page.goto(`${base}/tests/browser/game-menu-frame.html${query}`);
  await page.locator('.menu-title-ready').waitFor();
  await page.evaluate(() => { window.originalMenuScene = document.querySelector('.menu-scenery'); });
  await page.locator('.play-hotspot').click();
  await settled(page);
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.LIGHTHOUSE_BROWSER_PATH ? { executablePath: process.env.LIGHTHOUSE_BROWSER_PATH } : { channel: 'chrome' }) });
  const reports = [];
  try {
    for (const [name, width, height, touch, query] of [
      ['desktop-saved', 1672, 941, false, '?saved'], ['desktop-new', 1672, 941, false, ''],
      ['portrait-saved', 390, 844, true, '?saved'], ['portrait-new', 390, 844, true, ''],
      ['landscape', 844, 390, true, '?saved'], ['small-portrait', 320, 568, true, '?saved&large'],
      ['small-landscape', 568, 320, true, '?saved&large'], ['tablet', 768, 1024, true, '?saved'],
      ['english-large', 390, 844, true, '?saved&language=en&large']
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      try {
        await open(page, query);
        const report = await page.evaluate(() => ({
          layout: document.querySelector('.reference-game-menu').dataset.layout,
          scenePreserved: document.querySelector('.menu-scenery') === window.originalMenuScene,
          sceneCount: document.querySelectorAll('.menu-scenery').length,
          floor: !document.querySelector('.game-menu-floor').hidden,
          continueDisabled: document.querySelector('[data-action="continue-game"]').disabled,
          writes: window.gameMenuFixture.writes(),
          overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          buttons: [...document.querySelectorAll('.game-menu-control')].map(el => {
            const r = el.getBoundingClientRect(); return { action: el.dataset.action, x: r.x, y: r.y, width: r.width, height: r.height };
          })
        }));
        assert(report.scenePreserved && report.sceneCount === 1, `${name}: background was replaced`);
        assert(!report.overflow, `${name}: scroll overflow`);
        assert.equal(report.floor, report.layout === 'desktop');
        assert.equal(report.continueDisabled, !query.includes('saved'));
        assert.equal(report.writes, 0, `${name}: opening menu must not create progress`);
        for (const b of report.buttons) {
          assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${name}: control clipped ${JSON.stringify(b)}`);
          assert(b.width >= 44 && b.height >= 44, `${name}: small touch target`);
        }
        await page.screenshot({ path: `${output}/${name}.png` });
        if (name === 'desktop-saved') {
          const button = page.locator('[data-action="trials"]');
          await button.hover();
          assert.equal(await button.locator('.game-menu-sprite').evaluate(el => getComputedStyle(el).backgroundPositionX), '33.3333%');
          await page.screenshot({ path: `${output}/desktop-hover.png` });
          await page.mouse.down();
          assert.equal(await button.locator('.game-menu-sprite').evaluate(el => getComputedStyle(el).backgroundPositionX), '66.6667%');
          await page.screenshot({ path: `${output}/desktop-pressed.png` });
          await page.mouse.up();
          await page.locator('.trials-panel').waitFor();
          assert.equal(await page.evaluate(() => window.gameMenuFixture.writes()), 0);
          await page.getByRole('button', { name: '← Назад' }).click(); await settled(page);
          await page.locator('[data-action="new-game"]').click();
          await page.locator('.game-menu-confirm').waitFor();
          assert.equal(await page.evaluate(() => window.gameMenuFixture.writes()), 0);
          await page.keyboard.press('Escape'); await settled(page);
          assert.equal(await page.locator('.game-menu-confirm').count(), 0);
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.profile.resources), 123);
          await page.locator('[data-action="new-game"]').click();
          await page.locator('.game-menu-confirm').waitFor();
          await page.evaluate(() => window.gameMenuFixture.fail(true));
          await page.locator('[data-action="confirm-new-game"]').click();
          await page.waitForFunction(() => !!window.gameMenuFixture.app.view.error);
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('.game-menu-confirm [data-action="save"]').evaluate(el => el === document.activeElement), true);
          await page.locator('[data-action="cancel-new-game"]').click(); await settled(page);
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.error), null);
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.profile.resources), 123);
          await page.evaluate(() => window.gameMenuFixture.fail(false));
          await page.locator('[data-action="new-game"]').click();
          await page.locator('.game-menu-confirm').waitFor();
          await page.locator('[data-action="confirm-new-game"]').click();
          await page.waitForFunction(() => window.gameMenuFixture.app.view.screen === 'preparation');
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.profile.resources), 0);
        } else if (name === 'portrait-new') {
          await page.evaluate(() => window.gameMenuFixture.fail(true));
          await page.locator('[data-action="new-game"]').tap();
          await page.locator('.game-menu-confirm').waitFor();
          await page.locator('[data-action="cancel-new-game"]').tap(); await settled(page);
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.hasProgress), false);
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.error), null);
          await page.evaluate(() => window.gameMenuFixture.fail(false));
          await page.locator('[data-action="new-game"]').tap();
          await page.waitForFunction(() => window.gameMenuFixture.app.view.screen === 'preparation');
          assert.equal(await page.evaluate(() => window.gameMenuFixture.writes()), 1);
        } else if (name === 'portrait-saved') {
          await page.setViewportSize({ width: 844, height: 390 }); await settled(page);
          assert.equal(await page.evaluate(() => document.querySelector('.menu-scenery') === window.originalMenuScene), true);
          await page.setViewportSize({ width, height }); await settled(page);
          await page.locator('[data-action="continue-game"]').tap();
          await page.waitForFunction(() => window.gameMenuFixture.app.view.screen === 'preparation');
          assert.equal(await page.evaluate(() => window.gameMenuFixture.app.view.selectedNightId), 'winged-tide');
        } else if (name === 'desktop-new') {
          await page.keyboard.press('Escape');
          await page.locator('.play-hotspot').waitFor();
          assert.equal(await page.evaluate(() => document.querySelector('.menu-scenery') === window.originalMenuScene), true);
          await page.locator('.settings-hotspot').click();
          await page.locator('.reference-settings[data-ready="true"]').waitFor();
          await page.waitForFunction(() => !document.querySelector('.reference-settings').inert);
          await page.keyboard.press('Escape'); await page.locator('.play-hotspot').waitFor();
        }
        assert.deepEqual(errors, [], `${name}: browser errors`);
        reports.push({ name, ...report });
      } finally { await context.close(); }
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); await open(page, '?saved');
    assert.equal(await page.locator('.game-menu-board').evaluate(el => el.getAnimations().length), 0);
    await context.close();
    await fs.writeFile(`${output}/verification.json`, JSON.stringify(reports, null, 2));
    console.log(`Verified ${reports.length} viewports, reduced motion, persistent scenery, mouse/touch, hover/press, continue, trials, reset/cancel/failure and settings return.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
