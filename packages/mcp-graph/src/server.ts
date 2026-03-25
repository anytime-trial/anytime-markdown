import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readGraph } from './tools/readGraph';
import { writeGraph } from './tools/writeGraph';
import { createGraphFile } from './tools/createGraph';
import { addNode } from './tools/addNode';
import { updateNode } from './tools/updateNode';
import { removeNode } from './tools/removeNode';
import { addEdge } from './tools/addEdge';
import { removeEdge } from './tools/removeEdge';
import { listNodes } from './tools/listNodes';
import { exportSvg } from './tools/exportSvg';
import { exportDrawio } from './tools/exportDrawio';
import { importDrawio } from './tools/importDrawio';

export interface McpGraphOptions {
  rootDir: string;
}

const nodeTypeEnum = z.enum(['rect', 'ellipse', 'sticky', 'text', 'diamond', 'parallelogram', 'cylinder', 'insight', 'doc', 'frame', 'image']);
const edgeTypeEnum = z.enum(['line', 'arrow', 'connector']);
const endpointSchema = z.object({
  nodeId: z.string().optional(),
  x: z.number(),
  y: z.number(),
});

export function createMcpServer(options: McpGraphOptions): McpServer {
  const { rootDir } = options;

  const server = new McpServer({
    name: 'anytime-markdown-graph',
    version: '0.8.1',
  });

  server.tool(
    'read_graph',
    'Read a graph document (.graph.json)',
    { path: z.string().describe('Relative path to the .graph.json file') },
    async ({ path }) => {
      const doc = await readGraph({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  server.tool(
    'write_graph',
    'Write a graph document to a .graph.json file',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      document: z.string().describe('Graph document as JSON string'),
    },
    async ({ path, document: docStr }) => {
      const doc = JSON.parse(docStr);
      await writeGraph({ path, document: doc }, rootDir);
      return { content: [{ type: 'text' as const, text: `Written to ${path}` }] };
    },
  );

  server.tool(
    'create_graph',
    'Create a new empty graph document',
    {
      path: z.string().describe('Relative path for the new .graph.json file'),
      name: z.string().describe('Name of the graph document'),
    },
    async ({ path, name }) => {
      const doc = await createGraphFile({ path, name }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  server.tool(
    'add_node',
    'Add a node to a graph document (with grid snap)',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      type: nodeTypeEnum.describe('Node type'),
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
      text: z.string().optional().describe('Node text'),
      width: z.number().optional().describe('Node width'),
      height: z.number().optional().describe('Node height'),
    },
    async ({ path, type, x, y, text, width, height }) => {
      const node = await addNode({ path, type, x, y, text, width, height }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(node, null, 2) }] };
    },
  );

  server.tool(
    'update_node',
    'Update properties of a node in a graph document',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      nodeId: z.string().describe('ID of the node to update'),
      changes: z.string().describe('JSON string of properties to update'),
    },
    async ({ path, nodeId, changes }) => {
      const node = await updateNode({ path, nodeId, changes: JSON.parse(changes) }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(node, null, 2) }] };
    },
  );

  server.tool(
    'remove_node',
    'Remove a node and its connected edges from a graph document',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      nodeId: z.string().describe('ID of the node to remove'),
    },
    async ({ path, nodeId }) => {
      await removeNode({ path, nodeId }, rootDir);
      return { content: [{ type: 'text' as const, text: `Removed node ${nodeId}` }] };
    },
  );

  server.tool(
    'add_edge',
    'Add an edge between two nodes in a graph document',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      type: edgeTypeEnum.describe('Edge type'),
      from: endpointSchema.describe('Source endpoint'),
      to: endpointSchema.describe('Target endpoint'),
      label: z.string().optional().describe('Edge label'),
    },
    async ({ path, type, from, to, label }) => {
      const edge = await addEdge({ path, type, from, to, label }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(edge, null, 2) }] };
    },
  );

  server.tool(
    'remove_edge',
    'Remove an edge from a graph document',
    {
      path: z.string().describe('Relative path to the .graph.json file'),
      edgeId: z.string().describe('ID of the edge to remove'),
    },
    async ({ path, edgeId }) => {
      await removeEdge({ path, edgeId }, rootDir);
      return { content: [{ type: 'text' as const, text: `Removed edge ${edgeId}` }] };
    },
  );

  server.tool(
    'list_nodes',
    'List all nodes in a graph document with summary info',
    { path: z.string().describe('Relative path to the .graph.json file') },
    async ({ path }) => {
      const nodes = await listNodes({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(nodes, null, 2) }] };
    },
  );

  server.tool(
    'export_svg',
    'Export a graph document as SVG',
    { path: z.string().describe('Relative path to the .graph.json file') },
    async ({ path }) => {
      const svg = await exportSvg({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: svg }] };
    },
  );

  server.tool(
    'export_drawio',
    'Export a graph document as draw.io XML',
    { path: z.string().describe('Relative path to the .graph.json file') },
    async ({ path }) => {
      const xml = await exportDrawio({ path }, rootDir);
      return { content: [{ type: 'text' as const, text: xml }] };
    },
  );

  server.tool(
    'import_drawio',
    'Import a draw.io XML and create a graph document',
    {
      path: z.string().describe('Relative path for the output .graph.json file'),
      drawioContent: z.string().describe('draw.io XML content'),
    },
    async ({ path, drawioContent }) => {
      const doc = await importDrawio({ path, drawioContent }, rootDir);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] };
    },
  );

  return server;
}
