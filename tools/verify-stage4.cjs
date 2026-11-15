/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `stage4-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5191,strictPort:true,hmr:false}});await server.listen();
  const chrome = testBrowser.launch();
  let endpoint = '', diagnostics = ''; chrome.on('error', error => console.error(error)); chrome.stderr.on('data', chunk => { diagnostics += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) endpoint = match[1]; });
  for (let i = 0; i < 100 && !endpoint; i++) await sleep(100);
  const portFile=path.join(out,'profile','DevToolsActivePort');
  if(!endpoint && fs.existsSync(portFile)){const [port,route]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);endpoint='ws://127.0.0.1:'+port+route;}
  assert(endpoint, 'Chrome debugging endpoint '+diagnostics+' exit='+chrome.exitCode);
  const ws = new WebSocket(endpoint); await new Promise((resolve,reject) => {const timeout=setTimeout(()=>reject(Error('WebSocket timeout '+endpoint)),10000);ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();});ws.addEventListener('error',reject);});
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
    await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5191/tests/browser/stage4-frame.html'});
    await wait('!!window.stage4Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage4Fixture.app.view.error'),null);

    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),53);
    assert.equal(await evaluate('stage4Fixture.app.view.profile.purchasedUpgrades.length'),3);
    await click('[data-action="select-upgrade"][data-upgrade="unlock-repair-lamp"]',touch);
    await shot(width+'-development');
    await click('[data-action="upgrade"][data-upgrade="unlock-repair-lamp"]',touch);
    assert.equal(await evaluate('stage4Fixture.app.view.profile.devices.filter(d=>d.kind==="repair-lamp").length'),1);
    const paid=await evaluate('stage4Fixture.app.view.profile.resources');
    await evaluate('stage4Fixture.app.purchaseUpgrade("unlock-repair-lamp")');
    assert.equal(await evaluate('stage4Fixture.app.view.profile.resources'),paid);
    await click('[data-action="purchase-lens"][data-lens="long-range"]',touch);
    await click('[data-action="back"]',touch);
    await evaluate('stage4Fixture.app.openPreparation()');
    assert.equal(await evaluate('stage4Fixture.app.view.config.beam.range'),300);
    await click('[data-action="select-lens"][data-lens="long-range"]',touch);
    assert.equal(await evaluate('stage4Fixture.app.view.config.beam.range'),345);
    await evaluate('stage4Fixture.app.purchaseDevice("repair-lamp");stage4Fixture.app.selectDevice("repair-lamp");stage4Fixture.app.placeDevice(-140,-50);stage4Fixture.app.placeDevice(-140,50);stage4Fixture.app.selectDevice("cannon");stage4Fixture.app.placeDevice(-70,0)');
    assert.equal(await evaluate('stage4Fixture.app.view.preparation.placements.length'),3);
    await shot(width+'-preparation');
    await click('[data-action="start"]',touch);
    const scene=await evaluate('stage4Fixture.damageScene()');assert.equal(scene.ceiling,50);
    const aim=await evaluate('stage4Fixture.app.view.battle.desiredBeamAngle');
    await click('[data-action="inspect-device"][data-device-id="'+scene.lampIds[0]+'"]',touch);
    assert.equal(await evaluate('!!document.querySelector("[data-action=choose-target]")'),false);
    assert.equal(await evaluate('stage4Fixture.app.view.battle.desiredBeamAngle'),aim);
    await evaluate('stage4Fixture.steps(1)');
    const result=await evaluate('(()=>{const b=stage4Fixture.app.view.battle;return {events:b.events.filter(e=>e.type==="device-repaired"),lamps:b.devices.filter(d=>d.kind==="repair-lamp"),target:b.devices.find(d=>d.kind==="cannon"),enemy:b.enemies[0]}})()');
    assert.equal(result.events.length,2);assert.equal(result.events.reduce((sum,e)=>sum+e.amount,0),15);
    assert.equal(result.target.health,scene.ceiling);assert(result.lamps.every(d=>d.repairCharges===2));
    assert(result.enemy.health<scene.enemyHealth,'long-range hits enemy at 325 outside base range 300');
    await wait('document.querySelector(".device-command-panel").innerText.includes("заряды 2")');
    await shot(width+'-real-repair');
    await click('[data-action="close-device"]',touch);
    await evaluate('document.querySelector(".battle-rail").scrollTop=0');
    await shot(width+'-battle-overview');
    assert.equal(await evaluate('document.querySelector(".battle-rail").scrollTop'),0);
    assert((await evaluate('document.querySelector(".range-label").innerText')).includes('345'));
    const tick=await evaluate('stage4Fixture.app.view.battle.tick');
    await click('[data-action="pause"]',touch);await evaluate('stage4Fixture.steps(100)');assert.equal(await evaluate('stage4Fixture.app.view.battle.tick'),tick);
    await click('[data-action="resume"]',touch);
    const attempt=await evaluate('stage4Fixture.app.view.battle.seed');
    await cdp('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:1,mobile:true});await sleep(300);
    assert.equal(await evaluate('stage4Fixture.app.view.battle.tick'),tick);assert.equal(await evaluate('stage4Fixture.app.view.battle.seed'),attempt);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await click('[data-action="pause"]',touch);
    await evaluate('stage4Fixture.app.openSettings()');
    await wait('stage4Fixture.app.view.screen==="settings"');
    await evaluate('stage4Fixture.app.setLanguage("en");stage4Fixture.app.back()');
    await click('[data-action="resume"]',touch);
    await click('[data-action="inspect-device"][data-device-id="'+scene.lampIds[0]+'"]',touch);
    await wait('document.querySelector(".device-command-panel").innerText.includes("Automatic repair")');
    const englishMenu=await evaluate('document.querySelector(".device-command-panel").innerText');assert(!/[А-Яа-яЁё]/.test(englishMenu),englishMenu);
    await shot(width+'-english');
  }
  assert.deepEqual(runtimeErrors, []);
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    try {
      await testBrowser.cleanup();
    } finally {
      if (server) await server.close();
    }
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['old v4 profile migration','53 nodes and first lamp exactly once','long-range 345 vs300 and actual hit at325','two real repair events heal15 up to starting ceiling','real charges and no weapon commands','pause resume resize','portrait touch and landscape mouse','new menu English and no overflow/runtime errors'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
