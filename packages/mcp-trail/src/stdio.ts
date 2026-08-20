import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { runStartupDbSelfCheck } from './selfCheck.js';

async function main() {
  // DB 疎通を起動時に 1 回だけ確かめる。失敗しても起動は止めない（selfCheck.ts の注記参照）。
  await runStartupDbSelfCheck();
  const server = createMcpServer({
    serverUrl: process.env['TRAIL_SERVER_URL'],
    repoName: process.env['TRAIL_REPO_NAME'],
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
