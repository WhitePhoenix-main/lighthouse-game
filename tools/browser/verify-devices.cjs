/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `devices-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
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
  const state=()=>evaluate('({screen:deviceFixture.app.view.screen,balance:deviceFixture.app.view.profile.resources,inventory:deviceFixture.app.view.preparation.inventory,paused:deviceFixture.app.view.paused,attempt:deviceFixture.saved().activeAttempt})');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5185/tests/browser/devices-frame.html'});
  await wait('!!window.deviceFixture && !!document.querySelector("[data-placement-map]")');
  assert.equal(await evaluate('deviceFixture.saved().version'),5);assert.equal((await state()).inventory.length,4);
  await click('[data-action="purchase-device"][data-kind="cannon"]');assert.equal((await state()).inventory.length,5);assert.equal((await state()).balance,280);
  // Placement uses actual pointer events on the SVG, preserving world coordinates.
  const place = async(kind,x,y,touch=false)=>{await click(`[data-action="device-type"][data-kind="${kind}"]`,touch);const point=await evaluate(`(()=>{const e=document.querySelector('[data-placement-map]');e.scrollIntoView({block:'center'});const p=e.createSVGPoint();p.x=${x};p.y=${y};const q=p.matrixTransform(e.getScreenCTM());return{x:q.x,y:q.y}})()`);if(touch){await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});}await sleep(200);};
  await place('cannon',-100,0);await place('generator',0,110);await place('light-trap',100,0);
  assert.equal((await state()).inventory.filter(d=>d.position).length,3);assert.equal((await state()).balance,280);
  await cdp('Page.reload');await sleep(600);await wait('!!window.deviceFixture && !!document.querySelector("[data-placement-map]")');assert.equal((await state()).inventory.filter(d=>d.position).length,3);
  await shot('desktop-preparation');await click('[data-action="start"]');assert.equal((await state()).screen,'battle');assert.equal((await state()).balance,280);
  const id=(await state()).attempt.id;
  await sleep(500);await shot('desktop-battle');await click('[data-action="pause"]');await shot('desktop-after-pause');assert.equal((await state()).paused,true);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});await sleep(300);await shot('portrait-pause');await click('[data-action="resume"]',true);assert.equal((await state()).paused,false);assert.equal((await state()).attempt.id,id);
  await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await sleep(200);assert.equal((await state()).attempt.id,id);await shot('landscape-battle');
  await evaluate('deviceFixture.defeat()');await wait('deviceFixture.app.view.screen === "result"');assert.equal((await state()).inventory.find(d=>d.kind==='generator').health,0);
  await click('[data-action="start"]',true);await wait('!!document.querySelector("[data-placement-map]")');await shot('landscape-damage');
  await cdp('Page.reload');await sleep(600);await wait('!!window.deviceFixture && !!document.querySelector("[data-placement-map]")');assert.equal((await state()).inventory.find(d=>d.kind==='generator').health,0);assert.equal((await state()).inventory.find(d=>d.kind==='light-trap').consumed,true);
  await evaluate(`document.querySelector('[data-action="recharge-device"]')?.scrollIntoView({block:'center',behavior:'instant'})`);await sleep(100);await shot('landscape-destroyed-spent');
  const before=(await state()).balance;const inventory=(await state()).inventory;const generator=inventory.find(d=>d.kind==='generator');const trap=inventory.find(d=>d.kind==='light-trap');
  await click(`[data-action="repair-device"][data-device-id="${generator.id}"]`,true);assert.equal((await state()).inventory.find(d=>d.id===generator.id).health,generator.maxHealth);
  await click(`[data-action="recharge-device"][data-device-id="${trap.id}"]`,true);assert.equal((await state()).inventory.find(d=>d.id===trap.id).consumed,false);assert.equal((await state()).balance,before-generator.repairCost-trap.rechargeCost);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);await evaluate(`document.querySelector('[data-action="recharge-device"]')?.scrollIntoView({block:'center',behavior:'instant'})`);await sleep(100);await shot('portrait-restored');
  await click('[data-action="clear-devices"]',true);await place('barrier',-130,0,true);assert.equal((await state()).inventory.filter(d=>d.position).length,1);
  await cdp('Page.reload');await sleep(600);await wait('!!window.deviceFixture && !!document.querySelector("[data-placement-map]")');assert.equal((await state()).inventory.filter(d=>d.position).length,1);
  assert.deepEqual(runtimeErrors, [], 'No browser runtime errors');
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['v4 migration','purchase','pointer placement','reload','free start','pause/resume','resize preserves attempt','synthetic defeat settlement','repair','recharge','portrait touch placement'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
