import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Los servidores y las factorías E2E nunca usan la base de desarrollo.
process.env.NODE_ENV = 'test';

export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, retries: 0,
  outputDir: '../test-results/e2e',
  reporter: [['list']],
  use: {
    channel: 'chrome',
    baseURL: 'https://localhost:5173',
    viewport: { width: 360, height: 800 },
    ignoreHTTPSErrors: false,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev', cwd: resolve(__dirname, '..'),
    url: 'https://localhost:5173', ignoreHTTPSErrors: false,
    reuseExistingServer: false, timeout: 60000,
    env: { NODE_ENV: 'test' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
