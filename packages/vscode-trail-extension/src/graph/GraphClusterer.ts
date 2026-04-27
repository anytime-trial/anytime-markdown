import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

export interface ClusterResult {
  /** nodeId → communityId */
  readonly communities: Record<string, number>;
  /** communityId → ラベル文字列 */
  readonly labels: Record<number, string>;
}

export class GraphClusterer {
  cluster(graph: Graph): ClusterResult {
    if (graph.order === 0) return { communities: {}, labels: {} };

    const communities = louvain(graph) as Record<string, number>;
    const labels = this.buildLabels(graph, communities);
    return { communities, labels };
  }

  private buildLabels(graph: Graph, communities: Record<string, number>): Record<number, string> {
    const votes: Record<number, Record<string, number>> = {};
    graph.forEachNode((node) => {
      const cid = communities[node];
      const pkg = (graph.getNodeAttribute(node, 'package') as string) || 'unknown';
      votes[cid] ??= {};
      votes[cid][pkg] = (votes[cid][pkg] ?? 0) + 1;
    });
    const labels: Record<number, string> = {};
    for (const [cidStr, pkgVotes] of Object.entries(votes)) {
      const cid = Number(cidStr);
      labels[cid] = Object.entries(pkgVotes).sort((a, b) => b[1] - a[1])[0][0];
    }
    return labels;
  }
}
