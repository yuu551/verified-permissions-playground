import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
const out = 'build/pages'
mkdirSync(out, { recursive: true })
writeFileSync(
  out + '/index.html',
  readFileSync('team-documents/index.html', 'utf8').replaceAll('__CLIENT_ID__', 'browser-preview'),
)
await build({
  entryPoints: ['team-documents/browser.mjs'],
  outfile: out + '/browser.js',
  format: 'esm',
  platform: 'browser',
  loader: { '.cedar': 'text' },
  bundle: true,
  minify: true,
})
copyFileSync(
  new URL('./cedar_wasm_bg.wasm', import.meta.resolve('@cedar-policy/cedar-wasm/web')),
  out + '/cedar_wasm_bg.wasm',
)
