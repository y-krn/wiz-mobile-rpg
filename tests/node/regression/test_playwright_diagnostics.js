import assert from 'node:assert/strict';
import {
  collectDiagnostics,
  extractPermissionTarget,
  formatDiagnostics,
  formatLaunchFailureDiagnostics,
  isChromiumLaunchFailure,
  resolveWorkerCount,
} from '../../../scripts/playwright-diagnostics.js';

assert.deepEqual(resolveWorkerCount({ env: {}, argv: ['node', 'playwright'] }), {
  count: 1,
  source: 'default',
});
assert.deepEqual(resolveWorkerCount({ env: { PLAYWRIGHT_WORKERS: '2' }, argv: ['node', 'playwright'] }), {
  count: 2,
  source: 'PLAYWRIGHT_WORKERS',
});
assert.deepEqual(resolveWorkerCount({ env: { PLAYWRIGHT_WORKERS: '2' }, argv: ['node', 'playwright', '--workers=3'] }), {
  count: 3,
  source: 'CLI --workers',
});
assert.equal(extractPermissionTarget("browserType.launch: spawn /Users/test/Library/Caches/ms-playwright/chromium EACCES"), '/Users/test/Library/Caches/ms-playwright/chromium');
assert.equal(extractPermissionTarget("Error: EPERM: operation not permitted, open '/tmp/profile/SingletonLock'"), '/tmp/profile/SingletonLock');
assert.equal(extractPermissionTarget('Permission denied while starting --user-data-dir=/var/folders/task-profile'), '/var/folders/task-profile');
assert.equal(isChromiumLaunchFailure('Failed to launch chromium because the executable is not permitted'), true);

const diagnostics = collectDiagnostics({
  command: 'playwright test --grep @smoke',
  cwd: '/repo',
  platform: 'darwin',
  release: '24.6.0',
  arch: 'arm64',
  nodeVersion: 'v20.0.0',
  baseURL: 'http://127.0.0.1:1234',
  port: 1234,
  workerCount: 2,
  workerSource: 'PLAYWRIGHT_WORKERS',
  browserCachePath: '/Users/test/Library/Caches/ms-playwright',
  chromium: { executablePath: '/Users/test/chromium', revision: '1234567' },
  launchError: new Error("browserType.launch: spawn /Users/test/chromium EACCES"),
});
const formatted = formatLaunchFailureDiagnostics({
  error: new Error("browserType.launch: spawn /Users/test/chromium EACCES"),
  command: diagnostics.command,
  cwd: diagnostics.cwd,
  platform: diagnostics.platform,
  release: diagnostics.release,
  arch: diagnostics.arch,
  nodeVersion: diagnostics.nodeVersion,
  baseURL: diagnostics.baseURL,
  port: diagnostics.port,
  workerCount: diagnostics.workerCount,
  workerSource: diagnostics.workerSource,
  browserCachePath: diagnostics.browserCachePath,
  chromium: { executablePath: '/Users/test/chromium', revision: '1234567' },
});
assert.match(formatted, /worker count: 2 \(source: PLAYWRIGHT_WORKERS\)/);
assert.match(formatted, /chromium revision: 1234567/);
assert.match(formatted, /permission target: \/Users\/test\/chromium/);
assert.match(formatted, /macOS recovery guidance/);
assert.match(formatDiagnostics(diagnostics), /profile isolation: passed/);

console.log('Playwright diagnostics helpers passed');
