import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, rmSync, renameSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { renderPage } from './page.mjs'

mkdirSync('build', { recursive: true })
await build({
  entryPoints: ['api/hono/handler.mjs'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: 'build/hono/index.js',
  minify: true,
})
mkdirSync('build/ui', { recursive: true })
// CloudFormation supplies these public Cognito settings at runtime.
const html = renderPage({ mode: 'aws', region: '__REGION__', clientId: '__CLIENT_ID__' })
writeFileSync(
  'build/ui/index.js',
  `const page = ${JSON.stringify(html)};
exports.handler = async () => ({
  statusCode: 200, headers: {'Content-Type': 'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},
  body: page.replace('__REGION__', process.env.AWS_REGION).replace('__CLIENT_ID__',process.env.CLIENT_ID)
});`,
)
const python = mkdtempSync('build/python-staging-')
try {
  execFileSync(
    'uv',
    [
      'export',
      '--locked',
      '--no-dev',
      '--no-emit-project',
      '--no-header',
      '--output-file',
      'build/requirements.txt',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  execFileSync(
    'uv',
    [
      'pip',
      'install',
      '--target',
      python,
      '--python-version',
      '3.13',
      '--python-platform',
      'x86_64-manylinux_2_28',
      '--only-binary',
      ':all:',
      '--require-hashes',
      '-r',
      'build/requirements.txt',
    ],
    { stdio: 'inherit' },
  )
  copyFileSync('api/fastapi/handler.py', python + '/handler.py')
  rmSync('build/python', { recursive: true, force: true })
  renameSync(python, 'build/python')
} finally {
  rmSync(python, { recursive: true, force: true })
}
