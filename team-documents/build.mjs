import { build } from 'esbuild'
import { copyFileSync } from 'node:fs'
await build({
  entryPoints: ['team-documents/server.mjs'],
  outfile: 'build/team-documents/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
})
copyFileSync('team-documents/index.html', 'build/team-documents/index.html')
