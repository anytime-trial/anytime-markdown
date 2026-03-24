import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const server = createMcpServer({ rootDir: process.cwd() });
const transport = new StdioServerTransport();
await server.connect(transport);
