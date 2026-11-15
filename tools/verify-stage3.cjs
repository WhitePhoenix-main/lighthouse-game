/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `stage3-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
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
  await cdp('Page.enable'); await cdp('Runtime.enable');

  for (const [width,height] of [[390,844],[844,390]]) {
    const touch=width===390;
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5190/tests/browser/stage3-frame.html'});
    await wait('!!window.stage3Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage3Fixture.app.view.error'),null);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),45);
    assert.equal(await evaluate('stage3Fixture.app.view.profile.purchasedUpgrades.length'),14);
    await click('[data-action="select-upgrade"][data-upgrade="unlock-bell"]',touch);
    await shot(width+'-development');
    await click('[data-action="upgrade"][data-upgrade="unlock-bell"]',touch);
    assert.equal(await evaluate('stage3Fixture.app.view.profile.devices.filter(d=>d.kind==="bell").length'),1);
    const paid=await evaluate('stage3Fixture.app.view.profile.resources');
    await evaluate('stage3Fixture.app.purchaseUpgrade("unlock-bell")');
    assert.equal(await evaluate('stage3Fixture.app.view.profile.resources'),paid);
    await click('[data-action="purchase-lens"][data-lens="resonant"]',touch);
    await click('[data-action="purchase-lens-upgrade"][data-lens-upgrade="resonant-power"]',touch);
    await click('[data-action="back"]',touch);
    await evaluate('stage3Fixture.app.openPreparation()');
    await click('[data-action="select-lens"][data-lens="resonant"]',touch);
    await shot(width+'-preparation');
    await evaluate('stage3Fixture.app.selectDevice("bell");stage3Fixture.app.placeDevice(-100,0)');
    await click('[data-action="start"]',touch);
    const scene=await evaluate('stage3Fixture.scene()');
    const before=await evaluate('structuredClone(stage3Fixture.app.view.battle.enemies)');
    await evaluate('stage3Fixture.steps(1)');
    const after=await evaluate('structuredClone(stage3Fixture.app.view.battle.enemies)');
    assert(after.every(e=>e.bellSlows.length===1));
    assert(Math.abs(Math.hypot(before[0].x,before[0].y)-Math.hypot(after[0].x,after[0].y)-scene.speed*scene.multiplier/30)<1e-7);
    assert.equal(after[0].health,before[0].health);assert.equal(after[1].health,before[1].health);
    const deviceId=await evaluate('stage3Fixture.app.view.battle.devices.find(d=>d.kind==="bell").id');
    const aim=await evaluate('stage3Fixture.app.view.battle.desiredBeamAngle');
    await click('[data-action="inspect-device"][data-device-id="'+deviceId+'"]',touch);
    assert.equal(await evaluate('!!document.querySelector("[data-action=choose-target]")'),false);
    assert.equal(await evaluate('stage3Fixture.app.view.battle.desiredBeamAngle'),aim);
    await evaluate('stage3Fixture.steps(5)');
    await shot(width+'-bell-pulse');
    await click('[data-action="close-device"]',touch);
    const resonance=await evaluate('stage3Fixture.resonanceScene()');
    await evaluate('stage3Fixture.steps(59)');
    await shot(width+'-resonance-progress');
    const hp=await evaluate('stage3Fixture.app.view.battle.enemies[0].health');
    await evaluate('stage3Fixture.steps(1)');
    assert(resonance.paired>0);
    const hp60=await evaluate('stage3Fixture.app.view.battle.enemies[0].health');
    assert.equal(await evaluate('stage3Fixture.app.view.battle.resonance.ticks'),60);
    assert(Math.abs(hp-hp60-resonance.damage*(1+resonance.paired))<1e-7);
    await wait('document.body.innerText.includes("Резонанс готов")');await shot(width+'-resonance-ready');
    await evaluate('document.querySelector(".battle-rail").scrollTop=0');
    await shot(width+'-battle-overview');
    assert.equal(await evaluate('document.querySelector(".battle-rail").scrollTop'),0);
    await evaluate('stage3Fixture.steps(1)');
    assert(Math.abs(hp60-(await evaluate('stage3Fixture.app.view.battle.enemies[0].health'))-resonance.damage*(1+resonance.paired+resonance.bonus))<1e-7);
    const tick=await evaluate('stage3Fixture.app.view.battle.tick');
    await click('[data-action="pause"]',touch);await evaluate('stage3Fixture.steps(100)');assert.equal(await evaluate('stage3Fixture.app.view.battle.tick'),tick);
    await click('[data-action="resume"]',touch);
    const attempt=await evaluate('stage3Fixture.app.view.battle.seed');
    await cdp('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:1,mobile:true});await sleep(300);
    assert.equal(await evaluate('stage3Fixture.app.view.battle.tick'),tick);assert.equal(await evaluate('stage3Fixture.app.view.battle.seed'),attempt);
    await evaluate('stage3Fixture.app.command({type:"aim",angle:Math.PI});stage3Fixture.steps(100)');
    assert.equal(await evaluate('stage3Fixture.app.view.battle.resonance.ticks'),0);
    await wait('document.body.innerText.includes("Резонанс сброшен")');await shot(width+'-resonance-reset');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await click('[data-action="pause"]',touch);
    await evaluate('stage3Fixture.app.openSettings()');
    await wait('stage3Fixture.app.view.screen==="settings"');
    await evaluate('stage3Fixture.app.setLanguage("en");stage3Fixture.app.back()');
    await wait('document.body.innerText.includes("Resonance reset")');
    await shot(width+'-english');
  }
  assert.deepEqual(runtimeErrors, []);
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['old purchases preserved','first bell once','resonant purchase/equip','real pulse slows ground and flying targets without damage','passive bell no targeting or aim changes','60 normal damage steps, step 61 additive resonance','pause resume resize and resonance reset','portrait touch and landscape mouse','no overflow or runtime errors'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
