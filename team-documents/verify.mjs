import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { config, trialFolder } from './config.mjs'
import { operator } from './access.mjs'
import { dataClient } from './store.mjs'

const deployment = config()
if (!deployment.ExpiresUTC) throw Error('Run this drill in the temporary stack.')
const { accounts } = JSON.parse(
  readFileSync(trialFolder + '/accounts-' + deployment.Pool + '.json'),
)
const iam = await operator(deployment)
const db = dataClient({ region: deployment.Region })
const cognito = new CognitoIdentityProviderClient({ region: deployment.Region })
const run = randomUUID(),
  username = 'drill-' + run,
  password = 'Aa2!' + randomUUID()
const target = { Username: username, UserPoolId: deployment.Pool }
async function signIn(credentials) {
  const response = await cognito.send(
    new InitiateAuthCommand({
      ClientId: deployment.Client,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: credentials.username, PASSWORD: credentials.password },
    }),
  )
  return response.AuthenticationResult.IdToken
}
async function request(token, ref, status, method = 'GET', revision = 1) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {}
  if (method === 'POST') headers['If-Match'] = '"' + revision + '"'
  const response = await fetch(new URL('api/documents/' + ref, deployment.Url), { method, headers })
  const data = await response.json()
  assert.equal(
    response.status,
    status,
    JSON.stringify({
      ref,
      method,
      status: response.status,
      data,
      requestId: response.headers.get('x-request-id'),
    }),
  )
  assert.ok(response.headers.get('x-request-id'))
  if (status !== 200) assert.equal(data.body, undefined)
  console.log(method, ref, status, response.headers.get('x-request-id'))
  return data
}
let sub, id
try {
  const newUser = await cognito.send(
    new AdminCreateUserCommand({ ...target, MessageAction: 'SUPPRESS' }),
  )
  sub = newUser.User.Attributes.find((v) => v.Name === 'sub').Value
  await cognito.send(
    new AdminSetUserPasswordCommand({ ...target, Password: password, Permanent: true }),
  )
  await iam.set(username, 'design', 'editor', 0, 'Drill: onboard editor')
  const [self, peer, other] = await Promise.all([
    signIn({ username, password }),
    signIn(accounts.ben),
    signIn(accounts.chika),
  ])
  async function draft(token, status) {
    const response = await fetch(new URL('api/documents', deployment.Url), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Release review', body: 'Synthetic drill document.' }),
    })
    const data = await response.json()
    assert.equal(response.status, status, JSON.stringify(data))
    assert.ok(response.headers.get('x-request-id'))
    return data
  }
  await draft(peer, 403)
  id = (await draft(self, 201)).id
  await request(null, id, 401)
  await request(self, id, 200)
  await request(peer, id, 403)
  await request(other, id, 403)
  await request(peer, id, 403, 'POST')
  await request(self, id, 412, 'POST', 99)
  await request(self, id, 200, 'POST')
  await request(peer, id, 200)
  await request(other, id, 403)
  assert.deepEqual(
    (await iam.documentHistory(id)).map((r) => r.operation),
    ['publish', 'create'],
  )
  await iam.set(username, 'design', 'none', 1, 'Drill: offboard with active token')
  await request(self, id, 403)
  await assert.rejects(iam.set(username, 'design', 'editor', 1, 'Stale grant'), /Stale revision/)
  await iam.set(username, 'finance', 'reader', 2, 'Drill: transfer to Finance')
  await request(self, id, 403)
  await request(self, 'forecast', 200)
  const changes = await iam.history(username)
  assert.equal(changes.length, 3)
  assert.deepEqual(changes.map((r) => r.revision).sort(), [1, 2, 3])
  await iam.set(username, 'finance', 'none', 3, 'Drill complete')
  console.log(
    'Publication history, revocation with the same token, transfer and stale operator revision verified.',
  )
} finally {
  if (sub) {
    try {
      await cognito.send(new AdminDeleteUserCommand(target))
    } finally {
      for (const pk of [...(id ? ['DOC#' + id] : []), 'USER#' + sub])
        await db.send(new DeleteCommand({ TableName: deployment.State, Key: { pk } }))
    }
  }
}
