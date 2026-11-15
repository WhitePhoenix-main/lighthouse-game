/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `stage2-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
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
    await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5189/tests/browser/stage2-frame.html'});
    await wait('!!window.stage2Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage2Fixture.app.view.error'),null);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),37);
    assert.equal(await evaluate('stage2Fixture.app.view.profile.purchasedUpgrades.length'),14);
    assert((await evaluate('document.body.innerText')).includes('37 улучшений маяка · 19 улучшений линз · 5 открытия линз'));
    await click('[data-action="select-upgrade"][data-upgrade="unlock-mortar"]',touch);
    await shot(width+'-development');
    await click('[data-action="upgrade"][data-upgrade="unlock-mortar"]',touch);
    assert.equal(await evaluate('stage2Fixture.app.view.profile.devices.filter(d=>d.kind==="mortar").length'),1);
    const paid=await evaluate('stage2Fixture.app.view.profile.resources');
    await evaluate('stage2Fixture.app.purchaseUpgrade("unlock-mortar")');
    assert.equal(await evaluate('stage2Fixture.app.view.profile.resources'),paid);
    await click('[data-action="purchase-lens"][data-lens="smoldering"]',touch);
    await click('[data-action="purchase-lens-upgrade"][data-lens-upgrade="smoldering-power"]',touch);
    await click('[data-action="back"]',touch);
    await evaluate('stage2Fixture.app.openPreparation()');
    await wait('document.querySelector("[data-action=select-lens][data-lens=smoldering]")');
    await click('[data-action="select-lens"][data-lens="smoldering"]',touch);
    await shot(width+'-preparation');
    await evaluate('stage2Fixture.app.selectDevice("mortar"); stage2Fixture.app.placeDevice(-90,0)');
    await click('[data-action="start"]',touch);
    await evaluate('stage2Fixture.scene(); stage2Fixture.steps(1)');
    const batHealth=await evaluate('stage2Fixture.app.view.battle.enemies.find(e=>e.id===801).health');
    const deviceId=await evaluate('stage2Fixture.app.view.battle.devices.find(d=>d.kind==="mortar").id');
    const aim=await evaluate('stage2Fixture.app.view.battle.desiredBeamAngle');
    await click('[data-action="inspect-device"][data-device-id="'+deviceId+'"]',touch);
    await click('[data-action="choose-target"]',touch);
    assert.equal(await evaluate(`!!document.querySelector('[data-action="target-enemy"][data-enemy-id="801"]')`),false);
    await click('[data-action="target-enemy"][data-enemy-id="800"]',touch);
    await evaluate('stage2Fixture.steps(1)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.devices.find(d=>d.kind==="mortar").targetId'),800);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.desiredBeamAngle'),aim);
    await click('[data-action="close-device"]',touch);
    const flight=await evaluate('stage2Fixture.app.view.battle.mortarProjectiles[0]');
    assert(flight && flight.impactTick>flight.launchTick);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies.find(e=>e.id===800).health'),1000);
    await evaluate('stage2Fixture.steps('+Math.floor((flight.impactTick-flight.launchTick)/2)+')');
    await shot(width+'-mortar-flight');
    const pausedTick=await evaluate('stage2Fixture.app.view.battle.tick');
    await click('[data-action="pause"]',touch);
    await evaluate('stage2Fixture.steps(100)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.tick'),pausedTick);
    await click('[data-action="resume"]',touch);
    await evaluate('stage2Fixture.steps('+flight.impactTick+'-stage2Fixture.app.view.battle.tick)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies.find(e=>e.id===800).health'),1000);
    await evaluate('stage2Fixture.steps(1)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies.find(e=>e.id===800).health'),976);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies.find(e=>e.id===801).health'),batHealth);
    await shot(width+'-mortar-impact');
    const scene=await evaluate('stage2Fixture.burnScene()');
    await evaluate('stage2Fixture.steps(1)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies[0].burn.remainingTicks'),60);
    await wait('document.body.innerText.includes("Горят: 1")');
    await shot(width+'-burn-lit');
    await evaluate('stage2Fixture.app.command({type:"aim",angle:'+JSON.stringify(scene.angle+Math.PI)+'}); stage2Fixture.steps(30)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.litEnemyIds.length'),0);
    assert((await evaluate('stage2Fixture.app.view.battle.enemies[0].burn.remainingTicks'))>0);
    const health=await evaluate('stage2Fixture.app.view.battle.enemies[0].health');
    await evaluate('stage2Fixture.steps(1)');
    assert(Math.abs(health-(await evaluate('stage2Fixture.app.view.battle.enemies[0].health'))-scene.burnDamage)<1e-7);
    await wait('document.body.innerText.includes("В свете: 0 / 2") && document.body.innerText.includes("Горят: 1")');
    await shot(width+'-burn-residual');
    const tick=await evaluate('stage2Fixture.app.view.battle.tick');
    const burn=await evaluate('stage2Fixture.app.view.battle.enemies[0].burn.remainingTicks');
    await click('[data-action="pause"]',touch);
    await evaluate('stage2Fixture.steps(60)');
    assert.equal(await evaluate('stage2Fixture.app.view.battle.tick'),tick);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.enemies[0].burn.remainingTicks'),burn);
    await click('[data-action="resume"]',touch);
    const attempt=await evaluate('stage2Fixture.app.view.battle.seed');
    await cdp('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:1,mobile:true});
    await sleep(300);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.tick'),tick);
    assert.equal(await evaluate('stage2Fixture.app.view.battle.seed'),attempt);
    await evaluate('stage2Fixture.steps(100)');
    await wait('document.body.innerText.includes("Горят: 0")');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  }
  assert.deepEqual(runtimeErrors, []);
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['old profile preserved','mortar first copy once','smoldering purchase and equip','37+19+5 paid nodes','touch portrait and mouse landscape','mortar manual ground target, no bat target','real delayed impact, bat unaffected','tick-driven flight and impact screenshots','real residual burn outside beam, health loss','pause preserves flight/burn and resize preserves attempt','no horizontal overflow or runtime exceptions'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
