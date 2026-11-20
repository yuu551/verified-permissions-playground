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
  const subject = async (username) => {
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
  if (!target || !['show', 'set', 'history', 'review', 'document-history'].includes(command))
    throw new Error(
      'Usage: access <show|set|history> USERNAME or access review TEAM or access document-history DOCUMENT',
    )
  const client = await operator(config())
  const result =
    command === 'set'
      ? await client.set(target, values.team, values.role, Number(values.expect), values.reason)
      : command === 'document-history'
        ? await client.documentHistory(target)
        : await client[command](target)
  console.log(JSON.stringify(result, null, 2))
}
