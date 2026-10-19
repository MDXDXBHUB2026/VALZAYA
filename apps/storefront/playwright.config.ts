import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const STORE_PORT = PORT + 1;
export const storeURL = `http://localhost:${STORE_PORT}`;

/**
 * E2E runs against a production build with the in-memory waitlist backend
 * (STOREFRONT_DATA=memory), so CI needs no database credentials. Database behaviour itself is
 * covered by supabase/tests/database/rls.test.sql.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Build once (`pnpm test:e2e` runs `next build` first), then serve the same build twice:
  // waitlist mode on PORT and store mode (STOREFRONT_STORE_OPEN=true) on PORT + 1.
  webServer: [
    {
      command: `pnpm exec next start --port ${PORT}`,
      url: `${baseURL}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { STOREFRONT_DATA: 'memory', NEXT_PUBLIC_SITE_URL: baseURL },
    },
    {
      command: `pnpm exec next start --port ${STORE_PORT}`,
      url: `${storeURL}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        STOREFRONT_DATA: 'memory',
        STOREFRONT_STORE_OPEN: 'true',
        NEXT_PUBLIC_SITE_URL: storeURL,
      },
    },
  ],
});
