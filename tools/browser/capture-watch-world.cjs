/* Capture actual campaign preparation and combat with a disposable browser context for each state. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const out = path.resolve(__dirname, '../../test-results/watch-art-audit/world');
const formats = [['desktop', 1280, 720], ['portrait', 360, 640], ['landscape', 720, 360]];
const nights = ['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05'];

async function capture(browser, url, { format, boss = false, invalid = false, language = 'ru', textSize = 'normal' }) {
  const [name, width, height] = format;
  const isMobile = width < 1000;
  const label = textSize === 'large' ? name + '-en-large' : name;
  const dir = path.join(out, label);
  await fs.mkdir(dir, { recursive: true });
  const context = await browser.newContext({viewport:{width,height}, hasTouch:isMobile, isMobile, deviceScaleFactor:isMobile ? 2 : 1, locale:language, reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());});
  const activate = async selector => {
    const element = page.locator(selector + ':visible').first();
    if (isMobile) await element.tap();
    else await element.click();
  };
  const shot = async name => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({path:path.join(dir, name + '.png'), scale:'css'});
  };
  try {
    await page.goto(url);
    const profile = {
      version: 1, shards: 86, pearls: 1, purchasedNodeIds: ['unlock-cannon','unlock-barrier','unlock-flash'],
      wonNightIds: nights.slice(0, boss ? 5 : 2), selectedNightId: boss ? 'abyss-warden' : 'winged-tide',
      selectedLensId: 'basic', selectedAbilityId: 'flash', seenIntroIds: ['intro-misty-shore'],
      nextDeviceId: 9, inventory: [{id:7,kind:'cannon',health:70,consumed:false},{id:8,kind:'barrier',health:140,consumed:false}],
      layouts: {headland: [{deviceId:7,x:invalid ? 168 : -197,y:-36},{deviceId:8,x:-178,y:143}]}, activeAttempt: null, lastSettled: null,
      encountered: ['ghost','bat','turtle'], completedNights: boss ? 5 : 2,
    };
    await page.evaluate(({profile, language, textSize}) => {
      localStorage.setItem('lighthouse.campaign.v1', JSON.stringify(profile));
      localStorage.setItem('lighthouse.settings.v1', JSON.stringify({version:3, language, textSize, musicVolume:0, effectsVolume:0, soundEnabled:false}));
    }, {profile, language, textSize});
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (array instanceof Uint32Array && array.length === 1) { array[0] = 42; return array; }
        return original(array);
      };
    });
    await page.reload();
    await page.evaluate(async () => {
      const { LighthouseApplication } = await import('/src/application/gameApplication.ts');
      const original = LighthouseApplication.prototype.advance;
      LighthouseApplication.prototype.advance = function (ms) {
        window.watchQA = this;
        if (this.view.screen !== 'battle') return original.call(this, ms);
      };
      window.watchStep = () => {
        const app = window.watchQA;
        original.call(app, app.view.config.stepSeconds * 1000);
      };
    });
    await activate('[data-action="game-menu"]');
    await activate('[data-action="continue-game"]');
    await page.waitForFunction(() => document.querySelector('[data-prep-world]')?.dataset.worldReady === 'true');
    assert.deepEqual(await page.evaluate(() => window.watchQA.view.preparation.placements.map(device => device.id)), [7,8]);
    const prepPoint = await page.evaluate(() => {
      const canvas = document.querySelector('[data-prep-world]');
      const camera = JSON.parse(canvas.dataset.worldCamera);
      const rect = canvas.getBoundingClientRect();
      const {x,y} = window.watchQA.view.preparation.placements.find(device => device.id === 7);
      return {x:rect.left+camera.x+x*camera.zoom,y:rect.top+camera.y+y*camera.zoom*camera.projectionY};
    });
    const inspectPlacement = async () => {
      if (isMobile) await page.touchscreen.tap(prepPoint.x,prepPoint.y);
      else await page.mouse.click(prepPoint.x,prepPoint.y);
      await page.locator('.prep-inspector:visible').waitFor();
    };
    if (invalid) {
      await inspectPlacement();
      assert(await page.locator('[data-prep-action="start"]').isDisabled());
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).layouts.headland[0].x),168);
      await shot('placement-invalid');
      assert.deepEqual(errors, []);
      return;
    }
    if (!boss) {
      await shot('preparation');
      for (const [panel, slug] of [['devices','prep-catalog'],['ability','prep-ability'],['lens','prep-lens'],['recon','prep-recon']]) {
        await activate('[data-panel="'+panel+'"]');
        await page.locator('.prep-drawer').waitFor();
        await shot(slug);
        await activate('.prep-drawer header [data-prep-action="close-panel"]');
      }
    }
    if (!boss && textSize === 'normal') {
      await inspectPlacement();
      await activate('[data-prep-action="move-device"][data-device-id="7"]');
      await page.waitForFunction(() => window.watchQA.view.preparation.selectedType === 'cannon');
      const next = await page.evaluate(() => {
        const canvas = document.querySelector('[data-prep-world]');
        const camera = JSON.parse(canvas.dataset.worldCamera);
        const bounds = canvas.getBoundingClientRect();
        return {x:bounds.left+camera.x-156*camera.zoom,y:bounds.top+camera.y-131*camera.zoom*camera.projectionY};
      });
      await page.mouse.move(next.x,next.y);
      assert(await page.evaluate(() => window.watchQA.view.preparation.preview.valid));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).layouts.headland[0].x),-197);
      assert(await page.locator('[data-prep-action="start"]').isDisabled(), 'finish the move before starting a night');
      await shot('placement-move');
      await activate('[data-prep-action="cancel-placement"]');
      if (await page.locator('[data-prep-action="deselect"]').isVisible()) await activate('[data-prep-action="deselect"]');
    }
    await activate('[data-prep-action="start"]');
    await page.waitForFunction(() => document.querySelector('.chapter-world-underlay')?.dataset.artworkReady === 'true' && document.querySelector('.chapter-world-underlay')?.dataset.campaignArtworkReady === 'true');
    const info = await page.evaluate(boss => {
      const app = window.watchQA;
      const original = document.querySelector('.chapter-world-underlay');
      const camera = JSON.parse(original.dataset.worldCamera);
      const rect = original.getBoundingClientRect();
      const glCanvas = original.parentElement.querySelector('canvas:not(.chapter-world-underlay)');
      const gl = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl');
      let target;
      for (let i = 0; i < 1060; i++) {
        window.watchStep();
        const battle = app.view.battle;
        if (boss && battle.boss.campaign.telegraph) {
          target = battle.boss.tentacles.find(tip => tip.id === battle.boss.campaign.telegraph.sourceZoneId);
          break;
        }
        if (!boss && battle.enemies.some(enemy => enemy.kind === 'turtle') && battle.enemies.some(enemy => enemy.kind === 'bat')) {
          target = battle.enemies.find(enemy => enemy.kind === 'ghost' && enemy.y < -45 && Math.hypot(enemy.x, enemy.y) > 145 && Math.hypot(enemy.x, enemy.y) < 270);
          if (target) break;
        }
      }
      return {target:target && {id:target.id,x:rect.left+camera.x+target.x*camera.zoom,y:rect.top+camera.y+target.y*camera.zoom*camera.projectionY},
        renderer:gl && gl.getParameter(gl.VERSION), camera, field:{width:rect.width,height:rect.height}, seed:app.view.battle.seed, elapsed:app.view.battle.elapsed};
    }, boss);
    assert(info.renderer && info.target, JSON.stringify(info));
    if (isMobile) await page.touchscreen.tap(info.target.x, info.target.y);
    else await page.mouse.move(info.target.x, info.target.y);
    const result = await page.evaluate(({id,boss}) => {
      const app = window.watchQA;
      const matches = battle => (boss ? battle.litTentacleIds : battle.litEnemyIds).includes(id);
      for (let i = 0; i < 70 && !matches(app.view.battle); i++) window.watchStep();
      for (let i = 0; i < 8; i++) window.watchStep();
      const battle = app.view.battle;
      return {matches:matches(battle), enemies:battle.enemies.map(e=>({kind:e.kind,id:e.id,x:e.x,y:e.y,health:e.health})),
        litEnemyIds:battle.litEnemyIds, litTentacleIds:battle.litTentacleIds, desired: battle.desiredBeamAngle, beam: battle.beamAngle,
        telegraph:battle.boss?.campaign?.telegraph, deviceIds:battle.devices.map(device=>device.id), elapsed:battle.elapsed};
    }, {id:info.target.id,boss});
    assert(result.matches, JSON.stringify(result));
    assert.deepEqual(result.deviceIds, [7,8]);
    if (boss) assert(result.telegraph, JSON.stringify(result));
    await shot(boss ? 'battle-boss' : 'battle');
    const indicators = await page.locator('.chapter-world-underlay').evaluate(canvas => JSON.parse(canvas.dataset.indicators));
    assert.equal(indicators.length, result.enemies.length);
    if (isMobile && textSize === 'normal' && !boss) {
      const priority = indicators.find(bar => bar.id === info.target.id);
      const turtle = result.enemies.find(enemy => enemy.kind === 'turtle');
      const armor = indicators.find(bar => bar.id === turtle.id);
      assert(priority.width >= 32 && priority.height === 6, JSON.stringify(priority));
      assert(armor.width <= 34 && armor.height === 10, JSON.stringify(armor));
    }
    if (textSize === 'large') assert(indicators.every(bar => bar.width >= 54));
    if (!boss && textSize === 'normal') {
      await activate('.battle-device-access summary');
      await activate('[data-action="inspect-device"][data-device-id="7"]');
      await page.locator('[data-action="close-device"]:visible').first().waitFor();
      await shot('battle-device');
      await activate('[data-action="close-device"]');
    }
    if (isMobile && !boss) {
      const attempt = await page.evaluate(() => JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).activeAttempt.id);
      await page.setViewportSize({width:height,height:width});
      await page.waitForFunction(({width,height})=>document.querySelector('.chapter-world-underlay')?.clientWidth===height && document.querySelector('.chapter-world-underlay')?.clientHeight===width,{width,height});
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).activeAttempt.id),attempt);
    }
    assert.deepEqual(errors, []);
    const metrics = {label,width,height,...info,result,indicators,errors};
    await fs.writeFile(path.join(dir, boss ? 'boss-metrics.json' : 'metrics.json'), JSON.stringify(metrics,null,2));
    console.log(label, JSON.stringify({target:info.target, camera:info.camera, elapsed:result.elapsed, result}));
  } finally {
    await context.close();
  }
}

(async () => {
  const server = await (await import('vite')).createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error'});
  await server.listen();
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  try {
    const url = server.resolvedUrls.local[0];
    for (const format of formats) { await capture(browser,url,{format}); await capture(browser,url,{format,invalid:true}); }
    for (const format of formats) await capture(browser,url,{format,boss:true});
    await capture(browser,url,{format:formats[2],language:'en',textSize:'large'});
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
