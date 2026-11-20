# Access operations

[日本語](./OPERATIONS.ja.md) · [Application](./README.md)

## Who changes what

| Responsibility | Interface | Evidence |
| --- | --- | --- |
| Application owner | Review Cedar, schema and test changes in Git, deploy the reviewed commit with CDK | Commit, policy matrix and stack events |
| Access operator | Assume the stack's AccessOperator role through the CLI | Before/after membership, operator's source ARN, reason and revision |
| Document editor | Create and publish their own drafts in the workspace | Change, document revision and request ID |
| On-call engineer | CloudWatch Logs, metric alarm, CloudTrail archive, backups | Request ID, IAM session, table write and recovery timestamp |

Use individual federated sessions. The operator role trusts the owning account. Grant `sts:AssumeRole` on its exact output ARN only to approved access operators and restrict the trust before production. The web server cannot assign memberships. The operator can query the roster and audit history and update membership records. The ledger and CloudTrail are separate sources of evidence; the archive is in the same AWS account. Restrict its administrators or use a dedicated archive account for stronger separation.

## Expense approvals

Create an active membership before granting an expense role. Each member can submit expenses. Assign a manager to each team that submits claims and a separate finance user to record reimbursements. A single-manager team needs a second manager to approve its manager’s own claims.

```sh
npm run access -- show USERNAME
npm run access -- expense-role USERNAME --role manager --expect REVISION --reason "Design approval rota"
npm run access -- report-history REPORT_UUID
```

Use `employee`, `manager` or `finance`. The role and team come from the current membership on every request. A transfer or revocation clears the expense assignment. A former team’s returned draft requires an operator to resolve the business handoff before the employee can submit it again. Use the UUID in the report URL to correlate its latest 50 durable audit entries with CloudWatch request IDs. The report itself shows its most recent 40 activity entries. Seeded examples have a synthetic history and one import transaction. New reports record every business operation.

A receipt is one PDF, JPEG or PNG up to 1.5 MiB. Receipt chunks, report revision and audit record commit together. Replacing a receipt replaces its current copy. A payment reference records an external transfer. Reconcile it externally before recording it here.

## Onboard, transfer, revoke, review

Start with an authenticated AWS CLI session in the deployed Region. The CLI defaults to the trial's output file. For the persistent stack, export `TEAM_OUTPUTS=cdk-team-outputs.json`. Use an actual Cognito username in place of `USERNAME`. In a new persistent pool, the identity administrator provisions the account and completes its sign-in setup first. A newly provisioned identity has no membership.

```sh
npm run access -- show USERNAME
npm run access -- set USERNAME --team design --role editor --expect 0 --reason "Approved onboarding HR-41"
npm run access -- review design
npm run access -- set USERNAME --team finance --role reader --expect 1 --reason "Transfer HR-53"
npm run access -- set USERNAME --team finance --role none --expect 2 --reason "Departure HR-66"
npm run access -- history USERNAME
npm run access -- document-history DOCUMENT_ID
```

The roster includes a stable key such as `USER#<sub>`. Pass that exact key to `show` or `history` even after the Cognito account has been deleted. It can also revoke an existing assignment. New grants require a current Cognito username.

Use the revision returned by `show`. A stale write fails. Read the record again, check whether the request still applies and submit the new revision. To undo an assignment, make another reasoned change at the current revision. Do not erase the previous change. The roster index is eventually consistent, whereas `show` is strongly consistent. The next document request reads the current membership and document together. A publication also checks the membership revision at commit. Revocation prevents subsequent reads and writes; it cannot retract text already delivered. For departures, revoke the assignment first, then disable the Cognito account and end its sessions through your identity administrator.

## Investigate a denial or outage

1. Ask for the request ID displayed beside the response and the approximate time. A request can be traced without collecting its token or document text.
2. Open the CloudWatch log group in the stack's `LogsOutput` and run the query below in Logs Insights. For 401, check the login session, token expiration, pool and client. For 403, compare the member's current team and role, the document owner and published flag, and the policy revision deployed at the time. An unknown reference also returns 403.
3. For 409/412, reload the latest document and membership before acting. For 503, check DynamoDB, Verified Permissions, Cognito public keys and runtime IAM. The service withholds the document when the read or authorization dependency fails.
4. A 5xx request logged by the application trips the stack's CloudWatch alarm at one occurrence per five minutes. Subscribe the alarm to your incident channel. Crashes before the application logs a request need endpoint monitoring as well.

```
fields @timestamp, @message
| filter @message like /REQUEST_ID_HERE/
| sort @timestamp desc
```

Membership and publication writes commit with their audit event. `history` shows the latest 50 events for the subject; `review` paginates all assigned users on a team. CloudTrail delivers write data events for the three DynamoDB tables to the versioned bucket in `ArchiveOutput`. Correlate the IAM session, timestamp and table with the application ledger. Delivery is asynchronous. Give the archive its own retention and access policy for your organization.

### Rehearse loss of the authorization service

In the temporary stack, run `npm run drill:outage` during a coordinated test window. It checks HTTP 200 on the handbook, temporarily denies the **trial runtime role** access to that policy store, checks 503 without a document body, removes the deny and checks 200 again using the same token. The deny includes a two-minute expiration in case the operator terminal is interrupted. The CLI prints the policy name and request IDs. Check the alarm's history and log group. If the process was interrupted, remove the printed inline policy from `RuntimeRoleOutput` and verify a fresh read. The drill intentionally interrupts authorization for this trial's users. For a browser exercise with no interruption, run `npx playwright install chromium` and `npm run test:aws:ui`.

## Change and roll back a policy

Edit the Cedar files and strict schema in `expenses/policies/` or `team-documents/policies/` in a branch. Add an allowed and a denied case to `team-documents/test/access.test.mjs`. Include a cross-team case. Run `npm test`, `npm run synth` and `npx cdk diff` in the correct account. Review the policy change and data protection settings in the diff. Deploy to a trial and run `npm run verify:aws` before approving promotion. Require reviewers in your repository's branch protection or ruleset. For rollback, revert the offending commit and redeploy the reviewed policy. Verified Permissions changes propagate asynchronously; confirm representative outcomes after deployment before closing the incident.

## Recover state

In a seeded trial, run `npm run drill:restore` after its recovery window includes the fixture records. It restores all three tables at a common timestamp, checks Ben’s membership, a report, its inbox entry and their audit revisions, and deletes its temporary copies. The live application continues to serve its original tables.

The persistent tables have point-in-time recovery enabled. Pause membership, document and expense writes, record the incident time, and choose a common timestamp before the bad change. Restore all three tables to new names with `aws dynamodb restore-table-to-point-in-time --source-table-name SOURCE --target-table-name RESTORED --restore-date-time TIMESTAMP`. Wait for all three to become active. Check the roster index, sample document ownership, audit revisions and subsequent offboarding events. Reapply any revocations after the restore point before re-opening traffic. Review and deploy a CDK change to use the recovered table ARNs/names and update both runtime and operator IAM permissions. Preserve the original tables during validation. User pools and Cedar policy versions require their own recovery procedures; Git contains the policy definitions. Measure RPO/RTO with a rehearsal in your environment.

## End a trial

Check `ExpiresUTCOutput` and the enabled one-time EventBridge schedule. For an early teardown:

```sh
aws cloudformation delete-stack --stack-name VerifiedPermissionsTeamDocumentsTrial
aws cloudformation wait stack-delete-complete --stack-name VerifiedPermissionsTeamDocumentsTrial
```

The trial deletes its sample records and log archive. Keep evidence you need before deletion. CDK bootstrap assets and implicit cleanup-provider logs can outlive the application stack. Persistent deployments use a different stack name, retain their data, and have termination protection enabled.
