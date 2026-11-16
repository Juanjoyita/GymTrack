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
  webServer: [
    {
      command: 'npm run dev --workspace @gymtrack/backend', cwd: resolve(__dirname, '..'),
      port: 3000, reuseExistingServer: false, timeout: 60000,
      env: { NODE_ENV: 'test' },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'node ../node_modules/vite/bin/vite.js preview --host localhost --port 5173 --strictPort',
      cwd: resolve(__dirname, '../frontend'),
      url: 'https://localhost:5173', ignoreHTTPSErrors: false,
      reuseExistingServer: false, timeout: 60000,
      env: { NODE_ENV: 'test' },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
