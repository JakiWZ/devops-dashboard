import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
const FRONTEND_URL = 'http://localhost:5173';

/**
 * Gli E2E girano contro il backend vero (Express + Postgres con i dati del seed). Solo la
 * generazione AI viene intercettata nel test che la riguarda: richiede una chiave Anthropic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Il backend legge DATABASE_URL e JWT_ACCESS_SECRET dall'ambiente (o da backend/.env).
      command: 'npx tsx src/server.ts',
      cwd: '../backend',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !CI,
      env: { PORT: '4000', AUTH_RATE_LIMIT: '1000' },
      stdout: 'ignore',
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: FRONTEND_URL,
      reuseExistingServer: !CI,
    },
  ],
});
