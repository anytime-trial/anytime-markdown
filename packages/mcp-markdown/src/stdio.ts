import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main() {
  // VS Code 拡張から子プロセス起動される場合、cwd はワークスペースとは限らないため
  // ANYTIME_MARKDOWN_ROOT でワークスペースルートを受け取る。standalone (`npx mcp-markdown`)
  // 起動では未設定なので従来どおり cwd にフォールバックする。
  const rootDir = process.env.ANYTIME_MARKDOWN_ROOT ?? process.cwd();
  const server = createMcpServer({ rootDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
