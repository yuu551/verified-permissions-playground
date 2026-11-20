# Expense reports on AWS

[日本語](README.ja.md) · [Open the browser demo](https://yuu551.github.io/verified-permissions-playground/) · [Operations](OPERATIONS.md)

Alice takes the train to a customer visit and submits her fare. Ben reviews the amount and asks for the receipt. Alice attaches it and resubmits. After Ben approves, Chika records the payment reference. All three work on the same report. The app records reimbursements in a ledger. Bank transfers take place outside the sample.

## Try the workflow

1. Open the browser demo as Alice. Open **Q4 design workshop** to see Ben’s reason for returning it, or choose **New report** to enter your own expense items in JPY.
2. Save the report, attach a sample PDF, JPEG or PNG if needed, then choose **Submit report**.
3. Open the account menu at the top right and choose **Ben**. Find the report under **Approvals**. Approve it, or return it with a reason and switch back to Alice to correct it.
4. Switch to **Chika**, open the approved report in **Reimbursements**, enter a payment reference and choose **Record reimbursement**. Alice can see the result and the activity history in **My reports**.

The Pages demo evaluates the Cedar policies in your browser. IndexedDB keeps the sample reports and attachments on that browser profile between visits. Each visitor gets a separate dataset. Use synthetic receipts. On AWS, three separate Cognito logins share the same DynamoDB data. The language switch is available on both versions.

## What the authorization rules protect

| Action | Who can do it |
| --- | --- |
| Create, edit, attach or submit | An active employee working on their own team's draft or returned report |
| Approve or return | A manager on the report's team, while the report is submitted. Self-approval is denied. |
| Record reimbursement | Finance, after approval. The owner and the approver cannot settle the report. |
| Read | The owner, their team's manager during review, or Finance after approval |
| Change assignments | An IAM-authenticated access operator, with a reason and the current membership revision |

The Hono service reads the signed-in user's current assignment and checks the action with Amazon Verified Permissions. A DynamoDB transaction checks the report and membership revisions, updates the report and inboxes, and appends the audit entry. A failed authorization dependency returns an error. Receipts use the report's read and edit rules.

![Expense reports on AWS. Cognito signs in staff, a Lambda Web Function asks Verified Permissions about each action, and DynamoDB stores reports, receipts, memberships and audit entries.](docs/expense-reports.png)

[Editable diagram](docs/expense-reports.drawio) · [Cedar policies](expenses/policies/) · [Hono routes](expenses/service.mjs) · [Storage](expenses/store.mjs) · [CDK stack](team-documents/infra.mjs)

## Run locally

Use Node.js 24.12 or later.

```sh
npm ci
npm run dev
```

Open the URL printed by the server. Run `npm test` for the policy and validation tests. Run `npx playwright install chromium` and `npm run test:ui` for the browser workflow.

## Deploy a 24-hour trial

Use an AWS account that allows CDK deployments and assumption of the stack's access-operator role. Set the Region before deploying. For the first CDK deployment in an account and Region, bootstrap it with `npm run build && npx cdk bootstrap`.

```sh
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
npm ci
npm run trial
npm run seed
npx playwright install chromium
npm run test:aws:ui
```

The seed command prints the URL and a private credentials file under `.team-trial/`. Sign in as Alice, Ben and Chika using separate browser profiles or sign out between steps. The live UI test creates a synthetic report and takes it through return, resubmission, approval and reimbursement. EventBridge Scheduler requests stack deletion after 24 hours. AWS charges apply. See the [runbook](OPERATIONS.md) for early deletion and shared bootstrap resources.

## Operate a persistent workspace

Run `npm run deploy` and set `TEAM_OUTPUTS=cdk-team-outputs.json` for the access CLI. Provision identities in the stack's Cognito pool, assign membership, then grant manager and finance roles to the appropriate people. The persistent stack enables termination protection, retains data and enables DynamoDB point-in-time recovery. See the [operations runbook](OPERATIONS.md) for assignment changes, audit queries and recovery.

The sample supports JPY, one team per user and one attachment of up to 1.5 MiB per report. For company use, configure corporate sign-in and MFA, connect an alarm destination, and define receipt retention, scanning and financial reconciliation.

The [team document example](https://yuu551.github.io/verified-permissions-playground/documents/) demonstrates immediate access revocation. The [API Gateway comparison](examples/policy-playground/README.md) includes Hono and FastAPI.

[Apache License 2.0](LICENSE)
