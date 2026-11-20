import { App, Aws, CfnOutput, Duration, RemovalPolicies, Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import { documentResources } from './documents.mjs'

const stack = new Stack(new App(), 'VerifiedPermissionsWebFunction')
// Remove the application log group and CDK's code-copy log group with the sample.
RemovalPolicies.of(stack).destroy({ applyToResourceTypes: ['AWS::Logs::LogGroup'] })
const { pool, client, store } = documentResources(stack)
const server = new lambda.WebFunction(stack, 'Hono', {
  runtime: lambda.WebFunctionRuntime.NODEJS_24_X,
  code: lambda.WebFunctionCode.fromAssetToManagedBucket('build/web-function'),
  defaultEndpointAuth: lambda.WebFunctionAuthType.APPLICATION_MANAGED,
  defaultEndpoint: { maxEnvironments: 2 },
  timeout: Duration.seconds(15),
  logGroup: new logs.LogGroup(stack, 'HonoLogs', {
    retention: logs.RetentionDays.ONE_WEEK,
  }),
  environment: {
    POLICY_STORE_ID: store.attrPolicyStoreId,
    USER_POOL_ID: pool.userPoolId,
    CLIENT_ID: client.userPoolClientId,
  },
})
server.addToRolePolicy(new iam.PolicyStatement({
  actions: ['verifiedpermissions:IsAuthorizedWithToken'],
  resources: [store.attrArn],
}))

for (const [name, value] of Object.entries({
  PlaygroundUrl: 'https://' + server.endpoint.domainName + '/',
  PoolId: pool.userPoolId,
  ClientId: client.userPoolClientId,
  Region: Aws.REGION,
})) {
  new CfnOutput(stack, name, { value })
}
