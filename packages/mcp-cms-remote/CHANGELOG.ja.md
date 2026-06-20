# 変更履歴

`@anytime-markdown/mcp-cms-remote` に対するすべての重要な変更をこのファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.0.8] - 2026-06-20

### 追加

- S3 レポート本文を取得する `get_report` ツールを追加。

### セキュリティ

- `hono` を 4.12.20 → 4.12.26 に更新し、複数のセキュリティ脆弱性（CORS ワイルドカードバイパス、JWT スキーム混同、Cookie インジェクション、serve-static の path traversal ほか）を修正。

## [0.0.7] - 2026-05-27

### 変更

- SonarCloud S1874 非推奨 API の移行と機械的安全修正。

## [0.0.6] - 2026-05-20

### 変更

- `server.ts` ツールハンドラのユニットテストカバレッジを拡充

### セキュリティ

- `hono` および `ws` をバンプし moderate CVE を修正

## [0.0.5] - 2026-05-02

### 変更

- Jest カバレッジ設定を共通 `jest.config.base.js` に集約

## [0.0.4] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.0.3] - 2026-04-12

### 変更

- E2E カバレッジ連携のため jest `coverageReporters` に `json-summary` を追加

## [0.0.2] - 2026-03-28

### 追加

- MCP CMS Remote サーバー（Cloudflare Workers）の初回リリース
