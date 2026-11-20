import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { config, trialFolder } from './config.mjs'
import { operator } from './access.mjs'
import { dataClient } from './store.mjs'
import { expenseStore } from '../expenses/store.mjs'
import { sampleReports, profiles } from '../expenses/fixtures.mjs'
import { people, sampleDocuments } from './fixtures.mjs'

const deployment = config()
if (!deployment.ExpiresUTC) throw Error('The fixture accounts are for the temporary stack.')
mkdirSync(trialFolder, { recursive: true, mode: 0o700 })
const file = trialFolder + '/accounts-' + deployment.Pool + '.json'
try {
  const suffix = randomUUID()
  const accounts = Object.fromEntries(
    Object.keys(people).map((person) => [
      person,
      {
        username: person + '-' + suffix.slice(0, 8),
        password: 'Aa1!' + randomUUID(),
        marker: person + '-' + suffix,
      },
    ]),
  )
  writeFileSync(
    file,
    JSON.stringify({ url: deployment.Url, expires: deployment.ExpiresUTC, accounts }, null, 2) +
      '\n',
    { flag: 'wx', mode: 0o600 },
  )
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
const { accounts } = JSON.parse(readFileSync(file))
const iam = await operator(deployment)
const pool = new CognitoIdentityProviderClient({ region: deployment.Region })
const db = dataClient({ region: deployment.Region })
const subjects = {}
for (const [person, { username, password, marker }] of Object.entries(accounts)) {
  const target = { UserPoolId: deployment.Pool, Username: username }
  try {
    await pool.send(
      new AdminCreateUserCommand({
        ...target,
        MessageAction: 'SUPPRESS',
        UserAttributes: [{ Name: 'preferred_username', Value: marker }],
      }),
    )
  } catch (error) {
    if (error.name !== 'UsernameExistsException') throw error
  }
  const { UserAttributes, UserStatus } = await pool.send(new AdminGetUserCommand(target))
  if (UserAttributes.find((a) => a.Name === 'preferred_username')?.Value !== marker)
    throw Error('Account ownership mismatch')
  if (UserStatus === 'FORCE_CHANGE_PASSWORD')
    await pool.send(
      new AdminSetUserPasswordCommand({ ...target, Password: password, Permanent: true }),
    )
  subjects[person] = UserAttributes.find((a) => a.Name === 'sub').Value
  if ((await iam.show(username)).revision === 0) {
    const { team, role } = people[person]
    await iam.set(username, team, role, 0, 'Initial trial assignment')
  }
}
const expenses = expenseStore(db, deployment)
for (const [person, a] of Object.entries(accounts)) {
  const m = await iam.show(a.username)
  if (
    !m.expenseRole &&
    m.role === people[person].role &&
    m.team === people[person].team &&
    m.revision === 1
  )
    await iam.expenseRole(
      a.username,
      profiles[person].expenseRole,
      m.revision,
      'Initial expense assignment',
    )
}
const employee = await expenses.member(subjects.alice)
for (const report of sampleReports(subjects)) {
  if (!(await expenses.report(report.id))) await expenses.save(employee, null, report, randomUUID())
}
for (const doc of sampleDocuments(subjects.alice, subjects.chika)) {
  try {
    await db.send(
      new PutCommand({
        TableName: deployment.State,
        Item: { ...doc, pk: 'DOC#' + doc.id, revision: 1 },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    )
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error
  }
}
console.log(
  'Workspace:',
  deployment.Url,
  '\nPrivate sign-in details:',
  file,
  '\nExpires:',
  deployment.ExpiresUTC,
)
