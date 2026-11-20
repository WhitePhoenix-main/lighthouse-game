// Inspect the live route through accessible controls. Only the menu is a visual source.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({locale:'ru-RU', reducedMotion:'reduce', viewport:{width:1280,height:720}});
  const evidence = {};
  await page.goto(server.resolvedUrls.local[0]);
  const button = (selector) => page.locator(selector).first().click({timeout:20000});
  await button('[data-action="settings"]');
  await page.locator('[data-action="music-volume"]').waitFor({state:'attached'});
  evidence.settings = await page.locator('.reference-settings [data-action]').evaluateAll(rows => rows.map(row=>[row.dataset.action,row.getAttribute('aria-label') || row.textContent.trim(),row.value ?? null]));
  await button('[data-action="back"]');
  await button('[data-action="game-menu"]');
  await page.waitForSelector('.reference-game-menu[data-ready="true"]');
  evidence.gameMenu = await page.locator('[data-game-control]').evaluateAll(rows => rows.map(row=>[row.textContent.trim(),row.disabled]));
  await button('[data-action="new-game"]');
  await page.waitForSelector('#campaign-intro-title');
  evidence.intro = await page.locator('#campaign-intro-title').textContent();
  await button('[data-prep-action="acknowledge-intro"]');
  await page.waitForSelector('[data-prep-action="start"]');
  evidence.preparation = await page.locator('[data-prep-action]').evaluateAll(rows => rows.filter(row=>row.getClientRects().length).map(row=>[row.dataset.prepAction,row.innerText.trim()]));
  await button('[data-prep-action="start"]');
  await page.waitForSelector('.is-battle canvas');
  evidence.battle = await page.locator('.is-battle button').evaluateAll(rows=>rows.filter(row=>row.getClientRects().length).map(row=>[row.dataset.action,row.innerText.trim()]));
  const {CAMPAIGN_NIGHT_CATALOG} = await server.ssrLoadModule('/src/content/campaignRuntime.ts');
  const {createBattle,stepBattle} = await server.ssrLoadModule('/src/simulation/battle.ts');
  const {campaignStoryDriver} = await server.ssrLoadModule('/tests/helpers/campaignStoryDriver.ts');
  const {calculateCampaignLoadout} = await server.ssrLoadModule('/src/progression/campaignProgression.ts');
  const {emptyCampaignProfile} = await server.ssrLoadModule('/src/application/campaignProfileCodec.ts');
  const config=calculateCampaignLoadout(CAMPAIGN_NIGHT_CATALOG[0].config,emptyCampaignProfile());
  const battle=createBattle(config,42),drive=campaignStoryDriver(config,false);
  while(battle.outcome==='playing' && battle.elapsed<300)stepBattle(battle,config,battle.elapsed<33?drive(battle):[]);
  evidence.defeat={outcome:battle.outcome,kills:battle.kills,resources:battle.earnedResources,bonus:battle.earnedBonus,rescue:battle.earnedRescue};
  await writeFile(new URL('runtime.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
  console.log(evidence.defeat);
} finally { await browser?.close();await server.close(); }

