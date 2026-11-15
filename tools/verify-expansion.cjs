/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `expansion-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
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
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5188/tests/browser/expansion-frame.html'});
    await wait('!!window.expansionFixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('expansionFixture.app.view.error'),null);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),29);
    assert.equal(await evaluate('expansionFixture.app.view.profile.purchasedUpgrades.length'),14);
    await shot(width+'-development');
    await click('[data-action="select-upgrade"][data-upgrade="unlock-harpoon"]',true);
    await shot(width+'-selected');
    await click('[data-action="upgrade"][data-upgrade="unlock-harpoon"]',true);
    assert.equal(await evaluate('expansionFixture.app.view.profile.devices.filter(d=>d.kind==="harpoon").length'),1);
    const paid=await evaluate('expansionFixture.app.view.profile.resources');
    await evaluate('expansionFixture.app.purchaseUpgrade("unlock-harpoon")');
    assert.equal(await evaluate('expansionFixture.app.view.profile.resources'),paid);
    await click('[data-action="purchase-lens"][data-lens="focused"]',true);
    await click('[data-action="purchase-lens-upgrade"][data-lens-upgrade="focused-power"]',true);
    await click('[data-action="back"]',true);
    await evaluate('expansionFixture.app.openPreparation()');
    await wait('document.querySelector("[data-action=select-lens][data-lens=focused]")');
    await click('[data-action="select-lens"][data-lens="focused"]',true);
    assert((await evaluate('document.querySelector(".lens-selection").innerText')).includes('Каждое щупальце считается отдельно'));
    await shot(width+'-preparation');
    await evaluate('expansionFixture.app.selectDevice("harpoon"); expansionFixture.app.placeDevice(-90,0)');
    await click('[data-action="start"]',true);
    await evaluate('expansionFixture.scene()');
    const deviceId=await evaluate('expansionFixture.app.view.battle.devices.find(d=>d.kind==="harpoon").id');
    const aim=await evaluate('expansionFixture.app.view.battle.desiredBeamAngle');
    await click('[data-action="inspect-device"][data-device-id="'+deviceId+'"]',true);
    await click('[data-action="choose-target"]',true);
    assert.equal(await evaluate('expansionFixture.app.view.battle.desiredBeamAngle'),aim);
    await click('[data-action="target-enemy"][data-enemy-id="800"]',true);
    await evaluate('expansionFixture.step()');
    assert.equal(await evaluate('expansionFixture.app.view.battle.devices.find(d=>d.kind==="harpoon").targetId'),800);
    assert.equal(await evaluate('expansionFixture.app.view.battle.desiredBeamAngle'),aim);
    await shot(width+'-harpoon-target');
    await click('[data-action="close-device"]',true);
    const scene = await evaluate('expansionFixture.focusScene()');
    await evaluate('expansionFixture.steps(15)');
    assert.deepEqual(await evaluate('expansionFixture.app.view.battle.focus'),{targetId:900,ticks:15});
    assert.deepEqual(await evaluate('expansionFixture.app.view.battle.litEnemyIds'),[900]);
    await wait('document.body.innerText.includes("0.5 / 1.5")');
    const pausedTick=await evaluate('expansionFixture.app.view.battle.tick');
    await click('[data-action="pause"]',true);
    await evaluate('expansionFixture.steps(30)');
    assert.equal(await evaluate('expansionFixture.app.view.battle.tick'),pausedTick);
    assert.equal(await evaluate('expansionFixture.app.view.battle.focus.ticks'),15);
    await click('[data-action="resume"]',true);
    await evaluate('expansionFixture.steps(30)');
    assert.equal(await evaluate('expansionFixture.app.view.battle.focus.ticks'),45);
    const health45=await evaluate('expansionFixture.app.view.battle.enemies.find(e=>e.id===900).health');
    assert(Math.abs(scene.health-health45-scene.damagePerStep*45)<1e-7,'first 45 steps use base damage');
    await wait('document.body.innerText.includes("Фокус готов") && document.body.innerText.includes("В свете: 1 / 1")');
    await shot(width+'-focus-ready');
    await evaluate('expansionFixture.steps(1)');
    assert.equal(await evaluate('expansionFixture.app.view.battle.focus.ticks'),46);
    const health46=await evaluate('expansionFixture.app.view.battle.enemies.find(e=>e.id===900).health');
    assert(Math.abs(health45-health46-scene.damagePerStep*(1+scene.bonus))<1e-7,'step 46 uses focus damage');
    await evaluate('expansionFixture.app.command({type:"aim",angle:'+JSON.stringify(scene.angle+Math.PI)+'}); expansionFixture.steps(15)');
    assert.deepEqual(await evaluate('expansionFixture.app.view.battle.focus'),{targetId:null,ticks:0});
    await wait('document.body.innerText.includes("Фокус сброшен")');
    await shot(width+'-focus-turn-reset');
    await evaluate('expansionFixture.app.command({type:"aim",angle:'+JSON.stringify(scene.angle)+'}); expansionFixture.steps(15)');
    assert.equal(await evaluate('expansionFixture.app.view.battle.focus.targetId'),900);
    await evaluate('expansionFixture.moveOutOfRange(); expansionFixture.steps(1)');
    assert.deepEqual(await evaluate('expansionFixture.app.view.battle.focus'),{targetId:null,ticks:0});
    assert.deepEqual(await evaluate('expansionFixture.app.view.battle.litEnemyIds'),[]);
    await wait('document.body.innerText.includes("Фокус сброшен")');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  }
  assert.deepEqual(runtimeErrors, []);
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['old profile purchases preserved','first harpoon granted once','focused lens unlock and upgrade','portrait and landscape development/preparation','touch UI preserves aim','harpoon pins flying target','real simulation focus at 15/45/46 steps and bonus damage','pause preserves focus and tick','turn and range reset focus'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
