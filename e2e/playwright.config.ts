import { defineConfig } from '@playwright/test';

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../test-results/e2e',
  reporter: [['list']],
  use: {
    viewport: { width: 360, height: 800 },
    screenshot: 'only-on-failure'
  }
});
