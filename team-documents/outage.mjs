import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { config, trialFolder } from './config.mjs'

// All target identifiers for IAM writes come from the deployed trial, independently of local outputs.
const settings = config()
function aws(...args) {
  return execFileSync(
    'aws',
    [...args, '--region', settings.Region, '--output', 'json', '--no-cli-pager'],
    { encoding: 'utf8' },
  )
}
const [{ Outputs }] = JSON.parse(
  aws(
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    'VerifiedPermissionsTeamDocumentsTrial',
    '--query',
    'Stacks',
  ),
)
const actual = Object.fromEntries(
  Outputs.map(({ OutputKey, OutputValue }) => [OutputKey.replace(/Output$/, ''), OutputValue]),
)
if (
  !actual.ExpiresUTC ||
  Date.parse(actual.ExpiresUTC) <= Date.now() ||
  actual.Url !== settings.Url
)
  throw Error('Select the active trial.')
const { accounts } = JSON.parse(readFileSync(trialFolder + '/accounts-' + actual.Pool + '.json'))
const cognito = new CognitoIdentityProviderClient({ region: actual.Region })
const { AuthenticationResult } = await cognito.send(
  new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: actual.Client,
    AuthParameters: { USERNAME: accounts.alice.username, PASSWORD: accounts.alice.password },
  }),
)
async function waitFor(status) {
  for (let n = 0; n < 45; n++) {
    const res = await fetch(new URL('/api/documents/handbook', actual.Url), {
      headers: { Authorization: 'Bearer ' + AuthenticationResult.IdToken },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === status) {
      const body = await res.json()
      if (status === 503 && 'body' in body) throw Error('Unexpected document disclosure')
      console.log('HTTP', status, 'request', res.headers.get('x-request-id'))
      return
    }
    await delay(2000)
  }
  throw Error('Timed out waiting for HTTP ' + status)
}
await waitFor(200)
const storeArn = JSON.parse(
  aws(
    'verifiedpermissions',
    'get-policy-store',
    '--policy-store-id',
    actual.Store,
    '--query',
    'arn',
  ),
)
const name = 'AvailabilityDrill-' + randomUUID()
const until = new Date(Date.now() + 120000).toISOString()
const deny = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Deny',
      Action: 'verifiedpermissions:IsAuthorized',
      Resource: storeArn,
      Condition: { DateLessThan: { 'aws:CurrentTime': until } },
    },
  ],
}
console.log('Temporary policy', name, 'expires', until)
try {
  aws(
    'iam',
    'put-role-policy',
    '--role-name',
    actual.RuntimeRole,
    '--policy-name',
    name,
    '--policy-document',
    JSON.stringify(deny),
  )
  await waitFor(503)
} finally {
  aws('iam', 'delete-role-policy', '--role-name', actual.RuntimeRole, '--policy-name', name)
}
await waitFor(200)
