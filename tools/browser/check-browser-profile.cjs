const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createTestBrowser } = require('./browser-profile.cjs');

const resultsRoot = path.resolve(__dirname, '../..', 'test-results');
const executable = process.env.LIGHTHOUSE_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browserOptions = { skip: !fs.existsSync(executable), timeout: 20000 };

function fixture(t) {
  fs.mkdirSync(resultsRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(resultsRoot, 'profile-check-'));
  const browser = createTestBrowser(directory);
  const report = path.join(directory, 'report.json');
  fs.writeFileSync(report, '{"evidence":"keep"}');
  t.after(async () => {
    await browser.cleanup();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { browser, directory, report };
}

function endpoint(child) {
  return new Promise((resolve, reject) => {
    let diagnostics = '';
    const timer = setTimeout(() => fail(new Error(`Chrome startup timeout: ${diagnostics}`)), 10000);
    function detach() {
      clearTimeout(timer);
      child.removeListener('error', fail);
      child.removeListener('exit', onExit);
      child.stderr.removeListener('data', onData);
    }
    function fail(error) { detach(); reject(error); }
    function onExit(code) { fail(new Error(`Chrome exited before startup: ${code}: ${diagnostics}`)); }
    function onData(data) {
      diagnostics += data;
      const match = diagnostics.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { detach(); resolve(match[1]); }
    }
    child.once('error', fail);
    child.once('exit', onExit);
    child.stderr.on('data', onData);
  });
}

function closeOverCdp(url, child) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let requested = false;
    const timer = setTimeout(() => {
      child.removeListener('close', onExit);
      socket.close();
      reject(new Error('Browser.close timeout'));
    }, 5000);
    function onExit(code) {
      clearTimeout(timer);
      if (requested && code === 0) resolve();
      else reject(new Error(`Chrome exited before a normal Browser.close: ${code}`));
    }
    child.once('close', onExit);
    socket.addEventListener('open', () => {
      requested = true;
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    socket.addEventListener('error', event => {
      // Chrome may disconnect CDP without a closing handshake after Browser.close.
      if (!requested) {
        clearTimeout(timer);
        child.removeListener('close', onExit);
        reject(event.error || new Error(`CDP WebSocket failed: ${event.message || url}`));
      }
    });
  });
}

test('refuses the results root and directories outside it', () => {
  for (const directory of [resultsRoot, path.resolve(resultsRoot, '..'), `${resultsRoot}-other/run`]) {
    assert.throws(() => createTestBrowser(directory), /inside test-results/);
  }
});

test('cleanup removes only the profile, retains evidence, and is idempotent', async t => {
  const { browser, report } = fixture(t);
  fs.mkdirSync(path.join(browser.profilePath, 'Default', 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(browser.profilePath, 'Default', 'Cache', 'entry'), 'cache');
  await browser.cleanup();
  await browser.cleanup();
  assert.equal(fs.existsSync(browser.profilePath), false);
  assert.equal(fs.readFileSync(report, 'utf8'), '{"evidence":"keep"}');
  assert.throws(() => browser.launch(), /after profile cleanup/);
});

test('cleanup leaves another run and its profile untouched', async t => {
  const first = fixture(t);
  const second = fixture(t);
  fs.mkdirSync(first.browser.profilePath);
  fs.mkdirSync(second.browser.profilePath);
  await first.browser.cleanup();
  assert.equal(fs.existsSync(second.browser.profilePath), true);
  assert.equal(fs.existsSync(second.report), true);
});

test('a failed Chrome spawn still cleans the created profile', async t => {
  const { browser, directory } = fixture(t);
  const previous = process.env.LIGHTHOUSE_BROWSER_PATH;
  let child;
  try {
    process.env.LIGHTHOUSE_BROWSER_PATH = path.join(directory, 'missing-chrome.exe');
    child = browser.launch();
  } finally {
    if (previous === undefined) delete process.env.LIGHTHOUSE_BROWSER_PATH;
    else process.env.LIGHTHOUSE_BROWSER_PATH = previous;
  }
  const error = await new Promise(resolve => child.once('error', resolve));
  assert.equal(error.code, 'ENOENT');
  await browser.cleanup();
  assert.equal(fs.existsSync(browser.profilePath), false);
});

test('normal Browser.close removes a real Chrome profile and keeps the report', browserOptions, async t => {
  const { browser, report } = fixture(t);
  const child = browser.launch();
  await closeOverCdp(await endpoint(child), child);
  await browser.cleanup();
  assert.equal(fs.existsSync(browser.profilePath), false);
  assert.equal(fs.existsSync(report), true);
  assert(child.exitCode !== null || child.signalCode !== null);
});

test('verification failure stops real Chrome, removes its profile, and preserves the error', browserOptions, async t => {
  const { browser, report } = fixture(t);
  const child = browser.launch();
  await assert.rejects(async () => {
    try {
      await endpoint(child);
      throw new Error('Intentional verification failure');
    } finally {
      await browser.cleanup();
    }
  }, /Intentional verification failure/);
  assert.equal(fs.existsSync(browser.profilePath), false);
  assert.equal(fs.existsSync(report), true);
  assert(child.exitCode !== null || child.signalCode !== null);
});
