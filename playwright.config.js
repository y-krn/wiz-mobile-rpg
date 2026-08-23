import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import {
  collectDiagnostics,
  formatDiagnostics,
  resolveWorkerCount,
} from './scripts/playwright-diagnostics.js';

const projectPath = fileURLToPath(new URL('.', import.meta.url));
const defaultPort = 10000 + (createHash('sha256').update(projectPath).digest().readUInt32BE(0) % 10000);
const port = process.env.PLAYWRIGHT_PORT || defaultPort;
const baseURL = `http://127.0.0.1:${port}`;
const worker = resolveWorkerCount();
const preflightScript = fileURLToPath(new URL('./scripts/playwright-preflight.js', import.meta.url));

if (!process.argv.some(argument => argument.includes('workerProcessEntry'))) {
  console.error(formatDiagnostics(collectDiagnostics({
    baseURL,
    port,
    workerCount: worker.count,
    workerSource: worker.source,
  })));
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: worker.count,
  reporter: [['list'], ['./scripts/playwright-diagnostics-reporter.js']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node "${preflightScript}" ${port} && npx vite --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
