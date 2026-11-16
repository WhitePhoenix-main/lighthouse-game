/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173';
const out = path.resolve('test-results', `settings-navigation-${Date.now()}-${process.pid}`);
fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], runtimeErrors = [];
const timelines = [];
const timeline = value => {
  timelines.push(value);
  fs.writeFileSync(path.join(out,'timelines.json'),JSON.stringify(timelines,null,2));
};
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
  const click = async (selector, touch = false) => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    if (touch) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return;
    }
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  };
  const viewport = async (width, height) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: width < 900 });
    await sleep(120);
  };
  const menuReady = () => wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
  const key = async name => {
    const code = {Escape:27, Enter:13, Home:36, ArrowRight:39}[name];
    for (const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent', {type,key:name,code:name,windowsVirtualKeyCode:code,...(name==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});
  };
  const record = () => evaluate(`(()=>{
    window.navFrames=[]; const token=window.navToken=(window.navToken||0)+1;
    function sample(){
      const p=document.querySelector('.reference-settings'),g=document.querySelector('[data-settings-menu-ghost]'),ghost=g?.querySelector('.settings-menu-outgoing'),m=ghost||document.querySelector('.menu-artboard'),b=p?.querySelector('.settings-board'),s=p?.querySelector('.settings-scrim');
      const style=b&&getComputedStyle(b), menu=m&&getComputedStyle(m);
      const timing=e=>{const a=e?.getAnimations()[0];return a?{start:a.startTime,time:a.currentTime,duration:a.effect.getTiming().duration,state:a.playState}:null};
      const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
      navFrames.push({t:performance.now(),screen:window.settingsTest?.application.view.screen||null,ready:p?.dataset.ready,enter:p?.dataset.entering,exit:p?.dataset.exiting,menu:ghost?'out':m?.dataset.menuTransition,ghost:!!g,ghostSafe:!g||(g.inert&&g.getAttribute('aria-hidden')==='true'&&!g.querySelector('[id],[data-action],[data-focus-key]')),ghostSibling:!g||g.parentElement===document.querySelector('[data-overlay]').parentElement,settingsPages:document.querySelectorAll('.reference-settings').length,settingsControls:document.querySelectorAll('.reference-settings .settings-control').length,duplicateIds:new Set(ids).size!==ids.length,menuActions:document.querySelectorAll('[data-action="settings"]').length,menuOpacity:menu?+menu.opacity:null,x:style?new DOMMatrix(style.transform).m41:null,opacity:style?+style.opacity:null,scrim:s?+getComputedStyle(s).opacity:null,boardTiming:timing(b),scrimTiming:timing(s),menuTiming:timing(m),exitDuration:timing(b)?.duration,menuDuration:timing(m)?.duration});
      if(token===navToken)requestAnimationFrame(sample);
    } sample();requestAnimationFrame(sample);
  })()`);
  const remember = () => evaluate(`(()=>{window.navScene=document.querySelector('.menu-scenery');window.navAnimations=navScene.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);window.navTimes=navAnimations.map(a=>a.currentTime);return navAnimations.length})()`);
  const continuity = async label => {
    const result=await evaluate(`({same:navScene===document.querySelector('.menu-scenery'),animations:navAnimations.every(a=>navScene.getAnimations({subtree:true}).includes(a)),phases:navAnimations.every((a,i)=>a.currentTime>=navTimes[i])})`);
    assert(result.same&&result.animations&&result.phases,`${label}: backdrop DOM, CSSAnimation identity or playheads reset: ${JSON.stringify(result)}`);
    await evaluate('navTimes=navAnimations.map(a=>a.currentTime)');
  };
  const open = async (touch=false,keyboard=false,holdArtwork=false) => {
    await menuReady(); await record();
    if(holdArtwork)await evaluate(`(()=>{window.navImageSource=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.navHeldImages=[];Object.defineProperty(HTMLImageElement.prototype,'src',{...navImageSource,set(value){if(String(value).includes('menu-buttons-v2/'))navHeldImages.push([this,value]);else navImageSource.set.call(this,value)}})})()`);
    if(keyboard){if(keyboard!=='restored')await evaluate(`document.querySelector('[data-action="settings"]').focus()`);await key('Enter');}
    else await click('[data-action="settings"]',touch);
    if(holdArtwork){
      await wait(`document.querySelector('.reference-settings')?.dataset.entering==='pending'`);
      await sleep(180);
      assert.equal(await evaluate('settingsTest.application.view.screen'),'settings','route did not commit immediately while artwork was pending');
      assert((await evaluate('navHeldImages.length'))>0,'artwork readiness gate was not exercised');
      await evaluate(`Object.defineProperty(HTMLImageElement.prototype,'src',navImageSource);for(const [image,value] of navHeldImages)navImageSource.set.call(image,value)`);
    }
    await ready(); await sleep(40);
    const frames=await evaluate('navFrames'),out=frames.filter(f=>f.menu==='out');
    timeline({phase:'open',frames});
    assert(out.length>=3,'menu ghost has no rendered frames');
    assert(out.some(f=>f.menuOpacity<.95&&f.menuOpacity>.05&&f.enter==='true'&&f.x<0&&f.opacity>0&&f.opacity<1),'menu ghost fade and settings slide/fade did not share a frame');
    assert(out.every(f=>!f.screen||f.screen==='settings'),'settings route was delayed until after menu outro');
    const moving=frames.filter(f=>f.enter==='true');
    assert(moving.length>=3,'settings entry absent');
    assert(moving.every(f=>f.ghost&&f.menuDuration===420&&f.boardTiming?.duration===420&&f.scrimTiming?.duration===420),'all three entrance animations must run together for 420ms');
    for(const f of moving){
      const timings=[f.boardTiming,f.scrimTiming,f.menuTiming];
      const starts=timings.map(a=>a.start),times=timings.map(a=>a.time);
      if(starts.every(t=>typeof t==='number'))assert(Math.max(...starts)-Math.min(...starts)<1,'entrance animation start times differ');
      if(times.every(t=>typeof t==='number'))assert(Math.max(...times)-Math.min(...times)<1,'entrance animation playheads differ');
      assert(Math.abs(f.menuOpacity+f.opacity-1)<.015&&Math.abs(f.scrim-f.opacity)<.015,'menu/board/scrim opacity diverged or left an empty gap');
    }
    const pending=frames.filter(f=>f.enter==='pending');
    assert(pending.every(f=>f.ghost&&f.menuOpacity===1&&f.opacity===0),'ghost did not cover settings asset readiness');
    assert(frames.filter(f=>f.settingsPages).every(f=>f.settingsPages===1&&f.settingsControls===10&&f.menuActions===0&&!f.duplicateIds&&f.ghostSafe&&f.ghostSibling),'duplicate settings controls/IDs/actions or unsafe ghost');
    assert.equal(frames.at(-1).ghost,false,'settled settings retained outgoing ghost');
    await continuity('open');
    return frames;
  };
  const close = async (escape=false,touch=false,twice=false) => {
    await ready();
    const before=await evaluate('window.settingsTest?settingsTest.backCalls:0');
    await record();
    if(escape) {await key('Escape');if(twice)await key('Escape');}
    else {await click('[data-setting="back"]',touch);if(twice)await key('Escape');}
    await wait(`document.querySelector('.reference-settings')?.dataset.exiting==='true'`);
    assert.equal(await evaluate('window.settingsTest?.application.view.screen||"settings"'),'settings','route changed before exit finished');
    await menuReady(); await sleep(40);
    const frames=await evaluate('navFrames'),exit=frames.filter(f=>f.exit==='true'),intro=frames.filter(f=>f.menu==='in');
    timeline({phase:'close',frames});
    assert(exit.length>=3,'settings exit has no rendered frames');
    assert(exit.every(f=>f.exitDuration===420),'settings exit duration must be 420ms');
    assert(exit.every(f=>!f.screen||f.screen==='settings'),'route changed while exiting');
    assert(exit.some(f=>f.x<-40&&f.opacity<.8),'settings board did not exit left and fade');
    assert(exit.at(-1).x<exit[0].x&&exit.at(-1).opacity<exit[0].opacity,'settings exit did not progress');
    assert(exit.at(-1).scrim<exit[0].scrim,'scrim did not fade out');
    assert(intro.length>=3&&intro[0].menuOpacity<.2,'menu intro must start near zero');
    assert(intro.every(f=>f.menuDuration===220),'menu intro duration must be 220ms');
    assert(frames.at(-1).menuOpacity===1,'menu did not settle at opacity one');
    const firstMenu=frames.findIndex(f=>f.menu==='in');
    assert(firstMenu>frames.findLastIndex(f=>f.exit==='true'),'menu route occurred before settings exit');
    if(await evaluate('!!window.settingsTest'))assert.equal(await evaluate('settingsTest.backCalls'),before+1,'Back callback count');
    await continuity('close');
  };
  const pausePhase = async (selector,attribute,value,trigger) => {
    await evaluate(`(()=>{window.navFreeze=new MutationObserver(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e?.dataset[${JSON.stringify(attribute)}]===${JSON.stringify(value)}){navFreeze.disconnect();window.dispatchEvent(new Event('blur'));}});navFreeze.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,childList:true});})()`);
    await trigger();
    await wait(`document.querySelector(${JSON.stringify(selector)})?.dataset[${JSON.stringify(attribute)}]===${JSON.stringify(value)} && !!document.querySelector('.menu-motion-paused')`);
    await sleep(50);
    const state=()=>evaluate(`({screen:settingsTest.application.view.screen,back:settingsTest.backCalls,board:document.querySelector(${JSON.stringify(selector)})?.outerHTML,styles:[...document.querySelectorAll('.menu-artboard,.settings-menu-outgoing,.settings-board,.settings-scrim')].map(e=>{const s=getComputedStyle(e);return[s.transform,s.opacity]}),times:navAnimations.map(a=>a.currentTime)})`);
    const paused=await state();await sleep(250);assert.deepEqual(await state(),paused,`${value}: blur did not freeze navigation and backdrop`);
    await evaluate(`window.dispatchEvent(new Event('focus'))`);
  };
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await viewport(1280,720);
  await cdp('Page.navigate',{url:`${base}/tests/browser/settings-screen-frame.html`});
  await wait('!!window.settingsTest');await menuReady();
  await evaluate(`settingsTest.backCalls=0;settingsTest.originalBack=settingsTest.application.back.bind(settingsTest.application);settingsTest.application.back=()=>{settingsTest.backCalls++;return settingsTest.originalBack()}`);
  assert((await remember())>10,'ambient CSS animations absent');
  for(const [w,h] of [[1280,720],[390,844],[844,390]]) {
    await viewport(w,h);await open(w<900,w===1280,w===1280);await screenshot(`settings-${w}x${h}`);
    await evaluate(`document.querySelector('[data-action="music-volume"]').focus({preventScroll:true})`);
    await key('Home');await key('ArrowRight');
    assert.equal(await evaluate(`+document.querySelector('[data-action="music-volume"]').value`),1,'native range keys');
    await close(false,w<900,true);
    await open(w<900);await close(true,false,true);
    assert.equal(await evaluate('document.activeElement?.dataset.action'),'settings',`${w}×${h}: Settings focus was not restored after Escape/menu intro`);
    // No explicit .focus(): Enter must activate the button restored by navigation.
    await open(false,'restored');await close(true);
    await screenshot(`roundtrip-${w}x${h}`);
    check(`${w}×${h}: synchronous menu fade/settings entry → Back/Escape exit → menu intro; native controls, double Back, restored focus/Enter reopen and backdrop continuity`);
  }
  // Force a real locale rerender while all three entrance animations are live.
  await evaluate(`(()=>{window.navRerendered=false;window.navRerenderObserver=new MutationObserver(()=>{const p=document.querySelector('.reference-settings');if(p?.dataset.entering==='true'){navRerenderObserver.disconnect();window.navOldBoard=p.querySelector('.settings-board');window.navOldGhost=document.querySelector('[data-settings-menu-ghost]');requestAnimationFrame(()=>requestAnimationFrame(()=>{settingsTest.application.setLanguage('en');window.navRerendered=true}))}});navRerenderObserver.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,childList:true})})()`);
  const rerenderFrames=await open(true);
  assert.equal(await evaluate('navRerendered&&navOldBoard!==document.querySelector(".settings-board")'),true,'locale rerender during entry was not exercised');
  const rerenderMoving=rerenderFrames.filter(f=>f.enter==='true');
  assert(rerenderMoving.every((f,i)=>!i||f.boardTiming.time>=rerenderMoving[i-1].boardTiming.time),'rerender reset the shared entrance playhead');
  await close(true);check('locale rerender retains synchronous entrance playheads and cleans up ghost');
  await open(true);await viewport(390,844);await ready();await viewport(844,390);await ready();await close(false,true);
  await pausePhase('.reference-settings','entering','true',()=>click('[data-action="settings"]'));
  assert.equal(await evaluate("!!document.querySelector('[data-settings-menu-ghost]')"),true,'paused entry lost ghost');
  await ready();await continuity('paused menu outro resumed');
  await pausePhase('.reference-settings','exiting','true',()=>key('Escape'));
  await menuReady();await continuity('paused exit resumed');
  await open(true);
  await pausePhase('.menu-artboard','menuTransition','in',()=>key('Escape'));
  await menuReady();await continuity('paused menu intro resumed');
  check('rotation and blur/focus preserve synchronous entry, exit and incoming fades without route catch-up');
  // Close while the entrance is still in flight: the first exit frame must continue its current pose.
  await record();await click('[data-action="settings"]',true);
  await wait(`document.querySelector('.reference-settings')?.dataset.entering==='true'`);
  await key('Escape');await menuReady();
  const mid=await evaluate('navFrames'),firstExit=mid.findIndex(f=>f.exit==='true'),prior=mid.slice(0,firstExit).findLast(f=>f.enter==='true');
  timeline({phase:'close-mid-entry',frames:mid});
  assert(prior&&firstExit>0,'close during entry was not exercised');
  assert(Math.abs(mid[firstExit].x-prior.x)<90&&Math.abs(mid[firstExit].opacity-prior.opacity)<.2,'entry-to-exit pose jumped');
  assert.equal(await evaluate("!!document.querySelector('[data-settings-menu-ghost]')"),false,'mid-entry close retained ghost');
  await continuity('mid-entry close');check('closing during entry preserves the current board pose and removes ghost');
  await click('[data-action="settings"]',true);
  await wait(`document.querySelector('.reference-settings')?.dataset.entering==='true'`);
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await ready();
  assert.equal(await evaluate("!!document.querySelector('[data-settings-menu-ghost]')"),false,'reduced motion change during entry retained ghost');
  await evaluate(`document.querySelector('[data-setting="back"]').click()`);await menuReady();
  check('switching to reduced motion during entry settles and removes ghost');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await record();
  await evaluate(`document.querySelector('[data-action="settings"]').click()`);await ready();
  assert.equal(await evaluate('settingsTest.application.view.screen'),'settings');
  await evaluate(`document.querySelector('[data-setting="back"]').click()`);await menuReady();await sleep(50);
  assert(!(await evaluate('navFrames')).some(f=>f.menu==='in'||f.menu==='out'||f.enter==='true'||f.exit==='true'),'reduced motion rendered a navigation animation');
  assert.equal(await evaluate("!!document.querySelector('[data-settings-menu-ghost]')"),false,'reduced motion retained ghost');
  check('reduced motion settles navigation immediately and removes ghost');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate(`(()=>{const app=settingsTest.application;app.openPreparation();app.start();app.advance(1000);app.pause();app.openSettings()})()`);
  await ready();
  const pausedBattle=await evaluate('({tick:settingsTest.application.view.battle.tick,back:settingsTest.backCalls})');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait('settingsTest.application.view.screen==="battle"');
  for(let i=0;i<4;i++) {
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,autoRepeat:true});
    await sleep(60);
  }
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await sleep(150);
  assert.deepEqual(await evaluate('({screen:settingsTest.application.view.screen,paused:settingsTest.application.view.paused,tick:settingsTest.application.view.battle.tick,back:settingsTest.backCalls})'),{screen:'battle',paused:true,tick:pausedBattle.tick,back:pausedBattle.back+1},'held Escape resumed the paused battle or routed twice');
  check('held Escape after settings exit keeps the same battle paused with unchanged tick and one Back callback');
  // Also exercise the real bootstrap in this run’s disposable browser origin only.
  await evaluate('localStorage.clear()');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await viewport(1280,720);await cdp('Page.navigate',{url:base});await menuReady();await remember();
  await open();await close(true);check('production bootstrap roundtrip preserves backdrop and synchronous entry');
  assert.deepEqual(runtimeErrors,[],'browser runtime errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,runtimeErrors},null,2));
  fs.writeFileSync(path.join(out,'timelines.json'),JSON.stringify(timelines,null,2));
  await send('Browser.close');ws.close();
})().catch(error=>{console.error(error);process.exitCode=1;})
  .finally(async()=>{if(ws)ws.close();await testBrowser.cleanup();})
  .then(()=>console.log(JSON.stringify({ok:!process.exitCode,checks,runtimeErrors,artifacts:out},null,2)))
  .catch(error=>{console.error(error);process.exitCode=1;});
