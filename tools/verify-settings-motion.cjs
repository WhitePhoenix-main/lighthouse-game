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
const checks = [], runtimeErrors = [], timelines = [];
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
  const viewport = async (width, height, touch = width < 900) => {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>${touch?1:0}})`);
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
    await sleep(120);
  };
  // Layout registration and timeline identity are checked separately; never seek animations.
  const scenery = () => evaluate(`(window.motionScenerySnapshot=()=>{const s=document.querySelector('.menu-scenery'),r=s.getBoundingClientRect();return{rect:[r.x,r.y,r.width,r.height],images:[...s.querySelectorAll('img')].map(e=>{const q=e.getBoundingClientRect();return{src:e.currentSrc,rect:[q.x,q.y,q.width,q.height]}}),decor:[...s.querySelectorAll('.menu-decoration')].map(e=>{const c=getComputedStyle(e);return{class:e.className,world:e.dataset.worldRect,box:[e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight],background:c.backgroundImage,animation:[c.animationName,c.animationDuration,c.animationDelay,c.animationTimingFunction,c.animationIterationCount,c.animationDirection]}})}})()`);
  const remember = () => evaluate(`(()=>{window.motionScene=document.querySelector('.menu-scenery');window.motionAnimations=motionScene.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);window.motionMoon=motionScene.querySelector('.menu-moon').getAnimations()[0];window.motionMoonTime=motionMoon.currentTime;window.motionTimes=motionAnimations.map(a=>a.currentTime);return motionAnimations.length})()`);
  const continuity = async label => {
    const result = await evaluate(`({same:motionScene===document.querySelector('.menu-scenery'),animations:motionAnimations.every(a=>motionScene.getAnimations({subtree:true}).includes(a)),moon:motionMoon===motionScene.querySelector('.menu-moon').getAnimations()[0],time:motionMoon.currentTime,previous:motionMoonTime,phases:motionAnimations.every((a,i)=>a.currentTime>=motionTimes[i])})`);
    assert(result.same && result.animations && result.moon, `${label}: scenery or CSS animation objects replaced`);
    assert(result.time >= result.previous && result.phases, `${label}: ambient timeline reset`);
    await evaluate('motionMoonTime=motionMoon.currentTime;motionTimes=motionAnimations.map(a=>a.currentTime)');
  };
  const observeEntry = () => evaluate(`(()=>{window.motionFrames=[];window.motionSceneryFrames=[];window.motionSceneryBaseline=JSON.stringify(motionScenerySnapshot());window.motionFrameTimes=motionAnimations.map(a=>a.currentTime);window.motionEntryChanges=[];window.motionObserver?.disconnect();window.motionObserver=new MutationObserver(()=>{const p=document.querySelector('.reference-settings');if(p)motionEntryChanges.push(p.dataset.entering)});motionObserver.observe(document.querySelector('[data-overlay]'),{subtree:true,childList:true,attributes:true,attributeFilter:['data-entering']});const token=window.motionFrameToken=(window.motionFrameToken||0)+1;const end=performance.now()+10000;function frame(){const scene=document.querySelector('.menu-scenery'),animations=scene.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);motionSceneryFrames.push({layout:JSON.stringify(motionScenerySnapshot())===motionSceneryBaseline,same:scene===motionScene,animations:animations.length===motionAnimations.length&&motionAnimations.every(a=>animations.includes(a)),phases:motionAnimations.every((a,i)=>a.currentTime>=motionFrameTimes[i])});motionFrameTimes=motionAnimations.map(a=>a.currentTime);const p=document.querySelector('.reference-settings'),b=p?.querySelector('.settings-board');if(b){const c=getComputedStyle(b);motionFrames.push({state:p.dataset.entering,exit:p.dataset.exiting,layout:p.dataset.layout,scrollTop:p.scrollTop,boardTop:b.getBoundingClientRect().top,viewportHeight:p.clientHeight,x:new DOMMatrix(c.transform).m41,y:new DOMMatrix(c.transform).m42,opacity:+c.opacity,duration:b.getAnimations()[0]?.effect.getTiming().duration,controls:[...p.querySelectorAll('.settings-control')].every(e=>b.contains(e))})}if(performance.now()<end&&token===motionFrameToken)requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  const checkSceneryFrames = async label => {
    const frames=await evaluate('motionSceneryFrames');
    assert(frames.length>=3, `${label}: missing backdrop frames`);
    assert(frames.every(f=>f.layout&&f.same&&f.animations&&f.phases), `${label}: backdrop camera, DOM, CSSAnimation identity or phases changed: ${JSON.stringify(frames.filter(f=>!f.layout||!f.same||!f.animations||!f.phases))}`);
  };
  const checkEntry = async label => {
    await ready(); await sleep(60);
    await checkSceneryFrames(label);
    const frames = await evaluate('motionFrames');
    const moving = frames.filter(f=>f.state==='true');
    assert(moving.some(f=>(f.layout==='mobile'?f.y>20:f.x < -20) && f.opacity < .99), `${label}: missing layout-specific slide/fade: ${JSON.stringify(frames)}`);
    assert(moving.every(f=>f.layout==='mobile'?Math.abs(f.x)<.1&&f.y>=0:Math.abs(f.y)<.1&&f.x<=0), `${label}: wrong entry axis/direction`);
    timelines.push({label,frames});
    assert(moving.every(f=>f.duration===560), `${label}: entrance duration differs from 560ms`);
    assert(frames.filter(f=>f.state==='pending').every(f=>f.opacity===0), `${label}: pending board flashed before assets ready`);
    assert(moving.every(f=>f.controls), `${label}: controls escaped moving board`);
    const last=frames.at(-1); assert(Math.abs(last.x)<.1 && Math.abs(last.y)<.1 && last.opacity===1 && last.state==='false', `${label}: board did not settle: ${JSON.stringify(last)}`);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
  await viewport(1280,720);
  await cdp('Page.navigate', { url: base });
  await wait(`!!document.querySelector('[data-action="settings"]') && !!document.querySelector('.menu-moon')`);
  await wait(`[...document.querySelectorAll('.menu-scenery img')].every(e=>e.complete&&e.naturalWidth>0)`);
  for (const [width,height,touch] of [[1280,720,false],[1672,941,false],[844,390,false],[390,844,true],[844,390,true]]) {
    await viewport(width,height,touch);
    const original=await scenery(); assert((await remember())>10,'missing ambient animations');
    await observeEntry(); await click('[data-action="settings"]'); await checkEntry(`${width} entry`);
    assert.deepEqual(await scenery(), original, `${width}: menu/settings scenery geometry or animation declarations differ`);
    await continuity('settings entry');
    if(!touch&&width>=1000){
      const ui=await evaluate(`(()=>{const on=document.querySelector('[data-setting="on"]').getBoundingClientRect(),back=document.querySelector('[data-setting="back"]').getBoundingClientRect();return{onWidth:on.width,bottom:back.bottom,height:innerHeight}})()`);
      const oldScale=Math.min(width/1280,Math.max(.8,height/720));
      assert(ui.onWidth>128*oldScale*1.1,'standard desktop controls were not enlarged');
      assert(ui.bottom<=ui.height+1,'enlarged desktop controls overflow viewport');
    }
    await screenshot(`settings-${touch?'mobile':'desktop'}-${width}x${height}`);
    for (const selector of ['[data-setting="en"]','[data-setting="large"]','[data-setting="ru"]','[data-setting="normal"]']) {
      await observeEntry(); await click(selector); await ready(); await sleep(100);
      assert(!(await evaluate('motionEntryChanges')).includes('true'),'setting change replayed entry');
      assert(!(await evaluate('motionFrames')).some(f=>f.state==='true'||Math.abs(f.x)>.1||Math.abs(f.y)>.1||f.opacity<1),'setting change moved board');
      await continuity(selector);
    }
    const r=await evaluate(`(()=>{const r=document.querySelector('[data-action="music-volume"]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    await observeEntry();
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x+r.w*.5,y:r.y+r.h/2,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+r.w*.8,y:r.y+r.h/2,button:'left',buttons:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+r.w*.8,y:r.y+r.h/2,button:'left',buttons:0,clickCount:1});
    assert(Math.abs(await evaluate(`+document.querySelector('[data-action="music-volume"]').value`)-80)<=3,'native range drag');
    assert(!(await evaluate('motionEntryChanges')).includes('true'),'drag replayed entry'); await continuity('drag');
    await observeEntry();
    await click('[data-setting="back"]'); await wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
    await checkSceneryFrames(`${width} exit`);
    const exitFrames=(await evaluate('motionFrames')).filter(f=>f.exit==='true');
    timelines.push({label:`${width} exit`,frames:exitFrames});
    assert(exitFrames.some(f=>f.layout==='mobile'?f.y>40:f.x<-40),'exit did not move in its layout direction');
    assert(exitFrames.every(f=>f.layout==='mobile'?Math.abs(f.x)<.1&&f.y>=0:Math.abs(f.y)<.1&&f.x<=0),'exit used wrong axis/direction');
    const mobileExit=exitFrames.filter(f=>f.layout==='mobile');
    if(mobileExit.length){
      assert(mobileExit.every(f=>Math.abs(f.scrollTop-mobileExit[0].scrollTop)<.5),'mobile exit changed scrollTop');
      assert(mobileExit.at(-1).boardTop>=mobileExit.at(-1).viewportHeight-2,'mobile exit left bottom header tail');
    }
    await continuity('return menu'); assert.deepEqual(await scenery(),original);
    check(`${touch?'mobile':'desktop'} ${width}×${height}: same full scenery/camera every entry and exit frame; DOM/CSSAnimation identity and all phases; 560ms slide/fade; native controls and drag`);
  }
  for(const [width,height] of [[1280,1024],[2048,1548]]) {
    await viewport(width,height,false);
    const tallScenery=await scenery();await remember();await observeEntry();
    await click('[data-action="settings"]');await checkEntry(`tall desktop ${width}x${height}`);
    const tallBack=await evaluate(`(()=>{const page=document.querySelector('.reference-settings'),r=document.querySelector('[data-setting="back"]').getBoundingClientRect();return{bottom:r.bottom,height:innerHeight,scale:+getComputedStyle(page).getPropertyValue('--settings-ui-scale')}})()`);
    assert(Math.abs(tallBack.bottom-(tallBack.height-40*tallBack.scale))<=1,'tall desktop Back must leave exactly the scaled 40px bottom margin');
    assert.deepEqual(await scenery(),tallScenery);await continuity('tall desktop');
    await screenshot(`settings-desktop-${width}x${height}`);
    await click('[data-setting="back"]');await wait(`!!document.querySelector('[data-action="settings"]')`);
    check(`${width}×${height} desktop preserves left motion and stretches Back to the scaled bottom margin`);
  }
  // Synthetic lifecycle events are deliberate: headless native focus events vary by build.
  for(const [width,height] of [[844,390],[390,844]]) {
  await viewport(width,height,true);
  await evaluate(`window.freezeOnEntry=new MutationObserver(()=>{if(document.querySelector('.reference-settings')?.dataset.entering==='true'){freezeOnEntry.disconnect();window.dispatchEvent(new Event('blur'))}});freezeOnEntry.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,attributeFilter:['data-entering']})`);
  await click('[data-action="settings"]');
  await wait(`document.querySelector('.reference-settings')?.dataset.entering==='false' && !!document.querySelector('.menu-motion-paused')`);
  await sleep(60);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.settings-board')).opacity`),'1','blur retained partial settings opacity');
  const paused=await evaluate(`({moon:motionMoon.currentTime,board:getComputedStyle(document.querySelector('.settings-board')).transform,opacity:getComputedStyle(document.querySelector('.settings-board')).opacity})`);
  await sleep(200);
  assert.deepEqual(await evaluate(`({moon:motionMoon.currentTime,board:getComputedStyle(document.querySelector('.settings-board')).transform,opacity:getComputedStyle(document.querySelector('.settings-board')).opacity})`),paused,'blur did not settle UI and freeze scene');
  await evaluate(`window.dispatchEvent(new Event('focus'))`); await ready();
  await continuity('resume');
  await click('[data-setting="back"]');await wait(`!!document.querySelector('[data-action="settings"]')`);
  check(`${width}×${height}: blur settles vertical entrance and freezes/resumes backdrop without catch-up`);
  }
  await click('[data-action="settings"]');await ready();
  await viewport(844,390); await ready();
  const beforeScroll=await scenery();
  await evaluate(`document.querySelector('.reference-settings').scrollTop=10000`); await sleep(100);
  assert.deepEqual(await scenery(),beforeScroll,'settings scroll moved backdrop');
  await viewport(390,844); await ready(); await continuity('orientation resize');
  await click('[data-setting="back"]'); await wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
  await continuity('portrait return');
  check('stationary backdrop on settings scroll; scene and CSS timelines survive orientation resize');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of [[390,844],[844,390]]) {
  await viewport(width,height,true);
  await observeEntry(); await click('[data-action="settings"]'); await ready(); await sleep(100);
  assert(!(await evaluate('motionEntryChanges')).includes('true'),'reduced motion entered animation');
  assert((await evaluate('motionFrames')).every(f=>f.state!=='true'&&Math.abs(f.x)<.1&&Math.abs(f.y)<.1&&f.opacity===1),'reduced motion moved board');
  await screenshot(`reduced-motion-${width}x${height}`);
  await click('[data-setting="back"]');await wait(`!!document.querySelector('[data-action="settings"]')`);
  }
  check('reduced motion immediately displays settled controls on both mobile orientations');
  assert.deepEqual(runtimeErrors,[],'browser runtime errors');
  fs.writeFileSync(path.join(out,'timelines.json'),JSON.stringify(timelines,null,2));
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,runtimeErrors},null,2));
  await send('Browser.close'); ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (ws) ws.close(); await testBrowser.cleanup(); })
  .then(() => { console.log(JSON.stringify({ok:!process.exitCode,checks,runtimeErrors,artifacts:out},null,2)); })
  .catch(error => { console.error(error); process.exitCode = 1; });
