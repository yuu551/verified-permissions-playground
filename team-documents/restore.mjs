import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  DynamoDBClient,
  DescribeContinuousBackupsCommand,
  RestoreTableToPointInTimeCommand,
  DeleteTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb'
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { config, trialFolder } from './config.mjs'
import { expenseStore } from '../expenses/store.mjs'
import { dataClient, membership, history } from './store.mjs'

const settings = config()
if (!settings.ExpiresUTC) throw Error('Select the temporary stack for the restore drill.')
const ddb = new DynamoDBClient({ region: settings.Region })
const source = [settings.State, settings.Audit, settings.Reports]
const windows = await Promise.all(
  source.map(async (TableName) => {
    const result = await ddb.send(new DescribeContinuousBackupsCommand({ TableName }))
    return result.ContinuousBackupsDescription.PointInTimeRecoveryDescription
  }),
)
const point = new Date(Math.min(...windows.map((w) => w.LatestRestorableDateTime.getTime())) - 1000)
if (windows.some((w) => !w.EarliestRestorableDateTime || w.EarliestRestorableDateTime > point))
  throw Error('Wait for a shared recovery window.')
const suffix = randomUUID()
const copies = source.map(
  (_, i) => 'TeamDocsRestore-' + ['State', 'Audit', 'Reports'][i] + '-' + suffix,
)
const ready = { client: ddb, maxWaitTime: 900, minDelay: 5, maxDelay: 20 }
const created = []
try {
  console.log('Restoring to', point.toISOString())
  for (const [i, SourceTableName] of source.entries()) {
    await ddb.send(
      new RestoreTableToPointInTimeCommand({
        SourceTableName,
        TargetTableName: copies[i],
        RestoreDateTime: point,
      }),
    )
    created.push(copies[i])
    console.log('Temporary copy:', copies[i])
  }
  for (const TableName of created) await waitUntilTableExists(ready, { TableName })
  const { accounts } = JSON.parse(
    readFileSync(trialFolder + '/accounts-' + settings.Pool + '.json'),
  )
  const who = await new CognitoIdentityProviderClient({ region: settings.Region }).send(
    new AdminGetUserCommand({
      UserPoolId: settings.Pool,
      Username: accounts.ben.username,
    }),
  )
  const sub = who.UserAttributes.find((a) => a.Name === 'sub').Value
  const restored = { State: copies[0], Audit: copies[1], Reports: copies[2] },
    db = dataClient({ region: settings.Region })
  const member = await membership(db, restored, sub)
  assert.ok(member, 'Choose a recovery point after the fixture accounts were seeded.')
  const changes = await history(db, restored, 'USER#' + sub)
  const event = changes.find((e) => e.revision === member.revision)
  assert.deepEqual(event?.after, {
    team: member.team,
    role: member.role,
    ...(member.expenseRole && { expenseRole: member.expenseRole }),
  })
  const reports = expenseStore(db, restored)
  const sample = await reports.report('eb010000-0000-4000-8000-000000000001')
  assert.ok(sample, 'Choose a recovery point after the expense fixtures were seeded.')
  let found = false,
    after = null
  do {
    const page = await reports.list('MINE#' + sample.owner, after)
    found = page.reports.some((r) => r.id === sample.id)
    after = page.after
  } while (!found && after)
  assert.ok(found, 'The recovered report must appear in its owner inbox.')
  const events = await history(db, restored, 'REPORT#' + sample.id)
  assert.ok(
    events.some((e) => e.revision === sample.revision),
    'Recovered report and audit must agree.',
  )
  console.log('Restored membership matches its audit revision:', member.revision)
} finally {
  const results = await Promise.allSettled(
    created.map(async (TableName) => {
      await waitUntilTableExists(ready, { TableName })
      await ddb.send(new DeleteTableCommand({ TableName }))
      await waitUntilTableNotExists(ready, { TableName })
      console.log('Removed:', TableName)
    }),
  )
  for (const result of results) if (result.status === 'rejected') throw result.reason
}
