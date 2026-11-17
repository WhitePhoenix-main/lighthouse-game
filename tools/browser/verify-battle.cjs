/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv.slice(2).find(arg=>!arg.startsWith('--')) || 'http://127.0.0.1:5173';

const out = path.resolve('test-results', `battle-${Date.now()}-${process.pid}`);
fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out, { gpu: process.argv.includes('--gpu') });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], runtimeErrors = [];
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
    if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400)runtimeErrors.push({url:msg.params.response.url,status:msg.params.response.status});
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
    const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data.data, 'base64'));
  };
  const ready = async () => { await wait("window.battleFixture?.assetsReady && document.querySelector('.is-battle') && document.querySelector('.chapter-world-underlay')?.dataset.artworkReady === 'true'"); await sleep(150); };
  const viewport = async (width, height, touch = false) => {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: touch ? 2 : 1, mobile: touch });
    await sleep(200);
  };
  const navigate = async (query = '') => { await cdp('Page.navigate', { url: `${base}/tests/browser/battle-frame.html${query}` }); await ready(); };
  const snapshot = () => evaluate(`(()=>{const f=window.battleFixture,b=f.app.view.battle;return{screen:f.app.view.screen,paused:f.app.view.paused,tick:b?.tick,angle:b?.desiredBeamAngle,attempt:f.raw().activeAttempt?.id,waves:b?.waves.filter(w=>w.started).length,cooldown:b?.flash.cooldownRemaining,selected:b?.devices.map(d=>({id:d.id,targetId:d.targetId})),error:f.app.view.error}})()`);
  const click = async (selector, touch = false) => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    if (touch) { await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]}); await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
    else { await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point}); await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1}); await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1}); }
    await sleep(120);
  };
  const layouts = [], issues = [];
  const geometry = async label => {
    const metrics = await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}},canvas=document.querySelector('.chapter-world-underlay');return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,field:box(document.querySelector('.play-area')),header:box(document.querySelector('.statusbar')),dock:box(document.querySelector('.battle-controls')),controls:[...document.querySelectorAll('.statusbar button,.battle-controls button,.battle-device-access summary,.battle-brief summary')].filter(e=>e.getClientRects().length).map(e=>({...box(e),action:e.dataset.action||e.className})),bars:JSON.parse(canvas.dataset.indicators),bodies:JSON.parse(canvas.dataset.enemyBodies),camera:JSON.parse(canvas.dataset.worldCamera),pixel:[...document.querySelectorAll('.battle-pixel')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText,ready:e.dataset.painted,w:e.clientWidth,h:e.clientHeight}))}})()`);
    layouts.push({ label, ...metrics });
    if(metrics.scrollWidth>metrics.width||metrics.scrollHeight>metrics.height+1)issues.push(`${label}: document overflow`);
    for(const r of metrics.controls)if(r.w<43.9||r.h<43.9||r.x<-.5||r.x+r.w>metrics.width+.5||r.y<-.5||r.y+r.h>metrics.height+.5)issues.push(`${label}: clipped/undersized action ${JSON.stringify(r)}`);
    assert(metrics.field.h>150,`${label}: field height ${metrics.field.h}`);
    if(label==='mobile')assert(metrics.field.h>=590,`390x844 field too short ${metrics.field.h}`);
    for(const bar of metrics.bars){assert(bar.width>=44,`${label}: health width ${bar.width}`);assert(bar.x>=2&&bar.x+bar.width<=metrics.field.w-2,`${label}: clipped bar`);}
    assert(metrics.pixel.every(label=>label.ready==='true'),`${label}: missing pixel glyph or partial text`);
    assert(await evaluate('Number(getComputedStyle(document.querySelector(".ocean > canvas:not(.chapter-world-underlay)")).zIndex)>Number(getComputedStyle(document.querySelector(".chapter-world-underlay")).zIndex)'),`${label}: combat canvas behind terrain`);
    await screenshot(label);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await viewport(1280,800);
  await cdp('Page.navigate',{url:base});
  await wait('!!document.querySelector("[data-action=game-menu]")');
  await click('[data-action="game-menu"]');
  await wait('!!document.querySelector("[data-action=new-game]")');
  await wait('document.querySelector(".reference-game-menu").dataset.ready === "true" && !document.querySelector(".reference-game-menu").inert && !document.querySelector("[data-game-menu-ghost]")');
  await click('[data-action="new-game"]');
  await wait('!!document.querySelector("[data-prep-action=start]")');
  await click('[data-prep-action="start"]');
  await wait('document.querySelector(".chapter-world-underlay").dataset.worldReady === "true"');
  await screenshot('normal-start');
  if(process.argv.includes('--gpu'))assert(await evaluate('!document.querySelector(".ocean > canvas:not(.chapter-world-underlay)").getContext("2d")'),'WebGL renderer must actually be active in GPU verification');
  console.log('Normal entry canvas:',await evaluate('JSON.stringify([...document.querySelectorAll(".ocean canvas")].map(c=>({class:c.className,w:c.width,h:c.height,css:getComputedStyle(c).display,rect:{w:c.clientWidth,h:c.clientHeight},is2d:!!c.getContext("2d")})))'));
  check('Main menu to preparation to battle renders the world');
  await cdp('Page.reload');
  await wait('!!document.querySelector("[data-action=game-menu]")');
  await click('[data-action="game-menu"]');
  await wait('document.querySelector(".reference-game-menu")?.dataset.ready === "true" && !document.querySelector(".reference-game-menu").inert && !document.querySelector("[data-game-menu-ghost]")');
  await click('[data-action="continue-game"]');
  await wait('!!document.querySelector("[data-prep-action=start]")');
  await click('[data-prep-action="start"]');
  await wait('document.querySelector(".chapter-world-underlay").dataset.worldReady === "true"');
  await screenshot('cached-restart');
  check('Cached reload and continue also boot the battle renderer');
  if (process.argv.includes('--production-only')) {
    // Production has no fixtures. Exercise the actual entry and cached save flow,
    // then verify that both renderers survive phone rotation in the built app.
    for (const [width,height,label] of [[390,844,'portrait'],[844,390,'landscape']]) {
      await viewport(width,height,true);
      await wait('document.querySelector(".chapter-world-underlay")?.dataset.worldReady === "true"');
      assert(await evaluate('[...document.querySelectorAll(".ocean canvas")].length === 2 && [...document.querySelectorAll(".ocean canvas")].every(c=>c.width>0 && c.height>0 && c.clientWidth>0 && c.clientHeight>0)'), `${label}: visible nonzero canvases`);
      await screenshot(`production-${label}`);
      check(`Production ${label}: both world canvases remain visible`);
      await click('[data-action="pause"]',true);
      await wait('!!document.querySelector("[data-action=resume]")');
      assert(await evaluate('(() => { const b=document.querySelector("[data-action=resume]"),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })()'), 'Pause panel must receive pointer input above the battle canvas');
      await click('[data-action="resume"]',true);
      await wait('document.querySelector("[data-overlay]").hidden');
      check(`Production ${label}: pause and native touch resume`);
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,mode:'production-only',checks,issues,layouts,runtimeErrors,realPhoneTested:false},null,2));
    console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));
    assert.equal(runtimeErrors.length,0,'Production runtime or HTTP errors');
    await send('Browser.close'); ws.close(); return;
  }
  await viewport(390,844,true);
  await cdp('Page.navigate',{url:`${base}/tests/browser/preparation-frame.html`});
  await wait('window.preparationFixture?.assetsReady && !!document.querySelector("[data-prep-world]")');
  await click('[data-prep-action="start"]',true);
  await wait('window.preparationFixture.app.view.screen === "battle" && document.querySelector(".chapter-world-underlay").dataset.worldReady === "true"');
  await screenshot('entered-battle');
  check('Preparation starts a visible battle after the scene was initially hidden');
  await viewport(1672,941); await navigate(); await geometry('desktop');
  const original = await snapshot(); assert.equal(original.screen,'battle'); assert(original.attempt);
  await viewport(390,844,true); await ready(); await geometry('mobile');
  assert.equal((await snapshot()).attempt,original.attempt); check('390x844: same attempt, full field and readable bars');
  const before = await snapshot(); await click('[data-action="wave"]',true); await evaluate('window.battleFixture.step(.05)');
  assert.equal((await snapshot()).waves,before.waves+1); assert.equal((await snapshot()).angle,before.angle); check('Touch early-wave command leaves beam direction unchanged');
  await click('[data-action="flash"]',true); await evaluate('window.battleFixture.step(.05)'); assert((await snapshot()).cooldown>0); assert.equal((await snapshot()).angle,before.angle); check('Touch ability fires and preserves aim');
  const aimPoint = await evaluate('window.battleFixture.point(280,80)');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...aimPoint}); await evaluate('window.battleFixture.step(.05)');
  const aimed = await snapshot(); assert.notEqual(aimed.angle,before.angle); check('Native mouse points the beam through the visible field');
  // Native device entry allows keyboard access without aiming through the UI.
  await click('.battle-device-access summary',true);
  await click('[data-action="inspect-device"][data-device-id="1"]',true);
  const selectedAngle=(await snapshot()).angle;
  assert(await evaluate('!!document.querySelector(".device-command-panel")'));
  await click('[data-action="cannon-priority"][data-priority="strongest"]',true);
  await evaluate('window.battleFixture.step(.1)'); assert((await snapshot()).tick>before.tick); assert.equal((await snapshot()).angle,selectedAngle);
  await click('.device-description summary',true);
  await evaluate('window.battleFixture.app.command({type:"cannon-priority",deviceId:1,priority:"weakest"});window.battleFixture.step(.05)'); await sleep(150);
  assert(await evaluate('document.querySelector(".device-description").open'),'Expanded details survive live refresh');
  await click('.device-description summary',true); check('Expanded device details survive a live command refresh');
  await screenshot('device-menu'); await click('[data-action="close-device"]',true); check('Device menu remains live and does not turn beam');
  const cannonPoint=await evaluate('window.battleFixture.deviceCenter(1)');
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cannonPoint]}); await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await sleep(150);
  assert(await evaluate('!!document.querySelector(".device-command-panel")'),'Tap visible cannon body');
  await click('[data-action="choose-target"]',true);
  const enemyId=await evaluate('window.battleFixture.app.view.battle.enemies.find(e=>e.kind==="minotaur").id');
  const enemyPoint=await evaluate(`window.battleFixture.enemyCenter(${enemyId})`);
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[enemyPoint]}); await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await evaluate('window.battleFixture.step(.05)'); await sleep(150);
  assert.equal((await snapshot()).selected.find(d=>d.id===1).targetId,enemyId,'Tap visible center of minotaur');
  await click('[data-action="close-device"]',true); check('Touch selects cannon and enemy by visible sprite bounds');
  await evaluate("window.dispatchEvent(new Event('blur'))"); await sleep(100); assert((await snapshot()).paused); await evaluate('window.battleFixture.app.resume()'); await wait('document.querySelector("[data-overlay]").hidden'); check('Activity loss pauses combat');
  await click('[data-action="pause"]',true); const paused=await snapshot(); assert(paused.paused);
  await evaluate('window.battleFixture.step(5)'); assert.equal((await snapshot()).tick,paused.tick); await screenshot('paused');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(150); assert(!(await snapshot()).paused); check('Pause/resume never accumulates battle time');
  await viewport(844,390,true); await ready(); await geometry('mobile-landscape'); assert.equal((await snapshot()).attempt,original.attempt);
  await viewport(390,844,true); await ready(); assert.equal((await snapshot()).attempt,original.attempt); check('Orientation changes retain attempt');
  for(const [w,h,label,query] of [[390,844,'mobile-en-large','?en&large'],[320,568,'small-phone',''],[844,390,'landscape-en-large','?en&large']]){await viewport(w,h,true);await navigate(query);await geometry(label);}
  for(const night of ['rescue-trial','abyss-warden']){await viewport(390,844,true);await navigate(`?night=${night}`);await geometry(night);}
  await viewport(390,844,true); await navigate('?armor'); await geometry('mobile-armor');
  assert(await evaluate('window.battleFixture.app.view.battle.enemies.some(e=>e.kind==="turtle"&&e.armor>0)'),'Live armor fixture');
  const armored=await evaluate('JSON.parse(document.querySelector(".chapter-world-underlay").dataset.indicators).filter(i=>i.height>15)'); assert(armored.length>0); check('Armor retains separate enlarged strip above health');
  await evaluate('window.battleFixture.step(240)'); await sleep(100); assert.equal((await snapshot()).screen,'result');
  assert(await evaluate('document.querySelector(".battle-rail").hidden')); check('Battle-only menus disappear on result');
  check('RU/EN, large type, small portrait, landscape, ship and boss layouts');
  if (process.argv.includes('--beam')) {
    for (const [width,height,label,touch] of [[1280,800,'desktop',false],[390,844,'portrait',true],[844,390,'landscape',true]]) {
      await viewport(width,height,touch);
      for (const [direction,angle] of [['north',-Math.PI/2],['east',0],['south',Math.PI/2],['west',Math.PI]]) {
        await navigate();
        await evaluate(`window.battleFixture.app.command({type:'aim',angle:${angle}});window.battleFixture.step(2.1)`);
        await sleep(150);
        await screenshot(`beam-${label}-${direction}`);
      }
      check(`${label}: four soft-beam directions captured for visual review`);
    }
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks,issues,layouts,runtimeErrors,realPhoneTested:false},null,2));
  console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));
  assert.equal(issues.length,0,issues.join('\n')); assert.equal(runtimeErrors.length,0,'Runtime or HTTP errors');
  await send('Browser.close'); ws.close();
})().catch(error=>{console.error(error);console.error('Runtime errors:',JSON.stringify(runtimeErrors));fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));fs.writeFileSync(path.join(out,'runtime-errors.json'),JSON.stringify(runtimeErrors,null,2));process.exitCode=1;}).finally(async()=>{ws?.close();await testBrowser.cleanup();});
