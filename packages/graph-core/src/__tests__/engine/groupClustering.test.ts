import { clusterByY } from '../../engine/groupClustering';
import type { GraphNode } from '../../types';
import { DEFAULT_NODE_STYLE } from '../../types';

function makeNode(id: string, x: number, y: number, h = 60): GraphNode {
  return { id, type: 'rect', x, y, width: 100, height: h, text: id, style: DEFAULT_NODE_STYLE };
}

describe('clusterByY', () => {
  it('returns empty array for empty input (line 9)', () => {
    expect(clusterByY([])).toEqual([]);
  });

  it('returns single cluster for one node', () => {
    const node = makeNode('n1', 0, 100);
    const clusters = clusterByY([node]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual([node]);
  });

  it('groups nodes in the same Y row into one cluster', () => {
    const n1 = makeNode('n1', 0, 100);
    const n2 = makeNode('n2', 200, 105); // close in Y
    const clusters = clusterByY([n1, n2]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('separates nodes with large Y difference into different clusters', () => {
    const n1 = makeNode('n1', 0, 0);
    const n2 = makeNode('n2', 0, 500);
    const clusters = clusterByY([n1, n2]);
    expect(clusters).toHaveLength(2);
  });

  it('uses custom rowThreshold', () => {
    const n1 = makeNode('n1', 0, 0);
    const n2 = makeNode('n2', 0, 200);
    // With threshold 10, these should be in separate clusters
    const separate = clusterByY([n1, n2], 10);
    expect(separate).toHaveLength(2);
    // With threshold 300, they should be in the same cluster
    const together = clusterByY([n1, n2], 300);
    expect(together).toHaveLength(1);
  });

  it('uses max(heights)*1.5 as default threshold when rowThreshold is omitted', () => {
    // nodes with height=60, threshold = 60*1.5 = 90
    const n1 = makeNode('n1', 0, 0);      // y=0
    const n2 = makeNode('n2', 0, 50);     // |50 - 0| = 50 < 90 → same cluster
    const n3 = makeNode('n3', 0, 200);    // |200 - 0| = 200 > 90 → new cluster
    const clusters = clusterByY([n1, n2, n3]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toHaveLength(2); // n1, n2
    expect(clusters[1]).toHaveLength(1); // n3
  });

  it('sorts nodes by y before clustering', () => {
    const n1 = makeNode('n1', 0, 300); // out of order
    const n2 = makeNode('n2', 0, 0);
    const clusters = clusterByY([n1, n2]);
    // Should be 2 clusters (y difference=300 > threshold=90), n2 comes first
    expect(clusters[0][0].id).toBe('n2');
    expect(clusters[1][0].id).toBe('n1');
  });
});
