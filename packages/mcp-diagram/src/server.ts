import {
  DIAGRAM_ENDPOINTS,
  DIAGRAM_LINE_COLORS,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_RELATIONS,
  DIAGRAM_SPACING_RANGE,
} from '@anytime-markdown/diagram-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { readDiagram } from './tools/readDiagram.js';
import { setDiagramLayout, writeDiagram } from './tools/writeDiagram.js';

export interface McpDiagramOptions {
  rootDir: string;
}

const pathSchema = z
  .string()
  .describe('Path to the diagram file, relative to the workspace root. Must end with .diagram.json');

const groupAxisSchema = z.object({
  id: z.string().describe('Axis id, referenced by each family\'s groups object'),
  label: z.string().describe('Human-readable axis name shown in the legend'),
  values: z.record(z.string(), z.string()).describe('Value id to display label'),
});

const familySchema = z.object({
  parents: z.array(z.string()).min(1).describe('One or two parent names. People are derived from families'),
  children: z.array(z.string()).describe('Child names. May be empty for a couple with no recorded children'),
  kind: z.enum(DIAGRAM_RELATIONS).describe('Relation kind: birth (solid), creation (dotted), oath (dashed)'),
  groups: z.record(z.string(), z.string()).describe('Group axis id to value id, for the badges on each card'),
});

const connectorSchema = z.object({
  id: z.string().min(1).describe('Stable id, unique within the chart. Keeps the line identified across renames'),
  from: z.string().min(1).describe('Element the line starts at'),
  to: z.string().min(1).describe('Element the line ends at'),
  line: z.enum(DIAGRAM_LINE_STYLES).describe('Line style'),
  color: z.enum(DIAGRAM_LINE_COLORS).default('default')
    .describe('Colour role. The literal colour comes from the host theme, so the chart stays readable in dark and light'),
  start: z.enum(DIAGRAM_ENDPOINTS).describe('Marker at the from end'),
  end: z.enum(DIAGRAM_ENDPOINTS).describe('Marker at the to end'),
});

const placementSchema = z.object({
  column: z.number().int().min(0).describe('Grid column (generation). Not a pixel coordinate'),
  row: z.number().int().min(0).describe('Grid row within the column. Not a pixel coordinate'),
});

const spacingSchema = z
  .object({
    columnGap: z.number().min(DIAGRAM_SPACING_RANGE.columnGap.min).max(DIAGRAM_SPACING_RANGE.columnGap.max).optional(),
    nodeWidth: z.number().min(DIAGRAM_SPACING_RANGE.nodeWidth.min).max(DIAGRAM_SPACING_RANGE.nodeWidth.max).optional(),
    rowGap: z.number().min(DIAGRAM_SPACING_RANGE.rowGap.min).max(DIAGRAM_SPACING_RANGE.rowGap.max).optional(),
    nodeHeight: z.number().min(DIAGRAM_SPACING_RANGE.nodeHeight.min).max(DIAGRAM_SPACING_RANGE.nodeHeight.max).optional(),
  })
  .describe('Chart spacing in pixels, shared by the whole chart. Omitted fields fall back to the default');

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** 成功も失敗も同じ形（テキスト 1 件）で返す。MCP クライアントは `isError` で分岐する。 */
function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  };
}

/**
 * `server.registerTool()` のラッパー。MCP SDK の Zod スキーマ型推論が TS2589
 * (excessively deep) を引き起こすため、SDK 呼び出しを `@ts-expect-error` で抑制する。
 *
 * ハンドラ引数の型は `inputSchema` から `z.infer` ベースのマップ型で復元するので、各ハンドラの
 * 分割代入は型安全に保たれる（手動の `as` キャストが要らない）。mcp-graph と同じ作法。
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

export function createMcpServer(options: McpDiagramOptions): McpServer {
  const server = new McpServer({ name: 'mcp-diagram', version: '0.1.0' });
  const { rootDir } = options;

  registerTool(
    server,
    'read_diagram',
    'Read a genealogy diagram (*.diagram.json): its text, group axes, families and saved layout overrides.',
    { path: pathSchema },
    async (input) => {
      try {
        return ok(await readDiagram(input, rootDir));
      } catch (error) {
        return fail(error);
      }
    },
  );

  registerTool(
    server,
    'write_diagram',
    'Create or replace a genealogy diagram. People come from the families plus the standalone nodes list. '
    + 'Saved layout overrides in an existing file are kept — use set_diagram_layout to change placements. '
    + 'Omitted nodes / connectors are kept from the existing file too, so editing families alone never drops them.',
    {
      path: pathSchema,
      title: z.string().describe('Chart title'),
      lead: z.string().optional().describe('Introductory paragraph shown above the chart'),
      note: z.string().optional().describe('Closing note shown below the chart'),
      legend: z.string().optional().describe('One sentence explaining what the line styles mean in this chart'),
      groups: z.array(groupAxisSchema).optional().describe('Classification axes, in the order badges are shown'),
      families: z.array(familySchema).describe('Families. People are derived from them. May be empty when nodes carries the elements'),
      nodes: z.array(z.string().min(1)).optional()
        .describe('Standalone elements that appear in no family. Omit to keep the ones already in the file'),
      connectors: z.array(connectorSchema).optional()
        .describe('Hand-drawn lines between elements. Omit to keep the ones already in the file'),
      annotations: z.record(z.string(), z.string()).optional().describe('Person name to a short note on their card'),
    },
    async (input) => {
      try {
        return ok(await writeDiagram(input, rootDir));
      } catch (error) {
        return fail(error);
      }
    },
  );

  registerTool(
    server,
    'set_diagram_layout',
    'Replace the layout overrides of a diagram: which people sit in which grid cell, plus the shared spacing. '
    + 'Only people you moved need an entry; everyone else follows the automatic layout. '
    + 'Two people may not share a cell — the call is rejected rather than silently nudged.',
    {
      path: pathSchema,
      placements: z.record(z.string(), placementSchema)
        .describe('Person name to grid cell. This replaces the whole override set, it is not merged'),
      spacing: spacingSchema.optional(),
    },
    async (input) => {
      try {
        return ok(await setDiagramLayout(input, rootDir));
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
