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
