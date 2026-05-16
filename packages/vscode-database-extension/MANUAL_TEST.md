# anytime-database Manual Test (v1)

## VS Code 拡張 + Web アプリ スモークテスト項目

各項目を対象プラットフォームで確認し、結果（○ / × / N/A）を埋める。

| # | シナリオ | 期待結果 | Linux x64 | Mac arm64 | Win x64 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.sqlite` ファイルをエクスプローラからダブルクリック | Custom Editor が開き TableTree にテーブル一覧が表示される | | | |
| 2 | テーブルをクリック | 100 行ページネーションでデータが表示される | | | |
| 3 | ページサイズを 25 に変更 | 25 行表示 + ページャの 'Page X / Y' が更新される | | | |
| 4 | 範囲選択 + Ctrl+C | TSV 形式でクリップボードにコピーされる | | | |
| 5 | SQL Run (`SELECT * FROM users LIMIT 5`) | 5 行表示、ページャは非表示 | | | |
| 6 | SQL Run (`INSERT INTO users(name,email) VALUES ('X','x@x.com')`) | タブにドット (dirty) が表示される | | | |
| 7 | `Ctrl+S` で保存 | dirty が解除され、別アプリで開くと変更が反映されている | | | |
| 8 | 設定で `anytimeDatabase.openMode = readonly` にして再起動 | 書込 SQL が拒否されエラー表示、ツールバーに Read-only バッジ | | | |
| 9 | Web アプリ `/database` で同 fixture を開く | TableTree とグリッドが VS Code と同等表示 | | | |
| 10 | Web アプリで INSERT 実行 → Download | 別ファイルとして `.db` がダウンロードされる | | | |

## トランザクション競合確認

- VS Code で DB を開いた状態で `mcp-trail` のインポート処理が走った場合のエラーを記録
- 別の sqlite3 CLI で同 DB を `.write` で更新した場合の挙動を記録

## 自動テストでカバー済みの範囲（手動不要）

以下は jest で網羅済み（v0.1.0 時点 56 件すべて PASS）:

- `database-core` 配下: identifier / limitDetection / sqlMutationCheck / BetterSqlite3Adapter / SqlJsAdapter / RemoteDatabaseAdapter / PaginatedSqlSheetAdapter
- `database-viewer` 配下: TableTree / SqlEditorPanel
- `spreadsheet-viewer` 配下: PaginationBar

## 手動検証が必要な領域（自動テスト不可）

- VS Code 拡張の F5 デバッグ起動 → Custom Editor の表示
- WebView ↔ Extension Host の双方向 IPC 動作（実機環境依存）
- BetterSqlite3 の native binary が VSIX 配布で正しくロードされるか（プラットフォーム別）
- Web アプリでファイルピッカー / ドラッグ＆ドロップ → SqlJsAdapter → 表示
- ダーク／ライトモードの切替時の表示崩れ
- 大規模 DB（数万行以上）の selectRows / countRows のパフォーマンス

## 既知の制限

- `Save As` は v1 では未対応（`AnytimeDatabaseEditorProvider.saveCustomDocumentAs` が throw）
- `bindings` パッケージ経由で native binary をロードするため、`dist/native/better_sqlite3.node` の同梱が必須
- Web アプリでは sql.js (WASM) を `globalThis.localStorage.anytime-database.queryMaxRows` で行数制限可能（ストレージ未設定時は 1000）


## S3 バックアップアップロード

`anytime-database.uploadBackupToS3` コマンドで、`FileBackupManager` が生成した最新世代 `.bak.1.gz` を AWS S3 に手動でアップロードする機能。


### 準備

1. AWS Console でテスト用バケット（例: `anytime-db-backup-test`）を作成
2. PutObject 権限のみを持つ IAM ユーザーを作成し、Access Key を発行
3. VS Code User Settings (`~/.config/Code/User/settings.json`) に以下を追加:

```json
{
  "anytimeDatabase.s3.bucket": "anytime-db-backup-test",
  "anytimeDatabase.s3.region": "ap-northeast-1",
  "anytimeDatabase.s3.prefix": "anytime-database-backups",
  "anytimeDatabase.s3.accessKeyId": "<your-key>",
  "anytimeDatabase.s3.secretAccessKey": "<your-secret>"
}
```

4. VS Code を再起動（拡張 reload）


### ゴールデンパス

1. ワークスペースを開き、`trail.db` を更新して `FileBackupManager` で `.bak.1.gz` を生成
2. Activity Bar `Anytime Database` → `trail.db` → `Backups` → `Generation 1` の右にある `$(cloud-upload)` をクリック
3. 通知に `Uploading trail.db to S3` → `Uploaded s3://anytime-db-backup-test/anytime-database-backups/trail.db/<ISO>.bak.gz (<size> MB, <ms> ms)` が表示される
4. AWS Console S3 でオブジェクトが存在することを確認


### エッジケース

| # | 操作 | 期待結果 |
| --- | --- | --- |
| S1 | 設定の `bucket` を空にして実行 | `S3 not configured: missing bucket` の error 通知 |
| S2 | 設定の `accessKeyId` を空にして実行 | `S3 not configured: missing accessKeyId` の error 通知 |
| S3 | `.bak.1.gz` がない状態で Command Palette から起動 | `Latest backup not yet created for trail.db` の warning 通知 |
| S4 | 認証情報を不正値に書き換えて実行 | 5 秒後にリトライ後、`S3 upload failed: ...` の error 通知 |
| S5 | `Generation 2` を右クリック | upload icon が表示されない（`when: viewItem == backupEntryLatest` で除外） |
| S6 | OutputChannel `Anytime Database` で `accessKeyId` / `secretAccessKey` の文字列検索 | 一致なし（認証情報がログに出力されないこと） |
