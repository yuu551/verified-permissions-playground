import { defineConfig } from '@playwright/test'
const live = process.env.TEAM_LIVE === '1'
const hosted = process.env.TEAM_PREVIEW_URL
export default defineConfig({
  testDir: 'team-documents/test',
  testMatch: [live ? 'live.spec.mjs' : 'browser.spec.mjs', 'expenses.spec.mjs'],
  workers: 1,
  use: {
    baseURL: hosted ?? 'http://127.0.0.1:4173/',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer:
    live || hosted
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://127.0.0.1:4173/',
          reuseExistingServer: !process.env.CI,
        },
})
