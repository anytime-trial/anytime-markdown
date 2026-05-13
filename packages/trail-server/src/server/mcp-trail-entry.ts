import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '@anytime-markdown/mcp-trail';

async function main(): Promise<void> {
    const server = createMcpServer({
        serverUrl: process.env['TRAIL_SERVER_URL'],
        repoName: process.env['TRAIL_REPO_NAME'],
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    process.stderr.write(`[${new Date().toISOString()}] [ERROR] mcp-trail-server failed to start: ${message}\n`);
    process.exit(1);
});
