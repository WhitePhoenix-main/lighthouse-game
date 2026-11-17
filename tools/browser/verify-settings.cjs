const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { mkdir } = require('node:fs/promises');
// Optional authoring tool. Playwright is external, never a game runtime dependency.
const pw = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || process.argv[2] || 'playwright');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv[3] || 'http://127.0.0.1:5173';
const cdp = process.env.LIGHTHOUSE_CDP_URL || process.argv[4];

(async () => {
  const browser = cdp ? await pw.chromium.connectOverCDP(cdp) : await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width:1280, height:720 }, locale:'ru-RU' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    if (!Original) return;
    window.audioProbe = { starts:0, contexts:[] };
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.audioProbe.contexts.push(this); }
      createOscillator() {
        const voice=super.createOscillator(), start=voice.start.bind(voice);
        voice.start=(...args)=>{window.audioProbe.starts++;start(...args);}; return voice;
      }
    };
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const checks = [];
  const check = name => { checks.push(name); console.log(name); };
  const ready = async () => {
    await page.waitForFunction(() => {
      const page = document.querySelector('.reference-settings');
      return page?.dataset.ready === 'true' && page.dataset.orientation === (innerHeight >= innerWidth ? 'portrait' : 'landscape');
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const screenshot = async name => { await mkdir(resolve('test-results'), { recursive:true }); await page.screenshot({ path:resolve('test-results',name) }); };
  try {
    await page.goto(`${base}/tests/browser/settings-frame.html`);
    await page.getByRole('button',{name:'Настройки',exact:true}).click(); await ready();
    for (const [name,width,height] of [['desktop',1280,720],['portrait',390,844],['landscape',844,390],['compact',320,568]]) {
      await page.setViewportSize({width,height}); await ready();
      const geometry = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('.settings-control')].map(element => {
          const rect = element.getBoundingClientRect();
          return { name:element.dataset.setting,x:rect.x,y:rect.y,w:rect.width,h:rect.height };
        });
        return { controls, width:document.documentElement.scrollWidth, viewport:innerWidth };
      });
      for (const control of geometry.controls) assert(control.w >= 43.9 && control.h >= 43.9, `${name}: small ${control.name}`);
      for (let i=0;i<geometry.controls.length;i++) for (let j=i+1;j<geometry.controls.length;j++) {
        const a=geometry.controls[i],b=geometry.controls[j];
        const overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
        const overlapY=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
        assert(overlapX <= .5 || overlapY <= .5, `${name}: overlapping ${a.name}/${b.name}`);
      }
      assert(geometry.width<=geometry.viewport, `${name}: horizontal overflow`);
      await screenshot(`settings-${name}.png`);
    }
    check('44px controls, no overlaps or horizontal overflow in four viewports');
    await page.setViewportSize({width:844,height:390}); await ready();
    await page.locator('[data-size="large"]').click(); await ready();
    const scrollBefore=await page.locator('.reference-settings').evaluate(el=>el.scrollTop);
    await page.locator('[data-size="normal"]').click(); await ready();
    const scrollAfter=await page.locator('.reference-settings').evaluate(el=>el.scrollTop);
    assert(Math.abs(scrollBefore-scrollAfter)<2, 'settings scroll was reset');
    check('short landscape retains scroll after changing text size');
    await page.setViewportSize({width:1280,height:720}); await ready();
    const music=page.locator('[data-action="music-volume"]');
    await music.focus(); await music.press('Home'); await music.press('ArrowRight'); await music.press('ArrowRight');
    assert.equal(await music.inputValue(),'2');
    const range=await music.boundingBox();
    await page.mouse.move(range.x+range.width*.2,range.y+22); await page.mouse.down();
    await page.mouse.move(range.x+range.width*.75,range.y+22,{steps:8}); await page.mouse.up();
    assert(Math.abs(Number(await music.inputValue())-75)<=2, 'native drag does not match artwork');
    const effects=page.locator('[data-action="effects-volume"]');
    await effects.focus(); await effects.press('Home'); await effects.press('ArrowRight'); await effects.press('ArrowRight');
    assert.equal(await effects.inputValue(),'2');
    await page.waitForFunction(()=>window.audioProbe?.starts>0 && window.audioProbe.contexts.some(context=>context.state==='running'));
    await page.locator('[data-enabled="false"]').click();
    assert.equal(await page.locator('[data-action="effects-volume"]').inputValue(),'2');
    await page.locator('[data-enabled="true"]').click();
    assert.equal(await page.locator('[data-action="effects-volume"]').inputValue(),'2');
    check('mouse drag, keyboard ranges, independent levels and mute restoration');
    await page.locator('[data-language="en"]').click(); await ready();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert(!/[А-Яа-яЁё]/.test(await page.locator('body').textContent()),'Russian DOM text remains in English settings');
    await screenshot('settings-english.png');
    await page.locator('[data-language="ru"]').click(); await ready();
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    await page.locator('[data-language="auto"]').click(); await ready();
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    check('English, Russian and automatic language apply immediately');
    await page.evaluate(()=>{window.settingsTest.storage.fail=true;});
    await page.locator('[data-enabled="false"]').click();
    await page.getByRole('button',{name:'Повторить сохранение'}).waitFor();
    assert.equal(await page.locator('[data-enabled="true"]').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{window.settingsTest.storage.fail=false;});
    await page.getByRole('button',{name:'Повторить сохранение'}).click();
    await page.waitForFunction(()=>!window.settingsTest.application.view.settingsError);
    assert.equal(await page.locator('[data-enabled="false"]').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{window.settingsTest.storage.fail=true;});
    await page.locator('[data-language="en"]').click();
    await page.getByRole('button',{name:'Вернуться к сохранённому'}).click();
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    await page.evaluate(()=>{window.settingsTest.storage.fail=false;});
    check('write failure, confirmed values, retry and cancellation');
    await page.evaluate(()=>{const app=window.settingsTest.application;app.back();app.openPreparation();app.start();app.advance(1000);app.pause();app.openSettings();}); await ready();
    const tick=await page.evaluate(()=>window.settingsTest.application.view.battle.tick);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>window.settingsTest.application.view.battle.tick),tick);
    await page.getByRole('button',{name:'Назад',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>({screen:window.settingsTest.application.view.screen,paused:window.settingsTest.application.view.paused,tick:window.settingsTest.application.view.battle.tick})),{screen:'battle',paused:true,tick});
    check('settings return to the same paused battle without advancing its tick');
    const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ru-RU'});
    try {
      const touchPage=await touchContext.newPage();
      await touchPage.goto(`${base}/tests/browser/settings-frame.html`);
      await touchPage.getByRole('button',{name:'Настройки',exact:true}).tap();
      await touchPage.waitForSelector('[data-ready="true"]');
      await touchPage.locator('[data-language="en"]').tap();
      assert.equal(await touchPage.locator('html').getAttribute('lang'),'en');
      await touchPage.locator('[data-size="large"]').tap();
      assert.equal(await touchPage.locator('[data-size="large"]').getAttribute('aria-pressed'),'true');
      const slider=touchPage.locator('[data-action="music-volume"]');
      const rect=await slider.boundingBox();
      const client=await touchContext.newCDPSession(touchPage);
      await touchPage.evaluate(()=>{window.touchEvents=[]; for (const type of ['pointerdown','pointermove','pointerup','pointercancel','input','change']) document.addEventListener(type,event=>window.touchEvents.push({type,target:event.target.dataset.action,trusted:event.isTrusted}));});
      const y=rect.y+rect.height/2;
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.5,y}]});
      for (let step=6;step<=8;step++) await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*step/10,y}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      if (Math.abs(Number(await slider.inputValue())-80)>2) console.log(JSON.stringify(await touchPage.evaluate(()=>({events:window.touchEvents,width:innerWidth,scale:visualViewport.scale}))),rect);
      assert(Math.abs(Number(await slider.inputValue())-80)<=2,`touch slider drag does not match artwork: ${await slider.inputValue()}`);
      await touchPage.setViewportSize({width:844,height:390});
      await touchPage.waitForFunction(()=>document.querySelector('.reference-settings')?.dataset.orientation==='landscape');
      await touchPage.locator('[data-enabled="false"]').tap();
      assert.equal(await touchPage.locator('[data-enabled="false"]').getAttribute('aria-pressed'),'true');
      check('emulated touch: language, large text, native slider drag and rotation');
    } finally { await touchContext.close(); }
    await page.goto(base);
    await page.getByRole('button',{name:'Настройки',exact:true}).click(); await ready();
    await page.locator('[data-action="music-volume"]').focus(); await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-language="en"]').click(); await ready();
    await page.locator('[data-size="large"]').click();
    await page.reload();
    await page.getByRole('button',{name:'Settings',exact:true}).click(); await ready();
    assert.equal(await page.locator('[data-action="music-volume"]').inputValue(),'1');
    assert.equal(await page.locator('[data-language="en"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-size="large"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('lighthouse.save.v1')),null,'settings created a game profile');
    check('real localStorage reload preserves settings without creating a profile');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:checks,errors},null,2));
  } finally { await context.close(); await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
