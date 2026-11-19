import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

const outputs = process.env.PLAYGROUND_AWS_OUTPUTS
const hosted = process.env.PLAYGROUND_PREVIEW_URL
const pages = process.env.PLAYGROUND_PAGES_TEST === '1'
const localURL = pages ? 'http://127.0.0.1:4174/' : 'http://127.0.0.1:4173/'
const baseURL = outputs
  ? JSON.parse(readFileSync(outputs, 'utf8')).VerifiedPermissionsPlayground.PlaygroundUrl
  : hosted || localURL

export default defineConfig({
  testDir: 'test',
  testMatch: 'ui.spec.mjs',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    screenshot: 'off',
    trace: 'off',
  },
  webServer:
    outputs || hosted
      ? undefined
      : {
          command: pages
            ? 'python3 -m http.server 4174 --directory build/pages --bind 127.0.0.1'
            : 'npm run dev',
          url: localURL,
          reuseExistingServer: !process.env.CI,
        },
})
