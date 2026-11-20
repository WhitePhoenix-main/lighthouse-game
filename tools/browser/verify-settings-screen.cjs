/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173';
const out = path.resolve('test-results', `settings-screen-${Date.now()}-${process.pid}`);
fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], runtimeErrors = [];
const check = name => { checks.push(name); console.log(name); };
let ws;
(async () => {
  const chrome = testBrowser.launch();
  let endpoint = '', diagnostics = '';
  chrome.on('error', error => { diagnostics += error.message; });
  chrome.stderr.on('data', chunk => {
    diagnostics += String(chunk);
    const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) endpoint = match[1];
  });
  for (let i = 0; i < 100 && !endpoint; i++) await sleep(100);
  const portFile = path.join(testBrowser.profilePath, 'DevToolsActivePort');
  if (!endpoint && fs.existsSync(portFile)) {
    const [port, route] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    endpoint = `ws://127.0.0.1:${port}${route}`;
  }
  assert(endpoint, `Chrome debugging endpoint: ${diagnostics}`);
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let next = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') runtimeErrors.push(msg.params);
    if (msg.id) {
      const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
      if (msg.error) p.reject(Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); }
    await screenshot('timeout');
    throw Error(`Timeout: ${expression}\n${await evaluate('JSON.stringify({url:location.href,title:document.title,body:document.body.innerText.slice(0,4000),html:document.body.innerHTML.slice(0,1500)})')}`);
  };
  const ready = async () => {
    await wait(`document.querySelector('.reference-settings')?.dataset.ready==='true' && !['pending','true'].includes(document.querySelector('.reference-settings').dataset.entering) && document.querySelector('.reference-settings').dataset.orientation===(innerHeight>=innerWidth?'portrait':'landscape')`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  const rect = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);
    await sleep(80);
    return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  };
  const click = async (selector, touch = false) => {
    const r = await rect(selector), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    if (touch) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    }
    await sleep(100);
  };
  const viewport = async (width, height, touch = false, dpr = 1, touchPoints = touch ? 1 : 0) => {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>${touchPoints}})`);
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch });
    await sleep(100); await ready();
  };
  const screenshot = async name => {
    // Capture the actual viewport; short layouts receive an additional scrolled shot.
    const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data.data, 'base64'));
  };
  const geometry = () => evaluate(`(()=>{const p=document.querySelector('.reference-settings');return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...p.querySelectorAll('button,input[type=range]')].map(e=>{const r=e.getBoundingClientRect();return{name:e.dataset.setting||e.dataset.action,x:r.x,y:r.y,w:r.width,h:r.height}})}})()`);
  const validateGeometry = async label => {
    const g = await geometry(); assert.equal(g.controls.length, 10);
    assert(g.scrollWidth <= g.width, `${label}: horizontal document overflow`);
    for (const r of g.controls) {
      assert(r.w >= 43.9 && r.h >= 43.9, `${label}: undersized ${r.name} ${JSON.stringify(r)}`);
      assert(r.x >= -.5 && r.x + r.w <= g.width + .5, `${label}: clipped ${r.name}`);
    }
    for (let i = 0; i < g.controls.length; i++) for (let j = i + 1; j < g.controls.length; j++) {
      const a = g.controls[i], b = g.controls[j];
      assert(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)<=.5 || Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<=.5, `${label}: overlap ${a.name}/${b.name} ${JSON.stringify({a,b})}`);
    }
    return g.controls;
  };
  const validateLayout = async (label, mobile, coarse = mobile) => {
    const layout=await evaluate(`(()=>{
      const page=document.querySelector('.reference-settings');
      const rect=s=>page.querySelector(s).getBoundingClientRect().toJSON();
      return {width:page.clientWidth,height:page.clientHeight,coarse:matchMedia('(hover:none) and (pointer:coarse)').matches,
        orientation:page.dataset.orientation,audio:rect('.sound-shelf'),reading:rect('.reading-shelf'),back:rect('.settings-back')};
    })()`);
    assert.equal(layout.coarse,coarse,label+' input emulation');
    const portrait=layout.height>=layout.width;
    assert.equal(layout.orientation,portrait?'portrait':'landscape');
    const sideBySide=!portrait && (layout.width<960 || layout.height<=560);
    assert(sideBySide ? layout.reading.left>=layout.audio.right : layout.reading.top>=layout.audio.bottom,label+' shelf overlap');
    assert(layout.back.top>=Math.max(layout.audio.bottom,layout.reading.bottom)-1,label+' Back overlaps settings');
    if(layout.height>=640) assert(layout.back.bottom<=layout.height+1,label+' Back off screen');
    return layout;
  };
  const rangeValue = name => evaluate(`Number(document.querySelector('[data-action="${name}-volume"]').value)`);
  const key = async (name, value) => {
    await rect(`[data-action="${name}-volume"]`);
    await evaluate(`document.querySelector('[data-action="${name}-volume"]').focus({preventScroll:true})`);
    const code = { Home: 36, End: 35, ArrowRight: 39, ArrowLeft: 37 }[value];
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, windowsVirtualKeyCode: code });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, windowsVirtualKeyCode: code });
    await sleep(80);
  };
  const drag = async (name, target, touch = false) => {
    const r = await rect(`[data-action="${name}-volume"]`), y = r.y + r.height / 2;
    // Native thumb centres travel along the rail, inside the input's hit area.
    const rail = await evaluate(`document.querySelector('[data-setting="${name}"] .settings-track').getBoundingClientRect().toJSON()`);
    const start = { x: rail.x + rail.width * .5, y };
    if (touch) await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    else {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
    }
    for (let i = 1; i <= 8; i++) {
      const point = { x: rail.x + rail.width * (.5 + (target - .5) * i / 8), y };
      if (touch) await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      else await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1 });
    }
    if (touch) await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rail.x + rail.width * target, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
    assert(Math.abs(await rangeValue(name) - target * 100) <= 3, `${touch?'touch':'mouse'} ${name} drag: ${await rangeValue(name)}`);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setLocaleOverride', { locale: 'ru-RU' });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${base}/tests/browser/settings-screen-frame.html` });
  await wait('!!window.settingsTest && !!document.querySelector(\'[data-action="settings"]\')');
  await click('[data-action="settings"]'); await ready();
  const originalGeometry = await validateGeometry('initial desktop');
  for (const [name, w, h, touch, mobile=touch, touchPoints=touch?1:0] of [['desktop',1280,720,false],['tall-desktop',1280,1024,false],['narrow-desktop',844,390,false],['portrait',390,844,true],['landscape',844,390,true],['compact',320,568,true],['tablet',768,1024,true],['tablet-landscape',1024,768,true],['wide',1672,941,false],['small-landscape',568,320,true],['medium',1000,700,false],['fine-phone',390,844,false,true],['fine-portrait',795,1543,false,true],['fine-portrait-933',933,1051,false,true],['fine-touch-landscape',844,390,false,true,5],['wide-hybrid-desktop',1280,720,false,false,5]]) {
    await viewport(w,h,touch,1,touchPoints); await validateGeometry(name);
    await evaluate(`document.querySelector('.reference-settings').scrollTop=0`);
    await validateLayout(name,mobile,touch);
    await screenshot(name);
    if (['landscape','compact','tablet'].includes(name)) {
      await rect('[data-setting="back"]');
      await screenshot(`${name}-bottom`);
      await evaluate(`document.querySelector('.reference-settings').scrollTop=0`);
    }
  }
  for(const [width,height,touch] of [[390,844,false],[795,1543,false],[933,1051,false],[844,390,true]]) {
    await viewport(width,height,touch);
    for(const language of ['ru','en']) {
      await click(`[data-setting="${language}"]`);await ready();
      for(const size of ['normal','large']) {
        await click(`[data-setting="${size}"]`);await ready();
        await evaluate(`document.querySelector('.reference-settings').scrollTop=0`);
        await validateGeometry(`${width}x${height} ${language} ${size}`);
        await validateLayout(`${width}x${height} ${language} ${size}`,true,touch);
      }
    }
    await screenshot(`mobile-${width}x${height}-en-large`);
  }
  await click('[data-setting="auto"]');await ready();await click('[data-setting="normal"]');await ready();
  check('RU/EN normal/large mobile geometry keeps 44px controls and fully visible Back, including fine-pointer 795/933 portraits');
  await viewport(844,390,true);
  await click('[data-setting="large"]'); await ready();
  const scrollBefore = await evaluate(`document.querySelector('.reference-settings').scrollTop`);
  await click('[data-setting="normal"]'); await ready();
  const scrollAfter = await evaluate(`document.querySelector('.reference-settings').scrollTop`);
  assert(Math.abs(scrollBefore-scrollAfter)<2,'short landscape scroll resets after text change');
  await viewport(1280,720); assert.deepEqual(await validateGeometry('returned desktop'), originalGeometry);
  check('44px controls, no overlap/clipping; sixteen viewports including fine-pointer phones, enlarged bounded desktop panel and fullscreen mobile layouts; reversible rotation');
  const hover = await rect('[data-setting="off"]');
  await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', x:hover.x+hover.width/2, y:hover.y+hover.height/2 });
  assert.equal(await evaluate(`document.querySelector('[data-setting="off"]').matches(':hover')`), true);
  await key('music','Home'); await key('music','ArrowRight'); await key('music','ArrowRight'); assert.equal(await rangeValue('music'),2);
  await key('effects','End'); await key('effects','ArrowLeft'); assert.equal(await rangeValue('effects'),99);
  await drag('music',.75);
  const levels = await evaluate('({...settingsTest.application.view.settings})');
  await click('[data-setting="off"]'); await click('[data-setting="on"]');
  assert.equal(await rangeValue('music'),levels.musicVolume); assert.equal(await rangeValue('effects'),levels.effectsVolume);
  check('mouse hover and drag, keyboard Home/End/arrows, independent levels survive mute');
  await click('[data-setting="en"]'); await ready();
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  assert.equal(await evaluate('/[А-Яа-яЁё]/.test(document.body.innerText)'),false);
  await click('[data-setting="large"]'); await ready(); await validateGeometry('English large');
  await evaluate(`document.querySelector('.reference-settings').scrollTop=0`); await screenshot('english-large');
  await click('[data-setting="ru"]'); await ready(); assert.equal(await evaluate('document.documentElement.lang'),'ru');
  await click('[data-setting="auto"]'); await ready();
  assert.equal(await evaluate('settingsTest.application.view.settings.language'),'auto');
  await click('[data-setting="normal"]'); await ready();
  check('RU/EN/auto and normal/large apply immediately');
  await evaluate('settingsTest.storage.fail=true'); await click('[data-setting="off"]');
  await wait('!!document.querySelector(\'[data-action="retry-settings"]\')');
  assert.equal(await evaluate('settingsTest.application.view.settings.soundEnabled'),true);
  await screenshot('save-error');
  await evaluate('settingsTest.storage.fail=false'); await click('[data-action="retry-settings"]');
  await wait('!settingsTest.application.view.settingsError'); assert.equal(await evaluate('settingsTest.application.view.settings.soundEnabled'),false);
  await evaluate('settingsTest.storage.fail=true'); await click('[data-setting="en"]');
  await click('[data-action="cancel-settings"]');
  assert.equal(await evaluate('settingsTest.application.view.settings.language'),'auto');
  await evaluate('settingsTest.storage.fail=false');
  check('write failure retains confirmed settings; retry and cancellation');
  await evaluate(`(()=>{const app=settingsTest.application;app.back();app.openPreparation();app.start();app.advance(1000);app.pause();app.openSettings()})()`); await ready();
  const tick = await evaluate('settingsTest.application.view.battle.tick');
  await sleep(200); assert.equal(await evaluate('settingsTest.application.view.battle.tick'),tick);
  await click('[data-setting="back"]');
  await wait('settingsTest.application.view.screen==="battle"');
  assert.deepEqual(await evaluate('({screen:settingsTest.application.view.screen,paused:settingsTest.application.view.paused,tick:settingsTest.application.view.battle.tick})'),{screen:'battle',paused:true,tick});
  check('return to same paused battle, no tick advancement');
  await evaluate('settingsTest.application.openSettings()'); await ready();
  await viewport(390,844,true); await click('[data-setting="en"]',true); await ready();
  await click('[data-setting="large"]',true); await ready();
  await drag('music',.8,true);
  await viewport(844,390,true); await validateGeometry('touch rotated');
  await click('[data-setting="on"]',true); assert.equal(await evaluate('settingsTest.application.view.settings.soundEnabled'),true);
  check('emulated touch: native drag, language/text choices and rotation');
  await cdp('Page.navigate',{url:base});
  await wait('!!document.querySelector(\'[data-action="settings"]\')'); await click('[data-action="settings"]'); await ready();
  await key('music','Home'); await key('music','ArrowRight');
  await click('[data-setting="en"]'); await ready(); await click('[data-setting="large"]');
  await cdp('Page.reload'); await wait('!!document.querySelector(\'[data-action="settings"]\')');
  await click('[data-action="settings"]'); await ready();
  assert.equal(await rangeValue('music'),1);
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  assert.equal(await evaluate('document.documentElement.dataset.textSize'),'large');
  assert.equal(await evaluate('localStorage.getItem("lighthouse.campaign.v1")'),null);
  assert.equal(await evaluate('localStorage.getItem("lighthouse.save.v1")'),null);
  check('real localStorage survives reload without creating game profile');
  // Fresh document resets the artwork module cache; block a required sprite sheet.
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Network.setBlockedURLs',{urls:['*/images/settings-stone/*.png']});
  await cdp('Page.navigate',{url:`${base}/tests/browser/settings-screen-frame.html`});
  await wait('!!window.settingsTest && !!document.querySelector(\'[data-action="settings"]\')');
  await click('[data-action="settings"]');
  await ready();
  const fallback=await evaluate(`(()=>{const p=document.querySelector('.reference-settings');return {
    label:p.querySelector('[data-setting="music"] span').innerText,checked:p.querySelector('[data-setting="on"]').getAttribute('aria-pressed'),
    checkedColor:getComputedStyle(p.querySelector('[data-setting="on"]')).color,otherColor:getComputedStyle(p.querySelector('[data-setting="off"]')).color
  }})()`);
  assert(fallback.label.length>0);assert.equal(fallback.checked,'true');assert.notEqual(fallback.checkedColor,fallback.otherColor);
  await screenshot('artwork-fallback');
  await key('music','Home');await key('music','ArrowRight');assert.equal(await rangeValue('music'),1);
  await cdp('Network.setBlockedURLs',{urls:[]});
  await viewport(390,844,true);await screenshot('artwork-recovered');
  check('native labels, selected state and keyboard ranges survive unavailable artwork');
  const fontCrops=[];
  const cropButton=async(name,setting,dpr)=>{
    const source=await rect('[data-setting="'+setting+'"]');
    const data=await cdp('Page.captureScreenshot',{format:'png',clip:{...source,scale:1},captureBeyondViewport:false});
    const filename='font-'+name+'-dpr-'+dpr+'.png';
    fs.writeFileSync(path.join(out,filename),Buffer.from(data.data,'base64'));
    fontCrops.push({filename,source,dpr});
  };
  for(const dpr of [1,1.25,2]) {
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:dpr,mobile:false});
    await cdp('Page.navigate',{url:`${base}/tests/browser/settings-screen-frame.html`});
    await wait('!!window.settingsTest && !!document.querySelector(\'[data-action="settings"]\')');
    await click('[data-action="settings"]');await ready();
    await cropButton('vkl','on',dpr);
    await click('[data-setting="en"]');await ready();
    await cropButton('off','off',dpr);await cropButton('russian','ru',dpr);
  }
  fs.writeFileSync(path.join(out,'font-crops.json'),JSON.stringify(fontCrops,null,2));
  check('native text crops ВКЛ/OFF/RUSSIAN at DPR 1/1.25/2 for visual pixel QA');
  assert.deepEqual(runtimeErrors,[],'browser runtime errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,runtimeErrors},null,2));
  await send('Browser.close'); ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (ws) ws.close(); await testBrowser.cleanup(); })
  .then(() => { console.log(JSON.stringify({ok:!process.exitCode,checks,runtimeErrors,artifacts:out},null,2)); })
  .catch(error => { console.error(error); process.exitCode = 1; });
