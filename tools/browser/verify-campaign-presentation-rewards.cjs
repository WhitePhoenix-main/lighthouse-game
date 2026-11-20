const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');

const base = new URL(process.argv[2] || process.env.LIGHTHOUSE_TEST_URL || 'http://127.0.0.1:5198');
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1', 'Use a loopback Vite server');
const mainKey = 'lighthouse.campaign.v1';
const rewardKey = 'lighthouse.campaign.reward-test.v1';
const intro = '[aria-labelledby="campaign-intro-title"]';
const world = '.is-battle .chapter-world-underlay';
const portrait = [390, 844];
const landscape = [844, 390];
const action = name => `[data-action="${name}"]`;
const prep = name => `[data-prep-action="${name}"]`;
const panel = name => `${prep('panel')}[data-panel="${name}"]`;
const begin = (kind, id) => `${action('campaign-reward-start')}[data-reward-kind="${kind}"]${id ? `[data-reward-id="${id}"]` : ''}`;
const finish = result => `${action('campaign-reward-finish')}[data-reward-result="${result}"]`;
const selectReward = id => `${action('campaign-select-reward')}[data-reward-id="${id}"]`;
const exists = selector => `!!document.querySelector(${JSON.stringify(selector)})`;
const numbered = (chapter, count) => Array.from({ length: count }, (_, index) => `${chapter}-${String(index + 1).padStart(2, '0')}`);
const chapters = ['misty-shore', 'far-shore', 'thorn-marsh', 'ashen-cliffs', 'ship-graveyard'];
const wins = [['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05', 'abyss-warden'],
  ['far-shore', 'far-shore-02', 'far-shore-03', 'far-shore-04', 'far-shore-05', 'far-shore-06', 'drowned-captain'],
  [...numbered('thorn-marsh', 7), 'marsh-heart'], [...numbered('ashen-cliffs', 7), 'ash-colossus']];
const fixture = (selectedNightId, wonNightIds, seenCount, purchasedNodeIds = []) => ({
  version: 1, shards: 1000, pearls: 5, purchasedNodeIds, wonNightIds, selectedNightId,
  selectedLensId: 'basic', selectedAbilityId: null, seenIntroIds: chapters.slice(0, seenCount).map(id => `intro-${id}`),
  nextDeviceId: 1, inventory: [], layouts: {}, activeAttempt: null, lastSettled: null, encountered: [], completedNights: wonNightIds.length,
});
const chapterFive = { ...fixture('ship-graveyard-01', wins.flat(), 5, ['unlock-cannon']), nextDeviceId: 2,
  inventory: [{ id: 1, kind: 'cannon', health: 35, consumed: false }] };
const out = path.resolve('test-results', `campaign-presentation-rewards-${Date.now()}-${process.pid}`);
const report = { server: base.origin, browser: 'Headless Chrome, CDP touch, isolated contexts; RU/EN large + reduced motion', scenarios: [],
  notCovered: ['Physical devices, human playtest and audio output; reduced-motion preference was emulated, not an animation audit.',
    'Real ad SDK, production guard (independent check), 24h expiry, storage failures and multi-tab.',
    'Not a complete playthrough: intro UI chapters 1 and 4 only; no audit of every map, atlas tile or cosmetic.'] };
fs.mkdirSync(out, { recursive: true });
const browser = createTestBrowser(out, { gpu: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function observePage() {
  const qa = window.__campaignQa = { sprites: {}, warning: null, audio: { starts: 0, stops: 0, voices: 0 } };
  const canvas = CanvasRenderingContext2D.prototype;
  const originalDraw = canvas.drawImage;
  canvas.drawImage = function (image, ...args) {
    const match = this.canvas.classList?.contains('chapter-world-underlay') && /\/campaign\/(enemies|bosses)\.webp$/.exec(image.src);
    if (match && args.length === 8) qa.sprites[match[1]] = { time: performance.now(), bounds: args.slice(4) };
    return Reflect.apply(originalDraw, this, [image, ...args]);
  };
  const originalText = canvas.fillText;
  canvas.fillText = function (text, ...args) {
    const match = /^(\d+) · (.+) · (\d+\.\d+)\s*([\u0441s])$/u.exec(text);
    if (match) qa.warning = { text, source: Number(match[1]), seconds: Number(match[3]), unit: match[4], font: this.font, time: performance.now() };
    return Reflect.apply(originalText, this, [text, ...args]);
  };
  const originalStop = CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop = function (offset, color) {
    if (color.startsWith('rgba(176, 210, 252,')) qa.moonbeam = color;
    return Reflect.apply(originalStop, this, [offset, color]);
  };
  if (!window.AudioContext) return;
  const originalOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    const oscillator = Reflect.apply(originalOscillator, this, args);
    const start = oscillator.start, stop = oscillator.stop;
    oscillator.start = function (...params) {
      if (new Error().stack?.includes('campaignAmbience')) {
        qa.audio.starts++;
        qa.audio.voices++;
        oscillator.addEventListener('ended', () => qa.audio.voices--, { once: true });
      }
      return Reflect.apply(start, this, params);
    };
    oscillator.stop = function (...params) {
      if (new Error().stack?.includes('campaignAmbience')) qa.audio.stops++;
      return Reflect.apply(stop, this, params);
    };
    return oscillator;
  };
}

async function connect() {
  const chrome = browser.launch();
  let diagnostics = '';
  chrome.on('error', error => { diagnostics += error.message; });
  chrome.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-8000); });
  const portFile = path.join(browser.profilePath, 'DevToolsActivePort');
  let endpoint;
  for (let attempt = 0; attempt < 100 && !endpoint && chrome.exitCode === null; attempt++) {
    if (fs.existsSync(portFile)) {
      const [port, route] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      if (port && route) endpoint = `ws://127.0.0.1:${port}${route}`;
    }
    if (!endpoint) await sleep(100);
  }
  assert(endpoint, `DevTools unavailable: ${diagnostics}`);
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP connect timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('CDP connection failed')); }, { once: true });
  });
  const pending = new Map(), events = new Map();
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return events.get(message.sessionId)?.(message);
    pending.delete(message.id);
    callback(message);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, message => {
        clearTimeout(timer);
        if (message.error) reject(Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  return { socket, send, events };
}

async function scenario(connection, { name, profile, lang = 'ru', size = portrait, reward = false, sound = false }, verify) {
  const url = new URL(reward ? '/?rewardTest=1' : '/', base).href;
  const saveKey = reward ? rewardKey : mainKey;
  const normalSettings = 'lighthouse.settings.v1', testSettings = 'lighthouse.campaign.reward-test.settings.v1';
  const sentinel = JSON.stringify(fixture('first-light', [], 1));
  const result = { name, lang, size, checks: [], findings: [], errors: [], screenshots: [] };
  report.scenarios.push(result);
  const { send, events } = connection;
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  let sessionId, screenshot, evaluate;
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    const cdp = (method, params) => send(method, params, sessionId);
    const mainWrites = [];
    events.set(sessionId, ({ method, params }) => {
      if (method === 'Runtime.exceptionThrown') result.errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === 'Network.responseReceived' && params.response.status >= 400) result.errors.push(`${params.response.status} ${params.response.url}`);
      if (/^DOMStorage\.domStorageItem(?:Added|Updated|Removed)$/.test(method) && params.storageId.isLocalStorage && params.key === mainKey) mainWrites.push(method);
    });
    for (const domain of ['Page', 'Runtime', 'Network', 'DOMStorage']) await cdp(`${domain}.enable`);
    evaluate = async expression => {
      const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
      return response.result.value;
    };
    const wait = async (label, expression, timeout = 12000) => {
      const deadline = Date.now() + timeout;
      do {
        const value = await evaluate(expression);
        if (value) return value;
        await sleep(80);
      } while (Date.now() < deadline);
      throw Error(`Timed out: ${label}`);
    };
    const click = async (selector, index = 0) => {
      const point = await wait(`touch target ${selector} [${index}]`, `(() => {
        const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
        if (!node || node.disabled || node.closest('[inert]')) return false;
        node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
        const rect = node.getBoundingClientRect(), x = Math.round(rect.x+rect.width/2), y = Math.round(rect.y+rect.height/2);
        return node.contains(document.elementFromPoint(x,y)) && {x,y};
      })()`);
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const viewport = async ([width, height]) => {
      const taller = height > width;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true,
        screenOrientation: { type: taller ? 'portraitPrimary' : 'landscapePrimary', angle: taller ? 0 : 90 } });
    };
    screenshot = async label => {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = `${name}-${label}.png`;
      fs.writeFileSync(path.join(out, file), Buffer.from(data, 'base64'));
      result.screenshots.push(file);
    };
    const read = (key = saveKey) => evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
    const save = async () => JSON.parse(await read());
    const check = message => { result.checks.push(message); console.log(`[${name}] ${message}`); };
    const openGame = async seeded => {
      await click(action('game-menu'));
      await wait('game menu ready', 'document.querySelector(".reference-game-menu")?.dataset.ready === "true" && !document.querySelector(".reference-game-menu").inert && !document.querySelector("[data-game-menu-ghost]")');
      await click(action(seeded ? 'continue-game' : 'new-game'));
      await wait('preparation', exists('.preparation-screen'));
    };
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    await viewport(size);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${observePage})()` });
    const settings = { version: 3, language: lang, textSize: 'large', soundEnabled: sound, musicVolume: 50, effectsVolume: 0 };
    const seed = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.href === ${JSON.stringify(url)}) {
      localStorage.setItem(${JSON.stringify(reward ? testSettings : normalSettings)}, ${JSON.stringify(JSON.stringify(settings))});
      ${profile ? `localStorage.setItem(${JSON.stringify(saveKey)}, ${JSON.stringify(JSON.stringify(profile))});` : ''}
      ${reward ? `localStorage.setItem(${JSON.stringify(mainKey)}, ${JSON.stringify(sentinel)});` : ''}
    }` });
    assert.equal((await cdp('Page.navigate', { url })).errorText, undefined);
    await openGame(Boolean(profile));
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier });
    const reload = async () => {
      const timeOrigin = await evaluate('performance.timeOrigin');
      await cdp('Page.reload');
      await wait('new document after reload', `performance.timeOrigin !== ${timeOrigin}`);
      await openGame(true);
    };
    try {
      await verify({ result, evaluate, wait, click, viewport, screenshot, read, save, check, reload });
    } finally {
      if (reward) {
        assert.equal(await read(mainKey), sentinel);
        assert.equal(mainWrites.length, 1, `Main-store writes (including seed): ${mainWrites.join(', ')}`);
        assert.equal(await read(normalSettings), null);
        assert.equal(JSON.parse(await read(testSettings)).language, lang);
      } else assert.equal(await read(rewardKey), null);
      check(reward ? 'Main profile unchanged after seeding; settings isolated.' : 'No reward-test save was made.');
    }
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    result.failure = error.stack;
    try {
      result.failureScreen = await evaluate?.('document.body?.innerText.slice(0,2500)');
      await screenshot?.('failure');
    } catch (captureError) { result.captureError = captureError.message; }
    console.error(`[${name}] ${error.message}`);
  } finally {
    events.delete(sessionId);
    await send('Target.disposeBrowserContext', { browserContextId });
  }
}

async function introImage(qa, chapter, lang, selector = `${intro} img`) {
  const image = await qa.wait(`chapter ${chapter} image`, `(() => {
    const img = document.querySelector(${JSON.stringify(selector)});
    return img?.complete && img.naturalWidth && [img.currentSrc, img.naturalWidth, img.naturalHeight];
  })()`);
  const illustration = selector.startsWith(intro) ? `intro-${chapter}` : 'harbor';
  assert.deepEqual(image, [new URL(`/images/avalon-watch/illustrations/${illustration}.png`, base).href, 384, 192]);
  if (selector.startsWith(intro)) {
    const text = await qa.evaluate(`({ chapter: document.querySelector(${JSON.stringify(`${intro} small`)}).textContent.trim(),
      lang: document.querySelector('.campaign-story-card').lang, size: document.querySelector('.preparation-screen').dataset.textSize,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, horizontalOverflow: document.documentElement.scrollWidth > innerWidth })`);
    assert.deepEqual(text, { chapter: `${lang === 'ru' ? 'Глава' : 'Chapter'} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][chapter - 1]}`, lang, size: 'large', reduced: true, horizontalOverflow: false });
  }
}

async function story(qa) {
  const { result, click, screenshot, wait, viewport, evaluate, save, read, reload, check } = qa;
  const ack = `${intro} ${prep('acknowledge-intro')}`;
  assert.deepEqual((await save()).seenIntroIds, []);
  await introImage(qa, 1, 'ru');
  await screenshot('intro-portrait');
  await viewport(landscape);
  await introImage(qa, 1, 'ru');
  await screenshot('intro-landscape');
  result.assets = await evaluate(`Promise.all(Array.from({length:7}, async (_,index) => {
    const response = await fetch('/images/avalon-watch/illustrations/intro-' + (index + 1) + '.png');
    if (!response.ok || new URL(response.url).origin !== location.origin) throw Error(response.url + ': ' + response.status);
    const image = await createImageBitmap(await response.blob());
    const data = { chapter: index+1, type: response.headers.get('content-type'), width: image.width, height: image.height };
    image.close(); return data;
  }))`);
  assert(result.assets.every(asset => asset.width === 384 && asset.height === 192 && asset.type === 'image/png'));
  check('Seven same-origin PNGs decoded; chapter 1 portrait and landscape (RU large, reduced motion).');
  assert.match(await evaluate(`document.querySelectorAll(${JSON.stringify(ack)})[1]?.textContent.trim()`), /^Пропустить/u);
  await click(ack, 1);
  await wait('closed intro', `!(${exists(intro)})`);
  assert.deepEqual((await save()).seenIntroIds, ['intro-misty-shore']);
  const skipped = await read();
  await reload();
  assert.equal(await evaluate(exists(intro)), false);
  assert.equal(await read(), skipped);
  await click(panel('night'));
  await introImage(qa, 1, 'ru', '.chronicle-coast img');
  await click(prep('replay-intro'));
  await introImage(qa, 1, 'ru');
  await screenshot('chronicle-replay');
  assert.equal(await read(), skipped);
  await click(prep('close-intro-replay'));
  await wait('return to Chronicle', exists('.night-chronicle'));
  assert.equal(await read(), skipped);
  check('Skip persisted; Chronicle replay and return left the save byte-for-byte identical.');
}

async function battle(qa) {
  const { result, wait, click, evaluate, screenshot, viewport, save, check } = qa;
  const lang = result.lang;
  if (lang === 'en') {
    await introImage(qa, 4, 'en');
    await screenshot('intro');
    await click(`${intro} ${prep('acknowledge-intro')}`);
    assert((await save()).seenIntroIds.includes('intro-ashen-cliffs'));
    check('Chapter 4 story in EN large rendered and Continue persisted.');
  }
  await wait('preparation world', 'document.querySelector("[data-prep-world]")?.dataset.worldReady === "true"');
  await click(prep('start'));
  const rendering = `(() => {
    const under = document.querySelector(${JSON.stringify(world)});
    const canvas = document.querySelector('.is-battle .ocean > canvas:not(.chapter-world-underlay)');
    if (under?.dataset.worldReady !== 'true' || under.dataset.campaignArtworkReady !== 'true' || !canvas?.clientWidth) return false;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || gl.isContextLost()) return false;
    return { webgl: gl.getParameter(gl.VERSION), underlay: getComputedStyle(under).zIndex, overlay: getComputedStyle(canvas).zIndex,
      viewport: [innerWidth,innerHeight], canvas: [canvas.clientWidth,canvas.clientHeight], under: [under.clientWidth,under.clientHeight] };
  })()`;
  result.renderer = await wait('live WebGL and world/atlas readiness', rendering);
  assert(Number(result.renderer.overlay) > Number(result.renderer.underlay));
  const attempt = (await save()).activeAttempt;
  assert.equal(attempt.nightId, lang === 'en' ? 'ash-colossus' : 'drowned-captain');
  const [width, height] = lang === 'en' ? portrait : landscape;
  await viewport([width, height]);
  result.rotated = await wait('both canvases after rotate', `(() => {
    const value = ${rendering};
    return value && value.viewport[0] === ${width} && value.viewport[1] === ${height} &&
      value.canvas.every((dimension, index) => Math.abs(dimension-value.under[index])<2) && value;
  })()`);
  assert.deepEqual((await save()).activeAttempt, attempt);
  check('Normal menu route reached WebGL; rotation preserved the attempt.');
  const warning = `(() => {
    const qa = window.__campaignQa, boss = document.querySelector('[data-boss-status]'), timer = qa.warning;
    if (!boss || boss.hidden || !timer || timer.seconds <= 0 || performance.now() - timer.time > 700 || !qa.sprites.bosses) return false;
    const rect = boss.getBoundingClientRect();
    const under = document.querySelector(${JSON.stringify(world)});
    const field = under.getBoundingClientRect();
    const bars = JSON.parse(under.dataset.indicators ?? '[]');
    const barsClear = bars.every(bar => {
      const x = field.left + bar.x, y = field.top + bar.y;
      return x + bar.width <= rect.left || x >= rect.right || y + bar.height <= rect.top || y >= rect.bottom;
    });
    return { timer, text: boss.querySelector('[data-boss-text]').textContent.trim(), fontSize: document.documentElement.dataset.textSize,
      lang: document.documentElement.lang, wave: document.querySelector('[data-phase]').textContent.trim(), sprites: qa.sprites,
      reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, barsClear, barCount: bars.length,
      hudInViewport: rect.left>=-1 && rect.top>=-1 && rect.bottom<=innerHeight+1 && rect.right<=innerWidth+1 };
  })()`;
  result.warning = await wait('warning countdown and boss sprite draw', warning, 45000);
  await screenshot('warning');
  const ticking = await wait('warning countdown ticking', `(() => {
    const next = ${warning};
    return next && next.timer.source === ${result.warning.timer.source} && next.timer.seconds < ${result.warning.timer.seconds} && next;
  })()`);
  result.warningTicking = ticking;
  assert.equal(ticking.lang, lang);
  assert.equal(ticking.fontSize, 'large');
  assert(ticking.reduced && ticking.hudInViewport);
  assert(ticking.barsClear && ticking.barCount > 0, 'Ordinary enemies retain visible health strips beside the boss HUD');
  assert.match(ticking.timer.font, /\b13px\b/);
  assert.match(ticking.text, lang === 'en' ? /^Ash Colossus · Phase/ : /^Затонувший капитан · Фаза/u);
  assert.equal(ticking.timer.unit, lang === 'en' ? 's' : 'с');
  check(`Warning HUD in bounds; canvas countdown ${result.warning.timer.seconds} → ${ticking.timer.seconds} over atlas-backed boss.`);
  result.enemySprite = await wait('live drawImage from campaign enemy atlas', 'window.__campaignQa.sprites.enemies', 15000);
  check('New enemy atlas actually drawn, not just downloaded.');
  if (lang === 'ru') {
    const active = await evaluate('window.__campaignQa.audio');
    if (!active.voices) result.findings.push('Headless Chrome had no observed ambience voices; audio pause not verified.');
    else {
      await click(action('pause'));
      await wait('paused battle', exists('.battle-paused'));
      const paused = await wait('ambience stopped', `(() => {
        const audio = window.__campaignQa.audio; return audio.voices === 0 && audio.stops > ${active.stops} && audio;
      })()`);
      await click(action('resume'));
      const resumed = await wait('ambience resumed', `(() => {
        const audio = window.__campaignQa.audio; return audio.voices > 0 && audio.starts > ${paused.starts} && audio;
      })()`);
      result.audio = { active, paused, resumed };
      check('Pause stopped ambience oscillators; Resume started a new bed.');
    }
  }
}

async function rewardOffers(qa) {
  const { result, click, wait, evaluate, save, screenshot, reload, check } = qa;
  const ledger = async () => (await save()).rewards;
  const last = async () => (await ledger()).operations.at(-1);
  const offer = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.closest('.campaign-offer')?.innerText.trim()`);
  const balances = profile => [profile.shards, profile.pearls];
  const drawerText = () => evaluate('document.querySelector(".prep-drawer").innerText.trim()');
  const cap = async selector => Number(/Remaining in 24 h\s*(\d+)/u.exec(await offer(selector))?.[1]);
  const disabled = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.disabled`);
  const operationSelector = (decision, id) => `${finish(decision)}[data-reward-operation=${JSON.stringify(id)}]`;
  const start = async selector => {
    await click(selector);
    await wait('pending offer', exists(finish('confirmed')));
    const pending = await last();
    assert.equal(pending.status, 'pending');
    assert.equal(await evaluate(exists(operationSelector('confirmed', pending.id))), true);
    return pending;
  };
  const settle = async (decision, expected, id) => {
    await click(operationSelector(decision, id));
    await wait('resolved offer', `!(${exists(finish('confirmed'))})`);
    const operation = await last();
    assert.equal(operation.status, expected);
    assert.equal(operation.id, id);
  };
  const initial = await save();
  const shards = begin('shards');
  await click(panel('shards'));
  const shardOffer = await offer(shards);
  const amount = Number(/\+(\d+)\s*◈/u.exec(shardOffer)?.[1]);
  assert(amount > 0);
  const shardCap = await cap(shards);
  assert(shardCap > 0);
  await screenshot('amount-before-start');
  const dismissed = await start(shards);
  assert.equal(dismissed.amount, amount);
  await settle('dismissed', 'abandoned', dismissed.id);
  assert.deepEqual(balances(await save()), balances(initial));
  assert.equal(await cap(shards), shardCap);
  assert.match(await drawerText(), /Offer canceled/u);
  const unavailable = await start(shards);
  assert.notEqual(unavailable.id, dismissed.id);
  await settle('unavailable', 'abandoned', unavailable.id);
  assert.deepEqual(balances(await save()), balances(initial));
  assert.equal(await cap(shards), shardCap);
  assert.match(await drawerText(), /Video unavailable/u);
  await screenshot('no-video-outcome');
  check(`Offer displays +${amount} shards before start; cancel and no-video leave balances and cap unchanged.`);
  const pending = await start(shards);
  await screenshot('pending-before-reload');
  await reload();
  if (!await evaluate(exists(finish('confirmed')))) await click(panel('shards'));
  await wait('restored operation ID', exists(operationSelector('confirmed', pending.id)));
  assert.deepEqual(await last(), pending);
  assert.deepEqual(balances(await save()), balances(initial));
  await screenshot('pending-after-reload');
  await settle('confirmed', 'confirmed', pending.id);
  assert.equal((await save()).shards, initial.shards + amount);
  await reload();
  await click(panel('shards'));
  assert.equal(await evaluate(exists(finish('confirmed'))), false);
  assert.equal(await cap(shards), shardCap - 1);
  assert.equal((await save()).shards, initial.shards + amount);
  assert.equal((await ledger()).operations.filter(entry => entry.id === pending.id).length, 1);
  check('Reload restored the same pending ID; confirmation credited once across a second reload.');
  await click(`button${prep('close-panel')}`);
  const pearl = begin('pearl');
  await click(panel('pearls'));
  const pearlOffer = await offer(pearl);
  assert.match(pearlOffer, /\+1\s*◎/u);
  await settle('confirmed', 'confirmed', (await start(pearl)).id);
  assert.equal((await save()).pearls, initial.pearls + 1);
  assert.equal(await cap(pearl), 0);
  assert.equal(await disabled(pearl), true);
  await click(`button${prep('close-panel')}`);
  await click('.prep-collection');
  await click(selectReward('dawn-beacon'));
  const collection = begin('collection', 'dawn-beacon');
  const collectionOffer = await offer(collection);
  assert.match(collectionOffer, /\+1 point for Dawn beacon/u);
  await settle('confirmed', 'confirmed', (await start(collection)).id);
  assert.equal((await ledger()).collectionPoints['dawn-beacon'], 1);
  assert(!(await ledger()).unlockedIds.includes('dawn-beacon'));
  assert.equal(await cap(collection), 0);
  assert.equal(await disabled(collection), true);
  result.offers = { shardOffer, shardCap, pearlOffer, collectionOffer, operations: (await ledger()).operations };
  await screenshot('global-cap');
  check('+1 pearl and +1 collection point credited; pearl and global caps disable further offers.');
}

async function ordinaryCollection(qa) {
  const { result, click, wait, evaluate, save, screenshot, reload, check } = qa;
  const claim = id => `${action('campaign-reward-claim')}[data-reward-id="${id}"]`;
  const cosmetic = `${action('campaign-cosmetic')}[data-reward-id="moonbeam"]`;
  await click('.prep-collection');
  await wait('collection', exists('section.campaign-collection'));
  assert.equal(await evaluate('document.querySelector("section.campaign-collection h1").innerText'), 'Collection');
  assert.equal(await evaluate('document.querySelectorAll(".campaign-shelf-slot").length'), 5);
  assert.equal(await evaluate(exists(action('campaign-reward-start'))), false);
  await click(selectReward('siege-cannon'));
  await click(claim('siege-cannon'));
  await click(selectReward('moonbeam'));
  assert.deepEqual(await evaluate(`(() => {
    const claim = document.querySelector(${JSON.stringify(claim('moonbeam'))});
    const bounds = claim.getBoundingClientRect();
    return { lang: document.documentElement.lang, textSize: document.documentElement.dataset.textSize,
      portrait: innerWidth < innerHeight, visible: bounds.height >= 44 && bounds.left >= 0 && bounds.bottom <= innerHeight,
      title: document.querySelector('#campaign-reward-title').textContent.trim() };
  })()`), { lang: 'en', textSize: 'large', portrait: true, visible: true, title: 'Moonbeam' });
  await screenshot('claimable');
  await click(claim('moonbeam'));
  assert((await save()).rewards.unlockedIds.includes('siege-cannon'));
  await click(cosmetic);
  assert.equal((await save()).rewards.equipped.beam, 'moonbeam');
  await screenshot('equipped');
  await click('section.campaign-collection [data-action="back"]');
  await click(panel('devices'));
  const purchase = `${prep('purchase-device')}[data-kind="cannon"][data-variant="siege-cannon"]`;
  assert.equal(await evaluate('document.querySelector(".prep-variant h3")?.innerText'), 'Siege cannon');
  const button = await evaluate(`document.querySelector(${JSON.stringify(purchase)})?.innerText`);
  const cost = Number(/(\d+)\s*◈/u.exec(button)?.[1]);
  assert(cost > 0);
  const before = await save();
  await click(purchase);
  const after = await save();
  assert.equal(after.shards, before.shards - cost);
  assert.equal(after.inventory.length, before.inventory.length + 1);
  assert.equal(after.inventory.at(-1).variantId, 'siege-cannon');
  assert.deepEqual(after.layouts, before.layouts);
  await screenshot('variant-purchased');
  await reload();
  assert.deepEqual(await save(), after);
  await click('.prep-collection');
  await click(selectReward('moonbeam'));
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cosmetic)})?.getAttribute('aria-pressed')`), 'true');
  await click('section.campaign-collection [data-action="back"]');
  await click(prep('start'));
  result.moonbeam = await wait('moonbeam colour painted in battle after reload', 'window.__campaignQa.moonbeam');
  await screenshot('moonbeam-in-battle');
  await click(action('pause'));
  await click(action('confirm-abandon'));
  await click(action('abandon-preparation'));
  await click('.prep-collection');
  await click(selectReward('moonbeam'));
  await click(cosmetic);
  assert.equal((await save()).rewards.equipped.beam, undefined);
  await click(selectReward('dawn-beacon'));
  assert.match(await evaluate('document.querySelector("section.campaign-collection").innerText'), /Video offers are currently unavailable/u);
  check(`Without rewardTest: variant cost ${cost} shards; purchase and equip persisted, Moonbeam painted in battle and could be removed.`);
}

async function main() {
  const connection = await connect();
  try {
    await scenario(connection, { name: 'f-story-ru' }, story);
    await scenario(connection, { name: 'f-battle-ru', sound: true,
      profile: fixture('drowned-captain', wins[0].concat(wins[1].slice(0, -1)), 2) }, battle);
    await scenario(connection, { name: 'f-battle-en', lang: 'en', size: landscape,
      profile: fixture('ash-colossus', wins.slice(0, 3).flat().concat(wins[3].slice(0, -1)), 3) }, battle);
    await scenario(connection, { name: 'g-development-en', lang: 'en', reward: true, profile: chapterFive }, rewardOffers);
    await scenario(connection, { name: 'g-ordinary-en', lang: 'en', profile: chapterFive }, ordinaryCollection);
  } finally {
    await connection.send('Browser.close').catch(() => {});
    connection.socket.close();
  }
}

main().catch(error => {
  report.fatal = error.stack;
  console.error(error);
}).finally(async () => {
  try { await browser.cleanup(); } catch (error) { report.cleanup = { error: error.stack, cause: error.cause?.stack }; }
  const reportPath = path.join(out, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(reportPath);
  if (report.fatal || report.cleanup || report.scenarios.some(entry => entry.status !== 'passed')) process.exitCode = 1;
});
