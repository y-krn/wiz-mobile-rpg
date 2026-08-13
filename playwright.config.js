import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const projectPath = fileURLToPath(new URL('.', import.meta.url));
const defaultPort = 10000 + (createHash('sha256').update(projectPath).digest().readUInt32BE(0) % 10000);
const port = process.env.PLAYWRIGHT_PORT || defaultPort;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx vite --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
