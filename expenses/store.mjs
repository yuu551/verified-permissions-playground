import {
  GetCommand,
  QueryCommand,
  TransactGetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import { membership } from '../team-documents/store.mjs'
import { scopes } from './model.mjs'
const chunkSize = 192 * 1024
const key = (id) => ({ pk: 'REPORT#' + id, sk: 'DATA' })
export function expenseStore(db, config) {
  const TableName = config.Reports
  return {
    member: (sub) => membership(db, config, sub),
    async report(id) {
      const result = await db.send(
        new GetCommand({ TableName, Key: key(id), ConsistentRead: true }),
      )
      return result.Item?.value
    },
    async list(pk, after) {
      const result = await db.send(
        new QueryCommand({
          TableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ConsistentRead: true,
          Limit: 16,
          ...(after && { ExclusiveStartKey: { pk, sk: after } }),
        }),
      )
      const rows = result.Items.length
        ? await db.send(
            new TransactGetCommand({
              TransactItems: result.Items.map(({ sk }) => ({ Get: { TableName, Key: key(sk) } })),
            }),
          )
        : null
      return {
        reports: rows?.Responses.map((x) => x.Item?.value).filter(Boolean) ?? [],
        after: result.LastEvaluatedKey?.sk ?? null,
      }
    },
    async save(m, old, r, requestId, bytes) {
      const prev = old ? scopes(old) : [],
        next = scopes(r)
      const items = [
        {
          ConditionCheck: {
            TableName: config.State,
            Key: { pk: m.pk },
            ConditionExpression: 'revision = :r',
            ExpressionAttributeValues: { ':r': m.revision },
          },
        },
        {
          Put: {
            TableName,
            Item: { ...key(r.id), revision: r.revision, value: r },
            ...(old
              ? {
                  ConditionExpression: 'revision = :r',
                  ExpressionAttributeValues: { ':r': old.revision },
                }
              : { ConditionExpression: 'attribute_not_exists(pk)' }),
          },
        },
        {
          Put: {
            TableName: config.Audit,
            Item: {
              subject: 'REPORT#' + r.id,
              event: r.updated + '#' + requestId,
              actor: m.pk,
              operation: r.history.at(-1).operation,
              comment: r.history.at(-1).comment,
              revision: r.revision,
              requestId,
            },
            ConditionExpression: 'attribute_not_exists(subject)',
          },
        },
      ]
      for (const pk of prev.filter((k) => !next.includes(k)))
        items.push({ Delete: { TableName, Key: { pk, sk: r.id } } })
      for (const pk of next.filter((k) => !prev.includes(k)))
        items.push({ Put: { TableName, Item: { pk, sk: r.id } } })
      if (bytes) {
        const pk = 'FILE#' + r.id
        for (
          let i = 0;
          i < Math.ceil(Math.max(bytes.length, old?.receipt?.size ?? 0) / chunkSize);
          i++
        ) {
          const sk = String(i)
          if (i * chunkSize < bytes.length)
            items.push({
              Put: {
                TableName,
                Item: {
                  pk,
                  sk,
                  revision: r.receipt.revision,
                  bytes: bytes.slice(i * chunkSize, (i + 1) * chunkSize),
                },
              },
            })
          else items.push({ Delete: { TableName, Key: { pk, sk } } })
        }
      }
      await db.send(new TransactWriteCommand({ TransactItems: items }))
    },
    async receipt(id, meta) {
      const count = Math.ceil(meta.size / chunkSize)
      const result = await db.send(
        new TransactGetCommand({
          TransactItems: Array.from({ length: count }, (_, i) => ({
            Get: { TableName, Key: { pk: 'FILE#' + id, sk: String(i) } },
          })),
        }),
      )
      if (result.Responses.some((x) => x.Item?.revision !== meta.revision)) return null
      return Buffer.concat(result.Responses.map((x) => x.Item.bytes))
    },
  }
}
