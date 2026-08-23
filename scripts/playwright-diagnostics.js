import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

function packageJsonPath(packageName) {
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch {
    try {
      const entryPath = require.resolve(packageName);
      let directory = path.dirname(entryPath);
      while (directory !== path.dirname(directory)) {
        const candidate = path.join(directory, 'package.json');
        try {
          const packageJson = require(candidate);
          if (packageJson.name === packageName) return candidate;
        } catch {
          // Keep walking when a package layout does not expose package.json.
        }
        directory = path.dirname(directory);
      }
    } catch {
      // The package is optional for focused diagnostics tests.
    }
  }
  return null;
}

function packageVersion(packageName) {
  const packagePath = packageJsonPath(packageName);
  if (!packagePath) return 'unavailable';
  try {
    return require(packagePath).version || 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function chromiumDetails() {
  const packagePath = packageJsonPath('playwright-core');
  const details = {
    executablePath: 'unavailable',
    revision: 'unavailable',
  };

  if (!packagePath) return details;

  try {
    const { chromium } = require('playwright-core');
    details.executablePath = chromium.executablePath() || 'unavailable';
  } catch {
    // A missing browser installation is itself useful diagnostic output.
  }

  try {
    const browsers = require(path.join(path.dirname(packagePath), 'browsers.json'));
    details.revision = browsers.browsers.find(browser => browser.name === 'chromium')?.revision || 'unavailable';
  } catch {
    // Older/newer package layouts may not expose browsers.json.
  }

  return details;
}

function defaultBrowserCachePath({ platform = os.platform(), homeDirectory = os.homedir() } = {}) {
  if (platform === 'darwin') return path.join(homeDirectory, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return path.join(process.env.LOCALAPPDATA || homeDirectory, 'ms-playwright');
  return path.join(process.env.XDG_CACHE_HOME || path.join(homeDirectory, '.cache'), 'ms-playwright');
}

function parseWorkerValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`PLAYWRIGHT_WORKERS must be a positive integer; received ${value}`);
  }
  return parsed;
}

function workersFromArgv(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--workers=')) return parseWorkerValue(argument.slice('--workers='.length));
    if (argument === '--workers' || argument === '-w') return parseWorkerValue(argv[index + 1]);
    if (argument.startsWith('-w=')) return parseWorkerValue(argument.slice(3));
  }
  return null;
}

export function resolveWorkerCount({ env = process.env, argv = process.argv } = {}) {
  const cliWorkers = workersFromArgv(argv);
  if (cliWorkers !== null) return { count: cliWorkers, source: 'CLI --workers' };

  const environmentWorkers = parseWorkerValue(env.PLAYWRIGHT_WORKERS);
  if (environmentWorkers !== null) return { count: environmentWorkers, source: 'PLAYWRIGHT_WORKERS' };

  return { count: 1, source: 'default' };
}

export function extractPermissionTarget(errorText = '') {
  const line = String(errorText)
    .split(/\r?\n/)
    .find(candidate => /\b(?:EACCES|EPERM)\b/i.test(candidate));
  if (!line) {
    return String(errorText).match(/--user-data-dir=([^\s]+)/)?.[1] || null;
  }

  const quoted = [...line.matchAll(/["']([^"']+)["']/g)]
    .map(match => match[1])
    .find(value => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value));
  if (quoted) return quoted;

  return line.match(/(?:\/|[A-Za-z]:[\\/])[^\s,;)]+/)?.[0]
    || String(errorText).match(/--user-data-dir=([^\s]+)/)?.[1]
    || null;
}

export function isChromiumLaunchFailure(errorText = '') {
  return /(?:browserType\.launch|failed to launch|launching chromium|chromium|executable|user data dir|EACCES|EPERM|target page, context or browser has been closed)/i.test(errorText);
}

export function collectDiagnostics({
  baseURL,
  port,
  workerCount,
  workerSource = 'unknown',
  command = process.argv.slice(1).join(' '),
  cwd = process.cwd(),
  launchError,
  platform = os.platform(),
  release = os.release(),
  arch = os.arch(),
  nodeVersion = process.version,
  browserCachePath = process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowserCachePath({ platform }),
  chromium = chromiumDetails(),
  portStatus,
} = {}) {
  const errorText = launchError ? String(launchError.message || launchError) : '';
  return {
    command: command || 'unavailable',
    cwd,
    platform,
    release,
    arch,
    nodeVersion,
    playwrightVersion: packageVersion('@playwright/test'),
    chromiumExecutablePath: chromium.executablePath,
    chromiumRevision: chromium.revision,
    browserCachePath,
    browserProfilePath: 'not configured (Playwright-managed ephemeral context per test)',
    tempPath: os.tmpdir(),
    tempEnvironment: [process.env.TMPDIR, process.env.TMP, process.env.TEMP].filter(Boolean).join(', ') || 'not set',
    testDataPath: path.join(cwd, 'test-results'),
    workerCount: workerCount ?? 'unavailable',
    workerSource,
    baseURL: baseURL || 'unavailable',
    port: port ?? 'unavailable',
    portStatus: portStatus || 'not checked',
    sharedProfileCheck: 'passed: no fixed userDataDir configured; Playwright isolation is in use',
    sharedTempCheck: 'passed: no shared persistent browser profile or test temp directory configured',
    permissionTarget: extractPermissionTarget(errorText) || 'not detected',
    launchError: errorText || null,
  };
}

export function formatDiagnostics(diagnostics) {
  const lines = [
    '[playwright-diagnostics] environment',
    `[playwright-diagnostics] command: ${diagnostics.command}`,
    `[playwright-diagnostics] cwd: ${diagnostics.cwd}`,
    `[playwright-diagnostics] os: ${diagnostics.platform} ${diagnostics.release} (${diagnostics.arch})`,
    `[playwright-diagnostics] node: ${diagnostics.nodeVersion}`,
    `[playwright-diagnostics] playwright: @playwright/test ${diagnostics.playwrightVersion}`,
    `[playwright-diagnostics] chromium executable: ${diagnostics.chromiumExecutablePath}`,
    `[playwright-diagnostics] chromium revision: ${diagnostics.chromiumRevision}`,
    `[playwright-diagnostics] browser cache: ${diagnostics.browserCachePath}`,
    `[playwright-diagnostics] browser profile: ${diagnostics.browserProfilePath}`,
    `[playwright-diagnostics] temp path: ${diagnostics.tempPath} (env: ${diagnostics.tempEnvironment})`,
    `[playwright-diagnostics] test data: ${diagnostics.testDataPath}`,
    `[playwright-diagnostics] worker count: ${diagnostics.workerCount} (source: ${diagnostics.workerSource})`,
    `[playwright-diagnostics] base URL: ${diagnostics.baseURL}`,
    `[playwright-diagnostics] port: ${diagnostics.port} (${diagnostics.portStatus})`,
    `[playwright-diagnostics] profile isolation: ${diagnostics.sharedProfileCheck}`,
    `[playwright-diagnostics] temp/test-data isolation: ${diagnostics.sharedTempCheck}`,
  ];

  if (diagnostics.launchError) {
    lines.push(`[playwright-diagnostics] launch error: ${diagnostics.launchError}`);
    lines.push(`[playwright-diagnostics] permission target: ${diagnostics.permissionTarget}`);
  }

  return lines.join('\n');
}

export function formatRecoveryGuidance(diagnostics) {
  if (diagnostics.platform !== 'darwin' || !diagnostics.launchError || !isChromiumLaunchFailure(diagnostics.launchError)) {
    return '';
  }

  return [
    '[playwright-diagnostics] macOS recovery guidance:',
    '[playwright-diagnostics] - Confirm the repository, browser cache, and permission target above are readable/executable by the current user.',
    '[playwright-diagnostics] - For quarantine/signature errors, reinstall the pinned browser with `npx playwright install chromium` and inspect the macOS security prompt or `codesign --verify`; do not disable Gatekeeper, sandboxing, or other security controls.',
    '[playwright-diagnostics] - Retry with a task-owned PLAYWRIGHT_PORT and the default ephemeral Playwright profile; do not reuse or delete a broad profile/cache directory.',
  ].join('\n');
}

export function formatLaunchFailureDiagnostics({ error, ...context } = {}) {
  const diagnostics = collectDiagnostics({ ...context, launchError: error });
  return `${formatDiagnostics(diagnostics)}\n${formatRecoveryGuidance(diagnostics)}`.trim();
}

export function inspectPort(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve({ available: false, error }));
    server.listen({ host, port }, () => {
      server.close(() => resolve({ available: true, error: null }));
    });
  });
}
