import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { AVPAuthorizationEngine } from '@verifiedpermissions/authorization-clients-js'
import { workspace } from './app.mjs'
import { dataClient } from './store.mjs'

import { expenseService } from '../expenses/service.mjs'
import { expenseStore } from '../expenses/store.mjs'
const {
  REPORTS_TABLE,
  AWS_REGION,
  USER_POOL_ID,
  CLIENT_ID,
  POLICY_STORE_ID,
  STATE_TABLE,
  AUDIT_TABLE,
} = process.env
const html = (file) =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace('__REGION__', AWS_REGION)
    .replace('__CLIENT_ID__', CLIENT_ID)
const db = dataClient(),
  config = { State: STATE_TABLE, Audit: AUDIT_TABLE, Reports: REPORTS_TABLE }
const engine = new AVPAuthorizationEngine({
  policyStoreId: POLICY_STORE_ID,
  callType: 'isAuthorized',
})
const app = workspace({
  db,
  config,
  engine,
  page: html('index.html'),
  documentPage: html('documents.html'),
  assets: Object.fromEntries(
    [
      ['spend.js', 'text/javascript'],
      ['spend.css', 'text/css'],
    ].map(([p, type]) => ['/' + p, { type, body: readFileSync(join(__dirname, p), 'utf8') }]),
  ),
  expenses: expenseService({ store: expenseStore(db, config), engine }),
  verifier: CognitoJwtVerifier.create({
    userPoolId: USER_POOL_ID,
    clientId: CLIENT_ID,
    tokenUse: 'id',
  }),
})
const [hostname, port] = process.env.AWS_LAMBDA_HTTP_ENDPOINT.split(':')
serve({ fetch: app.fetch, hostname, port: Number(port) })
