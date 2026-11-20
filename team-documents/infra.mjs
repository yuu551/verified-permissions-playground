import { readFileSync } from 'node:fs'
import { App, Aws, Stack, Duration, CfnOutput, RemovalPolicy, RemovalPolicies } from 'aws-cdk-lib'
import * as avp from 'aws-cdk-lib/aws-verifiedpermissions'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as trail from 'aws-cdk-lib/aws-cloudtrail'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cw from 'aws-cdk-lib/aws-cloudwatch'
import * as ddb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'

const app = new App()
const expiry = app.node.tryGetContext('trialExpires')
if (expiry && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(expiry))
  throw new Error('Invalid UTC trial expiry')
const stack = new Stack(
  app,
  expiry ? 'VerifiedPermissionsTeamDocumentsTrial' : 'VerifiedPermissionsTeamDocuments',
  { terminationProtection: !expiry },
)
const removalPolicy = expiry ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN
if (expiry) RemovalPolicies.of(stack).destroy({ applyToResourceTypes: ['AWS::Logs::LogGroup'] })
const pool = new cognito.UserPool(stack, 'Accounts', {
  selfSignUpEnabled: false,
  deletionProtection: !expiry,
  removalPolicy,
})
const client = pool.addClient('Workspace', {
  generateSecret: false,
  authFlows: { userPassword: true },
  idTokenValidity: Duration.minutes(15),
})
function table(name, partition, sort) {
  return new ddb.Table(stack, name, {
    partitionKey: { name: partition, type: ddb.AttributeType.STRING },
    ...(sort && { sortKey: { name: sort, type: ddb.AttributeType.STRING } }),
    billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    removalPolicy,
    deletionProtection: !expiry,
    pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  })
}
const state = table('State', 'pk')
state.addGlobalSecondaryIndex({
  indexName: 'ByTeam',
  partitionKey: { name: 'roster', type: ddb.AttributeType.STRING },
  sortKey: { name: 'pk', type: ddb.AttributeType.STRING },
  projectionType: ddb.ProjectionType.INCLUDE,
  nonKeyAttributes: ['role', 'revision'],
})
const audit = table('Audit', 'subject', 'event')
const reports = table('Reports', 'pk', 'sk')
const archive = new s3.Bucket(stack, 'TrailArchive', {
  enforceSSL: true,
  versioned: true,
  removalPolicy,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  autoDeleteObjects: !!expiry,
})
const changes = new trail.Trail(stack, 'DataChanges', {
  bucket: archive,
  isMultiRegionTrail: false,
  includeGlobalServiceEvents: false,
  enableFileValidation: true,
})
changes.node.defaultChild.addPropertyDeletionOverride('EventSelectors')
changes.node.defaultChild.addPropertyOverride('AdvancedEventSelectors', [
  {
    Name: 'Document and membership writes',
    FieldSelectors: [
      { Field: 'eventCategory', Equals: ['Data'] },
      { Field: 'resources.type', Equals: ['AWS::DynamoDB::Table'] },
      { Field: 'resources.ARN', Equals: [state.tableArn, audit.tableArn, reports.tableArn] },
      { Field: 'readOnly', Equals: ['false'] },
    ],
  },
])
const read = (file) => readFileSync(new URL('./policies/' + file, import.meta.url), 'utf8')
const expense = (file) =>
  readFileSync(new URL('../expenses/policies/' + file, import.meta.url), 'utf8')
const store = new avp.CfnPolicyStore(stack, 'PolicyStore', {
  validationSettings: { mode: 'STRICT' },
  deletionProtection: { mode: expiry ? 'DISABLED' : 'ENABLED' },
  schema: {
    cedarJson: JSON.stringify({
      ...JSON.parse(read('schema.json')),
      ...JSON.parse(expense('schema.json')),
    }),
  },
})
store.applyRemovalPolicy(removalPolicy)
for (const name of ['boundary', 'read', 'publish']) {
  const policy = new avp.CfnPolicy(stack, name, {
    policyStoreId: store.attrPolicyStoreId,
    definition: { static: { statement: read(name + '.cedar'), description: name } },
  })
  policy.applyRemovalPolicy(removalPolicy)
}
for (const name of ['owner', 'author', 'manager', 'finance', 'settle']) {
  const policy = new avp.CfnPolicy(stack, 'Expense' + name, {
    policyStoreId: store.attrPolicyStoreId,
    definition: { static: { statement: expense(name + '.cedar'), description: 'Expense ' + name } },
  })
  policy.applyRemovalPolicy(removalPolicy)
}
const log = new logs.LogGroup(stack, 'Requests', {
  retention: logs.RetentionDays.ONE_MONTH,
  removalPolicy,
})
const server = new lambda.WebFunction(stack, 'WorkspaceServer', {
  runtime: lambda.WebFunctionRuntime.NODEJS_24_X,
  code: lambda.WebFunctionCode.fromAssetToManagedBucket('build/team-documents'),
  defaultEndpointAuth: lambda.WebFunctionAuthType.APPLICATION_MANAGED,
  defaultEndpoint: { maxEnvironments: 4 },
  logGroup: log,
  timeout: Duration.seconds(15),
  environment: {
    REPORTS_TABLE: reports.tableName,
    STATE_TABLE: state.tableName,
    AUDIT_TABLE: audit.tableName,
    USER_POOL_ID: pool.userPoolId,
    CLIENT_ID: client.userPoolClientId,
    POLICY_STORE_ID: store.attrPolicyStoreId,
  },
})
function ddbAccess(actions, target, keys) {
  return new iam.PolicyStatement({
    actions: actions.map((a) => 'dynamodb:' + a),
    resources: [target.tableArn],
    conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': keys } },
  })
}
server.addToRolePolicy(ddbAccess(['GetItem'], state, ['USER#*', 'DOC#*']))
server.addToRolePolicy(ddbAccess(['ConditionCheckItem'], state, ['USER#*']))
server.addToRolePolicy(ddbAccess(['PutItem', 'UpdateItem'], state, ['DOC#*']))
server.addToRolePolicy(ddbAccess(['PutItem'], audit, ['DOC#*', 'REPORT#*']))
server.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['verifiedpermissions:IsAuthorized'],
    resources: [store.attrArn],
  }),
)

server.addToRolePolicy(
  ddbAccess(['GetItem', 'PutItem', 'DeleteItem', 'Query'], reports, [
    'REPORT#*',
    'MINE#*',
    'REVIEW#*',
    'FINANCE',
    'FILE#*',
  ]),
)
const operator = new iam.Role(stack, 'AccessOperator', {
  assumedBy: new iam.AccountPrincipal(Aws.ACCOUNT_ID),
  description:
    'Assumed by the designated access operator to manage memberships and query change history.',
})
operator.addToPolicy(ddbAccess(['GetItem', 'PutItem'], state, ['USER#*']))
operator.addToPolicy(
  new iam.PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: [state.tableArn + '/index/ByTeam'],
  }),
)
operator.addToPolicy(ddbAccess(['PutItem'], audit, ['USER#*']))
operator.addToPolicy(ddbAccess(['Query'], audit, ['USER#*', 'DOC#*', 'REPORT#*']))
operator.addToPolicy(
  new iam.PolicyStatement({ actions: ['cognito-idp:AdminGetUser'], resources: [pool.userPoolArn] }),
)

const failures = new logs.MetricFilter(stack, 'Unavailable', {
  logGroup: log,
  filterPattern: logs.FilterPattern.literal(
    '{ $.message.event = "document-request" && $.message.status >= 500 }',
  ),
  metricNamespace: stack.stackName,
  metricName: 'ServerErrors',
  metricValue: '1',
})
const alarm = new cw.Alarm(stack, 'ServerErrorAlarm', {
  metric: failures.metric({ period: Duration.minutes(5), statistic: 'Sum' }),
  threshold: 1,
  evaluationPeriods: 1,
  treatMissingData: cw.TreatMissingData.NOT_BREACHING,
})
if (expiry) {
  const role = new iam.Role(stack, 'TrialCleanup', {
    assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
  })
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['cloudformation:DeleteStack'],
      resources: [stack.stackId],
    }),
  )
  new scheduler.CfnSchedule(stack, 'Expiry', {
    scheduleExpression: 'at(' + expiry + ')',
    flexibleTimeWindow: { mode: 'OFF' },
    target: {
      arn: 'arn:' + Aws.PARTITION + ':scheduler:::aws-sdk:cloudformation:deleteStack',
      roleArn: role.roleArn,
      input: JSON.stringify({ StackName: stack.stackName }),
      retryPolicy: { maximumRetryAttempts: 5 },
    },
  })
}
for (const [key, value] of Object.entries({
  Url: 'https://' + server.endpoint.domainName + '/',
  Region: Aws.REGION,
  Pool: pool.userPoolId,
  Client: client.userPoolClientId,
  Reports: reports.tableName,
  State: state.tableName,
  Audit: audit.tableName,
  Operator: operator.roleArn,
  Store: store.attrPolicyStoreId,
  RuntimeRole: server.role.roleName,
  Logs: log.logGroupName,
  Archive: archive.bucketName,
  Alarm: alarm.alarmName,
  ...(expiry && { ExpiresUTC: expiry + 'Z' }),
}))
  new CfnOutput(stack, key + 'Output', { value })
