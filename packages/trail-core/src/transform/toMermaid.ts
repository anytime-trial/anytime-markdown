import type { TrailGraph, TrailEdgeType } from '../model/types';

export interface MermaidOptions {
  readonly granularity: 'module' | 'symbol';
  readonly direction?: 'TD' | 'LR';
  readonly edgeTypes?: readonly TrailEdgeType[];
}

const EDGE_STYLE: Readonly<Record<TrailEdgeType, string>> = {
  import: '-->',
  call: '-.->',
  type_use: '-.->',
  inheritance: '==>',
  implementation: '==>',
  override: '-.->',
};

const ALL_EDGE_TYPES: readonly TrailEdgeType[] = [
  'import', 'call', 'type_use', 'inheritance', 'implementation', 'override',
];

function toMermaidId(id: string): string {
  return id.replaceAll(/[^a-zA-Z0-9_]/g, '_');
}

function toModuleMermaid(
  graph: TrailGraph,
  direction: string,
  edgeTypes: ReadonlySet<TrailEdgeType>,
): string {
  const lines: string[] = [`graph ${direction}`];

  const fileNodes = graph.nodes.filter(n => n.type === 'file');
  for (const node of fileNodes) {
    lines.push(`  ${toMermaidId(node.id)}["${node.filePath}"]`);
  }

  const fileIds = new Set(fileNodes.map(n => n.id));
  for (const edge of graph.edges) {
    if (!edgeTypes.has(edge.type)) continue;
    if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue;
    const arrow = EDGE_STYLE[edge.type];
    lines.push(`  ${toMermaidId(edge.source)} ${arrow}|${edge.type}| ${toMermaidId(edge.target)}`);
  }

  return lines.join('\n') + '\n';
}

function toSymbolMermaid(
  graph: TrailGraph,
  direction: string,
  edgeTypes: ReadonlySet<TrailEdgeType>,
): string {
  const lines: string[] = [`graph ${direction}`];

  const fileNodes = graph.nodes.filter(n => n.type === 'file');
  const symbolsByFile = new Map<string, typeof graph.nodes[number][]>();
  for (const node of graph.nodes) {
    if (node.type === 'file') continue;
    const fileId = node.parent ?? node.filePath;
    const list = symbolsByFile.get(fileId);
    if (list) {
      list.push(node);
    } else {
      symbolsByFile.set(fileId, [node]);
    }
  }

  for (const fileNode of fileNodes) {
    const symbols = symbolsByFile.get(fileNode.id) ?? [];
    if (symbols.length === 0) {
      lines.push(`  ${toMermaidId(fileNode.id)}["${fileNode.filePath}"]`);
      continue;
    }
    lines.push(`  subgraph ${toMermaidId(fileNode.id)} ["${fileNode.filePath}"]`);
    for (const sym of symbols) {
      lines.push(`    ${toMermaidId(sym.id)}["${sym.label}"]`);
    }
    lines.push('  end');
  }

  const nodeIds = new Set(graph.nodes.filter(n => n.type !== 'file').map(n => n.id));
  for (const edge of graph.edges) {
    if (!edgeTypes.has(edge.type)) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const arrow = EDGE_STYLE[edge.type];
    lines.push(`  ${toMermaidId(edge.source)} ${arrow}|${edge.type}| ${toMermaidId(edge.target)}`);
  }

  return lines.join('\n') + '\n';
}

export function toMermaid(graph: TrailGraph, options: MermaidOptions): string {
  const direction = options.direction ?? 'TD';
  const edgeTypes = new Set<TrailEdgeType>(options.edgeTypes ?? ALL_EDGE_TYPES);

  if (options.granularity === 'module') {
    return toModuleMermaid(graph, direction, edgeTypes);
  }
  return toSymbolMermaid(graph, direction, edgeTypes);
}
