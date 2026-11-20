# AWS でチームの文書アクセスを管理する

[English](./README.md) · [ブラウザーで試す](https://yuu551.github.io/verified-permissions-playground/) · [運用手順書](./OPERATIONS.ja.md)

設計チームの Alice が書いた下書きは、同じチームの Ben も公開までは読めません。経理の Chika には公開後もアクセス権がありません。Ben が経理へ異動すると、ログイン中でも次のリクエストから新しい所属が適用されます。この流れを Hono、Lambda Web Functions、Cognito、Amazon Verified Permissions、DynamoDB で実装しています。

![利用者は Cognito でサインインする。Hono は所属と文書の状態を読み、Verified Permissions に判定を依頼する。文書の更新と履歴の記録は同時に行い、担当者は専用 IAM ロールで所属を変更する。](./docs/team-documents.png)

## まず公開前後の違いを試す

ブラウザー版で Alice を選び、「下書きを作成」から文書を保存します。発行された文書 ID をコピーして、Ben に切り替え、同じ ID を開くと 403 が返ります。Alice で公開すると Ben も読めるようになります。「権限管理」で Ben の役割を `none` にすると、同じ文書が再び 403 になります。ブラウザー版ではこのリポジトリの Cedar ファイルを WebAssembly で評価します。操作結果は再読み込みでリセットされます。

AWS 版では一人ずつ Cognito にサインインします。画面を閉じても文書・所属・変更履歴が残ります。権限管理は担当者の端末から専用の IAM ロールを使って行います。

| 操作 | 許可の条件 |
| --- | --- |
| 下書きを作成する | 編集者が自分のチームに作成します。所有者と所属はサーバーが決めます。 |
| 文書を読む | 同じチームの公開済み文書か、自分が所有する下書きを読めます。 |
| 公開する | 作成者が今もそのチームの編集者であることが必要です。 |
| 異動・権限剥奪 | 担当者が変更理由と現在の版を指定します。別の担当者が先に変更していれば、最新の状態を確認します。 |

## 手元で動かす

Node.js 24.12 以降を使います。コマンドを実行し、表示されたアドレスを開いてください。

```sh
npm ci
npm run dev
```

## AWS で24時間試す

CDK をデプロイできる AWS アカウントを用意します。初めて使うアカウントとリージョンでは `npm ci` の後、`npm run build && npx cdk bootstrap` を一度実行してください。

```sh
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
npm ci
npm run trial
npm run seed
npm run verify:aws
```

`seed` が URL と試用アカウントのファイル名を表示します。`.team-trial/` に保存される3人は、設計の編集者 Alice、同じチームの閲覧者 Ben、経理の編集者 Chika です。初期文書の ID は `handbook`、`launch-notes`、`forecast` です。自動検証では専用の一時ユーザーと文書を使います。AWS の通常料金がかかり、24時間後に EventBridge Scheduler が試用スタックの削除を開始します。早めに終了する場合は `aws cloudformation delete-stack --stack-name VerifiedPermissionsTeamDocumentsTrial` を実行し、`stack-delete-complete` まで待ちます。CDK のブートストラップ用リソースは別に管理されます。

## 継続して使う環境

`npm run deploy` は試用環境とは別のスタックを作ります。運用 CLI は `TEAM_OUTPUTS=cdk-team-outputs.json` を指定して実行します。スタックの削除保護、ユーザープール・ポリシーストア・テーブルの保持、DynamoDB のポイントインタイムリカバリが有効です。自分の Cognito ユーザーを登録し、担当者が所属を割り当てると、編集者が画面から最初の文書を作成できます。

- [運用手順書](./OPERATIONS.ja.md)で、配属・異動・退職、棚卸し、拒否の調査、ポリシー変更の取り消し、データ復旧を扱っています。
- [Cedar ポリシー](./team-documents/policies/) · [Hono のルート](./team-documents/app.mjs) · [DynamoDB のトランザクション](./team-documents/store.mjs) · [CDK](./team-documents/infra.mjs)
- [構成図の編集用ファイル](./docs/team-documents.drawio) · [従来の API Gateway・Hono・FastAPI 比較サンプル](./examples/policy-playground/README.ja.md)

このサンプルは単一リージョンで、利用者は1つのチームに所属します。ID トークンはブラウザーのメモリに保持し、期限切れ時には再ログインします。社内データを扱う前には、組織の IdP・MFA、アラーム通知先、担当者ロールを引き受けられる人を設定し、想定負荷と復旧時間を確認してください。

[Apache License 2.0](./LICENSE)
