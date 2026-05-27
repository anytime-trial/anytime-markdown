import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readMarkdown } from './tools/readMarkdown';
import { writeMarkdown } from './tools/writeMarkdown';
import { getOutline } from './tools/getOutline';
import { getSection } from './tools/getSection';
import { updateSection } from './tools/updateSection';
import { sanitize } from './tools/sanitizeMarkdown';
import { diff } from './tools/computeDiff';

export interface McpEditorOptions {
  rootDir: string;
}

type ToolArgs = Record<string, unknown>;
type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type ToolCallback = (args: ToolArgs) => Promise<ToolResult>;

/**
 * server.registerTool() のラッパー。MCP SDK の Zod スキーマ型推論が TS2589 を引き起こすため、
 * パラメータ型を Record<string, z.ZodType> にキャストして型推論の深さを制限する。
 */
function registerTool(
  server: McpServer,
  name: string,
  description: string,
  params: Record<string, z.ZodType>,
  handler: ToolCallback,
): void {
  // @ts-expect-error TS2589: MCP SDK の Zod 型推論が深すぎる既知の制限
  server.registerTool(name, { description, inputSchema: params }, handler);
}

export function createMcpServer(options: McpEditorOptions): McpServer {
  const { rootDir } = options;

  const server = new McpServer({
    name: 'anytime-markdown-editor',
    version: '0.8.1',
  });

  registerTool(server, 'read_markdown',
    'Read a Markdown file and return its content',
    { path: z.string().describe('Relative path to the Markdown file') },
    async (args) => {
      const path = args.path as string;
      const content = await readMarkdown({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: content }] };
    },
  );

  registerTool(server, 'write_markdown',
    'Write content to a Markdown file',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      content: z.string().describe('Markdown content to write'),
    },
    async (args) => {
      const path = args.path as string;
      const content = args.content as string;
      await writeMarkdown({ path, content }, rootDir);
      return { content: [{ type: 'text' as const, text: `Written to ${path}` }] };
    },
  );

  registerTool(server, 'get_outline',
    'Extract heading structure from a Markdown file as a flat list',
    { path: z.string().describe('Relative path to the Markdown file') },
    async (args) => {
      const path = args.path as string;
      const headings = await getOutline({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(headings, null, 2) }] };
    },
  );

  registerTool(server, 'get_section',
    'Extract a section from a Markdown file by its heading (e.g. "## Section Name")',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      heading: z.string().describe('Full heading line including # marks (e.g. "## Section Name")'),
    },
    async (args) => {
      const path = args.path as string;
      const heading = args.heading as string;
      const section = await getSection({ path, heading }, rootDir);
      return { content: [{ type: 'text' as const, text: section }] };
    },
  );

  registerTool(server, 'update_section',
    'Replace a section in a Markdown file identified by its heading',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      heading: z.string().describe('Full heading line including # marks (e.g. "## Section Name")'),
      content: z.string().describe('New content for the section (should include the heading line)'),
    },
    async (args) => {
      const path = args.path as string;
      const heading = args.heading as string;
      const content = args.content as string;
      await updateSection({ path, heading, content }, rootDir);
      return { content: [{ type: 'text' as const, text: `Updated section "${heading}" in ${path}` }] };
    },
  );

  registerTool(server, 'sanitize_markdown',
    'Normalize and sanitize Markdown content using markdown-core rules',
    {
      content: z.string().optional().describe('Markdown content to sanitize'),
      path: z.string().optional().describe('Relative path to the Markdown file to sanitize'),
    },
    async (args) => {
      const content = args.content as string | undefined;
      const path = args.path as string | undefined;
      const result = await sanitize({ content, path }, rootDir);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  registerTool(server, 'compute_diff',
    'Compute diff between two Markdown contents or files',
    {
      contentA: z.string().optional().describe('First Markdown content'),
      contentB: z.string().optional().describe('Second Markdown content'),
      pathA: z.string().optional().describe('Relative path to first Markdown file'),
      pathB: z.string().optional().describe('Relative path to second Markdown file'),
    },
    async (args) => {
      const contentA = args.contentA as string | undefined;
      const contentB = args.contentB as string | undefined;
      const pathA = args.pathA as string | undefined;
      const pathB = args.pathB as string | undefined;
      const result = await diff({ contentA, contentB, pathA, pathB }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
