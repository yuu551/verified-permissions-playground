import { randomUUID } from 'node:crypto'
import { readDeployment } from './deployment.mjs'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider'

export async function createReader(outputs) {
  const username = 'reader-' + randomUUID().slice(0, 8)
  const password = 'Aa1!' + randomUUID()
  const cognito = new CognitoIdentityProviderClient({ region: outputs.Region })
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: outputs.PoolId,
        Username: username,
        MessageAction: 'SUPPRESS',
      }),
    )
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: outputs.PoolId,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    )
    return { username, password }
  } finally {
    cognito.destroy()
  }
}

if (import.meta.main) {
  const outputs = readDeployment(process.argv[2] ?? 'cdk-outputs.json')
  const reader = await createReader(outputs)
  console.log(
    'Open',
    outputs.PlaygroundUrl,
    '\nUsername:',
    reader.username,
    '\nPassword:',
    reader.password,
  )
}
