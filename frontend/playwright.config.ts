import { defineConfig } from '@playwright/test';
export default defineConfig({
  workers: 1,
  timeout: 60000,
  testDir: './e2e', use: {baseURL:process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',trace:'retain-on-failure'},
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
});
