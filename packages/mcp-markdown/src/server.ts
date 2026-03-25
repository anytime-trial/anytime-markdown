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

export function createMcpServer(options: McpEditorOptions): McpServer {
  const { rootDir } = options;

  const server = new McpServer({
    name: 'anytime-markdown-editor',
    version: '0.8.1',
  });

  server.tool(
    'read_markdown',
    'Read a Markdown file and return its content',
    { path: z.string().describe('Relative path to the Markdown file') },
    async ({ path }) => {
      const content = await readMarkdown({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: content }] };
    },
  );

  server.tool(
    'write_markdown',
    'Write content to a Markdown file',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      content: z.string().describe('Markdown content to write'),
    },
    async ({ path, content }) => {
      await writeMarkdown({ path, content }, rootDir);
      return { content: [{ type: 'text' as const, text: `Written to ${path}` }] };
    },
  );

  server.tool(
    'get_outline',
    'Extract heading structure from a Markdown file as a flat list',
    { path: z.string().describe('Relative path to the Markdown file') },
    async ({ path }) => {
      const headings = await getOutline({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(headings, null, 2) }] };
    },
  );

  server.tool(
    'get_section',
    'Extract a section from a Markdown file by its heading (e.g. "## Section Name")',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      heading: z.string().describe('Full heading line including # marks (e.g. "## Section Name")'),
    },
    async ({ path, heading }) => {
      const section = await getSection({ path, heading }, rootDir);
      return { content: [{ type: 'text' as const, text: section }] };
    },
  );

  server.tool(
    'update_section',
    'Replace a section in a Markdown file identified by its heading',
    {
      path: z.string().describe('Relative path to the Markdown file'),
      heading: z.string().describe('Full heading line including # marks (e.g. "## Section Name")'),
      content: z.string().describe('New content for the section (should include the heading line)'),
    },
    async ({ path, heading, content }) => {
      await updateSection({ path, heading, content }, rootDir);
      return { content: [{ type: 'text' as const, text: `Updated section "${heading}" in ${path}` }] };
    },
  );

  server.tool(
    'sanitize_markdown',
    'Normalize and sanitize Markdown content using markdown-core rules',
    {
      content: z.string().optional().describe('Markdown content to sanitize'),
      path: z.string().optional().describe('Relative path to the Markdown file to sanitize'),
    },
    async ({ content, path }) => {
      const result = await sanitize({ content, path }, rootDir);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'compute_diff',
    'Compute diff between two Markdown contents or files',
    {
      contentA: z.string().optional().describe('First Markdown content'),
      contentB: z.string().optional().describe('Second Markdown content'),
      pathA: z.string().optional().describe('Relative path to first Markdown file'),
      pathB: z.string().optional().describe('Relative path to second Markdown file'),
    },
    async ({ contentA, contentB, pathA, pathB }) => {
      const result = await diff({ contentA, contentB, pathA, pathB }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
