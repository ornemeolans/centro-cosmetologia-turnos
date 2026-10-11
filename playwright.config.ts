import { defineConfig, devices } from '@playwright/test';

// Puertos propios para E2E (5199 web, 3199 API, 54331 Postgres): no chocan con `npm run dev`.
export const E2E_API = 'http://localhost:3199';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5199',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Base descartable + migraciones + fichas de prueba (apps/api/scripts/e2e-server.ts).
      command: 'npx tsx scripts/e2e-server.ts',
      cwd: 'apps/api',
      url: `${E2E_API}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'npm run dev --workspace apps/web',
      env: { WEB_PORT: '5199', API_TARGET: E2E_API },
      url: 'http://localhost:5199',
      reuseExistingServer: false,
    },
  ],
});
