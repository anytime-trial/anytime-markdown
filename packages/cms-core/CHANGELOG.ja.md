# 変更履歴

"cms-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.2.0] - 2026-07-22

### 追加

- Google Drive Reader の共有ロジック（`googleDriveService`）を追加。サービスアカウント JWT 構築・base64url エンコード・Google OAuth トークン取得・Doc ID/URL 解析・Drive エクスポート取得を純粋関数/DI 関数として実装し、RS256 署名は呼び出し側から注入可能（新規 npm 依存追加なし）。

### 修正

- 403/404 応答に Google 側のエラー診断情報を付記し、トークンエンドポイントの非 JSON/null 応答を HTTP ステータス付きの例外に変換（anytime-cross-review 指摘対応）。

## [0.1.7] - 2026-06-20

### 追加

- S3 上のレポート本文を取得する `get_report` 機能を追加。

### 修正

- マージ前レビュー指摘（warn 2件）を反映。

## [0.1.6] - 2026-05-27

### 変更

- `@anytime-markdown/mcp-cms` とのリリース整合のためのバージョン更新。機能変更なし。

## [0.1.5] - 2026-05-04

### 修正

- React コンポーネントの props を `Readonly` でラップ（Sonar S6759）
- 不要な型アサーションを削除（Sonar S4325）

## [0.1.4] - 2026-05-02

### 変更

- Jest カバレッジ設定を共通 `jest.config.base.js` に集約

## [0.1.3] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.1.2] - 2026-04-12

### 変更

- E2E カバレッジ連携のため jest `coverageReporters` に `json-summary` を追加

## [0.1.1] - 2026-04-04

### 追加

- S3 特許ファイル操作用 patentService

### 修正

- listPatentFiles の日付フォーマットバリデーションを追加

## [0.1.0] - 2026-03-29

### 追加
- `mcp-cms-remote` パッケージ: API キー認証と Streamable HTTP による Cloudflare Workers エントリポイント
- コンテンツベースのツールインターフェースを持つリモート MCP サーバー定義
- リモート MCP サーバーのユニットテスト

## [0.0.1] - 2026-03-27

初回リリース。

### 追加

- S3 クライアント設定（`createCmsConfig`, `createS3Client`）と環境変数サポート
- ドキュメントサービス: `listDocs`, `uploadDoc`, `deleteDoc` による S3 ドキュメント管理
- レポートサービス: `listReportKeys`, `uploadReport` による S3 レポート管理
- ファイル名バリデーション（パストラバーサル・特殊文字の防止）
- 許可ファイル形式の制限（`.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`）
- ドキュメント・レポートサービスのユニットテスト
