// Capture the eight navigation states from the Avalon Watch reference on disposable profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');

const output = path.resolve('test-results/watch-art-audit/workshop');
const formats = [
  ['desktop', 1280, 720],
  ['landscape', 720, 360],
  ['portrait', 360, 640],
];
const preparation = name => `[data-prep-action="${name}"]`;
const action = name => `[data-action="${name}"]`;

async function seedCampaign(page, origin, lang, size, finale) {
  await page.evaluate(async ({ lang, size, finale }) => {
    const { emptyCampaignProfile, decodeCampaignProfile } = await import('/src/application/campaignProfileCodec.ts');
    const { CAMPAIGN_NIGHT_CATALOG } = await import('/src/content/campaignRuntime.ts');
    const { CAMPAIGN_CHAPTER_DRAFT } = await import('/src/content/campaignFoundationDraft.ts');
    const profile = emptyCampaignProfile();
    profile.shards = 85;
    profile.purchasedNodeIds = ['beam-power-1'];
    profile.wonNightIds = ['first-light', 'broken-shore'];
    profile.selectedNightId = 'winged-tide';
    profile.seenIntroIds = [CAMPAIGN_CHAPTER_DRAFT[0].introId];
    if (finale) {
      profile.wonNightIds = CAMPAIGN_NIGHT_CATALOG.map(night => night.id);
      profile.seenIntroIds = CAMPAIGN_CHAPTER_DRAFT.map(chapter => chapter.introId);
      profile.rewards = {
        unlockedIds: ['siege-cannon', 'long-harpoon', 'bronze-devices', 'moonbeam'],
        operations: [], collectionPoints: {}, equipped: {},
      };
    }
    profile.completedNights = profile.wonNightIds.length;
    const record = JSON.stringify(profile);
    decodeCampaignProfile(record);
    localStorage.setItem('lighthouse.campaign.v1', record);
    localStorage.setItem('lighthouse.settings.v1', JSON.stringify({
      version: 3, language: lang, textSize: size, soundEnabled: false, musicVolume: 0, effectsVolume: 0,
    }));
  }, { lang, size, finale });
  await page.goto(origin);
}

async function measureScreen(root) {
  return root.evaluate(async element => {
    const rect = target => {
      if (!target) return null;
      const { x, y, width, height } = target.getBoundingClientRect();
      return [x, y, width, height];
    };
    const layout = target => [target.clientWidth, target.scrollWidth, target.clientHeight, target.scrollHeight, rect(target)];
    const main = element.querySelector('.chronicle-scroll, .campaign-circuit-viewport, .campaign-display-case');
    const footer = element.querySelector('.chronicle-actions, .campaign-upgrade-actions, .campaign-display > button');
    const buttons = [...element.querySelectorAll('button, summary')].filter(control =>
      control.getClientRects().length && (!control.closest('details:not([open])') || control.matches('summary')));
    const badTargets = buttons.filter(control => control.offsetHeight < 44 || control.offsetWidth < 44)
      .map(control => [control.textContent.trim(), rect(control)]);
    const images = [...element.querySelectorAll('img')].filter(image => image.getClientRects().length);
    await Promise.all(images.map(image => image.decode().catch(() => {})));
    const clippedChronicleLabels = [...element.querySelectorAll('.chronicle-heading h1, .chronicle-confirm')].flatMap(label => {
      const box = label.getBoundingClientRect();
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const clipped = [];
      while (walker.nextNode()) {
        const text = walker.currentNode;
        for (const word of text.textContent.matchAll(/\S+/gu)) {
          range.setStart(text, word.index);
          range.setEnd(text, word.index + word[0].length);
          const bounds = range.getBoundingClientRect();
          if (bounds.left < box.left - 1 || bounds.right > box.right + 1) clipped.push(word[0]);
        }
      }
      return clipped;
    });
    return {
      badTargets, clippedChronicleLabels, root: layout(element), main: main && layout(main), footer: rect(footer),
      width: innerWidth, height: innerHeight, broken: images.filter(image => !image.naturalWidth).map(image => image.src),
      untranslated: /[А-ЯЁа-яё]/.test(element.innerText),
    };
  });
}

async function capture(browser, origin, [format, width, height], lang, size) {
  const touch = format !== 'desktop';
  const name = [format, lang, size].join('-');
  const directory = path.join(output, name);
  await fs.mkdir(directory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: touch, isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1, locale: lang,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const errors = [];
  const results = {};
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const hit = async selector => {
    const control = page.locator(selector + ':visible').first();
    if (touch) await control.tap();
    else await control.click();
  };
  const shot = async (slug, selector) => {
    const root = page.locator(selector).first();
    await root.waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const metrics = await measureScreen(root);
    assert.deepEqual(metrics.badTargets, [], `${slug}: controls smaller than 44 CSS px`);
    assert.deepEqual(metrics.clippedChronicleLabels, [], `${slug}: clipped chronicle labels`);
    assert.deepEqual(metrics.broken, [], `${slug}: missing images`);
    assert(metrics.root[1] <= metrics.width, `${slug}: horizontal screen overflow`);
    if (metrics.footer) assert(metrics.footer[1] + metrics.footer[3] <= metrics.height + 1, `${slug}: clipped actions`);
    if (lang === 'en') assert(!metrics.untranslated, `${slug}: untranslated text`);
    results[slug] = metrics;
    await page.screenshot({ path: path.join(directory, slug + '.png'), scale: 'css' });
  };
  const continueCampaign = async finale => {
    await seedCampaign(page, origin, lang, size, finale);
    await hit('.play-hotspot');
    await hit(action('continue-game'));
  };
  try {
    await page.goto(origin + '/tests/browser/preparation-frame.html?game-menu');
    await continueCampaign(false);
    await hit('.prep-night');
    await shot('chronicle', '.night-chronicle');
    await hit(preparation('chronicle-contents'));
    await hit(preparation('chronicle-chapter') + '[data-chapter="2"]');
    await shot('chronicle-chapters', '.night-chronicle');
    await hit(preparation('close-panel'));

    await hit(preparation('development'));
    const node = id => `.campaign-circuit-node[data-node="${id}"]`;
    await hit(node('beam-power-2'));
    await shot('upgrades', '.campaign-development');
    await hit(node('paired-light'));
    await shot('upgrades-locked', '.campaign-development');
    assert(await page.locator(action('campaign-purchase')).isDisabled());
    await page.locator('.campaign-circuit-viewport').evaluate(viewport => {
      viewport.scrollLeft += Math.round(viewport.clientWidth * .8);
    });
    await page.waitForSelector('.campaign-circuit-viewport[data-optics-scrolled]');
    await hit('[data-focus-key="campaign-branches"]');
    await hit('[data-focus-key="campaign-branch-beam-power-1"]');
    await hit('.campaign-group-picker summary');
    const generalFilter = '.campaign-group-picker [data-filter="general"]';
    await hit(generalFilter);
    assert.equal(await page.locator(generalFilter).getAttribute('aria-pressed'), 'true');
    await hit('.campaign-development ' + action('back'));

    await page.goto(`${origin}/tests/browser/game-menu-frame.html?saved&language=${lang}${size === 'large' ? '&large' : ''}`);
    await hit('.play-hotspot');
    await hit(action('trials'));
    await shot('trials', '.night-chronicle');
    await hit('[data-night="armored-front"]');
    await shot('trials-locked', '.night-chronicle');
    assert(await page.locator(preparation('confirm-night')).isDisabled());
    assert(await page.locator('.chronicle-nights li:last-child').evaluate(entry =>
      entry.getBoundingClientRect().bottom <= entry.closest('.chronicle-scroll').getBoundingClientRect().bottom + 1));

    await continueCampaign(true);
    await hit(preparation('campaign-collection'));
    await shot('collection', '.campaign-collection');
    await hit(action('campaign-reward-claim'));
    await hit(action('campaign-cosmetic'));
    await shot('collection-equipped', '.campaign-collection');
    await hit(action('campaign-cosmetic'));
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, 'metrics.json'), JSON.stringify(results, null, 2));
    console.log(`${name} OK`);
  } catch (error) {
    await page.screenshot({ path: path.join(directory, 'failed.png'), scale: 'css' });
    console.error(`${name} ${error.stack}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  const browserPath = process.env.LIGHTHOUSE_BROWSER_PATH;
  try {
    const browser = await chromium.launch({
      ...(browserPath ? { executablePath: browserPath } : { channel: 'chrome' }),
      headless: true, args: ['--enable-unsafe-swiftshader'],
    });
    try {
      for (const language of ['ru', 'en']) {
        for (const size of ['normal', 'large']) {
          for (const format of formats) {
            const name = [format[0], language, size].join('-');
            if (!process.env.WATCH_CASE || name.includes(process.env.WATCH_CASE)) {
              await capture(browser, origin, format, language, size);
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
