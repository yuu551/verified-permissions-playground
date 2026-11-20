import { readFileSync } from 'node:fs'
import { RemovalPolicy } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as avp from 'aws-cdk-lib/aws-verifiedpermissions'
import { policies } from '../scripts/page.mjs'

export function documentResources(stack) {
  const pool = new cognito.UserPool(stack, 'Readers', {
    selfSignUpEnabled: false,
    signInAliases: { username: true },
    removalPolicy: RemovalPolicy.DESTROY,
  })
  const client = pool.addClient('Browser', {
    generateSecret: false,
    authFlows: { userPassword: true },
  })
  const store = new avp.CfnPolicyStore(stack, 'Documents', {
    validationSettings: { mode: 'STRICT' },
    deletionProtection: { mode: 'DISABLED' },
    schema: { cedarJson: readFileSync(new URL('../policies/schema.json', import.meta.url), 'utf8') },
  })
  new avp.CfnIdentitySource(stack, 'ReaderIdentity', {
    policyStoreId: store.attrPolicyStoreId,
    principalEntityType: 'Demo::User',
    configuration: {
      cognitoUserPoolConfiguration: {
        userPoolArn: pool.userPoolArn,
        clientIds: [client.userPoolClientId],
      },
    },
  })
  for (const [name, statement] of Object.entries(policies)) {
    new avp.CfnPolicy(stack, name, {
      policyStoreId: store.attrPolicyStoreId,
      definition: { static: { statement } },
    })
  }
  return { pool, client, store }
}
