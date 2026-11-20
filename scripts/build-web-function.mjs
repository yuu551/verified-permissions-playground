import { writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { renderPage } from './page.mjs'

await build({
  entryPoints: ['api/hono/web-function.mjs'],
  outfile: 'build/web-function/index.js',
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  bundle: true,
  minify: true,
})
writeFileSync('build/web-function/index.html', renderPage({
  mode: 'webFunction', region: '__REGION__', clientId: '__CLIENT_ID__',
}))
