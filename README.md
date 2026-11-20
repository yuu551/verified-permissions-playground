# Team document access on AWS

[日本語](./README.ja.md) · [Try the browser workspace](https://yuu551.github.io/verified-permissions-playground/) · [Operations runbook](./OPERATIONS.md)

Alice writes a release note. Ben, her teammate, can read it once she publishes it. Chika works in Finance and cannot open it. When Ben moves to Finance, his next request uses his new assignment, even if he is still signed in. This repository implements that workflow with Hono on Lambda Web Functions, Amazon Cognito, Amazon Verified Permissions and DynamoDB.

![The browser signs in with Cognito. Hono reads membership and document state, asks Verified Permissions for a decision, and commits writes with an audit record. Operators use a separate IAM role.](./docs/team-documents.png)

## Try a handoff

In the browser workspace choose **Alice**, create a draft and copy its document reference. Switch to **Ben** and open the same reference. He gets 403. Publish it as Alice and try Ben again. **Access management** lets you change Ben's role to `none` with a reason. Repeat his request to see the effect. This version evaluates the project's Cedar files in WebAssembly and resets on reload.

On AWS, sign in as each user through Cognito. Documents, memberships and change history persist between sessions. Access operators run IAM-authenticated commands from their own terminal.

| Operation | Rule |
| --- | --- |
| Create a draft | An active editor creates it in their assigned team. The server sets the owner and team. |
| Read | Active members can read their team's published documents and their own drafts. |
| Publish | The owner must still be an editor on the document's team. |
| Transfer or revoke access | The access operator records the reason and expected membership revision. A concurrent change requires a fresh review. |

## Run locally

Use Node.js 24.12 or later. Open the address printed by the last command.

```sh
npm ci
npm run dev
```

## Deploy the 24-hour AWS trial

The example uses `us-east-1`. Use an AWS account where you can deploy CDK stacks and assume the sample operator role. If this is the account and Region's first CDK deployment, run `npm run build && npx cdk bootstrap` first.

```sh
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
npm ci
npm run trial
npm run seed
npm run verify:aws
```

The seed command prints the workspace URL and the location of a private credentials file under `.team-trial/`. It creates Alice (Design editor), Ben (Design reader) and Chika (Finance editor). Try `handbook`, `launch-notes` or `forecast`. The live drill uses a separate temporary account and draft. EventBridge Scheduler requests deletion of the trial stack after 24 hours. The AWS resources incur normal charges. To end a trial early, run `aws cloudformation delete-stack --stack-name VerifiedPermissionsTeamDocumentsTrial` and wait for `stack-delete-complete`. CDK bootstrap resources are shared separately.

## Operate a persistent deployment

Run `npm run deploy` to create the separate persistent stack. Set `TEAM_OUTPUTS=cdk-team-outputs.json` when running the operator CLI. The stack enables termination protection, retains the policy store, user pool and tables, and enables DynamoDB point-in-time recovery. The temporary passwords and fixtures belong to the trial. For a persistent deployment, provision your own Cognito identities and assign their membership with the operator CLI. Editors can create the first documents from the application.

- [Runbook](./OPERATIONS.md) — onboard, transfer, revoke, review, investigate a denial, roll back policies and recover data.
- [Cedar rules](./team-documents/policies/) · [Hono routes](./team-documents/app.mjs) · [DynamoDB transactions](./team-documents/store.mjs) · [CDK](./team-documents/infra.mjs)
- [Editable architecture diagram](./docs/team-documents.drawio) · [Hono and FastAPI comparison using API Gateway](./examples/policy-playground/README.md)

The reference application covers a single Region, a single active team per user and synthetic documents. The browser keeps ID tokens in memory and asks the user to sign in again when they expire. Before handling real company data, connect your identity provider and MFA, assign an alarm destination, restrict operator access, and measure the workload and restore time against your objectives.

[Apache License 2.0](./LICENSE)
