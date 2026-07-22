import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { resolveRootDir } from './resolveRootDir.js';

async function main() {
  const server = createMcpServer({ rootDir: resolveRootDir() });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // stdout は MCP のトランスポートなので使えない。起動失敗を無言で終わらせない。
  process.stderr.write(
    `[mcp-graph] failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exitCode = 1;
});
