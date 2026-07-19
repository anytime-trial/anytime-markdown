# @anytime-markdown/mcp-cms

Anytime Markdown CMS 操作用の MCP（Model Context Protocol）サーバー。

## 概要

S3 ベースのドキュメント・レポート管理を MCP ツールとして公開し、AI アシスタントが MCP プロトコル経由で CMS コンテンツを管理できるようにします。

## ツール

| ツール | 説明 |
| --- | --- |
| `upload_report` | ローカル Markdown ファイルを S3 レポートプレフィックスにアップロード |
| `list_reports` | S3 レポートプレフィックス内の全レポートファイルを一覧表示 |
| `upload_doc` | ローカルファイル（Markdown または画像）を S3 ドキュメントプレフィックスにアップロード |
| `list_docs` | S3 ドキュメントプレフィックス内の全ドキュメントファイルを一覧表示 |
| `delete_doc` | S3 ドキュメントプレフィックスからドキュメントを削除 |
| `read_google_doc` | サービスアカウント認証で Google ドキュメントをプレーンテキストとして読み取り（`GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 設定時のみ登録） |

### Google Drive Reader（`read_google_doc`）のセットアップ

1. GCP プロジェクトで Drive API を有効化する。
2. サービスアカウントを作成し、JSON 鍵を発行する。
3. 対象の Google ドキュメントをサービスアカウントのメールアドレス（`xxx@yyy.iam.gserviceaccount.com`）と共有する（閲覧者権限で可）。
4. 環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` に鍵ファイルの絶対パスを設定する。鍵ファイルはリポジトリにコミットしない（`.gitignore` で `*service-account*.json` / `*.pem` を除外済み）。

未設定の場合、`read_google_doc` ツールは登録されない（他ツールには影響しない）。

## 使用方法

### Claude Code（`.mcp.json`）

```json
{
  "mcpServers": {
    "mcp-cms": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-cms/src/stdio.ts"],
      "env": {
        "ANYTIME_AWS_REGION": "ap-northeast-1",
        "S3_DOCS_BUCKET": "your-bucket",
        "S3_DOCS_PREFIX": "docs/",
        "S3_REPORTS_PREFIX": "reports/"
      }
    }
  }
}
```

### スタンドアロン

```bash
npx tsx packages/mcp-cms/src/stdio.ts
```

環境変数は dotenv 経由で `.env` から読み込まれます。

## 依存パッケージ

- `@anytime-markdown/cms-core` — S3 CMS コアライブラリ
- `@modelcontextprotocol/sdk` — MCP サーバー SDK
- `dotenv` — 環境変数読み込み
