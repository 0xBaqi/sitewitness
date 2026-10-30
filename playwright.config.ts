import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://127.0.0.1:3107', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3107',
    url: 'http://127.0.0.1:3107', reuseExistingServer: false, timeout: 120000,
    // No real credentials are inherited by the acceptance server.
    env: { MODEL_API_KEY: '', SITEWITNESS_ACCESS_CODE: '' },
  },
});
