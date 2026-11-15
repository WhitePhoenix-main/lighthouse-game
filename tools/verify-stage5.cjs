/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `stage5-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5192,strictPort:true,hmr:false}});await server.listen();
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
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
    await cdp('Page.navigate',{url:'http://127.0.0.1:5192/tests/browser/stage5-frame.html'});
    await wait('!!window.stage5Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage5Fixture.app.view.error'),null);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),71);
    await click('[data-action="select-upgrade"][data-upgrade="barrier-health-1"]',touch);
    await shot(width+'-development');
    const before=await evaluate('(()=>{stage5Fixture.app.openPreparation();return stage5Fixture.app.view.preparation.inventory.find(d=>d.kind==="barrier")})()');
    await evaluate('stage5Fixture.app.openDevelopment()');
    await click('[data-action="select-upgrade"][data-upgrade="barrier-health-1"]',touch);
    await click('[data-action="upgrade"][data-upgrade="barrier-health-1"]',touch);
    const after=await evaluate('(()=>{stage5Fixture.app.openPreparation();return stage5Fixture.app.view.preparation.inventory.find(d=>d.kind==="barrier")})()');
    assert.equal(after.health/after.maxHealth,before.health/before.maxHealth);assert.equal(after.repairCost,before.repairCost);
    await evaluate('stage5Fixture.app.openDevelopment();stage5Fixture.completeBranches();stage5Fixture.app.openPreparation();stage5Fixture.app.selectDevice("cannon");stage5Fixture.app.placeDevice(-80,0);stage5Fixture.app.selectDevice("barrier");stage5Fixture.app.placeDevice(-110,75);stage5Fixture.app.selectDevice("generator");stage5Fixture.app.placeDevice(-50,-80)');
    assert.equal(await evaluate('stage5Fixture.app.view.preparation.placements.length'),3);
    await shot(width+'-preparation');
    await click('[data-action="start"]',touch);
    const ids=await evaluate('stage5Fixture.scene()');
    const aim=await evaluate('stage5Fixture.app.view.battle.desiredBeamAngle');
    await click('[data-action="inspect-device"][data-device-id="'+ids.cannon+'"]',touch);
    await click('[data-action="choose-target"]',touch);
    await click('[data-action="target-enemy"][data-enemy-id="800"]',touch);
    assert.equal(await evaluate('stage5Fixture.app.view.battle.desiredBeamAngle'),aim);
    await evaluate('stage5Fixture.steps(1)');
    assert.equal(await evaluate('stage5Fixture.app.view.battle.enemies[0].health'),970);
    await evaluate('stage5Fixture.readyShot();stage5Fixture.steps(1)');
    assert.equal(await evaluate('stage5Fixture.app.view.battle.enemies[0].health'),946);
    await wait('document.querySelector(".device-command-panel").innerText.includes("Бонус использован по целям: 1")');
    await shot(width+'-manual-bonus');
    await click('[data-action="close-device"]',touch);
    await evaluate('stage5Fixture.generatorScene();stage5Fixture.steps(1)');
    assert.equal(await evaluate('stage5Fixture.app.view.battle.devices.find(d=>d.kind==="generator").health'),1);
    await evaluate('stage5Fixture.readyAttack();stage5Fixture.steps(1)');
    assert.equal(await evaluate('stage5Fixture.app.view.battle.devices.find(d=>d.kind==="generator").health'),0);
    assert.equal(await evaluate('stage5Fixture.app.view.battle.events.some(e=>e.type==="generator-residual")'),true);
    await click('[data-action="inspect-device"][data-device-id="'+ids.generator+'"]',touch);
    await wait('document.querySelector(".device-command-panel").innerText.includes("Предохранитель использован.")');
    assert((await evaluate('document.querySelector("[data-shield-status]").innerText')).includes('Без живых генераторов'));
    await shot(width+'-residual-field');
    const tick=await evaluate('stage5Fixture.app.view.battle.tick');
    await click('[data-action="pause"]',touch);await evaluate('stage5Fixture.steps(100)');assert.equal(await evaluate('stage5Fixture.app.view.battle.tick'),tick);
    await click('[data-action="resume"]',touch);
    const attempt=await evaluate('stage5Fixture.app.view.battle.seed');
    await cdp('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:1,mobile:true});await sleep(300);
    assert.equal(await evaluate('stage5Fixture.app.view.battle.tick'),tick);assert.equal(await evaluate('stage5Fixture.app.view.battle.seed'),attempt);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await click('[data-action="pause"]',touch);
    await evaluate('stage5Fixture.app.openSettings()');await wait('stage5Fixture.app.view.screen==="settings"');
    await evaluate('stage5Fixture.app.setLanguage("en");stage5Fixture.app.back()');
    await click('[data-action="resume"]',touch);
    const english=await evaluate('document.querySelector(".device-command-panel").innerText');assert(!/[А-Яа-яЁё]/.test(english),english);
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
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['71 main nodes','HP upgrade ratio and invoice','actual cannon manual bonus 30 vs 24','actual fuse and residual after lethal hits','pause resume resize menu aim','portrait touch and landscape mouse','English abilities and no overflow/runtime errors'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
