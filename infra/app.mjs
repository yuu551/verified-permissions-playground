import { readFileSync } from 'node:fs'
import { App, Stack, RemovalPolicy, CfnOutput, Duration, Fn, Aws } from 'aws-cdk-lib'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as avp from 'aws-cdk-lib/aws-verifiedpermissions'
import { policies } from '../scripts/page.mjs'

const app = new App()
const stack = new Stack(app, 'VerifiedPermissionsPlayground')
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

function backend(name, directory, runtime, handler, environment) {
  return new lambda.Function(stack, name, {
    code: lambda.Code.fromAsset('build/' + directory),
    runtime,
    handler,
    environment,
    memorySize: 256,
    timeout: Duration.seconds(12),
    logGroup: new logs.LogGroup(stack, name + 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    }),
  })
}
const shell = backend('Web', 'ui', lambda.Runtime.NODEJS_24_X, 'index.handler', {
  CLIENT_ID: client.userPoolClientId,
})
const hono = backend('Hono', 'hono', lambda.Runtime.NODEJS_24_X, 'index.handler', {
  POLICY_STORE_ID: store.attrPolicyStoreId,
})
const fastapi = backend('FastAPI', 'python', lambda.Runtime.PYTHON_3_13, 'handler.handler', {
  POLICY_STORE_ID: store.attrPolicyStoreId,
})
for (const fn of [hono, fastapi])
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['verifiedpermissions:IsAuthorizedWithToken'],
      resources: [store.attrArn],
    }),
  )

function endpoint(fn, protectedRoute) {
  const method = {
    responses: { 200: { description: 'Success' } },
    'x-amazon-apigateway-integration': {
      type: 'aws_proxy',
      httpMethod: 'POST',
      uri: Fn.sub(
        'arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${TargetArn}/invocations',
        { TargetArn: fn.functionArn },
      ),
    },
  }
  if (protectedRoute) {
    method.security = [{ ReaderJWT: [] }]
    method.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
  }
  return { get: method }
}
const api = new apigw.SpecRestApi(stack, 'DocumentApi', {
  cloudWatchRole: false,
  endpointTypes: [apigw.EndpointType.REGIONAL],
  deployOptions: { stageName: 'demo', throttlingRateLimit: 10, throttlingBurstLimit: 20 },
  apiDefinition: apigw.ApiDefinition.fromInline({
    openapi: '3.0.1',
    info: { title: 'Verified Permissions playground', version: '1.0' },
    components: {
      securitySchemes: {
        ReaderJWT: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          'x-amazon-apigateway-authtype': 'jwt',
          'x-amazon-apigateway-authorizer': {
            type: 'jwt',
            identitySource: 'method.request.header.Authorization',
            jwtConfiguration: {
              issuers: [{ issuer: pool.userPoolProviderUrl, audiences: [client.userPoolClientId] }],
              defaultAlgorithms: ['RS256'],
            },
          },
        },
      },
    },
    paths: {
      '/': endpoint(shell, false),
      '/hono/documents/{id}': endpoint(hono, true),
      '/fastapi/documents/{id}': endpoint(fastapi, true),
    },
  }),
})
for (const [fn, path] of [
  [shell, '/'],
  [hono, '/hono/documents/*'],
  [fastapi, '/fastapi/documents/*'],
]) {
  fn.addPermission('ApiGet', {
    principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    sourceArn: api.arnForExecuteApi('GET', path, 'demo'),
  })
}
for (const [name, value] of Object.entries({
  PlaygroundUrl: api.url,
  PoolId: pool.userPoolId,
  ClientId: client.userPoolClientId,
  Region: Aws.REGION,
})) {
  new CfnOutput(stack, name, { value })
}
