import { spawn } from 'node:child_process';
import { preview } from 'vite';

// Serve the exact dist artifact under a project Pages path, with no SPA fallback.
const server = await preview({
  base: '/lighthouse-game/',
  appType: 'mpa',
  preview: { host: '127.0.0.1', port: 0 },
});

try {
  const [url] = server.resolvedUrls.local;
  const response = await fetch(url, { redirect: 'error' });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status} at ${url}`);

  console.log(`Production smoke test at ${url}`);
  await new Promise((resolve, reject) => {
    const browserCheck = spawn(process.execPath, ['tools/browser/verify-battle.cjs', '--gpu', '--production-only'], {
      env: { ...process.env, LIGHTHOUSE_TEST_URL: url },
      stdio: 'inherit',
    });
    browserCheck.once('error', reject);
    browserCheck.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Production battle smoke test failed (${signal ?? `exit ${code}`})`));
    });
  });
} finally {
  await server.close();
}
