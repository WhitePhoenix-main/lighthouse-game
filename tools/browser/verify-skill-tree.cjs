// Isolated, dependency-free Chrome QA. Never reads or writes the player's profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTestBrowser } = require('./browser-profile.cjs');
const output = path.resolve('test-results', 'skill-tree-mobile-overview');
fs.mkdirSync(output, { recursive: true });
const browser = createTestBrowser(output, { gpu: true });
const base = process.argv[2] || 'http://127.0.0.1:5174';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const chrome = browser.launch();
  let endpoint = '', diagnostics = '';
  chrome.on('error', error => { diagnostics += String(error); });
  chrome.stderr.on('data', chunk => { diagnostics += String(chunk); const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/); if (match) endpoint = match[1]; });
  for (let i = 0; i < 100 && !endpoint; i++) await sleep(100);
  const portFile = path.join(output, 'profile', 'DevToolsActivePort');
  if (!endpoint && fs.existsSync(portFile)) { const [port, route] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); endpoint = 'ws://127.0.0.1:' + port + route; }
  assert(endpoint, 'Chrome debugging endpoint: ' + diagnostics + ' exit=' + chrome.exitCode);
  const socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  let next = 0;
  const pending = new Map(), errors = [], reports = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error('Timeout: ' + expression + ' ' + JSON.stringify(errors) + ' ' + await evaluate('document.documentElement.outerHTML.slice(0,1500)')); };
  const click = async (selector, touch = false) => {
    if (selector.startsWith('[data-skill=')) {
      // The tiny full-map overview is navigational; zoom before choosing individual coins.
      while (await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)<55')) {
        await click('[data-tree-action="zoom-in"]', touch);
      }
    }
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) throw Error('Missing or disabled '+${JSON.stringify(selector)}); e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y); if (!e.contains(hit)) throw Error('Occluded '+${JSON.stringify(selector)}+' by '+hit?.outerHTML.slice(0,300)); return {x,y}; })()`);
    if (touch) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    }
    await sleep(150);
  };
  const shot = async name => {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
  };
  const checkMobileOverview = async name => {
    const result = await evaluate(`(() => {
      const viewport = document.querySelector('.skill-viewport').getBoundingClientRect();
      const footer = document.querySelector('.skill-zoom-controls').getBoundingClientRect();
      const canvas = document.querySelector('.skill-canvas');
      const medals = [...canvas.querySelectorAll('.skill-node-medallion')].map(node => node.getBoundingClientRect());
      const paths = canvas.querySelectorAll('.skill-connections path');
      const measure = node => node.getBoundingClientRect().width > 0;
      return { inside: medals.filter(r => r.width > 0 && r.left >= viewport.left - 1 && r.right <= viewport.right + 1 && r.top >= viewport.top - 1 && r.bottom <= footer.top + 1).length,
        paths:paths.length, graphVisible:getComputedStyle(canvas).visibility === 'visible',
        zoomVisible:measure(document.querySelector('.skill-zoom-controls output')),
        directionsCoverMap:measure(document.querySelector('.skill-directions')) };
    })()`);
    assert.deepEqual(result, { inside:200, paths:219, graphVisible:true, zoomVisible:true, directionsCoverMap:false }, `${name}: the full graph fits above the zoom controls`);
  };
  try {
    await cdp('Runtime.enable');
    for (const [name, width, height, touch, query] of [
      ['desktop', 1440, 960, false, ''], ['portrait', 390, 844, true, ''],
      ['landscape', 844, 390, true, ''], ['small-portrait', 320, 568, true, '&large'],
      ['small-landscape', 568, 320, true, '&large'], ['english-large', 1280, 800, false, '&language=en&large'],
      ['portrait-en-large', 390, 844, true, '&language=en&large'], ['landscape-en', 844, 390, true, '&language=en'],
      ['desktop-developed', 1440, 960, false, '&developed'],
      ['reference-desktop', 1671, 941, false, '&developed'], ['reference-portrait', 426, 923, true, ''],
    ]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
      await cdp('Page.navigate', { url: `${base}/tests/browser/skill-tree-frame.html?qa${query}` });
      await wait('!!window.skillTreeFixture && !!document.querySelector(".skill-node")');
      await sleep(350);
      assert.equal(await evaluate('document.documentElement.lang'), query.includes('language=en') ? 'en' : 'ru', `${name}: locale`);
      assert.equal(await evaluate('document.documentElement.dataset.textSize'), query.includes('&large') ? 'large' : 'normal', `${name}: text size`);
      await evaluate('window.initialTreeScene = document.querySelector(".menu-scenery")');
      const report = await evaluate(`(() => { const v=document.querySelector('.skill-viewport'), s=document.querySelector('.skill-inspector'); return { nodes:document.querySelectorAll('.skill-node').length, overflow:document.documentElement.scrollWidth > innerWidth, map:{width:v.clientWidth,height:v.clientHeight}, inspector:{width:s.clientWidth,height:s.clientHeight}, purchases:skillTreeFixture.writes()}; })()`);
      reports.push({ name, ...report });
      assert(!report.overflow, `${name}: page overflow`);
      assert.equal(report.nodes, 200, `${name}: one graph contains every purchase`);
      assert.equal(await evaluate('document.querySelectorAll(".skill-connections path").length'), 219, `${name}: the chart draws all dependencies`);
      assert(await evaluate('document.querySelector(".skill-inspector").hidden'), 'initial overview uses the whole map');
      assert(report.map.height > 90 && report.map.width > 170, `${name}: usable map ${JSON.stringify(report.map)}`);
      const chart = await evaluate(`(async () => {
        const panel = document.querySelector('.skill-map-panel');
        const source = getComputedStyle(panel).borderImageSource.slice(5, -2);
        const image = new Image(); image.src = source; await image.decode();
        const beacon = document.querySelector('.skill-root img'); await beacon.decode();
        return { frame: new URL(source).pathname, beacon: new URL(beacon.currentSrc).pathname };
      })()`);
      assert(chart.frame.endsWith('/avalon-watch/ui/panel.png') && chart.beacon.endsWith('/avalon-watch/world/beacon.png'),
        `${name}: loads the frame and beacon shared with Avalon Watch`);
      await shot(name);
      if (touch && height > width) {
        const header = await evaluate(`(() => {
          const back = document.querySelector('.skill-back').getBoundingClientRect();
          const wallet = document.querySelector('.skill-wallet').getBoundingClientRect();
          const title = document.querySelector('.skill-lettering-stacked');
          return { aligned:wallet.top < back.bottom && Math.abs(back.top - wallet.top) < 10, titleHeight:title.getBoundingClientRect().height };
        })()`);
        assert(header.aligned && header.titleHeight > 20, `${name}: title and both resources share the top row ${JSON.stringify(header)}`);
      }
      if (touch) await checkMobileOverview(`${name}, first open`);
      if (name === 'reference-desktop') {
        const spread = await evaluate(`(() => {
          const viewport = document.querySelector('.skill-viewport').getBoundingClientRect();
          const canvas = document.querySelector('.skill-canvas'), chart = canvas.getBoundingClientRect();
          const nodes = [...document.querySelectorAll('.skill-node')];
          const medals = nodes.map(e => e.querySelector('.skill-node-medallion').getBoundingClientRect());
          const centerError = Math.max(...nodes.map((node, i) => Math.abs(medals[i].left + medals[i].width/2 - (chart.left + parseFloat(node.style.left)*chart.width/canvas.offsetWidth))));
          return { ratio: (Math.max(...medals.map(r => r.right)) - Math.min(...medals.map(r => r.left))) / viewport.width,
            square: Math.abs(medals[0].width - medals[0].height) < 1, centerError };
        })()`);
        assert(spread.ratio > .60 && spread.ratio < .70 && spread.square && spread.centerError < 1, `wide overview fills the reference area ${JSON.stringify(spread)}`);
        await click('[data-tree-action="zoom-in"]');
        await click('[data-tree-action="zoom-in"]');
        const worldAt = target => evaluate(`(() => {
          const canvas = document.querySelector('.skill-canvas'), r = canvas.getBoundingClientRect();
          const viewport = document.querySelector('.skill-viewport').getBoundingClientRect();
          const controls = document.querySelector('.skill-zoom-controls').getBoundingClientRect();
          const x = ${target?.x ?? 'viewport.left + viewport.width / 2'};
          const y = ${target?.y ?? '(viewport.top + controls.top) / 2'};
          return { x: (x - r.left) / (r.width / canvas.offsetWidth), y: (y - r.top) / (r.height / canvas.offsetHeight) };
        })()`);
        const widePoint = await evaluate(`(() => { const r = document.querySelector('.skill-viewport').getBoundingClientRect(); return {x:r.left+r.width*.45,y:r.top+r.height*.4}; })()`);
        const beforeWheel = await worldAt(widePoint);
        await cdp('Input.dispatchMouseEvent', {type:'mouseWheel', ...widePoint, deltaY:-120, deltaX:0, modifiers:2});
        await sleep(150);
        const afterWheel = await worldAt(widePoint);
        assert(Math.hypot(afterWheel.x-beforeWheel.x,afterWheel.y-beforeWheel.y) < 4, 'wide Ctrl+wheel preserves the point under the cursor');
        await cdp('Emulation.setTouchEmulationEnabled', {enabled:true});
        const touchPoints = radius => [-radius, radius].map(offset => ({ x:widePoint.x+offset, y:widePoint.y }));
        await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:touchPoints(40)});
        await cdp('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:touchPoints(62)});
        await sleep(120);
        await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        await sleep(120);
        await cdp('Emulation.setTouchEmulationEnabled', {enabled:false});
        const afterPinch = await worldAt(widePoint);
        assert(Math.hypot(afterPinch.x-afterWheel.x,afterPinch.y-afterWheel.y) < 4, 'wide pinch preserves the point between fingers');
        const beforeResize = await worldAt();
        await cdp('Emulation.setDeviceMetricsOverride', {width:1190,height:900,deviceScaleFactor:1,mobile:false});
        await sleep(250);
        const afterResize = await worldAt();
        assert(Math.hypot(afterResize.x-beforeResize.x,afterResize.y-beforeResize.y) < 4, 'manual camera keeps its point when the wide projection turns off');
        await cdp('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false});
        await sleep(250);
        await click('.skill-overview-button');
      }
      if (name === 'desktop') {
        await cdp('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
        await sleep(250);
        assert(await evaluate(`(() => { const v=document.querySelector('.skill-viewport').getBoundingClientRect();return [...document.querySelectorAll('.skill-node-medallion')].every(n=>{const r=n.getBoundingClientRect();return r.x>=v.x-1 && r.y>=v.y-1 && r.right<=v.right+1 && r.bottom<=v.bottom+1;}); })()`), 'resize refits the entire map');
        assert.equal(await evaluate('skillTreeFixture.writes()'), 0);
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await sleep(250);
      }
      if (name === 'portrait' || name === 'reference-portrait') {
        await click('.skill-overview-button', true);
        await checkMobileOverview(`${name}, overview button`);
        await shot(name + '-overview');
        const scale = () => evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)');
        const fitted = await scale();
        await click('[data-tree-action="zoom-in"]', true);
        const closer = await scale();
        assert(closer > fitted && closer < fitted * 1.7, `${name}: plus takes a small zoom step`);
        const tapped = await evaluate(`(() => {
          const r = document.querySelector('.skill-viewport').getBoundingClientRect();
          return {x:r.left+r.width*.3,y:r.top+r.height*.4};
        })()`);
        await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[tapped]});
        await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        await sleep(150);
        assert(await scale() > closer, `${name}: tapping the map zooms towards the area`);
        const enlarged = await scale();
        await click('[data-tree-action="zoom-out"]', true);
        assert(await scale() < enlarged, `${name}: minus zooms out below the interaction threshold`);
        await click('.skill-overview-button', true);
        await checkMobileOverview(`${name}, after zooming`);
        if (name === 'portrait') {
          await cdp('Emulation.setDeviceMetricsOverride', {width:844,height:390,deviceScaleFactor:1,mobile:true});
          await sleep(200);
          await checkMobileOverview('portrait overview after turning to landscape');
          await cdp('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:true});
          await sleep(200);
          await checkMobileOverview('portrait overview after turning back');
        }
      }
      await click('[data-tree-action="category"][data-category="devices"]', touch);
      assert.equal(await evaluate('document.querySelector(".skill-tree-screen").dataset.category'), 'devices');
      assert.equal(await evaluate('skillTreeFixture.writes()'), 0);
      await click('[data-skill="unlock-cannon"]', touch);
      const focusGeometry = await evaluate(`(() => {
        const box = s => document.querySelector(s).getBoundingClientRect();
        const node = box('.skill-node[aria-pressed="true"]'), card = box('.skill-inspector'), map = box('.skill-map-panel'), zoom = box('.skill-zoom-controls');
        const label = box('.skill-chart-direction');
        const apart = r => !r.width || node.right <= r.left || node.bottom <= r.top || node.left >= r.right || node.top >= r.bottom;
        return { onMap: node.left >= map.left && node.right <= map.right && node.top >= map.top && node.bottom <= map.bottom,
          clear: apart(zoom) && apart(label),
          cardBelow: card.top >= map.bottom, cardRight: card.left >= map.right };
      })()`);
      assert(focusGeometry.onMap && focusGeometry.clear, name + ': selected node is visible on the map beside the zoom controls');
      assert(touch && height > width ? focusGeometry.cardBelow : focusGeometry.cardRight, name + ': the details card sits outside the map');
      if (name === 'reference-portrait' || name === 'portrait') {
        const composition = await evaluate(`(() => {
          const box = s => document.querySelector(s).getBoundingClientRect();
          const map = box('.skill-map-panel'), card = box('.skill-inspector');
          const node = box('.skill-node[aria-pressed="true"]'), body = box('.skill-inspector-body'), requirement = box('.skill-requirements li');
          return { mapToCard:map.height/card.height, nodeWidth:node.width,
            noteVisible:requirement.top >= body.top && requirement.bottom <= body.bottom };
        })()`);
        assert(composition.mapToCard > (name === 'reference-portrait' ? 1.3 : 1.15) && composition.nodeWidth >= 64 && composition.noteVisible, `portrait layout follows the reference ${JSON.stringify(composition)}`);
      }
      assert(await evaluate(`(() => {const b=document.querySelector('.skill-purchase-button').getBoundingClientRect(),c=document.querySelector('.skill-inspector').getBoundingClientRect();return b.top>=c.top && b.bottom<=c.bottom;})()`), name + ': purchase action stays visible without scrolling details');
      await shot(name + '-details');
      const detailSpace = await evaluate(`(() => {
        const details = document.querySelector('.skill-inspector-body').getBoundingClientRect();
        const title = document.querySelector('.skill-inspector h2').getBoundingClientRect();
        return { height: details.height, titleVisible: title.top >= details.top && title.bottom <= details.bottom };
      })()`);
      assert(detailSpace.height >= 74 && detailSpace.titleVisible, `${name}: the card keeps room for details above the purchase action ${JSON.stringify(detailSpace)}`);
      await click('.skill-purchase-button', touch);
      assert.equal(await evaluate('skillTreeFixture.app.view.profile.resources'), 415);
      assert.equal(await evaluate('skillTreeFixture.app.view.profile.purchasedUpgrades.includes("unlock-cannon")'), true);
      assert.equal(await evaluate('skillTreeFixture.reload().view.profile.purchasedUpgrades.includes("unlock-cannon")'), true);
      // Camera controls retain focus and selection; inspecting never buys anything.
      if (name === 'desktop') {
        const zoomBefore = await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)');
        await click('[data-tree-action="zoom-in"]');
        assert.equal(await evaluate('document.activeElement.dataset.treeAction'), 'zoom-in');
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await sleep(100);
        assert.equal(await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)'), zoomBefore + 20);
        await click('[data-tree-action="close-inspector"]');
        const wheelPoint = await evaluate(`(() => {const v=document.querySelector('.skill-viewport').getBoundingClientRect();return {x:v.x+v.width*.45,y:v.y+v.height*.4};})()`);
        const worldAtWheel = () => evaluate(`(() => {const f=document.querySelector('.skill-canvas-frame').getBoundingClientRect(),z=parseFloat(document.querySelector('.skill-canvas').style.getPropertyValue('--skill-zoom'));return {x:(${wheelPoint.x}-f.left)/z,y:(${wheelPoint.y}-f.top)/z};})()`);
        const beforeWheel = await worldAtWheel();
        const wheelZoom = await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)');
        await cdp('Input.dispatchMouseEvent', { type:'mouseWheel', ...wheelPoint, deltaX:0, deltaY:-120, modifiers:2 });
        await sleep(100);
        const afterWheel = await worldAtWheel();
        assert.equal(await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)'), wheelZoom + 10, 'Ctrl + wheel zooms');
        assert(Math.hypot(beforeWheel.x-afterWheel.x,beforeWheel.y-afterWheel.y)<3, 'wheel keeps the world point under the cursor');
        const v = await evaluate(`(() => { const v=document.querySelector('.skill-viewport'),r=v.getBoundingClientRect();return {x:r.x+v.clientWidth/2,y:r.y+40,left:v.scrollLeft}; })()`);
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', buttons: 1 });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: v.x - 120, y: v.y, button: 'left', buttons: 1 });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x - 120, y: v.y, button: 'left', buttons: 0 });
        assert(await evaluate('document.querySelector(".skill-viewport").scrollLeft') > v.left, 'mouse drag pans map');
        await click('[data-tree-action="category"][data-category="lighthouse"]');
        assert.equal(await evaluate('document.querySelector(".skill-tree-screen").dataset.category'), 'lighthouse', 'click after drag works');
        await click('[data-tree-search]');
        await cdp('Input.insertText', { text: 'Мощность' });
        assert.equal(await evaluate('document.querySelectorAll(".skill-node[data-match=true]").length'), 6);
        await evaluate(`document.querySelector('[data-tree-search]').setSelectionRange(1,1)`);
        await cdp('Input.insertText', { text: 'x' });
        assert.equal(await evaluate('document.querySelector("[data-tree-search]").selectionStart'), 2, 'search caret survives rendering');
        assert(await evaluate('!!document.querySelector(".skill-empty")'), 'no-results feedback');
        await evaluate(`const i=document.querySelector('[data-tree-search]');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));const s=document.querySelector('[data-tree-branch]');s.value='lighthouse:hull';s.dispatchEvent(new Event('change',{bubbles:true}));`);
        assert.equal(await evaluate('document.querySelectorAll(".skill-node[data-focused=true]").length'), 16);
        assert.equal(await evaluate('document.querySelectorAll(".skill-node").length'), 200);
        await click('[data-tree-action="category"][data-category="devices"]');
        await click('[data-skill="cannon-damage-1"]');
        await evaluate('skillTreeFixture.fail(true)');
        await click('.skill-purchase-button');
        assert.equal(await evaluate('skillTreeFixture.app.view.profile.resources'), 415, 'failed save does not spend');
        assert(await evaluate('!document.querySelector(".save-error").hidden'), 'save failure is visible');
        await evaluate('skillTreeFixture.fail(false)');
        await click('[data-action="save"]');
        assert.equal(await evaluate('skillTreeFixture.app.view.profile.resources'), 355, 'retry spends once');
        assert.equal(await evaluate('skillTreeFixture.reload().view.profile.purchasedUpgrades.includes("cannon-damage-1")'), true);
        await shot('desktop-purchased');
        const inspectedBalance = await evaluate('skillTreeFixture.app.view.profile.resources');
        const inspectedWrites = await evaluate('skillTreeFixture.writes()');
        await click('[data-skill-target="unlock-cannon"]');
        assert.equal(await evaluate('document.querySelector(".skill-node[aria-pressed=true]").dataset.skill'), 'unlock-cannon', 'prerequisite link reveals its real parent');
        assert.equal(await evaluate('skillTreeFixture.app.view.profile.resources'), inspectedBalance, 'inspecting a prerequisite does not spend');
        assert.equal(await evaluate('skillTreeFixture.writes()'), inspectedWrites, 'inspecting a prerequisite does not save a purchase');
      }
      await click('[data-tree-action="category"][data-category="lenses"]', touch);
      await shot(name + '-lenses');
      assert.equal(await evaluate('document.querySelectorAll(".skill-node").length'), 200);
      assert.equal(await evaluate('document.querySelectorAll(".skill-node[data-focused=true]").length'), 40, name + ': lens focus');
      assert.equal(await evaluate('document.querySelector(".menu-scenery") === window.initialTreeScene'), true, 'shared scenery survives');
      if (name === 'portrait') {
        const pinchPoint = await evaluate(`(() => {const r=document.querySelector('.skill-viewport').getBoundingClientRect();window.pinchCanvas=document.querySelector('.skill-canvas');return {x:r.x+r.width/2,y:r.y+r.height*.35,z:parseInt(document.querySelector('.skill-zoom-controls output').textContent)};})()`);
        await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:pinchPoint.x-30,y:pinchPoint.y},{x:pinchPoint.x+30,y:pinchPoint.y}]});
        await cdp('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:pinchPoint.x-40,y:pinchPoint.y},{x:pinchPoint.x+40,y:pinchPoint.y}]});
        await sleep(120); // Allow Phaser frames to run while both fingers are still down.
        assert(await evaluate('window.pinchCanvas === document.querySelector(".skill-canvas")'), 'pinch does not replace its touch target between frames');
        await cdp('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:pinchPoint.x-50,y:pinchPoint.y},{x:pinchPoint.x+50,y:pinchPoint.y}]});
        await sleep(120);
        assert(await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)') > pinchPoint.z, 'pinch updates the visual scale');
        await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        await sleep(150);
        const committedPinch = await evaluate('parseInt(document.querySelector(".skill-zoom-controls output").textContent)');
        assert(committedPinch > pinchPoint.z, 'pinch scale survives the following render');
        const v = await evaluate(`(() => { const v=document.querySelector('.skill-viewport'),r=v.getBoundingClientRect();return {x:r.x+v.clientWidth/2,y:r.y+90,left:v.scrollLeft}; })()`);
        const direction = v.left > 50 ? 1 : -1;
        await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: v.x, y: v.y }] });
        for (let step = 1; step <= 5; step++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: v.x + direction * step * 25, y: v.y }] }); await sleep(30); }
        await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(150);
        assert(Math.abs(await evaluate('document.querySelector(".skill-viewport").scrollLeft') - v.left) > 20, 'native touch pans map');
        const writes = await evaluate('skillTreeFixture.writes()');
        await cdp('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
        await sleep(150);
        assert.equal(await evaluate('skillTreeFixture.writes()'), writes, 'orientation does not buy or start an attempt');
        assert.equal(await evaluate('document.querySelector(".menu-scenery") === window.initialTreeScene'), true);
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
        await sleep(150);
      }
      await shot(name + '-lenses');
    }
    assert.deepEqual(errors, [], 'browser runtime errors');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ reports, errors }, null, 2));
    console.log(JSON.stringify({ reports, errors }, null, 2));
  } finally { await send('Browser.close').catch(() => {}); socket.close(); await browser.cleanup(); }
})().catch(async error => { console.error(error); await browser.cleanup(); process.exitCode = 1; });
