import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { resolveRootDir } from './resolveRootDir.js';
import { createMcpServer } from './server.js';

async function main() {
  const server = createMcpServer({
    rootDir: resolveRootDir(process.env, process.cwd(), { warn: console.error }),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // stdout は MCP のトランスポートなので使えない。起動失敗を無言で終わらせない。
  process.stderr.write(
    `[mcp-diagram] failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exitCode = 1;
});
