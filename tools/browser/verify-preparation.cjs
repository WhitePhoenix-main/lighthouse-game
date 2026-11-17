/* Node 22+; dependency-free CDP. Uses only an isolated disposable Chrome profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const base = process.env.LIGHTHOUSE_TEST_URL || process.argv.slice(2).find(arg=>!arg.startsWith('--')) || 'http://127.0.0.1:5173';
const layoutOnly=process.argv.includes('--layout-only');
const out = path.resolve('test-results', `preparation-${Date.now()}-${process.pid}`);
fs.mkdirSync(out, { recursive: true });
const testBrowser = createTestBrowser(out);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], runtimeErrors = [];
const check = name => { checks.push(name); console.log(name); };
let ws, captureFailure;
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
  const ready=async()=>{await wait("!!window.preparationFixture && window.preparationFixture.assetsReady && !!document.querySelector('[data-prep-world]') && document.querySelector('[data-prep-world]').width>100");await sleep(250);};
  const rect = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);
    await sleep(80);
    return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled '+${JSON.stringify(selector)}+' '+JSON.stringify({devices:window.preparationFixture.app.view.profile.devices,error:window.preparationFixture.app.view.error,body:document.body.innerText.slice(-5000)}));const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  };
  const click = async (selector, touch = false) => {
    if((selector.includes('close-panel')||selector.includes('cancel-placement')||selector.includes('deselect'))&&!await evaluate('!!document.querySelector('+JSON.stringify(selector)+')'))return;
    const r = await rect(selector), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    // Assert the native pointer can reach the requested control. A transparent
    // canvas can still intercept input while the button remains visibly rendered.
    const hit = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const list=document.elementsFromPoint(${point.x},${point.y});return{selector:${JSON.stringify(selector)},expected:e?.outerHTML,point:${JSON.stringify(point)},reachable:!!e&&e.contains(list[0]),stack:list.map(el=>({tag:el.tagName,class:el.getAttribute('class'),zIndex:getComputedStyle(el).zIndex,position:getComputedStyle(el).position}))}})()`);
    if (!hit.reachable) {
      fs.writeFileSync(path.join(out, 'hit-target-failure.json'), JSON.stringify(hit,null,2));
      await screenshot('hit-target-failure');
    }
    assert(hit.reachable, 'Native pointer target is covered: ' + JSON.stringify(hit));
    if (touch) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    }
    await sleep(100);
  };
  const viewport = async (width, height, touch = false, dpr = 1, touchPoints = touch ? 1 : 0) => {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>${touchPoints}})`);
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: touch });
    await sleep(100); await ready();
  };
  const screenshot = async name => {
    // Capture the actual viewport; short layouts receive an additional scrolled shot.
    const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data.data, 'base64'));
  };
  captureFailure = () => screenshot('failure');
  const issues=[], layouts=[];
  const point=async(x,y)=>evaluate(`window.preparationFixture.worldPoint(${x},${y})`);
  const mouse=async(p,type='mouseMoved')=>cdp('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type!=='mouseMoved'?{button:'left',buttons:type==='mousePressed'?1:0,clickCount:1}:{})});
  const worldClick=async(x,y,touch=false)=>{
    let p=await point(x,y);
    if(touch){
      await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
      await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await mouse(p);
      // Hover updates the preview and can replace/repaint the canvas. Finish that
      // render before pressing; exact world-coordinate assertions remain unchanged.
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      p=await point(x,y);
      await mouse(p,'mousePressed');await mouse(p,'mouseReleased');
    }
    await sleep(180);
  };
  const action=name=>`${name==='close-panel'?'button':''}[data-prep-action="${name}"]`;
  const panel=name=>`${action('panel')}[data-panel="${name}"]`;
  const snapshot=()=>evaluate(`(()=>{const f=window.preparationFixture;return{resources:f.app.view.profile.resources,devices:f.app.view.profile.devices,writes:f.writes(),error:f.app.view.error,screen:f.app.view.screen,paused:f.app.view.paused,raw:JSON.parse(f.raw()||'null'),preview:f.app.view.preparation.preview}})()`);
  const navigate=async(query='')=>{await cdp('Page.navigate',{url:`${base}/tests/browser/preparation-frame.html${query}`});await ready();};
  const geometry=async(label)=>{
   const g=await evaluate(`(()=>{const root=document.querySelector('.preparation-screen'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,action:e.dataset.prepAction||e.dataset.action}};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,header:box(root.querySelector('.prep-header')),dock:box(root.querySelector('.prep-dock')),field:box(root.querySelector('[data-prep-field]')),controls:[...root.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(box),attempt:JSON.parse(window.preparationFixture.raw()||'null')?.activeAttempt}})()`);
   if(g.scrollWidth>g.width)issues.push(`${label}: document overflow ${g.scrollWidth}/${g.width}`);
   for(const r of g.controls)if(r.w<43.9||r.h<43.9||r.x<-.5||r.x+r.w>g.width+.5||r.y<-.5||r.y+r.h>g.height+.5)issues.push(`${label}: clipped/undersize ${JSON.stringify(r)}`);
   assert(!g.attempt,`${label}: resize/orientation created attempt`);
   assert(g.field.h>100,`${label}: field lost usable height`);
   const visual=await evaluate(`(()=>{const b=document.querySelector('.prep-legend').getBoundingClientRect(),legend={x:b.x,y:b.y,w:b.width,h:b.height};return {legend,objects:window.preparationFixture.sceneBoxes(),footer:document.querySelector('.prep-free').textContent,scout:[...document.querySelectorAll('[data-prep-action="panel"][data-panel="recon"] [data-prep-label]>span')].map(e=>({text:e.textContent,w:e.getBoundingClientRect().width,parent:e.closest('button').getBoundingClientRect().width}))}})()`);
   for(const object of visual.objects){const a=visual.legend,b=object;if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5)issues.push(`${label}: legend overlaps sprite ${object.id} ${JSON.stringify({legend:a,object:b})}`);}
   if(label.includes('en-large')){assert(!/[а-яё]/i.test(visual.footer),`${label}: Russian footer`);assert(visual.scout.every(s=>s.text==='Scout'&&s.w<=s.parent),`${label}: Scout label clipped or untranslated ${JSON.stringify(visual.scout)}`);}
   const detail=await evaluate(`(()=>{const root=document.querySelector('.preparation-screen'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,name:e.className}};return{headerItems:[...root.querySelector('.prep-header').children].map(box),currencyItems:[...root.querySelectorAll('.prep-currency')].map(e=>[...e.children].map(box)),legendRows:[...root.querySelectorAll('.prep-legend-row')].map(e=>getComputedStyle(e).display),compactTitle:getComputedStyle(root.querySelector('.prep-night-compact')).display,titleText:root.querySelector('.prep-night-compact').textContent,footer:[...root.querySelectorAll('.prep-free>span')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent),legend:box(root.querySelector('.prep-legend')),zoom:box(root.querySelector('[data-prep-action="zoom"]'))}})()`);
   const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
   for(let i=0;i<detail.headerItems.length;i++)for(let j=i+1;j<detail.headerItems.length;j++)if(intersects(detail.headerItems[i],detail.headerItems[j]))issues.push(`${label}: header items overlap ${JSON.stringify([detail.headerItems[i],detail.headerItems[j]])}`);
   for(const row of detail.currencyItems)for(let i=0;i<row.length;i++)for(let j=i+1;j<row.length;j++)if(intersects(row[i],row[j]))issues.push(`${label}: currency content overlaps ${JSON.stringify([row[i],row[j]])}`);
   const compact=g.height>=g.width&&g.height<=650;
   assert(detail.legendRows.every(value=>compact?value==='none':value!=='none'),`${label}: wrong legend row visibility`);
   assert.equal(detail.compactTitle!=='none',compact,`${label}: wrong compact title visibility`);
   if(label.includes('en-large'))assert(detail.footer.every(text=>!/[а-яё]/i.test(text)),`${label}: untranslated visible footer`);
   const towerPixelHeight=visual.objects.find(object=>object.id==='lighthouse').h;
   if(compact){assert(towerPixelHeight>=45,`${label}: compact lighthouse remains too small ${towerPixelHeight} CSS px`);assert(Math.abs(detail.zoom.h-44)<.5,`${label}: compact Zoom is not 44 CSS px`);}
   layouts.push({label,...g,...detail,towerPixelHeight});
   return g;
  };
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1672,height:941,deviceScaleFactor:1,mobile:false});
  await navigate();
  for(const [label,w,h,touch,dpr] of [['desktop',1672,941,false,1],['desktop-1280',1280,720,false,1],['portrait',390,844,true,2],['portrait-360',360,740,true,1],['compact',320,568,true,1],['landscape',844,390,true,1]]){await viewport(w,h,touch,dpr);await geometry(label);await screenshot(label);check(`${label}: layout, no attempt on resize`);}
  await viewport(390,844,true,2);await navigate('?en&large');await geometry('en-large');await screenshot('en-large');check('English large text layout');
  for(const [label,w,h,touch,query] of [['ru-large-compact',320,568,true,'?large'],['en-large-compact',320,568,true,'?en&large'],['en-large-landscape',844,390,true,'?en&large'],['en-large-desktop',1672,941,false,'?en&large']]){await viewport(w,h,touch);await navigate(query);await geometry(label);await screenshot(label);check(label+': text, control sizes, visibility and no overflow');}
  console.log('LAYOUT ISSUES',JSON.stringify(issues));
  if(layoutOnly){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,mode:'layout-only',checks,layouts,issues,runtimeErrors,realPhoneTested:false},null,2));console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));assert.equal(issues.length,0,issues.join('\n'));assert.equal(runtimeErrors.length,0,'Runtime errors or HTTP failures');await send('Browser.close');ws.close();return;}
  await viewport(1280,720,false);await navigate();
  const balance=(await snapshot()).resources;
  for(const name of ['night','lens','recon','ability','shards','pearls']){await click(panel(name));assert(await evaluate(`!!document.querySelector('.prep-drawer')`));await screenshot(`drawer-${name}`);await click(action('close-panel'));assert.equal((await snapshot()).resources,balance);}
  check('Night, lens, recon, ability and currency drawers; plus does not grant currency');
  await click(panel('night'));await click('[data-action="select-night"][data-night="broken-shore"]');assert.equal(await evaluate('window.preparationFixture.app.view.selectedNightId'),'broken-shore');await click('[data-action="select-night"][data-night="first-light"]');await click(action('close-panel'));check('Night selection uses live application configuration');
  await click(panel('devices'));assert.equal(await evaluate(`document.querySelectorAll('.prep-catalogue article').length`),8);await screenshot('device-panel');
  const drawerBefore=await snapshot(),dr=await rect('.prep-drawer');await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:dr.x+dr.width/2,y:dr.y+dr.height/2,deltaY:400,deltaX:0});await sleep(200);assert(await evaluate(`document.querySelector('.prep-drawer').scrollTop>0`));assert.deepEqual((await snapshot()).devices,drawerBefore.devices);check('Drawer scrolling does not place or mutate inventory');
  await click(`${action('move-device')}[data-device-id="2"]`);await click(action('close-panel'));
  const beforeMove=await snapshot();await worldClick(-200,150);const afterMove=await snapshot();
  const moved=afterMove.devices.find(d=>d.id===2);assert(Math.abs(moved.position.x+200)<.01,JSON.stringify({position:moved.position,preview:afterMove.preview,expected:await point(-200,150)}));assert.equal(moved.health,42);assert.deepEqual(afterMove.devices.find(d=>d.id===4),beforeMove.devices.find(d=>d.id===4));assert.equal(afterMove.resources,beforeMove.resources);check('Exact owned id 2 moved with damage and spare instance preserved');
  await click(action('cancel-placement'));
  await worldClick(-200,150);assert(await evaluate(`!!document.querySelector('.prep-inspector')`));
  const overview=await point(0,0);await click(action('zoom'));const close=await point(0,0);assert(close.camera.zoom>overview.camera.zoom);await screenshot('selected-close');await click(action('zoom'));await click(action('deselect'));check('Context selection and explicit close camera');
  await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="4"]`);await click(action('close-panel'));
  const beforeInvalid=await snapshot();const sea=await point(150,0);await mouse(sea);await sleep(100);assert.equal((await snapshot()).preview.valid,false);await worldClick(150,0);assert.deepEqual((await snapshot()).devices,beforeInvalid.devices);check('Sea preview and click reject invalid placement');
  const start=await point(-120,-100),end=await point(-190,-130);await mouse(start);await mouse(start,'mousePressed');await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:end.x,y:end.y,button:'left',buttons:1});await mouse(end,'mouseReleased');await sleep(100);assert.deepEqual((await snapshot()).devices,beforeInvalid.devices);check('Map drag does not place');
  await worldClick(-140,-140);assert(Math.abs((await snapshot()).devices.find(d=>d.id===4).position.x+140)<.01);await click(action('cancel-placement'));check('Real mouse placement uses world coordinates');
  await click(panel('devices'));await click(`${action('repair-device')}[data-device-id="2"]`);const repaired=await snapshot();assert.equal(repaired.devices.find(d=>d.id===2).health,70);assert(repaired.resources<afterMove.resources);
  await click(`${action('purchase-device')}[data-kind="cannon"]`);assert.equal((await snapshot()).devices.length,5);await click(action('close-panel'));check('Repair and purchase persist real inventory and currency');
  await click(action('start'));await wait(`window.preparationFixture.app.view.screen==='battle' && !!document.querySelector('.chapter-world-underlay')`);await sleep(500);await screenshot('battle');
  const attempt=(await snapshot()).raw.activeAttempt.id;await click('[data-action="pause"]');assert((await snapshot()).paused);await click('[data-action="resume"]');assert.equal((await snapshot()).paused,false);
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});await sleep(250);assert.equal((await snapshot()).raw.activeAttempt.id,attempt);
  await click('[data-action="pause"]',true);assert((await snapshot()).paused);await click('[data-action="resume"]',true);assert.equal((await snapshot()).paused,false);assert.equal((await snapshot()).raw.activeAttempt.id,attempt);await screenshot('battle-landscape-resumed');check('Native landscape touch pause/resume reaches buttons and preserves attempt');
  await click('[data-action="pause"]',true);await click('[data-action="confirm-abandon"]',true);await click('[data-action="abandon-preparation"]',true);await ready();assert.equal((await snapshot()).raw.activeAttempt,null);assert.equal((await snapshot()).resources,repaired.resources-20);check('Real battle, pause/resume, DPR orientation keeps attempt, interruption returns preparation');
  await click(action('start'));await wait(`window.preparationFixture.app.view.screen==='battle'`);assert.notEqual((await snapshot()).raw.activeAttempt.id,attempt);await screenshot('battle-landscape');check('Second attempt reuses shared world renderer');
  await navigate('?invalid');await viewport(390,844,true);assert.equal(await evaluate(`document.querySelector('[data-prep-action="start"]').disabled`),true);assert.equal((await snapshot()).devices.find(d=>d.id===1).position.x,100);await screenshot('invalid-preserved');
  await click(panel('devices'),true);await click(`${action('move-device')}[data-device-id="1"]`,true);await click(action('close-panel'),true);await worldClick(-140,-140,true);assert(Math.abs((await snapshot()).devices.find(d=>d.id===1).position.x+140)<.01);await click(action('cancel-placement'),true);assert.equal(await evaluate(`document.querySelector('[data-prep-action="start"]').disabled`),false);check('Invalid legacy coordinate retained, blocked, then repaired by touch move');
  await navigate('?stock');await click(panel('devices'),true);await click(`${action('recharge-device')}[data-device-id="5"]`,true);assert.equal((await snapshot()).devices.find(d=>d.id===5).trapCharges,1);check('Trap recharge persists charges');
  await click(action('close-panel'),true);await navigate('?new');assert.equal((await snapshot()).devices.length,0);assert.equal(await evaluate(`document.querySelector('[data-prep-action="start"]').disabled`),false);await screenshot('empty');check('New profile can start without devices');
  await viewport(1280,720,false);await navigate();await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="1"]`);await click(action('close-panel'));
  const beforeFailure=await snapshot();await evaluate('window.preparationFixture.fail(true)');await worldClick(-100,-100);assert((await snapshot()).error);assert.equal((await snapshot()).raw.profile.devices.find(d=>d.id===1).position,null);await screenshot('save-failure');await evaluate('window.preparationFixture.fail(false)');await click('[data-action="save"]');const recovered=await snapshot();assert(!recovered.error);assert(Math.abs(recovered.devices.find(d=>d.id===1).position.x+100)<.01);assert.equal(recovered.resources,beforeFailure.resources);assert.equal(recovered.devices.length,beforeFailure.devices.length);check('Placement save failure and retry preserve profile and exact instance');
  await navigate();await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="1"]`);await click(action('close-panel'));await evaluate(`document.querySelector('[data-prep-world]').focus()`);
  for(const key of ['ArrowLeft','Enter']){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:37});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:37});await sleep(100);}assert((await snapshot()).devices.find(d=>d.id===1).position);check('Keyboard arrow and Enter placement');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks,issues,runtimeErrors,realPhoneTested:false},null,2));
  console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));
  assert.equal(issues.length,0,issues.join('\n'));assert.equal(runtimeErrors.length,0,'Runtime errors or HTTP failures');
  await send('Browser.close');ws.close();
})().catch(async error=>{console.error(error);fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));try{await captureFailure?.();}catch(captureError){console.error('Failure screenshot unavailable:',captureError.message);}process.exitCode=1;}).finally(async()=>{ws?.close();await testBrowser.cleanup();});
