# AWS で動く経費精算アプリ

[English](README.md) · [ブラウザーで試す](https://yuu551.github.io/verified-permissions-playground/) · [運用手順](OPERATIONS.ja.md)

Alice が出張の交通費を申請すると、上長の Ben の承認待ち一覧に届きます。領収書が足りなければ Ben は理由を書いて差し戻せます。Alice が領収書を添付して再申請し、Ben が承認すると、経理の Chika が精算番号を記録できます。実際の振り込みはアプリの外で行います。

## 3人の役割を試す

1. ブラウザー版は Alice の「自分の申請」から始まります。右上の「日本語」で表示を切り替えます。「Q4 design workshop」を開くと差し戻し理由を読めます。自分で入力する場合は「申請を作成」から件名、利用日、支払先、費目、金額を入力してください。
2. 保存後に領収書を添付し、「申請する」を押します。領収書は省略できます。
3. 右上の名前を押して Ben に切り替えます。「承認待ち」で申請を開き、明細を確認して承認します。差し戻しを試す場合は理由を入力して「差し戻す」を押します。Alice に戻ると同じ申請を修正できます。
4. Chika の「経理の精算一覧」で承認済みの申請を開きます。精算番号を入力して「精算を記録」を押すと、Alice の一覧でも「精算済み」になります。

GitHub Pages 版は端末上で Cedar ポリシーを評価します。明細と領収書はブラウザーの IndexedDB に保存し、再読み込み後も残ります。試す際は架空の領収書を使ってください。AWS 版では3人がそれぞれ Cognito にログインし、別々の端末から同じ申請を扱えます。

## 誰が何をできるか

| 操作 | 条件 |
| --- | --- |
| 作成・編集・添付・申請 | 在籍中の本人が、現在のチームで作成した下書きか差し戻し分を扱う |
| 承認・差し戻し | 同じチームの上長が承認待ちの申請を扱う。自分の申請は承認できない |
| 精算を記録 | 経理が承認済みの申請を扱う。申請者と承認者はその申請を精算できない |
| 閲覧 | 申請者本人、承認待ちの間は同じチームの上長、承認後は経理 |
| 権限変更 | 管理担当者が IAM ロールを引き受け、理由と所属情報の現在の版を指定する |

Hono はリクエストごとに所属と役割を読み、Amazon Verified Permissions に操作の可否を問い合わせます。更新時には DynamoDB のトランザクションで所属と申請の版を照合し、明細、担当者の一覧、監査履歴をまとめて書き込みます。領収書の閲覧・差し替えにも申請と同じ権限が必要です。

![AWS 構成図。Cognito でログインし、Lambda Web Function が Verified Permissions に認可を問い合わせ、DynamoDB に申請と領収書、所属、監査履歴を保存します。](docs/expense-reports.png)

[編集用の構成図](docs/expense-reports.drawio) · [Cedar ポリシー](expenses/policies/) · [Hono のルート](expenses/service.mjs) · [保存処理](expenses/store.mjs) · [CDK](team-documents/infra.mjs)

## ローカルで起動する

Node.js 24.12 以降を使います。次のコマンドが表示する URL を開いてください。

```sh
npm ci
npm run dev
```

`npm test` で認可と入力の検査を実行できます。ブラウザーの操作も確認する場合は `npx playwright install chromium` の後で `npm run test:ui` を実行してください。

## AWS に24時間の試用環境を作る

CDK でデプロイでき、所属管理用ロールを引き受けられる AWS アカウントを使います。対象アカウントとリージョンで初めて CDK を使う場合は、リージョン設定後に `npm run build && npx cdk bootstrap` を実行します。

```sh
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
npm ci
npm run trial
npm run seed
npx playwright install chromium
npm run test:aws:ui
```

`seed` は URL と、3人分のログイン情報を保存した `.team-trial/` 内のファイル名を表示します。AWS 版で役割を切り替えるときはログアウトするか、ブラウザーのプロファイルを分けてください。実機テストでは架空の交通費を申請し、差し戻しから精算まで操作します。24時間後に EventBridge Scheduler がスタックの削除を要求します。利用した AWS リソースには料金がかかります。早めに削除する手順は[運用手順](OPERATIONS.ja.md)にあります。

## 継続して使う場合

`npm run deploy` で継続用スタックを作り、権限管理 CLI には `TEAM_OUTPUTS=cdk-team-outputs.json` を指定します。Cognito に利用者を作成して所属を登録し、承認担当者と経理担当者にそれぞれ役割を付与してください。継続用スタックでは削除保護と DynamoDB のポイントインタイムリカバリが有効です。異動、権限変更、監査、復旧の手順は[運用手順](OPERATIONS.ja.md)にまとめています。

このサンプルは日本円、1人1所属、1申請につき領収書1点（1.5 MiB 以下）に対応します。社内で使う際には社内認証と MFA、障害通知先、領収書の保管期間とファイル検査、振込実績との照合方法を決めてください。

所属変更が文書の閲覧に反映される例は[チーム文書サンプル](https://yuu551.github.io/verified-permissions-playground/documents/)で試せます。[API Gateway の構成例](examples/policy-playground/README.md)には Hono 版と FastAPI 版があります。

[Apache License 2.0](LICENSE)
