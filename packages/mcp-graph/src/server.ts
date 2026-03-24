import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface McpGraphOptions {
  rootDir: string;
}

export function createMcpServer(options: McpGraphOptions): McpServer {
  const server = new McpServer({
    name: 'anytime-markdown-graph',
    version: '0.7.7',
  });

  // ツールは後続タスクで追加

  return server;
}
