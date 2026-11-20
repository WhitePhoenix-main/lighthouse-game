/* Node 22+; run against Vite with a disposable Chrome profile and native CDP input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestBrowser } = require('./browser-profile.cjs');

const base = process.env.LIGHTHOUSE_TEST_URL || process.argv[2] || 'http://127.0.0.1:5194';
const url = new URL('/', base);
const campaignKey = 'lighthouse.campaign.v1';
const settingsKey = 'lighthouse.settings.v1';
const oldSaveKey = 'lighthouse.save.v1';
const oldSave = JSON.stringify({ version: 6, profile: { resources: 41 } });
const out = path.resolve('test-results', `campaign-${Date.now()}-${process.pid}`);
const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
const menuReady = 'document.querySelector(".reference-game-menu")?.dataset.ready === "true" && !document.querySelector(".reference-game-menu").inert && !document.querySelector("[data-game-menu-ghost]")';
const intro = '[aria-labelledby="campaign-intro-title"]';
const start = '[data-prep-action="start"]';
const prepWorld = '[data-prep-world]';
const battleWorld = '.is-battle .chapter-world-underlay';
const combatCanvas = '.is-battle .ocean > canvas:not(.chapter-world-underlay)';
const upgradeButton = '.campaign-development button[data-action="campaign-purchase"]';
const catalogNode = '.campaign-development [data-campaign-catalog]';

// The first chapter has been won once, leaving the first night selected for replay.
const progressed = {
  version: 1, shards: 1000, pearls: 0, purchasedNodeIds: [],
  wonNightIds: ['first-light', 'broken-shore', 'winged-tide', 'misty-shore-04', 'misty-shore-05', 'abyss-warden'],
  selectedNightId: 'first-light', selectedLensId: 'basic', selectedAbilityId: null,
  seenIntroIds: [], nextDeviceId: 1, inventory: [], layouts: {}, activeAttempt: null, lastSettled: null,
  encountered: [], completedNights: 6,
};
const sealWins = [...progressed.wonNightIds, 'far-shore', 'far-shore-02', 'far-shore-03', 'far-shore-04',
  'far-shore-05', 'far-shore-06', 'drowned-captain'];
const sealProfile = { ...progressed, wonNightIds: sealWins, completedNights: sealWins.length };
const numberedNights = (chapterId, count) => Array.from({ length: count }, (_, index) =>
  `${chapterId}-${String(index + 1).padStart(2, '0')}`);
const ashWins = [...sealWins, ...numberedNights('thorn-marsh', 7), 'marsh-heart', ...numberedNights('ashen-cliffs', 7)];
const fogWins = [...ashWins, 'ash-colossus', ...numberedNights('ship-graveyard', 8), 'evening-knell',
  ...numberedNights('avalon-eclipse', 8), 'fallen-keeper', ...numberedNights('last-dawn', 8)];
const controlBosses = [
  { chapter: 1, introId: 'intro-misty-shore', nightId: 'abyss-warden', mapId: 'headland', wins: progressed.wonNightIds.slice(0, -1),
    language: 'ru', textSize: 'normal', first: portrait, second: landscape, title: 'Страж глубин', warning: 'УДАР ПО МАЯКУ' },
  { chapter: 4, introId: 'intro-ashen-cliffs', nightId: 'ash-colossus', mapId: 'ashen-plateau', wins: ashWins,
    language: 'en', textSize: 'large', first: landscape, second: portrait, title: 'Ash Colossus', warning: 'LIGHTHOUSE STRIKE' },
  { chapter: 7, introId: 'intro-last-dawn', nightId: 'fog-heart', mapId: 'rift-coast', wins: fogWins,
    language: 'ru', textSize: 'large', first: portrait, second: landscape, title: 'Сердце тумана', warning: 'ПРИЗЫВ' },
];

const readRenderer = `(() => {
  const canvas = document.querySelector(${JSON.stringify(combatCanvas)});
  if (!canvas || canvas.clientWidth < 100 || canvas.clientHeight < 100) return null;
  for (const kind of ['webgl2', 'webgl', 'experimental-webgl']) {
    const gl = canvas.getContext(kind);
    if (gl && !gl.isContextLost()) return gl.getParameter(gl.VERSION);
  }
  return null;
})()`;

const installWarningProbe = `(() => {
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
    const match = /^(\\d+) · (.+) · (\\d+\\.\\d+)\\s*[сs]$/u.exec(text);
    if (match) window.__campaignQaWarning = { text, source: Number(match[1]), action: match[2],
      seconds: Number(match[3]), font: this.font };
    return Reflect.apply(original, this, [text, ...args]);
  };
})()`;

fs.mkdirSync(out, { recursive: true });
const browser = createTestBrowser(out, { gpu: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { url: url.href, device: 'Chrome с эмуляцией телефона и касаний', scenarios: [] };
let ws;

async function connect() {
  const chrome = browser.launch();
  let endpoint;
  let diagnostics = '';
  chrome.on('error', error => { diagnostics += error.message; });
  chrome.stderr.on('data', chunk => {
    diagnostics += String(chunk);
    endpoint = diagnostics.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  });
  const portFile = path.join(browser.profilePath, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !endpoint && chrome.exitCode === null; attempt++) {
    if (fs.existsSync(portFile)) {
      const [port, route] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      if (port && route) endpoint = `ws://127.0.0.1:${port}${route}`;
    }
    if (!endpoint) await sleep(100);
  }
  assert(endpoint, `Chrome не открыл DevTools: ${diagnostics || `код выхода ${chrome.exitCode}`}`);
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('WebSocket CDP не открылся')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Error(`Не удалось подключиться к ${endpoint}`)); }, { once: true });
  });
  const pending = new Map();
  const events = new Map();
  let next = 0;
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    const request = pending.get(msg.id);
    if (!request) { events.get(msg.sessionId)?.(msg); return; }
    pending.delete(msg.id);
    clearTimeout(request.timer);
    if (msg.error) request.reject(Error(`${request.method}: ${msg.error.message}`));
    else request.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { send, events };
}

async function verifyBoss({ boss, scenario, wait, layout, click, screenshot, viewport, save, evaluate, started, check, setStage }) {
  const { language, textSize, first, second } = boss;
  scenario.boss = { chapter: boss.chapter, nightId: boss.nightId, mapId: boss.mapId };
  setStage('подготовка выбранного контрольного босса');
  await layout(prepWorld, first);
  const before = await save();
  assert.equal(before.selectedNightId, boss.nightId);
  assert.equal(before.activeAttempt, null);
  assert.deepEqual(started, []);
  const legacySave = `localStorage.getItem(${JSON.stringify(oldSaveKey)})`;
  assert.equal(await evaluate(legacySave), oldSave);
  await screenshot('preparation');

  setStage('запуск босса и обычной волны через WebGL');
  await click(start);
  await layout(battleWorld, first);
  const attempt = (await save()).activeAttempt;
  assert(attempt?.id && Number.isInteger(attempt.seed));
  assert.equal(attempt.nightId, boss.nightId);
  assert.equal(attempt.mapId, boss.mapId);
  scenario.attempt = attempt;
  scenario.renderer = await wait('живого WebGL', readRenderer);
  assert.match(scenario.renderer, /^WebGL/);
  const snapshot = `(() => {
    const hud = document.querySelector('[data-boss-status]');
    if (!hud || hud.hidden) return false;
    const rect = hud.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.left < -1 || rect.right > innerWidth + 1 ||
        rect.top < 0 || rect.bottom > innerHeight || getComputedStyle(hud).visibility !== 'visible') return false;
    const wave = document.querySelector('[data-phase]').textContent.trim();
    const bodies = JSON.parse(document.querySelector(${JSON.stringify(battleWorld)})?.dataset.enemyBodies || '[]');
    if (!/^(WAVES|ВОЛНЫ) [1-9]/iu.test(wave) || !bodies.length) return false;
    return { text: hud.querySelector('[data-boss-text]').textContent.trim(), wave, enemies: bodies.map(body => body.id),
      clock: document.querySelector('[data-timer]').textContent.trim(), language: document.documentElement.lang,
      textSize: document.documentElement.dataset.textSize,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  })()`;
  const assertHud = hud => {
    assert(hud.text.startsWith(`${boss.title} · ${language === 'en' ? 'Phase' : 'Фаза'} 1 · `), hud.text);
    assert.match(hud.text, /\d+\/\d+ HP/);
    assert.match(hud.wave, language === 'en' ? /^WAVES /iu : /^ВОЛНЫ /iu);
    assert.equal(hud.language, language);
    assert.equal(hud.textSize, textSize);
  };
  const opening = await wait('видимого HUD босса и живых врагов обычной волны', snapshot);
  assertHud(opening);
  assert(!opening.text.includes(boss.warning), 'Первая волна зафиксирована до предупреждения и возможного призыва');
  scenario.boss.opening = opening;
  await screenshot('boss-before-rotate');
  check(`Босс и обычная волна одновременно: ${opening.text} / ${opening.wave}`);

  setStage('поворот во время боя и сохранение ID');
  await viewport(second);
  await layout(battleWorld, second);
  scenario.boss.rotated = await wait('HUD босса после поворота', snapshot);
  assertHud(scenario.boss.rotated);
  assert.deepEqual((await save()).activeAttempt, attempt);
  assert.equal(await evaluate(readRenderer), scenario.renderer);
  await screenshot('boss-after-rotate');
  check(`Поворот ${first.width}×${first.height} → ${second.width}×${second.height} не прерывает WebGL-бой`);

  setStage('первое предупреждение босса: HUD, таймер canvas и обычная волна');
  const warningSample = `(() => {
    const hud = ${snapshot};
    const countdown = window.__campaignQaWarning;
    return hud && hud.text.endsWith(' · ' + ${JSON.stringify(boss.warning)}) &&
      countdown?.action === ${JSON.stringify(boss.warning)} && countdown.seconds > 0 && { hud, countdown };
  })()`;
  const warning = await wait(`предупреждения «${boss.warning}» и таймера canvas`, warningSample, 45000);
  scenario.boss.warning = { first: warning };
  assertHud(warning.hud);
  assert.match(warning.countdown.font, textSize === 'large' ? /\b13px\b/ : /\b10px\b/);
  const ticking = await wait('уменьшения таймера canvas для того же источника', `(() => {
    const sample = ${warningSample};
    return sample && sample.countdown.source === ${warning.countdown.source} && sample.countdown.seconds < ${warning.countdown.seconds} && sample;
  })()`);
  scenario.boss.warning.ticking = ticking;
  if (language === 'en' && /с$/u.test(ticking.countdown.text)) {
    (scenario.findings ??= []).push('В английской подписи canvas единица времени остаётся кириллической «с».');
  }
  await screenshot('boss-warning');
  check(`${warning.hud.text}; таймер canvas ${warning.countdown.seconds} → ${ticking.countdown.seconds} с`);

  setStage('целостность изолированного профиля и ошибки браузера');
  assert.deepEqual(await save(), { ...before, activeAttempt: attempt });
  assert.deepEqual([...new Set(started)], [attempt.id]);
  assert.equal(await evaluate(legacySave), oldSave);
  assert.deepEqual(scenario.errors, []);
  check('Сохранена одна попытка; остальной профиль и отдельный legacy-ключ не изменены');
}

async function verify(connection, { name, language, textSize, profile, abilityId = null, first, second, boss, retryProfileRead = false }) {
  const scenario = { name, language, textSize, checks: [], layouts: [], errors: [] };
  report.scenarios.push(scenario);
  let stage = 'создание изолированного контекста Chrome';
  let browserContextId, sessionId, screenshot, evaluate;
  const check = message => { scenario.checks.push(message); console.log(`[${name}] ${message}`); };
  const { send, events } = connection;
  try {
    ({ browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }));
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    const cdp = (method, params) => send(method, params, sessionId);
    events.set(sessionId, ({ method, params }) => {
      if (method === 'Runtime.exceptionThrown') scenario.errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === 'Console.messageAdded' && params.message.level === 'error') scenario.errors.push(params.message.text);
      if (method === 'Network.responseReceived' && params.response.status >= 400) {
        scenario.errors.push(`${params.response.status} ${params.response.url}`);
      }
    });
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Console.enable');
    await cdp('Network.enable');
    await cdp('DOMStorage.enable');

    evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (description, expression, timeout = 12000) => {
      const deadline = Date.now() + timeout;
      let result;
      do {
        result = await evaluate(expression);
        if (result) return result;
        await sleep(80);
      } while (Date.now() < deadline);
      throw Error(`Не дождались: ${description}`);
    };
    const exists = selector => `!!document.querySelector(${JSON.stringify(selector)})`;
    const tap = async point => {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const click = async selector => {
      const point = await wait(`видимой кнопки ${selector}`, `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element || element.disabled || element.closest('[inert]')) return false;
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rect = element.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        return rect.width > 0 && rect.height > 0 && element.contains(document.elementFromPoint(x, y)) && { x, y };
      })()`);
      await tap(point);
    };
    screenshot = async label => {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(out, `${name}-${label}.png`), Buffer.from(data, 'base64'));
    };
    const viewport = async ({ width, height }) => {
      const portrait = width < height;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true,
        screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 } });
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    };
    const layout = async (selector, expected) => {
      const metrics = await wait(`перерисовки ${selector} в ${expected.width}×${expected.height}`, `(() => {
        const canvas = document.querySelector(${JSON.stringify(selector)});
        if (innerWidth !== ${expected.width} || innerHeight !== ${expected.height} || canvas?.dataset.worldReady !== 'true') return false;
        const rect = canvas.getBoundingClientRect();
        const camera = JSON.parse(canvas.dataset.worldCamera);
        if (rect.width < 100 || rect.height < 100 || Math.abs(camera.width - rect.width) > 1 || Math.abs(camera.height - rect.height) > 1) return false;
        return { width: innerWidth, height: innerHeight, worldWidth: rect.width, worldHeight: rect.height, screen: ${JSON.stringify(selector)} };
      })()`);
      scenario.layouts.push(metrics);
    };
    const save = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(campaignKey)}))`);
    const settings = JSON.stringify({ version: 3, language, textSize, soundEnabled: false, musicVolume: 50, effectsVolume: 70 });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.href === ${JSON.stringify(url.href)}) {
      localStorage.setItem(${JSON.stringify(settingsKey)}, ${JSON.stringify(settings)});
      localStorage.setItem(${JSON.stringify(oldSaveKey)}, ${JSON.stringify(oldSave)});
      ${profile ? `localStorage.setItem(${JSON.stringify(campaignKey)}, ${JSON.stringify(JSON.stringify(profile))});` : ''}
      ${boss ? installWarningProbe : ''}
      ${retryProfileRead ? `const originalRead = Storage.prototype.getItem;
        let failOnce = true;
        Storage.prototype.getItem = function(key) {
          if (failOnce && key === ${JSON.stringify(campaignKey)}) {
            failOnce = false;
            throw new Error('Temporary campaign profile read failure');
          }
          return originalRead.call(this, key);
        };` : ''}
    }` });
    const started = [];
    const recordEvent = events.get(sessionId);
    events.set(sessionId, event => {
      recordEvent(event);
      if (['DOMStorage.domStorageItemAdded', 'DOMStorage.domStorageItemUpdated'].includes(event.method)
        && event.params.storageId.isLocalStorage && event.params.key === campaignKey) {
        const attempt = JSON.parse(event.params.newValue).activeAttempt;
        if (attempt) started.push(attempt.id);
      }
    });

    stage = 'новая игра / продолжение из главного меню';
    await viewport(first);
    const navigation = await cdp('Page.navigate', { url: url.href });
    assert.equal(navigation.errorText, undefined, `Chrome не открыл ${url.href}: ${navigation.errorText}`);
    if (retryProfileRead) {
      await click('.save-error:not([hidden]) [data-action="save"]');
      await wait('успешного повторного чтения профиля', 'document.querySelector(".save-error")?.hidden');
    }
    await click('[data-action="game-menu"]');
    await wait('каменного меню выбора игры', menuReady);
    assert.equal((await save())?.selectedNightId ?? null, profile?.selectedNightId ?? null);
    await click(profile ? '[data-action="continue-game"]' : '[data-action="new-game"]');

    if (boss) {
      await verifyBoss({ boss, scenario, wait, layout, click, screenshot, viewport, save, evaluate, started, check,
        setStage: next => { stage = next; } });
      return;
    }

    stage = 'вступление к первой главе';
    await wait('сюжетного вступления', exists(intro));
    const introButtons = `${intro} [data-prep-action="acknowledge-intro"]`;
    const captions = await evaluate(`[...document.querySelectorAll(${JSON.stringify(introButtons)})].map(e => e.textContent.trim())`);
    assert.deepEqual(captions, language === 'ru' ? ['Продолжить', 'Пропустить вступление'] : ['Continue', 'Skip intro']);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(intro + ' p')}).textContent.trim()`), language === 'ru'
      ? 'Я зажёг маяк в ответ на огни за каменным причалом. К берегу уже тянулись твари из тумана. У самой кромки света я увидел щупальце Стража глубин.'
      : 'I lit the lighthouse in answer to the lights beyond the stone pier. Creatures were already emerging from the mist. At the edge of the light I saw a tentacle of the Abyss Warden.');
    assert.deepEqual((await save()).seenIntroIds, []);
    assert.equal((await save()).activeAttempt, null);
    await screenshot('intro');
    await click(`${introButtons}:${profile ? 'first' : 'last'}-of-type`);
    await wait('закрытия вступления', `!(${exists(intro)})`);
    assert.deepEqual((await save()).seenIntroIds, ['intro-misty-shore']);
    check(profile ? '«Continue» закрывает вступление и сохраняет отметку' : '«Новая игра» открывает вступление, пропуск сохраняет отметку');

    stage = 'карта первой ночи и поворот на подготовке';
    await layout(prepWorld, first);
    assert.equal(await evaluate('performance.getEntriesByType("resource").some(entry => entry.name.endsWith("/terrain-coast-irregular-v1.png"))'), false,
      'Campaign preparation must not request the prototype coast PNG');
    const night = await evaluate('document.querySelector(".prep-night-full").textContent');
    assert.match(night, /Туманный берег|Misty Shore/);
    assert.match(night, /Первый свет|First Light/);
    assert.equal((await save()).selectedNightId, 'first-light');
    assert.equal((await save()).activeAttempt, null);
    await screenshot('preparation-before-rotate');
    await viewport(second);
    await layout(prepWorld, second);
    assert.equal((await save()).activeAttempt, null);
    assert.deepEqual(started, []);
    await screenshot('preparation-after-rotate');
    check('Туманный берег и карта первой ночи отрисованы в обеих ориентациях, попытка ещё не создана');

    stage = '256 покупок и фильтр доступных';
    await click('[data-prep-action="development"]');
    await wait('дерева кампании', exists(upgradeButton));
    const nodes = () => evaluate(`[...document.querySelectorAll(${JSON.stringify(catalogNode)})].map(b => ({ id: b.dataset.node, available: b.dataset.available === 'true' }))`);
    const all = await nodes();
    assert.equal(all.length, 256);
    assert.equal(new Set(all.map(node => node.id)).size, 256);
    assert.equal(await evaluate('document.querySelector(".campaign-development h1").textContent'), language === 'ru' ? 'Улучшения' : 'Upgrades');
    assert.equal(await evaluate('document.querySelector(".campaign-development").dataset.textSize'), textSize);
    assert(await evaluate(exists('.campaign-circuit path[data-from="beam-power-1"][data-to="beam-power-2"]')));
    const inspect = id => `.campaign-circuit-node[data-node="${id}"]`;
    await click(inspect('beam-power-2'));
    assert(await evaluate(exists('[data-purchase-heading="beam-power-2"]')));
    assert(await evaluate(exists('.campaign-upgrade-stats dd')));
    await screenshot('upgrade-inspector');
    await viewport(first);
    assert(await evaluate(exists('[data-purchase-heading="beam-power-2"]')), 'Выбранный узел остаётся в карточке после поворота');
    assert(await evaluate(`[...document.querySelectorAll('.campaign-filters button')].every(button => {
      const label = document.createRange(); label.selectNodeContents(button);
      return label.getBoundingClientRect().width <= button.clientWidth + 1;
    })`), 'Подписи фильтров помещаются в свои плашки');
    await screenshot('upgrade-inspector-rotated');
    await viewport(second);
    await click('.campaign-requirements [data-node="beam-power-1"]');
    assert(await evaluate(exists('[data-purchase-heading="beam-power-1"]')));
    const available = '[data-action="campaign-filter"][data-filter="available"]';
    await evaluate(`document.querySelector(${JSON.stringify(available)}).focus()`);
    const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...enter });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
    await wait('активного фильтра доступных узлов', exists(`${available}[aria-pressed="true"]`));
    assert.equal(await evaluate('document.activeElement.dataset.filter'), 'available');
    const filtered = await nodes();
    assert.deepEqual([...filtered].sort((a, b) => a.id.localeCompare(b.id)), all.filter(node => node.available).sort((a, b) => a.id.localeCompare(b.id)));
    if (profile) assert(filtered.length > 0 && filtered.length < all.length);
    else assert.equal(filtered.length, 0);
    await screenshot('available-upgrades');
    check(`Дерево содержит 256 уникальных узлов, доступно к покупке ${filtered.length}`);

    const abilityName = abilityId === 'seal' ? 'Печать' : 'Перегрузка';
    if (abilityId) {
      stage = `покупка способности «${abilityName}»`;
      const unlockId = `ability-${abilityId}-unlock`;
      assert(filtered.some(node => node.id === unlockId));
      await click('[data-focus-key="campaign-catalog"]');
      await click(`${catalogNode}[data-node="${unlockId}"]`);
      assert(await evaluate(exists(`[data-purchase-heading="${unlockId}"]`)));
      await click(`${upgradeButton}[data-node="${unlockId}"]`);
      assert((await save()).purchasedNodeIds.includes(unlockId), 'Покупка должна попасть в сохранение');
      assert.equal(await evaluate('document.activeElement.dataset.filter'), 'available');
    }
    stage = 'панель выбора способности на подготовке';
    await click('.campaign-development [data-action="back"]');
    await wait('возврата на подготовку', exists(prepWorld));
    assert.equal(await evaluate(exists(intro)), false);
    await click('[data-prep-action="panel"][data-panel="ability"]');
    const choices = '[data-prep-action="select-ability"]';
    await wait('списка способностей', exists(choices));
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(choices)}).length`), 6);
    assert(await evaluate(exists(`${choices}[data-ability="none"][aria-pressed="true"]`)));
    if (abilityId) {
      const ability = `${choices}[data-ability="${abilityId}"]`;
      await click(ability);
      await wait(`выбранной способности «${abilityName}»`, exists(`${ability}[aria-pressed="true"]`));
      assert.equal((await save()).selectedAbilityId, abilityId);
      await screenshot('selected-ability');
      check(`Купленная способность «${abilityName}» выбирается в подготовке и сохраняется`);
    } else {
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(`${choices}:disabled`)}).length`), 5);
      check('На чистом профиле пять способностей закрыты, выбран пустой слот');
    }
    await click('button[data-prep-action="close-panel"]');
    assert.equal((await save()).activeAttempt, null);
    assert.deepEqual(started, []);

    stage = 'запуск боя через Phaser WebGL';
    await click(start);
    await layout(battleWorld, second);
    if (retryProfileRead) {
      await wait('боевых атласов кампании после повтора чтения',
        'document.querySelector(".chapter-world-underlay")?.dataset.campaignArtworkReady === "true"');
      check('Повтор чтения профиля восстанавливает кампанию и загрузку боевых атласов');
    }
    const attempt = (await save()).activeAttempt;
    assert(attempt?.id && Number.isInteger(attempt.seed), 'Сохранена одна активная попытка с ID и seed');
    assert.equal(attempt.mapId, 'headland');
    assert.equal(attempt.nightId, 'first-light');
    assert.equal(attempt.abilityId, abilityId);
    scenario.attempt = attempt;
    const renderer = () => evaluate(readRenderer);
    scenario.renderer = await renderer();
    assert.match(scenario.renderer ?? '', /^WebGL/, 'Боевой canvas должен использовать живой контекст WebGL');
    check(`Бой первого берега запущен через ${scenario.renderer}`);
    await screenshot('battle-before-rotate');

    stage = 'поворот в бою и единственная запись попытки';
    await viewport(first);
    await layout(battleWorld, first);
    assert.equal(await renderer(), scenario.renderer);
    assert.deepEqual((await save()).activeAttempt, attempt);
    assert.deepEqual(started, [attempt.id]);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(oldSaveKey)})`), oldSave);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(settingsKey)})`), settings);
    await screenshot('battle-after-rotate');
    check('После поворота сохранена та же попытка, CDP увидел ровно одну запись старта');

    if (abilityId) {
      stage = `применение способности «${abilityName}» и переход на перезарядку`;
      const flash = '[data-action="flash"]';
      scenario.abilityHud = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(flash)});
        return { text: button.textContent.trim(), label: button.getAttribute('aria-label'), title: button.title };
      })()`);
      const status = 'document.querySelector("[data-flash-status]")?.textContent.trim()';
      if (abilityId === 'seal') {
        const aim = async () => {
          await click(flash);
          await wait('режима прицеливания Печати', exists(`${flash}[aria-pressed="true"][data-ability-aim="true"]`));
        };
        stage = 'прицеливание Печати и отмена через Escape';
        await aim();
        const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
        const readyAfterEscape = await wait('готовности Печати после Escape', `
          ${exists(`${flash}[aria-pressed="false"][data-ability-aim="false"]:enabled`)} &&
          /^(READY|ГОТОВА)$/iu.test(${status}) && ${status}`);
        check('Escape отменяет прицеливание Печати, способность остаётся готовой');

        stage = 'повторное прицеливание Печати и касание внутри дальности';
        await aim();
        const target = { x: 80, y: 0 };
        const point = await wait('доступной точки в 80 мировых единицах от маяка', `(() => {
          const canvas = document.querySelector(${JSON.stringify(combatCanvas)});
          const camera = JSON.parse(document.querySelector(${JSON.stringify(battleWorld)}).dataset.worldCamera);
          const bounds = canvas.getBoundingClientRect();
          const x = bounds.left + (camera.x + ${target.x} * camera.zoom) * bounds.width / camera.width;
          const y = bounds.top + camera.y * bounds.height / camera.height;
          return document.elementFromPoint(x, y) === canvas && { x, y };
        })()`);
        await tap(point);
        const cooldown = await wait('положительного таймера Печати после касания', `
          ${exists(`${flash}[aria-pressed="false"][data-ability-aim="false"]:disabled`)} &&
          /^(IN|ЧЕРЕЗ) (?!00:00)\\d{2}:\\d{2}$/iu.test(${status}) && ${status}`);
        scenario.seal = { readyAfterEscape, target, cooldown };
        await screenshot('seal-cooldown');
        check(`Касание в пределах дальности применяет Печать и включает таймер ${cooldown}`);
      } else {
        await click(flash);
        await wait('перезарядки боевой способности', exists(`${flash}:disabled`));
        check(`Боевая кнопка способности «${abilityName}» уходит на перезарядку после касания`);
      }
      assert.deepEqual((await save()).activeAttempt, attempt);
    }
    stage = 'ошибки браузера или загрузки ресурсов';
    assert.deepEqual(scenario.errors, []);
  } catch (error) {
    scenario.failure = { stage, message: error.message };
    try {
      scenario.page = await evaluate?.('({ url: location.href, title: document.title, text: document.body?.innerText.slice(0, 1200) })');
      await screenshot?.('failure');
    } catch (diagnosticError) {
      scenario.failure.diagnostics = diagnosticError.message;
    }
    console.error(`[${name}] ${stage}: ${error.message}`);
  } finally {
    events.delete(sessionId);
    if (browserContextId) await send('Target.disposeBrowserContext', { browserContextId });
  }
}

(async () => {
  try {
    const connection = await connect();
    await verify(connection, { name: 'fresh-ru', language: 'ru', textSize: 'normal', first: portrait, second: landscape, retryProfileRead: true });
    await verify(connection, { name: 'progressed-en', language: 'en', textSize: 'large', profile: progressed, abilityId: 'overload', first: landscape, second: portrait });
    await verify(connection, { name: 'seal-ru', language: 'ru', textSize: 'normal', profile: sealProfile, abilityId: 'seal', first: portrait, second: landscape });
    for (const boss of controlBosses) {
      const profile = { ...progressed, selectedNightId: boss.nightId, seenIntroIds: [boss.introId],
        wonNightIds: boss.wins, completedNights: boss.wins.length };
      await verify(connection, { ...boss, name: `boss-${boss.chapter}-${boss.language}`, profile, boss });
    }
    if (report.scenarios.some(scenario => scenario.failure)) process.exitCode = 1;
    await connection.send('Browser.close');
  } catch (error) {
    report.failure = error.message;
    console.error(error);
    process.exitCode = 1;
  } finally {
    ws?.close();
    try { await browser.cleanup(); }
    catch (error) { report.cleanupError = String(error); console.error(error); process.exitCode = 1; }
    const filename = path.join(out, 'report.json');
    fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
    console.log(filename);
  }
})();
