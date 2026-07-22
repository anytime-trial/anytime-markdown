# 変更履歴

"mcp-cms" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.2.0] - 2026-07-22

### 追加

- `read_google_doc` MCP ツールを追加。サービスアカウント認証（RS256 署名は `node:crypto` で実装）で Google Doc をプレーンテキストとして読み取る。Doc ID または Google Docs/Drive の URL を受け付ける。`GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 設定時のみ登録され、対象ドキュメントはサービスアカウントのメールアドレスへ閲覧者共有が必要。

## [0.1.7] - 2026-06-20

### 追加

- S3 レポート本文を取得する MCP ツール `get_report` を追加。

## [0.1.6] - 2026-05-27

### 変更

- SonarCloud S1874 非推奨 API の移行。

## [0.1.5] - 2026-05-04

### 修正

- React コンポーネントの props を `Readonly` でラップ（Sonar S6759）
- 不要な型アサーションを削除（Sonar S4325）

## [0.1.4] - 2026-05-02

### 変更

- cms-core 依存を 0.1.4 に更新

## [0.1.3] - 2026-04-12

### 変更

- cms-core 依存を 0.1.3 に更新

## [0.1.1] - 2026-04-04

### 変更

- cms-core 依存を 0.1.1 に更新

## [0.1.0] - 2026-03-29

### 追加
- cms-core・mcp-cms のユニットテストを CI パイプラインに追加
- mcp-cms-remote のデプロイワークフロー

## [0.0.1] - 2026-03-27

初回リリース。

### 追加

- MCP サーバー（`anytime-markdown-cms`）と stdio トランスポート
- `upload_report` ツール: ローカル Markdown ファイルを S3 レポートプレフィックスにアップロード
- `list_reports` ツール: S3 レポートプレフィックス内の全レポートファイルを一覧表示
- `upload_doc` ツール: ローカルファイル（Markdown または画像）を S3 ドキュメントプレフィックスにアップロード（サブフォルダ指定可）
- `list_docs` ツール: S3 ドキュメントプレフィックス内の全ドキュメントファイルを一覧表示
- `delete_doc` ツール: S3 ドキュメントプレフィックスからドキュメントを削除
- dotenv による環境変数設定サポート
