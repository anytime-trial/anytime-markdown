import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main() {
  const server = createMcpServer({
    serverUrl: process.env['TRAIL_SERVER_URL'],
    repoName: process.env['TRAIL_REPO_NAME'],
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
