/* Dependency-free Chromium CDP browser verification; run with Node 22+. */
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');
const assert = require('node:assert/strict');
const out = path.resolve('test-results', `late-modes-${Date.now()}-${process.pid}`); fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
let server;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const {createServer}=await import('vite');server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false}});await server.listen();
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
  const shot = async name => {const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));};
  await cdp('Page.enable'); await cdp('Runtime.enable');



  const checks=[], layouts=[];
  const check=name=>{checks.push(name);console.log(name);};
  const ready=()=>wait('!!window.lateModeFixture && !!document.querySelector("canvas") && !!document.querySelector(".preparation-panel")');
  const snapshot=()=>evaluate('JSON.stringify(lateModeFixture.saved().profile)');
  const modeButton=mode=>'[data-action="select-late-mode"][data-mode="'+mode+'"]';
  const viewport=async(width,height,mobile)=>{
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
   await cdp('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
   await sleep(250);
  };
  await viewport(1280,800,false);
  await cdp('Page.navigate',{url:'http://127.0.0.1:5198/tests/browser/late-modes-frame.html'});
  await ready();
  const initial=await snapshot();
  for(const [width,height,mobile] of [[1280,800,false],[320,740,true],[390,844,true],[844,390,true]]){
   await viewport(width,height,mobile);
   for(const id of ['armored-front','sky-siege','cross-current']){
    await click('[data-action="select-night"][data-night="'+id+'"]',mobile);
    await wait('lateModeFixture.app.view.selectedNightId==='+JSON.stringify(id));
    for(const mode of ['transition','assault']){
     await click(modeButton(mode),mobile);
     await wait('lateModeFixture.app.view.config.lateMode==='+JSON.stringify(mode));
     assert.equal(await snapshot(),initial,'switch must not mutate saved profile');
     assert.equal(await evaluate('document.activeElement.dataset.mode'),mode,'selected mode must retain keyboard focus');
     assert.equal(await evaluate('!!(document.querySelector(".late-mode-selection").compareDocumentPosition(document.querySelector(".night-selection")) & Node.DOCUMENT_POSITION_FOLLOWING)'),true,'modes must precede the long night list');
     assert.equal(await evaluate('document.querySelector('+JSON.stringify(modeButton(mode))+').getAttribute("aria-pressed")'),'true');
     const expected=mode==='transition'?190:260;
     assert((await evaluate('document.querySelector('+JSON.stringify(modeButton(mode))+').innerText')).includes(String(expected)));
     const completion=await evaluate('lateModeFixture.app.view.config.victoryReward');
     assert((await evaluate('document.querySelector(".victory-reward").innerText')).includes(String(completion)));
     assert((await evaluate('document.querySelector(".briefing .eyebrow").innerText')).includes(mode==='transition'?'Переходный':'Штурм'));
     const geometry=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(modeButton(mode))+'),r=e.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,right:r.right,overflow:document.documentElement.scrollWidth-innerWidth,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===e}})()');
     assert.equal(geometry.overflow,0,'horizontal overflow');
     assert(geometry.width>=44&&geometry.height>=44,'touch target below 44px');
     assert(geometry.x>=0&&geometry.right<=width+1,'mode button clipped');
     assert(geometry.hit,'mode button covered');
     layouts.push({width,height,id,mode,...geometry});
    }
   }
   await click('[data-action="select-night"][data-night="armored-front"]',mobile);
   await click(modeButton('transition'),mobile);
   await shot(width+'x'+height+'-modes');

   if(mobile){
    const scrollBefore=await evaluate('document.querySelector("[data-overlay]").scrollTop');
    const modeBefore=await evaluate('lateModeFixture.app.view.config.lateMode');
    const x=width-38,y=height-100,travel=Math.min(280,height-180);
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=6;step++){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-travel*step/6}]});await sleep(40);}
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
    assert((await evaluate('document.querySelector("[data-overlay]").scrollTop'))>scrollBefore+30,'native touch swipe did not scroll preparation');
    assert.equal(await evaluate('lateModeFixture.app.view.config.lateMode'),modeBefore,'scroll accidentally changed mode');
    assert.equal(await snapshot(),initial);
   }
   if(width===320){
    await evaluate('lateModeFixture.app.openSettings();lateModeFixture.app.setTextSize("large");lateModeFixture.app.setLanguage("en");lateModeFixture.app.back()');
    await sleep(250);await click(modeButton('assault'),true);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert((await evaluate('document.querySelector(".late-mode-selection").innerText')).includes('Assault'));
    assert(!/[А-Яа-яЁё]/.test(await evaluate('document.querySelector(".late-mode-selection").innerText')));
    assert.equal(await evaluate('lateModeFixture.app.view.settings.textSize'),'large');
    assert.equal(await evaluate('lateModeFixture.app.view.settings.language'),'en');
    assert.equal(await evaluate('[...document.querySelectorAll(".masthead .brand,.masthead .bank,.masthead .bank strong,.masthead .material-bank")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1})'),true,'translated large-text header is clipped');
    await shot('320-large-english-modes');
    await evaluate('lateModeFixture.app.openSettings();lateModeFixture.app.setTextSize("normal");lateModeFixture.app.setLanguage("ru");lateModeFixture.app.back()');await sleep(250);
   }
   check(width+'x'+height+': all three nights, both modes, reward text, real '+(mobile?'touch':'mouse')+' input, unchanged inventory');
  }
  // Keep the same real browser/localStorage and complete actual full nights through the application.
  await viewport(390,844,true);
  await click(modeButton('transition'),true);
  await click('[data-action="start"]',true);
  await wait('lateModeFixture.app.view.screen==="battle"');
  assert.equal(await evaluate('document.querySelectorAll("[data-action=select-late-mode]").length'),0);
  assert((await evaluate('document.querySelector("[data-night-label]").textContent')).includes('Переходный'));
  const savedStart=await evaluate('lateModeFixture.saved().activeAttempt');
  assert.equal(savedStart.lateMode,'transition');
  await shot('390-transition-battle');
  const first=await evaluate('lateModeFixture.play()');
  assert.equal(first.outcome,'victory');assert.equal(first.totalResources,190);
  await wait('!!document.querySelector(".result-panel")');
  assert((await evaluate('document.querySelector(".result-panel .eyebrow").innerText')).includes('Переходный'));
  assert((await evaluate('document.querySelector(".result-total").innerText')).includes('190'));
  assert.equal(await evaluate('[...document.querySelectorAll("[data-action=select-late-mode]")].every(b=>b.disabled)'),true);
  await shot('390-transition-result');
  const beforePreparation=await snapshot();
  await click('[data-action="start"]',true);await wait('!!document.querySelector(".preparation-panel")');
  assert.equal(await snapshot(),beforePreparation,'new preparation changed saved reward/inventory');
  const afterFirst=await snapshot();
  await cdp('Page.reload');await ready();
  assert.equal(await snapshot(),afterFirst,'reload after victory changed profile');
  await click('[data-action="select-night"][data-night="armored-front"]',true);
  assert.equal(await evaluate('document.querySelector("[data-night=armored-front]").classList.contains("completed")'),true);
  await click(modeButton('assault'),true);
  await click('[data-action="start"]',true);
  await wait('lateModeFixture.app.view.screen==="battle"');
  assert.equal(await evaluate('lateModeFixture.saved().activeAttempt.lateMode'),'assault');
  // Rotation keeps this attempt and actual beam aim, without recharging or recreating anything.
  const active=await evaluate('JSON.stringify(lateModeFixture.saved())');
  await viewport(844,390,true);
  assert.equal(await evaluate('JSON.stringify(lateModeFixture.saved())'),active);
  assert((await evaluate('document.querySelector("[data-night-label]").textContent')).includes('Штурм'));
  const second=await evaluate('lateModeFixture.play()');
  assert.equal(second.outcome,'victory');assert.equal(second.totalResources,260);
  await wait('!!document.querySelector(".result-panel")');
  assert((await evaluate('document.querySelector(".result-panel .eyebrow").innerText')).includes('Штурм'));
  await shot('844-assault-result');
  assert.equal(await evaluate('!!(document.querySelector(".result-panel [data-action=start]").compareDocumentPosition(document.querySelector(".night-selection")) & Node.DOCUMENT_POSITION_FOLLOWING)'),true,'retry must precede the long night list');
  await evaluate('lateModeFixture.app.openSettings();lateModeFixture.app.setTextSize("large");lateModeFixture.app.back()');await sleep(250);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await evaluate('[...document.querySelectorAll(".result-panel .results > div")].every(e=>e.scrollWidth<=e.clientWidth+1)'),true,'result values overflow at large text');
  assert.equal(await evaluate('lateModeFixture.app.view.settings.textSize'),'large');
  await shot('844-assault-result-large');
  await evaluate('lateModeFixture.app.openSettings();lateModeFixture.app.setTextSize("normal");lateModeFixture.app.back()');await sleep(250);
  const afterSecond=JSON.parse(await snapshot()), before=JSON.parse(initial);
  assert.equal(afterSecond.resources,before.resources+450);
  assert.equal(afterSecond.completedNights,before.completedNights+2);
  assert.equal(afterSecond.wonNightIds.filter(id=>id==='armored-front').length,1);
  assert.deepEqual(afterSecond.purchasedUpgrades,before.purchasedUpgrades);
  assert.deepEqual(afterSecond.lensUpgrades,before.lensUpgrades);
  const beforeTrap=before.devices.find(d=>d.kind==='light-trap'),afterTrap=afterSecond.devices.find(d=>d.id===beforeTrap.id);
  assert.deepEqual(afterTrap,beforeTrap,'unused damaged trap was healed/recharged');
  await evaluate('lateModeFixture.app.retrySave();lateModeFixture.app.retrySave()');
  assert.equal(await snapshot(),JSON.stringify(afterSecond));
  await cdp('Page.reload');await ready();
  assert.deepEqual(JSON.parse(await snapshot()),afterSecond);
  check('two real full-night victories: +190 then +260, reload/retry idempotency, one shared completion, old purchases and damaged trap preserved');
  // Interrupted third attempt grants nothing and preserves the pre-night inventory.
  await click('[data-action="select-night"][data-night="armored-front"]',true);
  await click(modeButton('assault'),true);
  await click('[data-action="start"]',true);
  await wait('lateModeFixture.app.view.screen==="battle"');
  await evaluate('lateModeFixture.steps(120)');
  await cdp('Page.reload');await ready();
  assert.deepEqual(JSON.parse(await snapshot()),afterSecond);
  assert.equal(await evaluate('lateModeFixture.saved().activeAttempt'),null);
  assert.equal(await evaluate('lateModeFixture.saved().lastSettled.outcome'),'interrupted');
  assert.equal(await evaluate('lateModeFixture.saved().lastSettled.reward'),0);
  check('reload during assault interrupts once without reward or free maintenance');
  // Actual production bootstrap reads the same test profile, without test fixture globals.
  await cdp('Page.navigate',{url:'http://127.0.0.1:5198/'});
  await wait('!!document.querySelector("canvas") && !!document.querySelector("[data-action=preparation]")');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("lighthouse.save.v1")).profile'),afterSecond);
  await shot('844-production-menu');
  await click('[data-action="preparation"]',true);await wait('!!document.querySelector(".preparation-panel")');
  await click('[data-action="select-night"][data-night="armored-front"]',true);await click(modeButton('assault'),true);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(modeButton('assault'))+').getAttribute("aria-pressed")'),'true');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("lighthouse.save.v1")).profile'),afterSecond);
  await shot('844-production-modes');
  check('production bootstrap reads the resulting v6 profile');
  assert.deepEqual(runtimeErrors,[]);
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,layouts,runtimeErrors,first,second},null,2));
  await send('Browser.close');ws.close();
  console.log(JSON.stringify({ok:true,checks,artifacts:out}));

})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await testBrowser.cleanup();if(server)await server.close();console.log('Artifacts: '+out);});
