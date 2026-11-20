import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { AVPAuthorizationEngine } from '@verifiedpermissions/authorization-clients-js'
import { workspace } from './app.mjs'
import { dataClient } from './store.mjs'

const { AWS_REGION, USER_POOL_ID, CLIENT_ID, POLICY_STORE_ID, STATE_TABLE, AUDIT_TABLE } =
  process.env
const page = readFileSync(join(__dirname, 'index.html'), 'utf8')
  .replace('__REGION__', AWS_REGION)
  .replace('__CLIENT_ID__', CLIENT_ID)
const app = workspace({
  db: dataClient(),
  page,
  config: { State: STATE_TABLE, Audit: AUDIT_TABLE },
  verifier: CognitoJwtVerifier.create({
    userPoolId: USER_POOL_ID,
    clientId: CLIENT_ID,
    tokenUse: 'id',
  }),
  engine: new AVPAuthorizationEngine({ policyStoreId: POLICY_STORE_ID, callType: 'isAuthorized' }),
})
const [hostname, port] = process.env.AWS_LAMBDA_HTTP_ENDPOINT.split(':')
serve({ fetch: app.fetch, hostname, port: Number(port) })
