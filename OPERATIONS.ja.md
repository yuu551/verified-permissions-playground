# 文書アクセスの運用手順

[English](./OPERATIONS.md) · [アプリの説明](./README.ja.md)

## 担当と記録

| 担当 | 操作 | 確認できる記録 |
| --- | --- | --- |
| アプリ担当者 | Git で Cedar・スキーマ・テストをレビューし、CDK で反映 | コミット、テスト結果、スタックイベント |
| 権限担当者 | 自分の AWS セッションで専用ロールを引き受け、所属と役割を変更 | 変更前後の値、担当者の ARN、理由、版 |
| 文書の編集者 | 画面から下書きを作成し、自分の文書を公開 | 文書の版、リクエスト ID、操作履歴 |
| 障害対応者 | CloudWatch、CloudTrail とバックアップを調査 | リクエスト ID、IAM セッション、書き込み時刻、復旧点 |

担当者ごとに個別の AWS セッションを使います。権限管理ロールは同一アカウントを信頼しています。導入時は信頼ポリシーを絞り、承認済みの担当者にだけ対象ロールへの `sts:AssumeRole` を許可してください。Web アプリのロールには所属変更権限がありません。アプリの変更履歴に加え、CloudTrail にも DynamoDB の書き込みを記録します。監査用 S3 は同じアカウント内にあります。管理者権限から独立した保全が必要なら、組織のログアーカイブアカウントへ転送します。

## 経費の承認担当者を割り当てる

在籍中の利用者は自分の経費を申請できます。所属を登録してから、チームに上長を、経理に精算担当者を割り当てます。上長自身の経費を承認するには、同じチームにもう1人の上長が必要です。

```sh
npm run access -- show USERNAME
npm run access -- expense-role USERNAME --role manager --expect REVISION --reason "設計チームの承認当番"
npm run access -- report-history REPORT_UUID
```

役割は `employee`、`manager`、`finance` から選びます。異動か権限剥奪の際には経費の役割も解除されます。旧所属で差し戻された申請は異動後の本人が再提出できないため、異動前に処理中の申請を確認してください。申請 URL の UUID を `report-history` に渡すと直近50件の監査履歴を参照できます。画面には直近40件の操作を表示します。試用時の見本には架空の履歴と投入時の監査記録があり、新規申請では操作ごとに監査履歴を保存します。

領収書は1申請につき PDF・JPEG・PNG のいずれか1点で、上限は1.5 MiB です。差し替えると現在の領収書を更新します。経理は外部で振込実績と照合してから精算番号を記録してください。

## 配属・異動・退職・棚卸し

デプロイ先と同じリージョンを指定し、AWS にサインインします。CLI は通常、試用環境の出力ファイルを参照します。継続環境では `export TEAM_OUTPUTS=cdk-team-outputs.json` を実行してください。次の `USERNAME` は対象者の Cognito ユーザー名に置き換えます。継続環境の新規ユーザーは、ID 管理者があらかじめ発行し、初回サインインを完了させます。所属を登録するまでは文書を閲覧できません。

```sh
npm run access -- show USERNAME
npm run access -- set USERNAME --team design --role editor --expect 0 --reason "設計に配属 HR-41"
npm run access -- review design
npm run access -- set USERNAME --team finance --role reader --expect 1 --reason "経理に異動 HR-53"
npm run access -- set USERNAME --team finance --role none --expect 2 --reason "退職 HR-66"
npm run access -- history USERNAME
npm run access -- document-history DOCUMENT_ID
```

棚卸し結果の `USER#<sub>` は利用者を識別する固定キーです。この値を `show` や `history` に渡せば、Cognito のユーザー削除後も調査できます。既存の所属の剥奪にも使えます。権限を付与するときは現在の Cognito ユーザー名を指定します。

`--expect` は `show` で確認した版です。別の担当者による更新後は古い版での変更に失敗します。現在の所属を読み直し、承認内容と照合してください。誤った変更を戻すときも、新しい版と理由を記録します。チーム一覧に使うインデックスには反映が遅れる場合があります。個別の `show` は強い整合性で読みます。アプリはリクエストごとに所属と文書をまとめて読み、公開の確定時にも所属の版を照合します。退職時は先に役割を `none` にし、その後で ID 管理者が Cognito ユーザーを無効にしてセッションを終了します。すでに端末へ配信した文書は回収できません。

## 閲覧拒否・障害を調査する

1. 画面に表示されたリクエスト ID と時刻を聞きます。トークンや文書の本文を送ってもらう必要はありません。
2. スタック出力 `LogsOutput` の CloudWatch Logs を開き、次のクエリで絞り込みます。401 ではトークン期限、プール、クライアントを確認します。403 では所属・役割、文書の所有者・公開状態、その時点の Cedar ポリシーを照合します。存在しない文書も 403 です。
3. 409・412 なら画面で文書を読み直し、最新の版で操作します。503 なら DynamoDB、Verified Permissions、Cognito の公開鍵取得と実行ロールを確認します。認可やデータ取得に失敗したリクエストには文書を返しません。
4. アプリが記録した 5xx が5分間に1件以上あると CloudWatch アラームが作動します。導入時に当番の通知先を設定してください。アプリの起動前に起きる障害を検知するには、エンドポイントの外形監視も必要です。

```
fields @timestamp, @message
| filter @message like /ここにリクエストID/
| sort @timestamp desc
```

所属・文書の変更は履歴と同じトランザクションで確定します。`history` は対象者の直近50件を、`review` は対象チームの全員を取得します。`ArchiveOutput` の S3 バケットには3つのテーブルに対する書き込みの CloudTrail データイベントが届きます。IAM セッション・時刻・テーブルを変更履歴と照合してください。配送には時間差があります。保存期間と閲覧者は組織の基準に合わせて設定します。

### 認可サービスの障害訓練

利用者と時間を合わせ、試用スタックで `npm run drill:outage` を実行します。訓練はハンドブックが 200 で開くことを確認し、試用スタックの実行ロールに対象ポリシーストアへの一時的な拒否を設定します。文書を含まない 503 を確認して拒否を削除し、同じトークンで再び 200 になるまで待ちます。一時ポリシーには2分の失効条件があります。CLI が表示するリクエスト ID をログとアラーム履歴で確認してください。途中で端末が終了した場合は、表示された名前のインラインポリシーを `RuntimeRoleOutput` のロールから削除し、もう一度文書を開きます。訓練中はこの試用環境の利用者全員に影響します。障害を起こさず画面だけをテストするには、`npx playwright install chromium` と `npm run test:aws:ui` を実行します。

## ポリシーのレビューと切り戻し

ブランチで `expenses/policies/` または `team-documents/policies/` の Cedar とスキーマを更新し、許可・拒否・別チームのケースを `team-documents/test/access.test.mjs` に追加します。`npm test`、`npm run synth`、対象アカウントで `npx cdk diff` を実行します。レビュアーが権限の広がりとデータの保持設定を確認し、試用環境で `npm run verify:aws` が通ったコミットを反映します。必須レビュアーはリポジトリのルールセットなどで設定してください。切り戻しは対象コミットを revert し、レビュー後に再デプロイします。Verified Permissions の変更は反映まで時間差があるため、実際の許可・拒否を確認してから復旧と判断します。

## データの復旧

試用環境の初期データが復旧可能な時刻に入ったら、`npm run drill:restore` で訓練できます。3つのテーブルを同じ時点で別名に復元し、Ben の所属、申請と一覧、監査履歴の版を照合して、訓練用のコピーを削除します。試用アプリは元のテーブルを使い続けます。

継続環境の3つのテーブルはポイントインタイムリカバリが有効です。所属変更、文書と経費の更新を止め、誤操作前の共通の時刻を選びます。`aws dynamodb restore-table-to-point-in-time --source-table-name SOURCE --target-table-name RESTORED --restore-date-time TIMESTAMP` で所属、申請、履歴を別名に復元します。すべてが使用可能になったら、チーム一覧用インデックス、所有者、履歴の版を照合します。復旧点より後に退職した人の権限が復活していないか確認し、必要な剥奪を先に再適用してください。元テーブルを保持したまま復元先の名前・ARN とアプリ、担当者の IAM ポリシーを CDK で切り替えます。Cognito の復旧と Git で管理する Cedar の復旧は別途行います。目標復旧時間・復旧時点は利用環境で訓練して測定してください。

## 試用を終了する

`ExpiresUTCOutput` と EventBridge Scheduler の一回限りのスケジュールを確認します。すぐに終了する場合は次を実行します。

```sh
aws cloudformation delete-stack --stack-name VerifiedPermissionsTeamDocumentsTrial
aws cloudformation wait stack-delete-complete --stack-name VerifiedPermissionsTeamDocumentsTrial
```

試用スタックを削除すると、サンプルのデータと監査アーカイブも消えます。必要な調査記録は先に保全してください。CDK の共用ブートストラップ資産と、削除用 Lambda が自動生成したログは残ることがあります。継続環境は別名のスタックで、データを保持し、スタックの削除保護が有効です。
