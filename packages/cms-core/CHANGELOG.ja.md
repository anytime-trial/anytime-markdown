# 変更履歴

"cms-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

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
