import { mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { config, trialFolder } from './config.mjs'
mkdirSync(trialFolder, { recursive: true, mode: 0o700 })
const previous = existsSync(trialFolder + '/outputs.json') ? config().ExpiresUTC : ''
const expiry = (
  Date.parse(previous) > Date.now() ? previous : new Date(Date.now() + 24 * 3600_000).toISOString()
).slice(0, 19)
execFileSync(
  'cdk',
  [
    'deploy',
    '--app',
    'node team-documents/infra.mjs',
    '--context',
    'trialExpires=' + expiry,
    '--outputs-file',
    trialFolder + '/outputs.json',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
)
