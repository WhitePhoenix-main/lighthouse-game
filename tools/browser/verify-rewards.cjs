/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `rewards-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
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
    await cdp('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:5186/tests/browser/rewards-frame.html'});
    await wait('!!window.rewardsFixture && !!document.querySelector("canvas")');
    assert((await evaluate('document.body.innerText')).includes('За каждую победу: +83'));
    await click('[data-action="start"]',true);
    await wait('rewardsFixture.app.view.screen === "battle"');
    assert((await evaluate('document.querySelector("[data-victory-reward]").textContent')).includes('При победе: +83'));
    await shot(width+'-battle');
    await evaluate('rewardsFixture.fail(true); rewardsFixture.finish()');
    await wait('rewardsFixture.app.view.screen === "result" && !rewardsFixture.app.view.result.saved');
    const pendingResult = await evaluate('rewardsFixture.app.view.result');
    assert.equal(pendingResult.outcome,'victory'); assert.equal(pendingResult.victoryReward,83);
    await wait('document.querySelector(".result-total")?.textContent.includes(""+rewardsFixture.app.view.result.totalResources)');
    assert((await evaluate('document.body.innerText')).includes('Результат ещё не сохранён'));
    await shot(width+'-pending');
    await evaluate('rewardsFixture.fail(false)');await click('[data-action="save"]',true);
    await wait('rewardsFixture.app.view.result.saved');
    const balance = await evaluate('rewardsFixture.app.view.profile.resources');
    await evaluate('rewardsFixture.app.retrySave()');
    assert.equal(await evaluate('rewardsFixture.app.view.profile.resources'),balance);
    await shot(width+'-victory');
    await click('[data-action="start"]',true);await click('[data-action="start"]',true);
    await evaluate('rewardsFixture.finish(true)');
    await wait('rewardsFixture.app.view.screen === "result"');
    const defeat = await evaluate('rewardsFixture.app.view.result');
    assert.equal(defeat.outcome,'defeat');assert.equal(defeat.victoryReward,0);
    await wait('document.querySelector(".result-panel")?.textContent.includes("Свет погас.")');
    assert((await evaluate('document.querySelector(".results").innerText')).includes('За победу\n+0'));
    await shot(width+'-defeat');
  }
  assert.deepEqual(runtimeErrors, []);
  await send('Browser.close');ws.close();
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await testBrowser.cleanup();
  }).then(() => {
    if (!process.exitCode) console.log(JSON.stringify({ok:true,checks:['portrait and landscape victory reward','pending save breakdown and total','retry saves once','defeat zero victory reward'],artifacts:out}));
  }).catch(error => { console.error(error); process.exitCode = 1; });
