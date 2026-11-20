import { parseArgs } from 'node:util'
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { config } from './config.mjs'
import { dataClient, membership, setMembership, history, review } from './store.mjs'

export async function operator(deployment) {
  const region = deployment.Region
  const { Arn: actor } = await new STSClient({ region }).send(new GetCallerIdentityCommand({}))
  const credentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: {
      RoleArn: deployment.Operator,
      RoleSessionName: 'access-' + crypto.randomUUID().slice(0, 8),
    },
  })
  const db = dataClient({ region, credentials })
  const cognito = new CognitoIdentityProviderClient({ region, credentials })
  const storedSubject = /^USER#([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i
  const subject = async (username) => {
    const stored = storedSubject.exec(username)
    if (stored) return stored[1]
    const result = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: deployment.Pool, Username: username }),
    )
    return result.UserAttributes.find((a) => a.Name === 'sub').Value
  }
  return {
    async review(team) {
      return review(db, deployment, team)
    },
    async show(username) {
      return (await membership(db, deployment, await subject(username))) ?? { revision: 0 }
    },
    async set(username, team, role, expected, reason) {
      if (storedSubject.test(username) && (role !== 'none' || expected === 0))
        throw new Error(
          'Use a current Cognito username for a grant. A stored ID can revoke an existing assignment.',
        )
      return setMembership(
        db,
        deployment,
        await subject(username),
        team,
        role,
        expected,
        reason,
        actor,
      )
    },
    async history(username) {
      return history(db, deployment, 'USER#' + (await subject(username)))
    },
    async expenseRole(username, role, expected, reason) {
      if (storedSubject.test(username)) throw Error('Use a current Cognito username')
      const sub = await subject(username),
        m = await membership(db, deployment, sub)
      if (!m || m.role === 'none') throw Error('Grant active membership first')
      return setMembership(db, deployment, sub, m.team, m.role, expected, reason, actor, role)
    },
    async reportHistory(id) {
      return history(db, deployment, 'REPORT#' + id)
    },
    async documentHistory(id) {
      return history(db, deployment, 'DOC#' + id)
    },
  }
}

if (import.meta.main) {
  const {
    values,
    positionals: [command, target],
  } = parseArgs({
    allowPositionals: true,
    options: {
      team: { type: 'string' },
      role: { type: 'string' },
      expect: { type: 'string' },
      reason: { type: 'string' },
    },
  })
  if (
    !target ||
    ![
      'show',
      'set',
      'history',
      'review',
      'expense-role',
      'report-history',
      'document-history',
    ].includes(command)
  )
    throw new Error(
      'Usage: access <show|set|history> USERNAME or access review TEAM or access document-history DOCUMENT',
    )
  const client = await operator(config())
  const result =
    command === 'set'
      ? await client.set(target, values.team, values.role, Number(values.expect), values.reason)
      : command === 'expense-role'
        ? await client.expenseRole(target, values.role, Number(values.expect), values.reason)
        : command === 'report-history'
          ? await client.reportHistory(target)
          : command === 'document-history'
            ? await client.documentHistory(target)
            : await client[command](target)
  console.log(JSON.stringify(result, null, 2))
}
