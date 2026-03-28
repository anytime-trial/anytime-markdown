# @anytime-markdown/mcp-cms

MCP (Model Context Protocol) server for Anytime Markdown CMS operations.

## Overview

Exposes S3-based document and report management as MCP tools, enabling AI assistants to manage CMS content via the MCP protocol.

## Tools

| Tool | Description |
| --- | --- |
| `upload_report` | Upload a local Markdown file to S3 reports prefix |
| `list_reports` | List all report files in S3 reports prefix |
| `upload_doc` | Upload a local file (Markdown or image) to S3 docs prefix |
| `list_docs` | List all document files in S3 docs prefix |
| `delete_doc` | Delete a document from S3 docs prefix |

## Usage

### Claude Code (`.mcp.json`)

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

### Standalone

```bash
npx tsx packages/mcp-cms/src/stdio.ts
```

Environment variables are loaded from `.env` via dotenv.

## Dependencies

- `@anytime-markdown/cms-core` — S3 CMS core library
- `@modelcontextprotocol/sdk` — MCP server SDK
- `dotenv` — Environment variable loading
