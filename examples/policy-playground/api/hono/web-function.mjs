import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { FetchError, JwksValidationError } from 'aws-jwt-verify/error'
import { Hono } from 'hono'
import { bearerTokenPrincipal } from 'hono-verified-permissions'
import { cloudApp } from './cloud.mjs'

const app = new Hono()
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  clientId: process.env.CLIENT_ID,
  tokenUse: 'id',
})
// index.html sits next to the bundled CommonJS entry point in the deployment ZIP.
const page = readFileSync(join(__dirname, 'index.html'), 'utf8')
  .replace('__REGION__', process.env.AWS_REGION)
  .replace('__CLIENT_ID__', process.env.CLIENT_ID)

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})
app.get('/', (c) => c.html(page))
app.use('/hono/documents/*', async (c, next) => {
  const token = bearerTokenPrincipal(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    await verifier.verify(token.id)
  } catch (error) {
    if (error instanceof FetchError || error instanceof JwksValidationError)
      return c.json({ error: 'Identity provider unavailable' }, 503)
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})
app.route('/', cloudApp(process.env.POLICY_STORE_ID))

const [hostname, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? '127.0.0.1:3000').split(':')
serve({ fetch: app.fetch, hostname, port: Number(port) })
