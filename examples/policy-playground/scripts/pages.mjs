import { build } from 'esbuild'
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { renderPage } from './page.mjs'

mkdirSync('build/pages', { recursive: true })
writeFileSync('build/pages/index.html', renderPage({ mode: 'browser' }))
await build({
  entryPoints: ['web/browser.mjs'],
  outfile: 'build/pages/engine.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
})
copyFileSync(
  new URL('./cedar_wasm_bg.wasm', import.meta.resolve('@cedar-policy/cedar-wasm/web')),
  'build/pages/cedar_wasm_bg.wasm',
)
