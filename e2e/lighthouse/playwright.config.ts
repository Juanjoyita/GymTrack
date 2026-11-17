import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '../tests',
  testMatch: ['respuesta-local.spec.ts', 'rendimiento-500.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: resolve(__dirname, '../../test-results/perf-playwright'),
  reporter: [['list']],
  use: {
    channel: 'chrome',
    baseURL: 'https://localhost:5173',
    viewport: { width: 360, height: 800 },
    ignoreHTTPSErrors: false,
    screenshot: 'only-on-failure',
  },
});
