import Graph from 'graphology';
import type { CodeGraphEdge, CodeGraphNode } from './CodeGraph.types';

type NodeInput = Omit<CodeGraphNode, 'community' | 'communityLabel' | 'x' | 'y' | 'size'>;
type EdgeInput = CodeGraphEdge;

export class GraphBuilder {
  private readonly nodes = new Map<string, NodeInput>();
  private readonly edges: EdgeInput[] = [];

  addNode(node: NodeInput): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: EdgeInput): void {
    this.edges.push(edge);
  }

  build(): Graph {
    const g = new Graph({ multi: false });
    for (const [id, attrs] of this.nodes) {
      g.addNode(id, { ...attrs, size: 0 });
    }
    for (const edge of this.edges) {
      if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
      if (g.hasEdge(edge.source, edge.target)) continue;
      g.addEdge(edge.source, edge.target, {
        confidence: edge.confidence,
        confidence_score: edge.confidence_score,
        crossRepo: edge.crossRepo,
      });
      g.setNodeAttribute(
        edge.target,
        'size',
        (g.getNodeAttribute(edge.target, 'size') as number) + 1,
      );
    }
    return g;
  }
}
