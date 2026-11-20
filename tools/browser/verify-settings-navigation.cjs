/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = (process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
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
  const viewport = async (width, height, touch = width < 900, dpr = 1, touchPoints = touch ? 1 : 0) => {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>${touchPoints}})`);
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch });
    await sleep(120);
  };
  const navigate = async url => {await evaluate('window.navOldDocument=true');await cdp('Page.navigate',{url});await wait('!window.navOldDocument');};
  const menuReady = () => wait(`!!document.querySelector('[data-action="settings"]') && document.querySelector('.menu-artboard')?.dataset.menuTransition !== 'in'`);
  const menuVisual = `(root)=>[...root.querySelectorAll('[data-menu-rect],.menu-button-label-art,.menu-button-label')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{class:e.className,image:s.backgroundImage,font:s.fontSize,rect:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10)}})`;
  const key = async name => {
    const code = {Escape:27, Enter:13, Home:36, ArrowRight:39}[name];
    for (const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent', {type,key:name,code:name,windowsVirtualKeyCode:code,...(name==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});
  };
  const record = () => evaluate(`(()=>{
    window.navFrames=[];window.navCancelSnapshots=[];
    if(!window.navOriginalCancel){
      window.navOriginalCancel=Animation.prototype.cancel;
      Animation.prototype.cancel=function(){
        const target=this.effect?.target,page=target?.closest?.('.reference-settings'),time=this.currentTime;
        const completedExit=target?.classList?.contains('settings-board')&&page?.dataset.exiting==='true'&&typeof time==='number'&&time>=559;
        const result=navOriginalCancel.call(this);
        if(completedExit){const style=getComputedStyle(target);navCancelSnapshots.push({layout:page.dataset.layout,connected:target.isConnected,visibility:style.visibility,transform:style.transform,opacity:style.opacity,departed:page.dataset.departed,time});}
        return result;
      };
    }
    const token=window.navToken=(window.navToken||0)+1;
    function sample(frameTime){
      if(token!==navToken)return;
      const p=document.querySelector('.reference-settings'),g=document.querySelector('[data-settings-menu-ghost]'),ghost=g?.querySelector('.settings-menu-outgoing'),m=ghost||document.querySelector('.menu-artboard'),b=p?.querySelector('.settings-board'),s=p?.querySelector('.settings-scrim');
      const style=b&&getComputedStyle(b), menu=m&&getComputedStyle(m);
      const timing=e=>{const a=e?.getAnimations()[0];return a?{start:a.startTime,time:a.currentTime,duration:a.effect.getTiming().duration,state:a.playState}:null};
      const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
      navFrames.push({t:performance.now(),frameTime,screen:window.settingsTest?.application.view.screen||null,layout:p?.dataset.layout,scrollTop:p?.scrollTop,boardTop:b?.getBoundingClientRect().top,viewportHeight:p?.clientHeight,ready:p?.dataset.ready,enter:p?.dataset.entering,exit:p?.dataset.exiting,menu:ghost?(p?.dataset.exiting==='true'?'ghost-in':'out'):m?.dataset.menuTransition,ghost:!!g,ghostSafe:!g||(g.inert&&g.getAttribute('aria-hidden')==='true'&&!g.querySelector('[id],[data-action],[data-focus-key]')),ghostSibling:!g||g.parentElement===document.querySelector('[data-overlay]').parentElement,settingsPages:document.querySelectorAll('.reference-settings').length,settingsControls:document.querySelectorAll('.reference-settings .settings-control').length,duplicateIds:new Set(ids).size!==ids.length,menuActions:document.querySelectorAll('[data-action="settings"]').length,menuOpacity:menu?+menu.opacity:null,x:style?new DOMMatrix(style.transform).m41:null,y:style?new DOMMatrix(style.transform).m42:null,exitTarget:b?.getAnimations()[0]?.effect.getKeyframes().at(-1)?.transform,opacity:style?+style.opacity:null,scrim:s?+getComputedStyle(s).opacity:null,boardTiming:timing(b),scrimTiming:timing(s),menuTiming:timing(m),exitDuration:timing(b)?.duration,menuDuration:timing(m)?.duration});
      requestAnimationFrame(sample);
    } sample();
  })()`);
  const remember = () => evaluate(`(()=>{window.navScene=document.querySelector('.menu-scenery');window.navAnimations=navScene.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);window.navTimes=navAnimations.map(a=>a.currentTime);return navAnimations.length})()`);
  const continuity = async label => {
    const result=await evaluate(`({same:navScene===document.querySelector('.menu-scenery'),animations:navAnimations.every(a=>navScene.getAnimations({subtree:true}).includes(a)),phases:navAnimations.every((a,i)=>a.currentTime>=navTimes[i])})`);
    assert(result.same&&result.animations&&result.phases,`${label}: backdrop DOM, CSSAnimation identity or playheads reset: ${JSON.stringify(result)}`);
    await evaluate('navTimes=navAnimations.map(a=>a.currentTime)');
  };
  const displacement = frame => frame.layout==='mobile'?frame.y:-frame.x;
  const checkAxis = (frames,label) => assert(frames.every(f=>f.layout==='mobile'?Math.abs(f.x)<.1&&f.y>=-.1:Math.abs(f.y)<.1&&f.x<=.1),`${label}: navigation used the wrong axis/direction`);
  const open = async (touch=false,keyboard=false,holdArtwork=false) => {
    await menuReady(); await record();
    // Capture the native click/keyboard activation itself, not the CDP roundtrip.
    await evaluate(`document.querySelector('[data-action="settings"]').addEventListener('click',()=>{
      window.navActivation=performance.now();
      window.navActivationFrame=document.timeline.currentTime;
      window.navMounted=null;
      const observer=new MutationObserver(()=>{
        if(document.querySelector('.reference-settings')){window.navMounted=performance.now();observer.disconnect();}
      });
      observer.observe(document.querySelector('[data-overlay]'),{childList:true});
    },{capture:true,once:true})`);
    if(holdArtwork) { await cdp('Network.enable'); await cdp('Network.setBlockedURLs',{urls:['*/images/settings-stone/*.png']}); }
    if(keyboard){if(keyboard!=='restored')await evaluate(`document.querySelector('[data-action="settings"]').focus()`);await key('Enter');}
    else await click('[data-action="settings"]',touch);
    if(holdArtwork){
      await wait("document.querySelector('.reference-settings')?.dataset.ready==='true'");
      assert.equal(await evaluate('settingsTest.application.view.screen'),'settings','native controls wait for decorative images');
      await cdp('Network.setBlockedURLs',{urls:[]});
    }
    await ready(); await sleep(40);
    const frames=await evaluate('navFrames'),out=frames.filter(f=>f.menu==='out');
    const activation=await evaluate('({click:navActivation,frame:navActivationFrame,mounted:navMounted})');
    timeline({phase:'open',activation,frames});
    assert(activation.mounted!==null&&activation.mounted-activation.click<180,'Settings activation waited for button animation before mounting the page');
    assert(out.length>=3,'menu ghost has no rendered frames');
    assert(out.some(f=>f.menuOpacity<.95&&f.menuOpacity>.05&&f.enter==='true'&&displacement(f)>0&&f.opacity>0&&f.opacity<1),'menu ghost fade and settings slide/fade did not share a frame');
    assert(out.every(f=>!f.screen||f.screen==='settings'),'settings route was delayed until after menu outro');
    const moving=frames.filter(f=>f.enter==='true');
    assert(moving.length>=3,'settings entry absent');
    checkAxis(moving,'entry');
    assert(displacement(moving.at(-1))<displacement(moving[0]),'entry did not approach its settled pose');
    assert(moving.every(f=>f.ghost&&f.menuDuration===560&&f.boardTiming?.duration===560&&f.scrimTiming?.duration===560),'all three entrance animations must run together for 560ms');
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
    assert(exit.every(f=>f.exitDuration===560),'settings exit duration must be 560ms');
    assert(exit.every(f=>!f.screen||f.screen==='settings'),'route changed while exiting');
    checkAxis(exit,'exit');
    assert(exit.some(f=>displacement(f)>40&&f.opacity<.8),'settings board did not exit in its layout direction and fade');
    assert(exit.filter(f=>f.layout==='mobile').every(f=>f.exitTarget==='translateY(calc(100% + 1px))'),'mobile exit must hide the full panel height, including scrolled compact layouts');
    assert(displacement(exit.at(-1))>displacement(exit[0])&&exit.at(-1).opacity<exit[0].opacity,'settings exit did not progress');
    assert(exit.at(-1).scrim<exit[0].scrim,'scrim did not fade out');
    const mobileExit=exit.filter(f=>f.layout==='mobile');
    if(mobileExit.length){
      assert(mobileExit.every(f=>Math.abs(f.scrollTop-mobileExit[0].scrollTop)<.5),'mobile scrollTop shifted during exit');
      const tail=mobileExit.at(-1);
      assert(tail.boardTop>=tail.viewportHeight-2,'mobile final exit frame retained a bottom header tail');
    }
    const canceled=await evaluate('navCancelSnapshots');
    assert(canceled.length>0,'completed-exit cancellation handoff was not sampled');
    assert(canceled.every(f=>!f.connected||f.visibility==='hidden'),'cancel exposed the old connected settings header');
    timeline({phase:'cancel-handoff',snapshots:canceled});
    assert.equal(await evaluate('document.querySelectorAll(".reference-settings,.settings-board,.settings-art").length'),0,'settings header/artwork remained after navigation');
    assert.equal(intro.length,0,'real menu must appear settled without a second intro');
    assert(exit.every(f=>f.ghost&&f.ghostSafe&&f.ghostSibling&&f.settingsPages===1&&f.settingsControls===10&&f.menuActions===0&&!f.duplicateIds),'exit ghost duplicated actions/IDs/pages or was unsafe');
    assert(exit.every(f=>f.menuDuration===560&&f.boardTiming?.duration===560&&f.scrimTiming?.duration===560),'exit board/scrim/menu must share 560ms');
    assert(exit.some(f=>f.menuOpacity>.05&&f.menuOpacity<.95&&f.opacity>0&&f.opacity<1),'incoming ghost and outgoing board did not share rendered frames');
    for(const f of exit){
      const timings=[f.boardTiming,f.scrimTiming,f.menuTiming];
      const starts=timings.map(a=>a.start),times=timings.map(a=>a.time);
      if(starts.every(t=>typeof t==='number'))assert(Math.max(...starts)-Math.min(...starts)<1,'exit animation start times differ');
      if(times.every(t=>typeof t==='number'))assert(Math.max(...times)-Math.min(...times)<1,'exit animation playheads differ');
      assert(Math.abs(f.menuOpacity+f.opacity-1)<.015&&Math.abs(f.scrim-f.opacity)<.015,'exit menu/board/scrim opacity diverged');
    }
    assert(frames.at(-1).menuOpacity===1,'menu did not settle at opacity one');
    const firstMenu=frames.findIndex(f=>!f.settingsPages&&f.menuOpacity!==null);
    assert(firstMenu>frames.findLastIndex(f=>f.exit==='true'),'real menu route occurred before settings exit');
    assert(frames.slice(firstMenu).every(f=>f.menuOpacity===1&&!f.ghost),'real menu flashed or faded after exit');
    if(await evaluate('!!window.settingsTest'))assert.equal(await evaluate('settingsTest.backCalls'),before+1,'Back callback count');
    await continuity('close');
  };
  const pausePhase = async (selector,attribute,value,trigger) => {
    await evaluate(`(()=>{window.navFreeze=new MutationObserver(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e?.dataset[${JSON.stringify(attribute)}]===${JSON.stringify(value)}){navFreeze.disconnect();window.dispatchEvent(new Event('blur'));}});navFreeze.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,childList:true});})()`);
    await trigger();
    await wait(attribute==='entering'?`document.querySelector('.reference-settings')?.dataset.entering==='false'&&!!document.querySelector('.menu-motion-paused')`:`!!document.querySelector('[data-action="settings"]')&&!!document.querySelector('.menu-motion-paused')`);
    await sleep(50);
    const state=()=>evaluate(`({screen:settingsTest.application.view.screen,back:settingsTest.backCalls,board:document.querySelector(${JSON.stringify(selector)})?.outerHTML,styles:[...document.querySelectorAll('.menu-artboard,.settings-menu-outgoing,.settings-board,.settings-scrim')].map(e=>{const s=getComputedStyle(e);return[s.transform,s.opacity]}),times:navAnimations.map(a=>a.currentTime)})`);
    const paused=await state();await sleep(250);assert.deepEqual(await state(),paused,`${value}: blur did not settle navigation and freeze backdrop`);
    await evaluate(`window.dispatchEvent(new Event('focus'))`);
  };
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  if(!process.env.LIGHTHOUSE_PAINT_ONLY) {
  await viewport(1280,720);
  await navigate(`${base}/tests/browser/settings-screen-frame.html`);
  await wait('!!window.settingsTest');await menuReady();
  await evaluate(`settingsTest.backCalls=0;settingsTest.originalBack=settingsTest.application.back.bind(settingsTest.application);settingsTest.application.back=()=>{settingsTest.backCalls++;return settingsTest.originalBack()}`);
  assert((await remember())>10,'ambient CSS animations absent');
  for(const [w,h,touch,dpr=1,touchPoints=touch?1:0] of [[1280,720,false],[844,390,false],[390,844,true],[844,390,true],[568,320,true],[390,844,true,1.25],[844,390,true,1.25],[390,844,false],[795,1543,false],[933,1051,false],[844,390,false,1,5]]) {
    await viewport(w,h,touch,dpr,touchPoints);await open(touch,w===1280,w===1280);await screenshot(`settings-${touch?'coarse':touchPoints?'fine-touch':'fine'}-${w}x${h}-dpr-${dpr}`);
    await evaluate(`document.querySelector('[data-action="music-volume"]').focus({preventScroll:true})`);
    await key('Home');await key('ArrowRight');
    assert.equal(await evaluate(`+document.querySelector('[data-action="music-volume"]').value`),1,'native range keys');
    await close(false,touch,true);
    await open(touch);await close(true,false,true);
    assert.equal(await evaluate('document.activeElement?.dataset.action'),'settings',`${w}×${h}: Settings focus was not restored after Escape/menu intro`);
    // No explicit .focus(): Enter must activate the button restored by navigation.
    await open(false,'restored');await close(true);
    await screenshot(`roundtrip-${touch?'coarse':touchPoints?'fine-touch':'fine'}-${w}x${h}`);
    check(`${touch?'coarse':touchPoints?'fine-touch':'fine'} ${w}×${h} DPR${dpr}: immediate activation; synchronous menu/settings entry and mirrored exit on the layout axis; native controls, double Back, restored focus/Enter reopen and backdrop continuity`);
  }
  await viewport(844,390,true);
  // Force a real locale rerender while all three entrance animations are live.
  await evaluate(`(()=>{window.navRerendered=false;window.navRerenderObserver=new MutationObserver(()=>{const p=document.querySelector('.reference-settings');if(p?.dataset.entering==='true'){navRerenderObserver.disconnect();window.navOldBoard=p.querySelector('.settings-board');window.navOldGhost=document.querySelector('[data-settings-menu-ghost]');requestAnimationFrame(()=>requestAnimationFrame(()=>{settingsTest.application.setLanguage('en');window.navRerendered=true}))}});navRerenderObserver.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,childList:true})})()`);
  const rerenderFrames=await open(true);
  assert.equal(await evaluate('navRerendered&&navOldBoard!==document.querySelector(".settings-board")'),true,'locale rerender during entry was not exercised');
  const rerenderMoving=rerenderFrames.filter(f=>f.enter==='true');
  assert(rerenderMoving.every((f,i)=>!i||f.boardTiming.time>=rerenderMoving[i-1].boardTiming.time),'rerender reset the shared entrance playhead');
  await close(true);check('locale rerender retains synchronous entrance playheads and cleans up ghost');
  await open(true);await viewport(390,844);await ready();
  await click('[data-setting="ru"]',true);await ready();await click('[data-setting="large"]',true);await ready();
  await viewport(844,390);await ready();
  await evaluate(`(()=>{window.navSnapshotObserver=new MutationObserver(()=>{const g=document.querySelector('[data-settings-menu-direction="in"] .settings-menu-outgoing');if(g){navSnapshotObserver.disconnect();window.navIncomingVisual=(${menuVisual})(g)}});navSnapshotObserver.observe(document.querySelector('[data-overlay]').parentElement,{subtree:true,childList:true,attributes:true})})()`);
  await close(false,true);
  const incomingVisual=await evaluate('navIncomingVisual');
  const settledVisual=await evaluate(`(${menuVisual})(document.querySelector('.menu-artboard'))`);
  assert(incomingVisual?.length>0,'fresh incoming ghost was not sampled');
  assert.equal(incomingVisual.length,settledVisual.length,'incoming menu artwork count');
  for(let i=0;i<incomingVisual.length;i++){
    const {rect,...visual}=incomingVisual[i],{rect:expected,...expectedVisual}=settledVisual[i];
    assert.deepEqual(visual,expectedVisual,'incoming menu snapshot used stale locale/text-size after rotation');
    assert(rect.every((n,j)=>Math.abs(n-expected[j])<=.5),`incoming menu geometry mismatch: ${JSON.stringify({rect,expected})}`);
  }
  check('incoming ghost matches current language, large text and rotated layout before real menu replaces it');
  await pausePhase('.reference-settings','entering','true',()=>click('[data-action="settings"]'));
  assert.equal(await evaluate("!!document.querySelector('[data-settings-menu-ghost]')"),false,'blurred settled entry retained ghost');
  await ready();await continuity('paused menu outro resumed');
  await pausePhase('.reference-settings','exiting','true',()=>key('Escape'));
  await menuReady();await continuity('paused exit resumed');
  await open(true);
  await pausePhase('.reference-settings','exiting','true',()=>key('Escape'));
  await menuReady();await continuity('paused incoming ghost resumed');
  check('rotation and blur/focus settle active navigation while backdrop stays paused');
  // Close while the entrance is still in flight: the first exit frame must continue its current pose.
  // Freeze an actual early RAF pose before sending native Escape. CDP roundtrip
  // latency otherwise lets this fast easing pass the useful visible-menu range.
  await evaluate(`(()=>{window.navMidFreeze=new MutationObserver(()=>{if(document.querySelector('.reference-settings')?.dataset.entering==='true'){navMidFreeze.disconnect();requestAnimationFrame(()=>{const time=document.querySelector('.settings-board').getAnimations()[0].currentTime;for(const e of document.querySelectorAll('.settings-board,.settings-scrim,.settings-menu-outgoing'))for(const a of e.getAnimations()){a.pause();a.currentTime=time;}window.navMidHeld=true;})}});navMidFreeze.observe(document.querySelector('[data-overlay]'),{subtree:true,attributes:true,childList:true})})()`);
  await record();await click('[data-action="settings"]',true);
  await wait(`document.querySelector('.reference-settings')?.dataset.entering==='true'&&window.navMidHeld`);
  await key('Escape');
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await menuReady();
  const mid=await evaluate('navFrames'),firstExit=mid.findIndex(f=>f.exit==='true'),prior=mid.slice(0,firstExit).findLast(f=>f.enter==='true');
  timeline({phase:'close-mid-entry',frames:mid});
  assert(prior&&firstExit>0,'close during entry was not exercised');
  assert(Math.abs(mid[firstExit].x-prior.x)<90&&Math.abs(mid[firstExit].y-prior.y)<90&&Math.abs(mid[firstExit].opacity-prior.opacity)<.2,'entry-to-exit pose jumped');
  checkAxis([prior,mid[firstExit]],'mid-entry close');
  assert(prior.layout==='mobile'&&prior.y>0,'mid-entry close did not exercise mobile upward entry');
  assert(prior.menuOpacity>.2,'mid-entry close did not exercise a visible outgoing menu');
  assert(Math.abs(mid[firstExit].menuOpacity-prior.menuOpacity)<.2,'entry-to-exit menu opacity jumped instead of continuing the visible ghost');
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
  await viewport(1280,720);await navigate(base);await menuReady();await remember();
  await open();await close(true);check('production bootstrap roundtrip preserves backdrop and synchronous entry');
  }
  // Compare real composited pixels, including the first frame after native focus returns.
  const decodePng = data => {
    const png=Buffer.from(data,'base64'),chunks=[];let width,height,bpp;
    for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8),d=png.subarray(p+8,p+8+n);if(type==='IHDR'){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert([2,6].includes(d[9]),'unsupported screenshot PNG');bpp=d[9]===2?3:4;}if(type==='IDAT')chunks.push(d);p+=n+12;}
    const raw=require('node:zlib').inflateSync(Buffer.concat(chunks)),stride=width*bpp,rows=Buffer.alloc(height*stride);
    const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
    let offset=0;for(let y=0;y<height;y++){const filter=raw[offset++];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=bpp?rows[i-bpp]:0,b=y?rows[i-stride]:0,c=y&&x>=bpp?rows[i-stride-bpp]:0;rows[i]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
    const pixels=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)pixels[i*3+c]=rows[i*bpp+c];return{width,height,pixels};
  };
  const pixelDifference=(expected,data)=>{const actual=decodePng(data);assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);let changed=0;for(let i=0;i<actual.pixels.length;i+=3)if(Math.abs(actual.pixels[i]-expected.pixels[i])>4||Math.abs(actual.pixels[i+1]-expected.pixels[i+1])>4||Math.abs(actual.pixels[i+2]-expected.pixels[i+2])>4)changed++;return changed;};
  const paintChecks=[];
  const paintCases=[[390,844,false,0],[795,1543,false,0],[933,1051,false,0],[844,390,true,1],[844,390,false,0],[844,390,false,5],[568,320,true,1],[1280,720,false,0]];
  for(let index=0;index<paintCases.length;index++) {
    const [width,height,touch,touchPoints]=paintCases[index],language=index%2?'en':'ru',large=!!(index%2);
    await viewport(width,height,touch,1,touchPoints);
    await navigate(`${base}/tests/browser/settings-screen-frame.html`);await wait('!!window.settingsTest');await menuReady();
    await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>${touchPoints}});settingsTest.application.setLanguage('${language}');settingsTest.application.setTextSize('${large?'large':'normal'}')`);
    await wait(`!!document.querySelector('.menu-title-ready')&&[...document.querySelectorAll('.menu-scenery img')].every(i=>i.complete&&i.naturalWidth)`);
    await evaluate(`(()=>{const style=document.createElement('style');style.textContent='.menu-title-sprite{animation:none!important;filter:none!important;background-position:0 0!important}.menu-title-sprite::after{animation:none!important;opacity:0!important}.menu-hotspot:focus-visible{outline:none!important}.menu-button-frame{background-position:0% 0!important}.menu-button-label-art{transform:none!important}';document.head.append(style);window.paintNativePlay=Animation.prototype.play;Animation.prototype.play=function(){if(this.effect?.target?.closest('.menu-scenery')){this.pause();this.currentTime=0;return;}return paintNativePlay.call(this);};window.paintNativeAnimate=Element.prototype.animate;Element.prototype.animate=function(...args){const a=paintNativeAnimate.apply(this,args);if(this.closest('.menu-scenery')){a.pause();a.currentTime=0;}return a;};for(const a of document.querySelector('.menu-scenery').getAnimations({subtree:true})){a.pause();a.currentTime=0;}})()`);
    await evaluate(`window.paintSentinel=document.createElement('div');paintSentinel.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:#00ff00';document.body.append(paintSentinel)`);
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await evaluate('document.activeElement?.blur()');await sleep(80);
    const baseline=(await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,expected=decodePng(baseline);
    const label=`paint-${width}x${height}-${touch?'coarse':touchPoints?'fine-touch':'fine'}-${language}-${large?'large':'normal'}`;
    fs.writeFileSync(path.join(out,`${label}-baseline.png`),Buffer.from(baseline,'base64'));
    for(const blur of [false,true]) {
      await evaluate(`paintSentinel.style.background='#ff0000';document.querySelector('[data-action="settings"]').click()`);await ready();
      const mode=await evaluate(`document.querySelector('.reference-settings').dataset.layout`);
      const input=await evaluate(`({width:innerWidth,height:innerHeight,coarse:matchMedia('(pointer:coarse)').matches,anyCoarse:matchMedia('(any-pointer:coarse)').matches,touch:navigator.maxTouchPoints})`);
      // The motion axis uses width. Only short or narrow landscape windows
      // place the shelves side by side, regardless of pointer type.
      assert.equal(mode, width<960?'mobile':'desktop',`${label}: navigation layout ${JSON.stringify(input)}`);
      const shelves=await evaluate(`(()=>{
        const sound=document.querySelector('.sound-shelf').getBoundingClientRect();
        const reading=document.querySelector('.reading-shelf').getBoundingClientRect();
        return {stacked:reading.top>=sound.bottom&&Math.abs(reading.left-sound.left)<1,
          adjacent:reading.left>=sound.right&&Math.abs(reading.top-sound.top)<1};
      })()`);
      const sideBySide=width>height&&(width<960||height<=560);
      assert(sideBySide?shelves.adjacent:shelves.stacked,`${label}: wrong shelf arrangement for viewport`);
      if(height<400)await evaluate(`document.querySelector('.reference-settings').scrollTop=10000`);
      const frames=[];const onFrame=event=>{const message=JSON.parse(event.data);if(message.method==='Page.screencastFrame'&&message.sessionId===sessionId){frames.push(message.params);cdp('Page.screencastFrameAck',{sessionId:message.params.sessionId}).catch(error=>runtimeErrors.push(error.message));}};
      ws.addEventListener('message',onFrame);await cdp('Page.startScreencast',{format:'png',everyNthFrame:1});
      await evaluate(`window.paintClosedAt=0;window.paintCloseObserver=new MutationObserver(()=>{if(!document.querySelector('.reference-settings')){paintClosedAt=Date.now();paintSentinel.style.background='#00ff00';paintCloseObserver.disconnect();}});paintCloseObserver.observe(document.querySelector('[data-overlay]'),{childList:true,subtree:true});document.querySelector('[data-setting="back"]').click()`);
      let otherTarget,visibleAt=0;
      if(blur){await wait(`document.querySelector('.reference-settings')?.dataset.exiting==='true'`);otherTarget=(await send('Target.createTarget',{url:'about:blank'})).targetId;await send('Target.activateTarget',{targetId:otherTarget});}
      await menuReady();
      const closedAt=await evaluate('paintClosedAt');assert(closedAt>0,`${label}: menu handoff not observed`);
      if(blur){await sleep(700);assert.equal(await evaluate(`document.querySelectorAll('.reference-settings,[data-settings-menu-ghost]').length`),0,'native blur left a partial settings sheet or ghost');visibleAt=Date.now();await send('Target.activateTarget',{targetId});await cdp('Page.bringToFront');}
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await evaluate('document.activeElement?.blur()');await sleep(120);
      const final=(await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
      await cdp('Page.stopScreencast');ws.removeEventListener('message',onFrame);if(otherTarget)await send('Target.closeTarget',{targetId:otherTarget});
      const eligible=frames.filter(f=>{const p=decodePng(f.data);return p.pixels[0]===0&&p.pixels[1]===255&&p.pixels[2]===0&&(!blur||f.metadata.timestamp*1000>=visibleAt);});
      assert(eligible.length>0,`${label}: no composited menu frame after ${blur?'native focus return':'handoff'}`);
      const comparisons=eligible.map(f=>pixelDifference(expected,f.data));comparisons.push(pixelDifference(expected,final));
      for(const [i,frame] of eligible.slice(0,3).entries())fs.writeFileSync(path.join(out,`${label}-${blur?'blur':'active'}-menu-frame-${i}.png`),Buffer.from(frame.data,'base64'));
      fs.writeFileSync(path.join(out,`${label}-${blur?'blur':'active'}-settled.png`),Buffer.from(final,'base64'));
      paintChecks.push({label,blur,mode,input,frames:eligible.length,sentinel:'painted menu handoff',differingPixels:comparisons});fs.writeFileSync(path.join(out,'paint-checks.json'),JSON.stringify(paintChecks,null,2));
      assert(comparisons.every(n=>n===0),`${label}: old settings pixels survived ${blur?'native blur/return':'close'}: ${JSON.stringify(comparisons)}`);
    }
  }
  check('composited menu pixels match a frozen clean baseline after active close and native mid-exit focus loss; fine/coarse/touch-capable inputs, both orientations and RU/EN normal/large');
  assert.deepEqual(runtimeErrors,[],'browser runtime errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,runtimeErrors},null,2));
  fs.writeFileSync(path.join(out,'timelines.json'),JSON.stringify(timelines,null,2));
  await send('Browser.close');ws.close();
})().catch(error=>{console.error(error);process.exitCode=1;})
  .finally(async()=>{if(ws)ws.close();await testBrowser.cleanup();})
  .then(()=>console.log(JSON.stringify({ok:!process.exitCode,checks,runtimeErrors,artifacts:out},null,2)))
  .catch(error=>{console.error(error);process.exitCode=1;});
