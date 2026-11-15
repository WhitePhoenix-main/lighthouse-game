/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `stage7-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true,hmr:false}});await server.listen();
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


  const newNodes=[['expanded-power-1',70,1],['expanded-power-2',95,2],['slowing-range',70,1],['slowing-power-2',95,2],['armor-breaker-width',70,1],['armor-breaker-power-2',100,2]];
  const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
  for (const [width,height] of [[390,844],[844,390]]) {
    const touch=width===390;
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
    await cdp('Page.navigate',{url:'http://127.0.0.1:5194/tests/browser/stage7-frame.html?run='+width});
    await sleep(500);
    await wait('!!window.stage7Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage7Fixture.app.view.error'),null);
    assert.equal(await evaluate('stage7Fixture.app.view.profile.lensUpgrades.length'),27);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=select-upgrade]").length'),82);
    assert.equal(await evaluate('document.querySelectorAll("[data-action=purchase-lens-upgrade]").length'),33);
    assert((await evaluate('document.querySelector(".development-panel").innerText')).includes('82 улучшений маяка · 33 улучшений линз · 7 открытия линз'));
    await evaluate('stage7Fixture.app.openPreparation();stage7Fixture.app.selectLens("basic")');
    const basic=await evaluate('JSON.stringify(stage7Fixture.app.view.config.beam)');
    await evaluate('stage7Fixture.app.openDevelopment()');
    await wait('!!document.querySelector(".development-panel")');
    let resources=10000,pearls=100;
    for(const [id,cost,material] of newNodes){
      const selector='[data-action="purchase-lens-upgrade"][data-lens-upgrade="'+id+'"]';
      assert((await evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`)).includes(`${cost} ◈ + ${material}`));
      await click(selector,touch);resources-=cost;pearls-=material;
      assert.equal(await evaluate('stage7Fixture.app.view.error'),null);
      assert.equal(await evaluate('stage7Fixture.app.view.profile.resources'),resources);
      assert.equal(await evaluate('stage7Fixture.app.view.profile.bossMaterials'),pearls);
    }
    assert.equal(await evaluate('stage7Fixture.saved().profile.lensUpgrades.length'),33);
    await shot(width+'-development');
    await cdp('Page.reload');await sleep(500);await wait('!!window.stage7Fixture && !!document.querySelector("canvas")');
    assert.equal(await evaluate('stage7Fixture.app.view.profile.resources'),resources);
    assert.equal(await evaluate('stage7Fixture.app.view.profile.bossMaterials'),pearls);
    assert.equal(await evaluate('stage7Fixture.app.view.profile.lensUpgrades.length'),33);
    await evaluate('stage7Fixture.app.openPreparation();stage7Fixture.app.selectLens("basic")');
    assert.equal(await evaluate('JSON.stringify(stage7Fixture.app.view.config.beam)'),basic);
    for(const lens of ['expanded','slowing','armor-breaker']){
      await click('[data-action="select-lens"][data-lens="'+lens+'"]',touch);
      const stats=await evaluate('({...stage7Fixture.app.view.config.beam,...stage7Fixture.app.view.config.lens})');
      const shown=await evaluate('document.querySelector(".beam-stats").innerText');
      assert(shown.includes(String(Number(stats.damagePerSecond.toFixed(2)))),shown);
      assert(shown.includes(String(Number(stats.range.toFixed(2)))),shown);
      assert(shown.includes(String(Number((stats.halfAngle*360/Math.PI).toFixed(2)))),shown);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      if(lens==='expanded')await evaluate('stage7Fixture.app.selectDevice("cannon");stage7Fixture.app.placeDevice(-80,0)');
      await shot(width+'-'+lens+'-preparation');
      await click('[data-action="start"]',touch);
      assert.equal(await evaluate('stage7Fixture.app.view.error'),null);
      const fixture=await evaluate(`stage7Fixture.scene(${JSON.stringify(lens)})`);
      await evaluate('stage7Fixture.steps(1)');
      assert.deepEqual(await evaluate('stage7Fixture.app.view.battle.litEnemyIds'),[800]);
      const enemy=await evaluate('stage7Fixture.app.view.battle.enemies[0]');
      if(lens==='armor-breaker'){
        assert(fixture.angle>fixture.oldHalfAngle);close(enemy.armor,10000-fixture.dps*fixture.dt*fixture.armor);close(enemy.health,10000);
      } else {
        close(enemy.health,10000-fixture.dps*fixture.dt);
        if(lens==='slowing'){assert(fixture.radius>fixture.oldRange+1);close(Math.hypot(enemy.x,enemy.y),fixture.radius-10*fixture.dt*fixture.slow);}
      }
      const aim=await evaluate('stage7Fixture.app.view.battle.desiredBeamAngle');
      await click('[data-action="inspect-device"][data-device-id="1"]',touch);
      await click('[data-action="choose-target"]',touch);await click('[data-action="target-enemy"][data-enemy-id="800"]',touch);
      assert.equal(await evaluate('stage7Fixture.app.view.battle.desiredBeamAngle'),aim);
      await shot(width+'-'+lens+'-battle');
      const tick=await evaluate('stage7Fixture.app.view.battle.tick');await click('[data-action="pause"]',touch);await evaluate('stage7Fixture.steps(20)');assert.equal(await evaluate('stage7Fixture.app.view.battle.tick'),tick);await click('[data-action="resume"]',touch);
      const seed=await evaluate('stage7Fixture.app.view.battle.seed');await cdp('Emulation.setDeviceMetricsOverride',{width:height,height:width,deviceScaleFactor:1,mobile:true});await sleep(200);assert.equal(await evaluate('stage7Fixture.app.view.battle.seed'),seed);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await evaluate('stage7Fixture.finish();stage7Fixture.app.openPreparation()');
    }
    await evaluate('stage7Fixture.app.openSettings();stage7Fixture.app.setLanguage("en");stage7Fixture.app.back();stage7Fixture.app.openDevelopment()');
    await wait('!!document.querySelector(".lens-development") && document.querySelector(".lens-development").innerText.includes("Lens")');
    const english=await evaluate('document.querySelector(".lens-development").innerText');assert(!/[А-Яа-яЁё]/.test(english),english);await shot(width+'-english');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
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
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:["v6 previous 116-node profile","82 main + 33 lens + 7 paid unlocks = 122","six UI purchases deduct 500 resources and nine pearls","reload preserves all old and new upgrades","selected beam stats and unchanged basic lens","real expanded damage, slowing beyond old range, armor damage outside old sector","pause resume resize menu aim","portrait touch and landscape mouse","English and no overflow/errors"],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
