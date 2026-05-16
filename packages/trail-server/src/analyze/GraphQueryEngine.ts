import Graph from 'graphology';
import { bidirectional } from 'graphology-shortest-path';
import type {
  CodeGraph,
  CodeGraphEdge,
  CodeGraphExplainResult,
  CodeGraphNode,
  CodeGraphPathResult,
  CodeGraphQueryResult,
} from './CodeGraph.types';

export class GraphQueryEngine {
  private readonly graph: Graph;
  private readonly nodeMap: Map<string, CodeGraphNode>;
  private readonly edgeList: readonly CodeGraphEdge[];

  constructor(private readonly codeGraph: CodeGraph) {
    this.graph = new Graph({ multi: false, type: 'directed' });
    this.nodeMap = new Map(codeGraph.nodes.map((n) => [n.id, n]));
    this.edgeList = codeGraph.edges;
    for (const n of codeGraph.nodes) this.graph.addNode(n.id);
    for (const e of codeGraph.edges) {
      if (this.graph.hasNode(e.source) && this.graph.hasNode(e.target) && !this.graph.hasEdge(e.source, e.target)) {
        this.graph.addEdge(e.source, e.target);
      }
    }
  }

  query(keyword: string, depth = 3): CodeGraphQueryResult {
    const lower = keyword.toLowerCase();
    const starts = this.codeGraph.nodes
      .filter((n) => n.label.toLowerCase().includes(lower) || n.id.toLowerCase().includes(lower))
      .map((n) => n.id);

    const visited = new Set<string>(starts);
    let frontier = new Set(starts);
    for (let i = 0; i < depth; i++) {
      const next = new Set<string>();
      for (const n of frontier) {
        if (!this.graph.hasNode(n)) continue;
        this.graph.neighbors(n).forEach((nb) => {
          if (!visited.has(nb)) {
            visited.add(nb);
            next.add(nb);
          }
        });
      }
      frontier = next;
    }
    const edges = this.edgeList
      .filter((e) => visited.has(e.source) && visited.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));
    return { nodes: [...visited], edges };
  }

  explain(nodeId: string): CodeGraphExplainResult | null {
    const node = this.nodeMap.get(nodeId);
    if (!node) return null;
    const incoming = this.edgeList.filter((e) => e.target === nodeId);
    const outgoing = this.edgeList.filter((e) => e.source === nodeId);
    return { node, incoming, outgoing };
  }

  path(from: string, to: string): CodeGraphPathResult {
    if (!this.graph.hasNode(from) || !this.graph.hasNode(to)) {
      return { found: false, path: [], hops: 0 };
    }
    try {
      const p = bidirectional(this.graph, from, to);
      if (!p) return { found: false, path: [], hops: 0 };
      return { found: true, path: p, hops: p.length - 1 };
    } catch {
      return { found: false, path: [], hops: 0 };
    }
  }
}
