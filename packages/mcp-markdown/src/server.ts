import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readMarkdown } from './tools/readMarkdown';
import { writeMarkdown } from './tools/writeMarkdown';
import { getOutline } from './tools/getOutline';
import { getSection } from './tools/getSection';
import { updateSection } from './tools/updateSection';
import { sanitize } from './tools/sanitizeMarkdown';
import { diff } from './tools/computeDiff';
import { runSearchDocs, runBacklinks, runNeighbors } from './tools/docSearch';

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
      maxChars: z.number().optional().describe('Truncate the returned section to this many characters (token saving)'),
    },
    async (args) => {
      const path = args.path as string;
      const heading = args.heading as string;
      const maxChars = args.maxChars as number | undefined;
      const section = await getSection({ path, heading, maxChars }, rootDir);
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

  // --- doc-core 検索（markdown 拡張が ingest した doc-core.db を読む） ---

  registerTool(server, 'search_docs',
    'Search the document index (doc-core.db) by keyword (FTS5) and/or frontmatter facets (category/type/lang). Returns path/title/excerpt (+ snippet for keyword) so you can judge relevance without opening files.',
    {
      query: z.string().optional().describe('Free-text keyword query (FTS5). Omit to filter by facets only.'),
      category: z.string().optional().describe('Filter by frontmatter category (exact match)'),
      type: z.string().optional().describe('Filter by frontmatter type (exact match, e.g. spec/plan)'),
      lang: z.string().optional().describe('Filter by frontmatter lang (exact match, e.g. ja/en)'),
      limit: z.number().optional().describe('Max results (default 8)'),
      snippetTokens: z.number().optional().describe('Keyword-match snippet length in FTS5 trigram tokens (~chars, default 24, max 64)'),
    },
    async (args) => {
      const hits = runSearchDocs(rootDir, {
        query: args.query as string | undefined,
        category: args.category as string | undefined,
        type: args.type as string | undefined,
        lang: args.lang as string | undefined,
        limit: args.limit as number | undefined,
        snippetTokens: args.snippetTokens as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(hits, null, 2) }] };
    },
  );

  registerTool(server, 'doc_backlinks',
    'List documents that link to the given doc (typed relations: who references/depends-on/implements it)',
    {
      path: z.string().describe('Target doc path (root-relative, e.g. spec/...)'),
      type: z.string().optional().describe('Relation type filter: references/depends-on/implements/part-of/supersedes/refines'),
    },
    async (args) => {
      const edges = runBacklinks(rootDir, args.path as string, args.type as string | undefined);
      return { content: [{ type: 'text' as const, text: JSON.stringify(edges, null, 2) }] };
    },
  );

  registerTool(server, 'doc_neighbors',
    'List related documents via undirected relation-graph BFS (N hops) from the given doc',
    {
      path: z.string().describe('Center doc path (root-relative, e.g. spec/...)'),
      hops: z.number().optional().describe('BFS hops (default 1)'),
    },
    async (args) => {
      const paths = runNeighbors(rootDir, args.path as string, args.hops as number | undefined);
      return { content: [{ type: 'text' as const, text: JSON.stringify(paths, null, 2) }] };
    },
  );

  return server;
}
