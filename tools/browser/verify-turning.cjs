/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `turning-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const chrome = testBrowser.launch();
  let endpoint = '', diagnostics = ''; chrome.on('error', error => console.error(error)); chrome.stderr.on('data', chunk => { diagnostics += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) endpoint = match[1]; });
  for (let i = 0; i < 100 && !endpoint; i++) await sleep(100);
  const portFile=path.join(out,'profile','DevToolsActivePort');
  if(!endpoint && fs.existsSync(portFile)){const [port,route]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);endpoint='ws://127.0.0.1:'+port+route;}
  assert(endpoint, 'Chrome debugging endpoint '+diagnostics+' exit='+chrome.exitCode);
  const ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve));
  const runtimeErrors = []; let next = 0; const pending = new Map();
  ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if(msg.method==='Runtime.exceptionThrown') runtimeErrors.push(msg.params); if (msg.id) { const callback = pending.get(msg.id); pending.delete(msg.id); if (msg.error) callback.reject(Error(JSON.stringify(msg.error))); else callback.resolve(msg.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, {resolve,reject}); ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); });
  const {targetId} = await send('Target.createTarget', {url:'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten:true});
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}); if(r.exceptionDetails) throw Error(r.exceptionDetails.text + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
  const wait = async expression => { for(let i=0;i<100;i++) { if(await evaluate(expression)) return; await sleep(100); } throw Error('Timeout: '+expression+' '+await evaluate('document.documentElement.outerHTML.slice(0,3000)'));  };
  const click = async (selector, touch=false) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);await sleep(200);
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e || e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    if(touch){await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});}
    await sleep(150);
  };
  const shot = async name => {const metrics=await cdp('Page.getLayoutMetrics');const size=metrics.cssContentSize;const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:size.height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));};
  const state = () => evaluate('(()=>{const v=turningFixture.app.view,b=v.battle;return {screen:v.screen,paused:v.paused,tick:b.tick,actual:b.beamAngle,desired:b.desiredBeamAngle,speed:v.config.beam.turnSpeed,step:v.config.stepSeconds,sameBattle:b===turningFixture.initialBattle,devices:b.devices.length}})()');
  const gap = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  const aim = async (angle,touch=false) => {
    await evaluate('document.querySelector("canvas").scrollIntoView({block:"center",behavior:"instant"})');
    const point = await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),c=turningFixture.app.view.config;const u=Math.max(.05,Math.min((r.width-38)/(c.worldRadius*2),(r.height-48)/(c.worldRadius*1.68)));return{x:r.x+r.width/2+Math.cos(${angle})*c.beam.range*u,y:r.y+r.height/2+8+Math.sin(${angle})*c.beam.range*u*.84}})()`);
    if(touch){await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5186/tests/browser/turning-frame.html'});
  await wait('!!window.turningFixture && !!document.querySelector("canvas") && turningFixture.app.view.battle?.tick > 0');
  assert.equal((await state()).devices,1);
  const before=await state(); const target=before.actual+Math.PI;
  await aim(target); await sleep(100);
  const moving=await state();
  assert(gap(moving.desired,target)<.02,'Mouse sets desired direction');
  assert(gap(moving.actual,moving.desired)>2,'Beam does not snap');
  assert(gap(moving.actual,before.actual)<=moving.speed*(moving.tick-before.tick)*moving.step+.001,'Actual turn is bounded by speed and simulation ticks');
  await shot('desktop-turning');
  // A UI click must keep the desired angle, including its preceding mousemove.
  await click('[data-action="pause"]');const paused=await state();
  await aim(-1.8); await sleep(300);const frozen=await state();
  assert.equal(frozen.tick,paused.tick);assert.equal(frozen.actual,paused.actual);assert.equal(frozen.desired,paused.desired);
  await shot('desktop-paused');
  await click('[data-action="resume"]');
  const priorUI=await state();await click('[data-action="inspect-device"]');await click('[data-action="cannon-priority"][data-priority="strongest"]');
  await aim(-2.5);await sleep(100);assert.equal((await state()).desired,priorUI.desired,'Device selection and commands preserve aim');
  assert((await state()).tick>priorUI.tick,'Battle continues with device menu');
  await click('[data-action="close-device"]');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});await sleep(200);
  await aim(-.4,true);await sleep(100);assert(gap((await state()).desired,-.4)<.03,'Touch sets desired direction');
  await shot('portrait-turning');
  const touchUI=await state();await click('[data-action="inspect-device"]',true);await click('[data-action="cannon-priority"][data-priority="weakest"]',true);
  assert.equal((await state()).desired,touchUI.desired,'Touch device UI preserves aim');
  await click('[data-action="close-device"]',true);
  await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await sleep(200);
  assert.equal((await state()).sameBattle,true,'Resize preserves the original battle object');
  await aim(2.5,true);await sleep(100);assert(gap((await state()).desired,2.5)<.03,'Landscape touch direction');
  await shot('landscape-turning');
  await click('[data-action="pause"]',true);const landscapePaused=await state();await sleep(200);assert.equal((await state()).actual,landscapePaused.actual);
  await click('[data-action="resume"]',true);await sleep(2200);const caught=await state();assert(gap(caught.actual,caught.desired)<.001,'Beam catches up after resume');
  assert.deepEqual(runtimeErrors, [], 'No browser runtime errors');
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['mouse desired angle','bounded actual turning','pause freezes turn and input','device UI keeps aim while battle continues','portrait touch aim and device UI','landscape touch aim','resize preserves attempt','resume and catch up'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
