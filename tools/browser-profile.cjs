const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const resultsRoot = path.resolve(__dirname, '..', 'test-results');

function waitForExit(exited, timeoutMs) {
  let timer;
  return Promise.race([
    exited.then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

/** Owns only this verification's Chrome processes and its disposable profile. */
function createTestBrowser(artifactDirectory) {
  const directory = path.resolve(artifactDirectory);
  const relative = path.relative(resultsRoot, directory);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Browser artifacts must be in a run directory inside test-results');
  }
  const profilePath = path.join(directory, 'profile');
  const processes = [];
  let cleanupPromise;

  function launch() {
    if (cleanupPromise) throw new Error('Cannot launch Chrome after profile cleanup');
    fs.mkdirSync(profilePath, { recursive: true });
    const child = spawn(process.env.LIGHTHOUSE_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless=new', '--disable-crash-reporter', '--disable-breakpad', '--disable-gpu',
      '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profilePath}`, 'about:blank',
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const exited = new Promise(resolve => {
      child.once('close', resolve);
      child.once('error', resolve);
    });
    processes.push({ child, exited });
    return child;
  }

  async function stop({ child, exited }) {
    // Browser.close normally exits on its own. Await it before touching locked files.
    if (await waitForExit(exited, 1000)) return;
    if (child.exitCode === null && child.signalCode === null && child.pid && process.platform === 'win32') {
      try {
        // Kill only the process tree started by this run, including renderer children.
        await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true, timeout: 5000,
        });
      } catch (error) {
        if (child.exitCode === null && child.signalCode === null) throw error;
      }
    } else if (child.exitCode === null && child.signalCode === null && child.pid) {
      child.kill('SIGKILL');
    }
    if (!await waitForExit(exited, 5000)) throw new Error(`Chrome did not exit: ${child.pid}`);
  }

  function cleanup() {
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        try {
          for (const ownedProcess of processes) await stop(ownedProcess);
          await fs.promises.rm(profilePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
        } catch (error) {
          throw new Error(`Could not clean temporary browser profile: ${profilePath}`, { cause: error });
        } finally {
          process.removeListener('SIGINT', onInterrupt);
          process.removeListener('SIGTERM', onTerminate);
        }
      })();
    }
    return cleanupPromise;
  }

  function exitAfterCleanup(code) {
    cleanup().catch(error => console.error(error)).finally(() => process.exit(code));
  }
  function onInterrupt() { exitAfterCleanup(130); }
  function onTerminate() { exitAfterCleanup(143); }
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  return { profilePath, launch, cleanup };
}

module.exports = { createTestBrowser };
