import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactGetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'

export function dataClient(config = {}) {
  return DynamoDBDocumentClient.from(new DynamoDBClient(config))
}

export function conflict(error) {
  return (
    error.name === 'TransactionCanceledException' &&
    error.CancellationReasons?.some(
      (r) => r.Code === 'ConditionalCheckFailed' || r.Code === 'TransactionConflict',
    )
  )
}

export async function snapshot(db, state, sub, id) {
  const keys = ['USER#' + sub, 'DOC#' + id]
  const result = await db.send(
    new TransactGetCommand({
      TransactItems: keys.map((pk) => ({ Get: { TableName: state, Key: { pk } } })),
    }),
  )
  return { member: result.Responses[0].Item, doc: result.Responses[1].Item }
}

function record(table, subject, fields) {
  const event = new Date().toISOString() + '#' + randomUUID()
  return {
    Put: {
      TableName: table,
      Item: { subject, event, ...fields },
      ConditionExpression: 'attribute_not_exists(subject)',
    },
  }
}

export async function publish(db, config, member, doc, requestId) {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: config.State,
            Key: { pk: member.pk },
            ConditionExpression: 'revision = :r',
            ExpressionAttributeValues: { ':r': member.revision },
          },
        },
        {
          Update: {
            TableName: config.State,
            Key: { pk: doc.pk },
            ConditionExpression: 'revision = :r AND published = :no',
            UpdateExpression: 'SET published = :yes, revision = :next',
            ExpressionAttributeValues: {
              ':r': doc.revision,
              ':next': doc.revision + 1,
              ':no': false,
              ':yes': true,
            },
          },
        },
        record(config.Audit, doc.pk, {
          operation: 'publish',
          actor: member.pk,
          requestId,
          revision: doc.revision + 1,
        }),
      ],
    }),
  )
}

export async function createDraft(db, config, member, doc, requestId) {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: config.State,
            Key: { pk: member.pk },
            ConditionExpression: 'revision = :r',
            ExpressionAttributeValues: { ':r': member.revision },
          },
        },
        {
          Put: {
            TableName: config.State,
            Item: doc,
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        record(config.Audit, doc.pk, {
          operation: 'create',
          actor: member.pk,
          requestId,
          revision: 1,
        }),
      ],
    }),
  )
}

export async function membership(db, config, sub) {
  const { Item } = await db.send(
    new GetCommand({
      TableName: config.State,
      Key: { pk: 'USER#' + sub },
      ConsistentRead: true,
    }),
  )
  return Item
}

export async function setMembership(
  db,
  config,
  sub,
  team,
  role,
  expected,
  reason,
  actor,
  expenseRole,
) {
  if (
    typeof team !== 'string' ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(team) ||
    !['reader', 'editor', 'none'].includes(role)
  )
    throw new Error('Use a team slug and one of reader, editor or none.')
  if (!Number.isSafeInteger(expected) || expected < 0 || !reason?.trim() || reason.length > 240)
    throw new Error('Supply the current revision and a change reason (1–240 characters).')
  const previous = await membership(db, config, sub)
  if ((previous?.revision ?? 0) !== expected)
    throw new Error('Stale revision. Read the membership again.')
  if (expenseRole && (!['employee', 'manager', 'finance'].includes(expenseRole) || role === 'none'))
    throw Error('Invalid expense assignment')
  const assignment =
    expenseRole ?? (team === previous?.team && role !== 'none' ? previous?.expenseRole : undefined)
  const next = {
    ...(assignment && { expenseRole: assignment }),
    pk: 'USER#' + sub,
    revision: expected + 1,
    team,
    role,
    ...(role !== 'none' && { roster: team }),
  }
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.State,
            Item: next,
            ...(expected === 0
              ? { ConditionExpression: 'attribute_not_exists(pk)' }
              : {
                  ConditionExpression: 'revision = :r',
                  ExpressionAttributeValues: { ':r': expected },
                }),
          },
        },
        record(config.Audit, next.pk, {
          operation: 'membership',
          actor,
          reason: reason.trim(),
          before: previous
            ? {
                team: previous.team,
                role: previous.role,
                ...(previous.expenseRole && { expenseRole: previous.expenseRole }),
              }
            : null,
          after: { team, role, ...(assignment && { expenseRole: assignment }) },
          revision: next.revision,
        }),
      ],
    }),
  )
  return next
}

export async function history(db, config, subject) {
  const { Items } = await db.send(
    new QueryCommand({
      TableName: config.Audit,
      ConsistentRead: true,
      KeyConditionExpression: 'subject = :s',
      ExpressionAttributeValues: { ':s': subject },
      Limit: 50,
      ScanIndexForward: false,
    }),
  )
  return Items
}

export async function review(db, config, team) {
  const members = []
  let cursor
  do {
    const result = await db.send(
      new QueryCommand({
        TableName: config.State,
        IndexName: 'ByTeam',
        KeyConditionExpression: 'roster = :team',
        ExpressionAttributeValues: { ':team': team },
        ExclusiveStartKey: cursor,
      }),
    )
    members.push(...result.Items)
    cursor = result.LastEvaluatedKey
  } while (cursor)
  return members
}
