import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readGraph } from './tools/readGraph';
import { writeGraph } from './tools/writeGraph';
import { exportSvg } from './tools/exportSvg';
import { exportDrawio } from './tools/exportDrawio';
import { importDrawio } from './tools/importDrawio';
import { batchImport } from './tools/batchImport';
import { writeCooccurrence } from './tools/writeCooccurrence';
import { readCooccurrence } from './tools/readCooccurrence';

export interface McpGraphOptions {
  rootDir: string;
}

const noteSchema = z
  .string()
  .optional()
  .describe('Free-form note shown when the element is hovered. Omit for no note; an empty string is rejected');
/**
 * スライス別の値。キーはスライスのラベル（設計書 §5）。添字で受けると、スライスを 1 つ挿入した
 * 瞬間に、それ以前の呼び出しが指していた対象が黙ってずれる。
 */
const sliceValuesSchema = z
  .record(z.string(), z.number())
  .optional()
  .describe('Per-slice values keyed by slice label. Use with slices; omit for a graph without a time axis');
const cooccurrenceSliceSchema = z.object({
  label: z.string().describe('Slice label (unique, used as the key of sliceValues)'),
  at: z.string().optional().describe('ISO 8601 date of the slice. Slices with a date must be in chronological order'),
});
const cooccurrenceTermSchema = z.object({
  label: z.string().describe('Term label'),
  frequency: z
    .number()
    .optional()
    .describe('Term frequency. Omit when slices are given; the total is derived from the sum of sliceValues'),
  sliceValues: sliceValuesSchema,
  note: noteSchema,
});
const cooccurrenceLinkSchema = z.object({
  source: z.string().describe('Source term label'),
  target: z.string().describe('Target term label'),
  strength: z
    .number()
    .optional()
    .describe('Cooccurrence strength. Omit when slices are given; the total is derived from the sum of sliceValues'),
  sliceValues: sliceValuesSchema,
  direction: z
    .enum(['none', 'forward', 'backward', 'both'])
    .optional()
    .describe('Direction of the relation (source to target). Omit for an undirected cooccurrence'),
  note: noteSchema,
});
const cooccurrenceSubclusterSchema = z.object({
  label: z.string().describe('Subcluster label'),
  members: z.array(z.string()).describe('Subcluster member term labels'),
});
const cooccurrenceClusterSchema = z.object({
  label: z.string().describe('Cluster label'),
  members: z.array(z.string()).describe('Cluster member term labels'),
  subclusters: z
    .array(cooccurrenceSubclusterSchema)
    .optional()
    .describe(
      'One level of subdivision inside the cluster. Members must be a subset of the cluster members and must not overlap each other',
    ),
  note: noteSchema,
});

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

/**
 * server.registerTool() のラッパー。MCP SDK の Zod スキーマ型推論が TS2589
 * (excessively deep) を引き起こすため、SDK 呼び出しを @ts-expect-error で抑制する。
 * ハンドラ引数の型は inputSchema から z.infer ベースのマップ型で復元するため、
 * 各ハンドラの分割代入は従来どおり型安全に保たれる（手動 as キャスト不要）。
 */
function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: { [K in keyof Shape]: z.infer<Shape[K]> }) => Promise<ToolResult>,
): void {
  // @ts-expect-error TS2589: MCP SDK の Zod 型推論が深すぎる既知の制限
  server.registerTool(name, { description, inputSchema }, handler);
}

export function createMcpServer(options: McpGraphOptions): McpServer {
  const { rootDir } = options;

  const server = new McpServer({
    name: 'anytime-markdown-graph',
    version: '0.8.1',
  });

  registerTool(server, 'read_graph',
    'Read a graph document (.graph)',
    { path: z.string().describe('Relative path to the .graph file') },
    async ({ path }) => {
      const doc = await readGraph({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  registerTool(server, 'write_graph',
    'Write a graph document to a .graph file',
    {
      path: z.string().describe('Relative path to the .graph file'),
      document: z.string().describe('Graph document as JSON string'),
    },
    async ({ path, document: docStr }) => {
      const doc = JSON.parse(docStr);
      await writeGraph({ path, document: doc }, rootDir);
      return { content: [{ type: 'text' as const, text: `Written to ${path}` }] };
    },
  );

  registerTool(server, 'export_svg',
    'Export a graph document as SVG',
    { path: z.string().describe('Relative path to the .graph file') },
    async ({ path }) => {
      const svg = await exportSvg({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: svg }] };
    },
  );

  registerTool(server, 'export_drawio',
    'Export a graph document as draw.io XML',
    { path: z.string().describe('Relative path to the .graph file') },
    async ({ path }) => {
      const xml = await exportDrawio({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: xml }] };
    },
  );

  registerTool(server, 'import_drawio',
    'Import a draw.io XML and create a graph document',
    {
      path: z.string().describe('Relative path for the output .graph file'),
      drawioContent: z.string().describe('draw.io XML content'),
    },
    async ({ path, drawioContent }) => {
      const doc = await importDrawio({ path, drawioContent }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  registerTool(server, 'batch_import',
    'Create a graph from structured batch data (nodes + edges)',
    {
      path: z.string().describe('Relative path for the output .graph file'),
      name: z.string().optional().describe('Name of the graph document'),
      nodes: z.array(z.object({
        id: z.string().describe('User-supplied node ID (mapped to internal UUID)'),
        text: z.string().describe('Node label text'),
        metadata: z.record(z.union([z.string(), z.number()])).optional()
          .describe('Key-value metadata for data-driven styling'),
        url: z.string().optional().describe('URL associated with the node'),
      })).describe('Array of nodes to create'),
      edges: z.array(z.object({
        fromId: z.string().describe('Source node ID (user-supplied)'),
        toId: z.string().describe('Target node ID (user-supplied)'),
        weight: z.number().min(0).max(1).optional().describe('Edge weight (0-1)'),
        label: z.string().optional().describe('Edge label'),
      })).describe('Array of edges to create'),
    },
    async ({ path, name, nodes, edges }) => {
      const doc = await batchImport({ path, name, nodes, edges }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  registerTool(server, 'write_cooccurrence',
    'Write a cooccurrence network to a .cooc.json file',
    {
      path: z.string().describe('Relative path to the .cooc.json file'),
      mode: z.enum(['replace', 'append']).describe('replace overwrites the file, append preserves existing terms and links'),
      title: z.string().optional().describe('Optional network title'),
      subject: z.string().optional().describe('Optional subject term label'),
      slices: z
        .array(cooccurrenceSliceSchema)
        .optional()
        .describe('Time axis slices in chronological order. Each layer of the diagram is one slice'),
      terms: z.array(cooccurrenceTermSchema).describe('Terms with labels and frequencies'),
      links: z.array(cooccurrenceLinkSchema).describe('Cooccurrences by term label'),
      clusters: z.array(cooccurrenceClusterSchema).optional().describe('Clusters by term label'),
    },
    async ({ path, mode, title, subject, slices, terms, links, clusters }) => {
      const result = await writeCooccurrence({ path, mode, title, subject, slices, terms, links, clusters }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  registerTool(server, 'read_cooccurrence',
    'Read a cooccurrence network (.cooc.json) with term-label endpoints',
    { path: z.string().describe('Relative path to the .cooc.json file') },
    async ({ path }) => {
      const result = await readCooccurrence({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
