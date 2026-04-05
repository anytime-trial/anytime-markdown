import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseMermaidC4,
  extractBoundaries,
  buildC4Matrix,
  detectCycles,
  clusterMatrix,
} from '@anytime-markdown/c4-kernel';
import type { C4Model, BoundaryInfo } from '@anytime-markdown/c4-kernel';

export interface McpC4Options {
  rootDir: string;
}

const levelEnum = z.enum(['component', 'package']);

export function createMcpServer(options: McpC4Options): McpServer {
  const { rootDir } = options;

  // --- State ---
  let currentModel: C4Model | null = null;
  let currentBoundaries: BoundaryInfo[] = [];

  const server = new McpServer({
    name: 'anytime-markdown-c4',
    version: '0.1.0',
  });

  // --- Helpers ---

  const NO_MODEL_HINT = 'No model loaded. Use load_c4_file or parse_c4_mermaid first.';

  function loadModel(text: string): { content: Array<{ type: 'text'; text: string }>; isError?: true } {
    try {
      currentModel = parseMermaidC4(text);
      currentBoundaries = extractBoundaries(text);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          title: currentModel.title,
          level: currentModel.level,
          elementCount: currentModel.elements.length,
          relationshipCount: currentModel.relationships.length,
          boundaryCount: currentBoundaries.length,
        }, null, 2) }],
      };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Parse error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
  }

  // --- Tools ---

  server.tool(
    'load_c4_file',
    'Load a C4 model from a Mermaid .mmd file',
    { path: z.string().describe('Relative or absolute path to the .mmd file') },
    async ({ path: filePath }) => {
      const resolved = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
      if (!fs.existsSync(resolved)) {
        return { content: [{ type: 'text' as const, text: `File not found: ${resolved}` }], isError: true };
      }
      return loadModel(fs.readFileSync(resolved, 'utf-8'));
    },
  );

  server.tool(
    'parse_c4_mermaid',
    'Parse Mermaid C4 text and set as current model',
    { text: z.string().describe('Mermaid C4 diagram text') },
    async ({ text }) => loadModel(text),
  );

  server.tool(
    'get_c4_model',
    'Get the current C4 model as JSON',
    {},
    async () => {
      if (!currentModel) {
        return { content: [{ type: 'text' as const, text: NO_MODEL_HINT }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(currentModel, null, 2) }] };
    },
  );

  server.tool(
    'get_dsm_matrix',
    'Get DSM adjacency matrix for the current C4 model',
    {
      level: levelEnum.describe('Granularity: "component" for element-level, "package" for boundary-level'),
      boundaryId: z.string().optional().describe('Optional: filter to elements within this boundary'),
    },
    async ({ level, boundaryId }) => {
      if (!currentModel) {
        return { content: [{ type: 'text' as const, text: NO_MODEL_HINT }], isError: true };
      }

      let model = currentModel;
      if (boundaryId) {
        const childElements = model.elements.filter(e => e.boundaryId === boundaryId);
        if (childElements.length > 0) {
          const childIds = new Set(childElements.map(e => e.id));
          model = {
            ...model,
            elements: childElements,
            relationships: model.relationships.filter(r => childIds.has(r.from) || childIds.has(r.to)),
          };
        }
      }

      const matrix = buildC4Matrix(model, level, currentBoundaries);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          nodes: matrix.nodes.map(n => n.name),
          nodeIds: matrix.nodes.map(n => n.id),
          adjacency: matrix.adjacency,
          size: matrix.nodes.length,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'get_cycles',
    'Detect circular dependencies in the current C4 model',
    {
      level: levelEnum.describe('Granularity: "component" or "package"'),
    },
    async ({ level }) => {
      if (!currentModel) {
        return { content: [{ type: 'text' as const, text: NO_MODEL_HINT }], isError: true };
      }

      const matrix = buildC4Matrix(currentModel, level, currentBoundaries);
      const sccs = detectCycles(matrix.adjacency, matrix.nodes.map(n => n.id));

      // Map IDs to names
      const idToName = new Map(matrix.nodes.map(n => [n.id, n.name]));
      const cycles = sccs.map(scc => scc.map(id => idToName.get(id) ?? id));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          cycleCount: cycles.length,
          cycles,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'cluster_matrix',
    'Get clustered (reordered) DSM matrix using Reverse Cuthill-McKee algorithm',
    {
      level: levelEnum.describe('Granularity: "component" or "package"'),
    },
    async ({ level }) => {
      if (!currentModel) {
        return { content: [{ type: 'text' as const, text: NO_MODEL_HINT }], isError: true };
      }

      const matrix = buildC4Matrix(currentModel, level, currentBoundaries);
      const clustered = clusterMatrix(matrix);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          nodes: clustered.nodes.map(n => n.name),
          nodeIds: clustered.nodes.map(n => n.id),
          adjacency: clustered.adjacency,
          size: clustered.nodes.length,
        }, null, 2) }],
      };
    },
  );

  return server;
}
