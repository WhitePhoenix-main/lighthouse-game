/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173';
const out = path.resolve('test-results', `settings-motion-${Date.now()}-${process.pid}`);
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
  const screenshot = async name => {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  const ready = () => wait(`document.querySelector('.reference-settings')?.dataset.ready==='true' && document.querySelector('.reference-settings').dataset.entering==='false'`);
  const click = async selector => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  };
  const viewport = async (width, height) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(120);
  };
  // Layout registration and timeline identity are checked separately; never seek animations.
  const scenery = () => evaluate(`(()=>{const s=document.querySelector('.menu-scenery'),r=s.getBoundingClientRect();return{rect:[r.x,r.y,r.width,r.height],images:[...s.querySelectorAll('img')].map(e=>{const q=e.getBoundingClientRect();return{src:e.currentSrc,rect:[q.x,q.y,q.width,q.height]}}),decor:[...s.querySelectorAll('.menu-decoration')].map(e=>{const c=getComputedStyle(e);return{class:e.className,world:e.dataset.worldRect,box:[e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight],background:c.backgroundImage,animation:[c.animationName,c.animationDuration,c.animationDelay,c.animationTimingFunction,c.animationIterationCount,c.animationDirection]}})}})()`);
  const remember = () => evaluate(`(()=>{window.motionScene=document.querySelector('.menu-scenery');window.motionAnimations=motionScene.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);window.motionMoon=motionScene.querySelector('.menu-moon').getAnimations()[0];window.motionMoonTime=motionMoon.currentTime;return motionAnimations.length})()`);
  const continuity = async label => {
    const result = await evaluate(`({same:motionScene===document.querySelector('.menu-scenery'),animations:motionAnimations.every(a=>motionScene.getAnimations({subtree:true}).includes(a)),moon:motionMoon===motionScene.querySelector('.menu-moon').getAnimations()[0],time:motionMoon.currentTime,previous:motionMoonTime})`);
    assert(result.same && result.animations && result.moon, `${label}: scenery or CSS animation objects replaced`);
    assert(result.time >= result.previous, `${label}: moon timeline reset`);
    await evaluate('motionMoonTime=motionMoon.currentTime');
  };
  const observeEntry = () => evaluate(`(()=>{window.motionFrames=[];window.motionEntryChanges=[];window.motionObserver?.disconnect();window.motionObserver=new MutationObserver(()=>{const p=document.querySelector('.reference-settings');if(p)motionEntryChanges.push(p.dataset.entering)});motionObserver.observe(document.querySelector('[data-overlay]'),{subtree:true,childList:true,attributes:true,attributeFilter:['data-entering']});const token=window.motionFrameToken=(window.motionFrameToken||0)+1;const end=performance.now()+10000;function frame(){const p=document.querySelector('.reference-settings'),b=p?.querySelector('.settings-board');if(b){const c=getComputedStyle(b);motionFrames.push({state:p.dataset.entering,x:new DOMMatrix(c.transform).m41,opacity:+c.opacity,duration:b.getAnimations()[0]?.effect.getTiming().duration,controls:[...p.querySelectorAll('.settings-control')].every(e=>b.contains(e))})}if(performance.now()<end&&token===motionFrameToken)requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  const checkEntry = async label => {
    await ready(); await sleep(60);
    const frames = await evaluate('motionFrames');
    const moving = frames.filter(f=>f.state==='true');
    assert(moving.some(f=>f.x < -20 && f.opacity < .99), `${label}: missing left slide/fade: ${JSON.stringify(frames)}`);
    assert(moving.every(f=>f.duration===420), `${label}: entrance duration differs from 420ms`);
    assert(frames.filter(f=>f.state==='pending').every(f=>f.opacity===0), `${label}: pending board flashed before assets ready`);
    assert(moving.every(f=>f.controls), `${label}: controls escaped moving board`);
    const last=frames.at(-1); assert(Math.abs(last.x)<.1 && last.opacity===1 && last.state==='false', `${label}: board did not settle: ${JSON.stringify(last)}`);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
  await viewport(1280,720);
  await cdp('Page.navigate', { url: base });
  await wait(`!!document.querySelector('[data-action="settings"]') && !!document.querySelector('.menu-moon')`);
  await wait(`[...document.querySelectorAll('.menu-scenery img')].every(e=>e.complete&&e.naturalWidth>0)`);
  for (const [width,height] of [[1280,720],[1672,941]]) {
    await viewport(width,height);
    const original=await scenery(); assert((await remember())>10,'missing ambient animations');
    await observeEntry(); await click('[data-action="settings"]'); await checkEntry(`${width} entry`);
    assert.deepEqual(await scenery(), original, `${width}: menu/settings scenery geometry or animation declarations differ`);
    await continuity('settings entry');
    await screenshot(`settings-${width}`);
    for (const selector of ['[data-setting="en"]','[data-setting="large"]','[data-setting="ru"]','[data-setting="normal"]']) {
      await observeEntry(); await click(selector); await ready(); await sleep(100);
      assert(!(await evaluate('motionEntryChanges')).includes('true'),'setting change replayed entry');
      assert(!(await evaluate('motionFrames')).some(f=>f.state==='true'||f.x<-.1||f.opacity<1),'setting change moved board');
      await continuity(selector);
    }
    const r=await evaluate(`(()=>{const r=document.querySelector('[data-action="music-volume"]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    await observeEntry();
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x+r.w*.5,y:r.y+r.h/2,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+r.w*.8,y:r.y+r.h/2,button:'left',buttons:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+r.w*.8,y:r.y+r.h/2,button:'left',buttons:0,clickCount:1});
    assert(Math.abs(await evaluate(`+document.querySelector('[data-action="music-volume"]').value`)-80)<=3,'native range drag');
    assert(!(await evaluate('motionEntryChanges')).includes('true'),'drag replayed entry'); await continuity('drag');
    await click('[data-setting="back"]'); await wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
    await continuity('return menu'); assert.deepEqual(await scenery(),original);
    check(`${width}×${height}: same scene/images/layout/ambient animations; slide/fade; native controls; settings and drag preserve timelines`);
  }
  // Synthetic lifecycle events are deliberate: headless native focus events vary by build.
  await evaluate(`window.freezeOnEntry=new MutationObserver(()=>{if(document.querySelector('.reference-settings')?.dataset.entering==='true'){freezeOnEntry.disconnect();window.dispatchEvent(new Event('blur'))}});freezeOnEntry.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,attributeFilter:['data-entering']})`);
  await click('[data-action="settings"]');
  await wait(`document.querySelector('.reference-settings')?.dataset.entering==='true' && !!document.querySelector('.menu-motion-paused')`);
  await sleep(60);
  const paused=await evaluate(`({moon:motionMoon.currentTime,board:getComputedStyle(document.querySelector('.settings-board')).transform,opacity:getComputedStyle(document.querySelector('.settings-board')).opacity})`);
  await sleep(200);
  assert.deepEqual(await evaluate(`({moon:motionMoon.currentTime,board:getComputedStyle(document.querySelector('.settings-board')).transform,opacity:getComputedStyle(document.querySelector('.settings-board')).opacity})`),paused,'blur did not freeze scene and entry');
  await evaluate(`window.dispatchEvent(new Event('focus'))`); await ready();
  await continuity('resume'); check('blur/focus freezes and resumes background CSS and entrance without catch-up');
  await viewport(844,390); await ready();
  const beforeScroll=await scenery();
  await evaluate(`document.querySelector('.reference-settings').scrollTop=10000`); await sleep(100);
  assert.deepEqual(await scenery(),beforeScroll,'settings scroll moved backdrop');
  await viewport(390,844); await ready(); await continuity('orientation resize');
  await click('[data-setting="back"]'); await wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
  await continuity('portrait return');
  check('stationary backdrop on settings scroll; scene and CSS timelines survive orientation resize');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await observeEntry(); await click('[data-action="settings"]'); await ready(); await sleep(100);
  assert(!(await evaluate('motionEntryChanges')).includes('true'),'reduced motion entered animation');
  assert((await evaluate('motionFrames')).every(f=>f.state!=='true'&&Math.abs(f.x)<.1&&f.opacity===1),'reduced motion moved board');
  await screenshot('reduced-motion'); check('reduced motion immediately displays settled controls');
  assert.deepEqual(runtimeErrors,[],'browser runtime errors');
  await send('Browser.close'); ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (ws) ws.close(); await testBrowser.cleanup(); })
  .then(() => { console.log(JSON.stringify({ok:!process.exitCode,checks,runtimeErrors,artifacts:out},null,2)); })
  .catch(error => { console.error(error); process.exitCode = 1; });
