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
  const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
  const fitsInside = (inner, outer) => inner.x >= outer.x - .5 && inner.y >= outer.y - .5 &&
    inner.x + inner.w <= outer.x + outer.w + .5 && inner.y + inner.h <= outer.y + outer.h + .5;
  const checkDeviceCounts = async label => {
    const result = await evaluate(`(() => {
      const {settings, preparation, config} = window.preparationFixture.app.view;
      const devices = document.querySelector('.prep-devices');
      const counts = document.querySelector('#prep-counts');
      const title = devices.querySelector('.prep-device-title');
      const box = ({x, y, width: w, height: h}) => ({x, y, w, h});
      const measure = element => box(element.getBoundingClientRect());
      const artwork = label => {
        const range = document.createRange();
        range.selectNodeContents(label.firstElementChild);
        return [...range.getClientRects()].map(box);
      };
      return {
        copies: document.querySelectorAll('[id="prep-counts"], .prep-counts').length,
        described: devices.getAttribute('aria-describedby'),
        dock: measure(devices.closest('.prep-dock')),
        portrait: innerHeight > innerWidth,

        english: settings.language === 'en',
        values: [
          preparation.placements.length + '/' + config.devices.maxObjects,
          new Set(preparation.placements.map(placement => placement.kind)).size + '/' + config.devices.typeSlots,
        ],
        screen: {x: 0, y: 0, w: innerWidth, h: innerHeight},
        card: measure(devices),
        title: title && measure(title),
        counters: counts && measure(counts),
        rows: counts ? [...counts.querySelectorAll(':scope > .prep-count')].map(row => ({
          box: measure(row),
          labels: [...row.querySelectorAll('[data-prep-label]')].map(label => ({
            text: label.textContent.trim(),
            ink: artwork(label),
          })),
        })) : [],
      };
    })()`);
    const {copies, described, dock, portrait, english, values, screen, card, title, counters, rows} = result;
    assert.equal(copies, 1, `${label}: expected one copy of device counters`);
    assert.equal(described, 'prep-counts', `${label}: device button description`);
    assert(title && counters, `${label}: missing device title or counters`);
    assert(fitsInside(counters, screen), `${label}: device counters outside viewport`);
    assert(fitsInside(counters, dock), `${label}: counters outside the stone dock`);
    if (portrait) {
      assert(counters.y >= card.y + card.h - .5, `${label}: portrait counters should sit below the device button`);
    } else {
      assert(fitsInside(counters, card), `${label}: landscape counters should sit inside the device row`);
    }
    assert(!intersects(counters, title), `${label}: device counters overlap title or icon`);
    const names = english ? ['Objects', 'Types'] : ['Объекты', 'Типы'];
    assert.deepEqual(rows.map(row => row.labels.map(item => item.text)), names.map((name, i) => [name, values[i]]),
      `${label}: wrong localized device counts`);
    for (const row of rows) {
      assert(fitsInside(row.box, counters), `${label}: counter row outside its container`);
      // A DOM text range can extend slightly above its CSS line box.
      const inset = row.box.h * .3;
      const line = {...row.box, y: row.box.y - inset, h: row.box.h + inset * 2};
      for (const item of row.labels) {
        assert(item.ink.length === 1 && item.ink.every(box => box.w > 0 && box.h > 0 &&
          fitsInside(box, line) && fitsInside(box, dock) && !intersects(box, title)),
          `${label}: hidden or clipped device count ${JSON.stringify({item, row: row.box})}`);
      }
      assert(!row.labels[0].ink.some(a => row.labels[1].ink.some(b => intersects(a,b))),
        `${label}: counter label and value overlap`);
    }
    const [objects, types] = rows.map(row => row.box);
    assert(!intersects(objects,types), `${label}: device counters overlap one another`);
    return {counters, rows};
  };
  const geometry=async(label)=>{
   const g=await evaluate(`(()=>{const root=document.querySelector('.preparation-screen'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,action:e.dataset.prepAction||e.dataset.action}};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,header:box(root.querySelector('.prep-header')),dock:box(root.querySelector('.prep-dock')),field:box(root.querySelector('[data-prep-field]')),controls:[...root.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(box),attempt:JSON.parse(window.preparationFixture.raw()||'null')?.activeAttempt}})()`);
   if(g.scrollWidth>g.width)issues.push(`${label}: document overflow ${g.scrollWidth}/${g.width}`);
   for(const r of g.controls)if(r.w<43.9||r.h<43.9||r.x<-.5||r.x+r.w>g.width+.5||r.y<-.5||r.y+r.h>g.height+.5)issues.push(`${label}: clipped/undersize ${JSON.stringify(r)}`);
   assert(!g.attempt,`${label}: resize/orientation created attempt`);
   assert(g.field.h>100,`${label}: field lost usable height`);
   const detail=await evaluate(`(()=>{const root=document.querySelector('.preparation-screen'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,name:e.className}};return{
     headerItems:[...root.querySelectorAll('.prep-header button')].map(box),
     currencyItems:[...root.querySelectorAll('.prep-currency')].map(e=>[...e.children].map(box)),
     compactTitle:getComputedStyle(root.querySelector('.prep-night-compact')).display,
     zoom:box(root.querySelector('[data-prep-action="zoom"]')),
     objects:window.preparationFixture.sceneBoxes(),
     scout:root.querySelector('[data-panel="recon"]').textContent.trim(),
   }})()`);
   for(let i=0;i<detail.headerItems.length;i++)for(let j=i+1;j<detail.headerItems.length;j++)if(intersects(detail.headerItems[i],detail.headerItems[j]))issues.push(`${label}: header buttons overlap ${JSON.stringify([detail.headerItems[i],detail.headerItems[j]])}`);
   for(const row of detail.currencyItems)for(let i=0;i<row.length;i++)for(let j=i+1;j<row.length;j++)if(intersects(row[i],row[j]))issues.push(`${label}: currency content overlaps ${JSON.stringify([row[i],row[j]])}`);
   assert.equal(detail.compactTitle!=='none',g.height>g.width,`${label}: wrong compact title visibility`);
   if(label.includes('en-large'))assert.equal(detail.scout,'Scout',`${label}: scout label not localized`);
   for(const object of detail.objects)for(const control of detail.headerItems) {
     if(intersects(control,object)) issues.push(`${label}: upper HUD overlaps sprite ${object.id} ${JSON.stringify({control,object})}`);
   }
   const headerOverflow=await evaluate(`Array.from(document.querySelectorAll('.prep-header [data-prep-label]>span')).filter(span=>{
     if(!span.getClientRects().length)return false;
     const control=span.closest('button,.prep-currency').getBoundingClientRect();
     const ink=span.getBoundingClientRect();
     return ink.top<control.top-.5||ink.bottom>control.bottom+.5;
   }).map(span=>span.textContent)`);
   assert.deepEqual(headerOverflow,[],`${label}: header labels exceed their controls`);

   const towerPixelHeight=detail.objects.find(object=>object.id==='lighthouse').h;
   if(g.height>g.width&&g.height<=650){assert(towerPixelHeight>=45,`${label}: compact lighthouse remains too small ${towerPixelHeight} CSS px`);assert(Math.abs(detail.zoom.h-44)<.5,`${label}: compact Zoom is not 44 CSS px`);}
   const deviceCounts = await checkDeviceCounts(label);
   const available = await evaluate(`['.prep-devices', '.prep-lens', '.prep-ability', '.prep-start'].map(selector => {
     const button = document.querySelector(selector);
     const {x,y,width,height} = button.getBoundingClientRect();
     return !button.disabled && button.contains(document.elementFromPoint(x + width/2, y + height/2));
   })`);
   assert.deepEqual(available, [true,true,true,true], `${label}: unreachable devices, lens, ability or start button`);
   layouts.push({label,...g,...detail,towerPixelHeight,deviceCounts});
   return g;
  };
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1672,height:941,deviceScaleFactor:1,mobile:false});
  await navigate();
  for(const [label,w,h,touch,dpr] of [['desktop',1672,941,false,1],['desktop-1280',1280,720,false,1],['portrait',390,844,true,2],['portrait-360',360,740,true,1],['compact',320,568,true,1],['landscape',844,390,true,1]]){await viewport(w,h,touch,dpr);await geometry(label);await screenshot(label);check(`${label}: layout, no attempt on resize`);}
  await viewport(390,844,true,2);await navigate('?en&large');await geometry('en-large');await screenshot('en-large');check('English large text layout');
  for (const [label,w,h,touch,query] of [
    ['en-compact',320,568,true,'?en'],
    ['ru-large-compact',320,568,true,'?large'],
    ['en-large-compact',320,568,true,'?en&large'],
    ['ru-narrow-landscape',568,320,true,''],
    ['en-narrow-landscape',568,320,true,'?en'],
    ['ru-large-narrow-landscape',568,320,true,'?large'],
    ['en-large-narrow-landscape',568,320,true,'?en&large'],
    ['en-large-landscape',844,390,true,'?en&large'],
    ['en-desktop',1672,941,false,'?en'],
    ['en-large-desktop',1672,941,false,'?en&large'],
  ]) {
    await viewport(w,h,touch);await navigate(query);await geometry(label);await screenshot(label);
    check(label+': text, control sizes, visibility and no overflow');
  }
  console.log('LAYOUT ISSUES',JSON.stringify(issues));
  if(layoutOnly){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,mode:'layout-only',checks,layouts,issues,runtimeErrors,realPhoneTested:false},null,2));console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));assert.equal(issues.length,0,issues.join('\n'));assert.equal(runtimeErrors.length,0,'Runtime errors or HTTP failures');await send('Browser.close');ws.close();return;}
  await viewport(1280,720,false);await navigate();
  const balance=(await snapshot()).resources;
  for(const name of ['lens','recon','ability','shards','pearls']){await click(panel(name));assert(await evaluate(`!!document.querySelector('.prep-drawer')`));await screenshot(`drawer-${name}`);await click(action('close-panel'));assert.equal((await snapshot()).resources,balance);}
  check('Lens, recon, ability and currency drawers; plus does not grant currency');

  const chapter = id => `${action('chronicle-chapter')}[data-chapter="${id}"]`;
  const night = id => `${action('chronicle-night')}[data-night="${id}"]`;
  const selectedNight = () => evaluate('window.preparationFixture.app.view.selectedNightId');
  const confirmNight = action('confirm-night');
  const contentsTab = '.chronicle-bookmark';
  const inspectChapter = action('chronicle-inspect-chapter');
  const escapeKey = async () => {
    for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', {type, key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
  };
  const checkChronicleLayout = async english => {
    const geometry = await evaluate(`(async () => {
      const book = document.querySelector('.night-chronicle'), scroll = book.querySelector('.chronicle-scroll');
      const buttons = [...book.querySelectorAll('button')].filter(b => b.getClientRects().length), footer = book.querySelector('.chronicle-actions');
      await Promise.all([...book.querySelectorAll('img')].map(img => img.decode()));
      return {
        horizontalOverflow: scroll.scrollWidth > scroll.clientWidth || book.scrollWidth > book.clientWidth,
        smallTargets: buttons.filter(b => b.offsetHeight < 44 || b.offsetWidth < 44).map(b => b.textContent),
        footerVisible: footer.getBoundingClientRect().bottom <= innerHeight + 1,
        russianText: [...book.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).join(' ') + book.textContent,
      };
    })()`);
    assert(!geometry.horizontalOverflow, `Chronicle overflows horizontally: ${geometry.russianText}`);
    assert.deepEqual(geometry.smallTargets, []);
    assert(geometry.footerVisible);
    if(english)assert(!/[а-яё]/i.test(geometry.russianText),geometry.russianText);
  };

  const beforeChronicle = await snapshot();
  await click(panel('night'));
  assert(await evaluate(`document.activeElement.matches('${contentsTab}')`));
  assert(await evaluate(`(() => {
    const beacon = document.querySelector('.chronicle-card [data-light="lit"] img');
    const coast = document.querySelector('.chronicle-coast img');
    return beacon?.src.endsWith('/images/avalon-watch/ui/icon-check.png') &&
      coast?.currentSrc.endsWith('/images/avalon-watch/illustrations/harbor.png') && !document.querySelector('[data-prep-world]');
  })()`));
  await click(contentsTab);
  assert(await evaluate(`!!document.querySelector('${chapter('1')}[aria-current="true"]')`));
  await screenshot('chronicle-contents');
  await click(chapter('2')); await click(inspectChapter);
  assert(await evaluate(`document.querySelector('${confirmNight}').disabled && document.querySelector('.chronicle-condition').textContent.includes('Страж глубин')`));
  await click(contentsTab);
  await click(chapter('1')); await click(inspectChapter);
  await click(night('winged-tide'));
  assert(await evaluate(`document.activeElement.matches('${night('winged-tide')}[aria-pressed="true"]') && !!document.querySelector('${night('winged-tide')} [data-light="dim"]')`));
  assert.equal(await selectedNight(),'first-light');
  await checkChronicleLayout(false);
  await screenshot('chronicle-desktop');
  await escapeKey();
  assert(await evaluate(`document.activeElement.matches('${panel('night')}')`));
  assert.equal(await selectedNight(),'first-light');
  await click(panel('night'));
  await click(night('broken-shore'));
  await click(confirmNight);
  assert.equal(await selectedNight(),'broken-shore');
  assert.deepEqual(await snapshot(),beforeChronicle);
  await click(panel('night'));
  await click(night('first-light'));
  await click(confirmNight);
  assert.equal(await selectedNight(),'first-light');
  check('Chronicle: locked chapter, lit completion, draft selection, Escape focus and free replay');

  await viewport(390,844,true,2);
  await navigate('?clear-shore&en&large');
  await click(panel('night'),true);
  await checkChronicleLayout(true);
  await screenshot('chronicle-portrait-en-large');
  await click(contentsTab,true);
  await click(chapter('2'),true); await click(inspectChapter,true);
  await click(night('far-shore'),true);
  await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});
  await sleep(250);
  assert(await evaluate(`!!document.querySelector('${night('far-shore')}[aria-pressed="true"]')`));
  await checkChronicleLayout(true);
  await screenshot('chronicle-landscape-en-large');
  await click(confirmNight,true);
  assert.equal(await selectedNight(),'far-shore');
  await click(panel('night'),true);
  await click(contentsTab,true);
  assert(await evaluate(`!!document.querySelector('${chapter('2')}[aria-current="true"]')`));
  await click(action('chronicle-trials'),true);
  await checkChronicleLayout(true);
  await screenshot('trials-landscape-en-large');
  await click(night('armored-front'),true);
  await click(confirmNight,true);
  assert.equal(await selectedNight(),'armored-front');
  await click(panel('recon'),true);
  assert(await evaluate(`!!document.querySelector('.prep-drawer [data-action="select-late-mode"]')`));
  await click(action('close-panel'),true);
  check('Chronicle: touch, large English text, orientation, unlocked chapter and late trials');

  for(const [label,width,height,query,english] of [
    ['portrait-ru',390,844,'',false],
    ['compact-ru-large',320,568,'?large',false],
    ['compact-en-large',320,568,'?en&large',true],
    ['landscape-en',844,390,'?en',true],
  ]){
    await viewport(width,height,true);
    await navigate(query);
    await click(panel('night'),true);
    await checkChronicleLayout(english);
    await screenshot(`chronicle-${label}`);
    if(label==='compact-ru-large'){
      assert(await evaluate(`Array.from(document.querySelectorAll('.chronicle-card .prep-label')).every(label => getComputedStyle(label).fontFamily.includes('Avalon Menu') && label.scrollWidth <= label.clientWidth + 1)`), 'Compact night names use the pixel lettering');
      assert(await evaluate(`(() => {
        const scroll = document.querySelector('.chronicle-scroll');
        scroll.scrollTop = scroll.scrollHeight;
        const lastCard = document.querySelector('.chronicle-nights li:last-child');
        return scroll.scrollTop > 0 && lastCard.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().bottom;
      })()`));
      await checkChronicleLayout(english);
      await screenshot('chronicle-compact-ru-large-scrolled');
    }
    await click(action('close-panel'),true);
  }
  check('Chronicle: normal and large text in Russian and English, compact layout and fixed actions');

  await viewport(1280,720,false); await navigate('?long-chapter&clear-shore');
  await click(panel('night'));
  assert.equal(await evaluate(`document.querySelectorAll('.chronicle-nights li').length`),4);
  await screenshot('chronicle-sheet-1');
  await click(`${action('chronicle-page')}[data-page="1"]`);
  assert.equal(await evaluate(`document.querySelectorAll('.chronicle-nights li').length`),2);
  assert(await evaluate(`!!document.querySelector('${night('far-shore')}') && document.querySelector('${confirmNight}').disabled`));
  await screenshot('chronicle-sheet-2');
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
  await evaluate(`Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>1})`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(250);
  const pageCard = await rect('.chronicle-nights li:first-child');
  const swipeX = pageCard.x + pageCard.width * .25;
  const swipeY = pageCard.y + pageCard.height * .45;
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipeX,y:swipeY}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipeX+44,y:swipeY}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipeX+90,y:swipeY}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(`document.querySelectorAll('.chronicle-nights li').length === 4`);
  assert.equal(await selectedNight(),'first-light');
  await click(`${action('chronicle-page')}[data-page="1"]`,true);
  await wait(`document.querySelectorAll('.chronicle-nights li').length === 2`);
  await click(night('far-shore'),true);
  await click(confirmNight,true);
  await click(panel('night'),true);
  assert(await evaluate(`!!document.querySelector('${night('far-shore')}[aria-pressed="true"]')`));
  check('Chronicle: four entries per sheet, touch swipe, second-page selection and reopening');

  await cdp('Page.navigate',{url:`${base}/tests/browser/preparation-frame.html?game-menu`});
  await wait(`document.querySelector('.reference-game-menu')?.dataset.ready === 'true' && !document.querySelector('.reference-game-menu').inert`);
  await click('[data-action="trials"]',true);
  await wait(`!!document.querySelector('.trials-panel [data-chronicle-kind="trials"]')`);
  await checkChronicleLayout(false);
  await screenshot('trials-portrait-ru');
  assert.equal(await selectedNight(),'winged-tide');
  await escapeKey();
  await wait(`document.querySelector('.reference-game-menu')?.dataset.ready === 'true' && !document.querySelector('.reference-game-menu').inert`);
  await click('[data-action="trials"]',true);
  await wait(`!!document.querySelector('.trials-panel [data-chronicle-kind="trials"]')`);
  await click(night('rescue-trial'),true);
  await click(confirmNight,true);
  assert.equal(await selectedNight(),'rescue-trial');
  assert.equal((await snapshot()).screen,'preparation');
  assert.equal((await snapshot()).writes,0);
  assert(await evaluate(`document.activeElement.matches('${panel('night')}')`));
  await click(`${action('back')}.prep-back`,true);
  await wait(`!!document.querySelector('.reference-game-menu')`);
  await navigate();
  check('Trials: standalone book from game menu, Escape cancellation, confirmation and return from preparation');

  await viewport(1280,720,false);await navigate();
  await click(panel('devices'));assert.equal(await evaluate(`document.querySelectorAll('.prep-mechanisms button').length`),8);await screenshot('device-panel');
  const drawerBefore=await snapshot(),dr=await rect('.prep-drawer-body');await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:dr.x+dr.width/2,y:dr.y+dr.height/2,deltaY:400,deltaX:0});await sleep(200);assert(await evaluate(`document.querySelector('.prep-drawer-body').scrollTop>0`));assert.deepEqual((await snapshot()).devices,drawerBefore.devices);check('Drawer scrolling does not place or mutate inventory');
  await click(`${action('move-device')}[data-device-id="2"]`);await click(action('close-panel'));
  const beforeMove=await snapshot();await worldClick(-200,150);const afterMove=await snapshot();
  const moved=afterMove.devices.find(d=>d.id===2);assert(Math.abs(moved.position.x+200)<.01,JSON.stringify({position:moved.position,preview:afterMove.preview,expected:await point(-200,150)}));assert.equal(moved.health,42);assert.deepEqual(afterMove.devices.find(d=>d.id===4),beforeMove.devices.find(d=>d.id===4));assert.equal(afterMove.resources,beforeMove.resources);check('Exact owned id 2 moved with damage and spare instance preserved');
  await click(action('cancel-placement'));
  await worldClick(-200,150);assert(await evaluate(`!!document.querySelector('.prep-inspector')`));
  const overview=await point(0,0);await click(action('zoom'));const close=await point(0,0);assert(close.camera.zoom>overview.camera.zoom);await screenshot('selected-close');await click(action('zoom'));await click(action('deselect'));check('Context selection and explicit close camera');
  await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="4"]`);await click(action('close-panel'));
  await checkDeviceCounts('returned to stock');
  const beforeInvalid=await snapshot();const sea=await point(150,0);await mouse(sea);await sleep(100);assert.equal((await snapshot()).preview.valid,false);await worldClick(150,0);assert.deepEqual((await snapshot()).devices,beforeInvalid.devices);check('Sea preview and click reject invalid placement');
  const start=await point(-120,-100),end=await point(-190,-130);await mouse(start);await mouse(start,'mousePressed');await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:end.x,y:end.y,button:'left',buttons:1});await mouse(end,'mouseReleased');await sleep(100);assert.deepEqual((await snapshot()).devices,beforeInvalid.devices);check('Map drag does not place');
  await worldClick(-140,-140);assert(Math.abs((await snapshot()).devices.find(d=>d.id===4).position.x+140)<.01);await click(action('cancel-placement'));await checkDeviceCounts('placed from stock');check('Real mouse placement uses world coordinates and updates the counters');
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
  await navigate('?stock');await click(panel('devices'),true);await click(`${action('browse-device')}[data-kind="light-trap"]`,true);await click(`${action('recharge-device')}[data-device-id="5"]`,true);assert.equal((await snapshot()).devices.find(d=>d.id===5).trapCharges,1);check('Trap recharge persists charges');
  await click(action('close-panel'),true);await navigate('?new');assert.equal((await snapshot()).devices.length,0);assert.equal(await evaluate(`document.querySelector('[data-prep-action="start"]').disabled`),false);await checkDeviceCounts('new profile');await screenshot('empty');check('New profile can start without devices');
  await viewport(1280,720,false);await navigate();await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="1"]`);await click(action('close-panel'));
  const beforeFailure=await snapshot();await evaluate('window.preparationFixture.fail(true)');await worldClick(-100,-100);assert((await snapshot()).error);assert.equal((await snapshot()).raw.profile.devices.find(d=>d.id===1).position,null);await screenshot('save-failure');await evaluate('window.preparationFixture.fail(false)');await click('[data-action="save"]');const recovered=await snapshot();assert(!recovered.error);assert(Math.abs(recovered.devices.find(d=>d.id===1).position.x+100)<.01);assert.equal(recovered.resources,beforeFailure.resources);assert.equal(recovered.devices.length,beforeFailure.devices.length);check('Placement save failure and retry preserve profile and exact instance');
  await navigate();await click(panel('devices'));await click(`${action('remove-device')}[data-device-id="1"]`);await click(`${action('owned-device')}[data-device-id="1"]`);await click(action('close-panel'));await evaluate(`document.querySelector('[data-prep-world]').focus()`);
  for(const key of ['ArrowLeft','Enter']){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:37});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Enter'?13:37});await sleep(100);}assert((await snapshot()).devices.find(d=>d.id===1).position);check('Keyboard arrow and Enter placement');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,checks,issues,runtimeErrors,realPhoneTested:false},null,2));
  console.log(JSON.stringify({out,checks:checks.length,issues,runtimeErrors},null,2));
  assert.equal(issues.length,0,issues.join('\n'));assert.equal(runtimeErrors.length,0,'Runtime errors or HTTP failures');
  await send('Browser.close');ws.close();
})().catch(async error=>{console.error(error);fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));try{await captureFailure?.();}catch(captureError){console.error('Failure screenshot unavailable:',captureError.message);}process.exitCode=1;}).finally(async()=>{ws?.close();await testBrowser.cleanup();});
