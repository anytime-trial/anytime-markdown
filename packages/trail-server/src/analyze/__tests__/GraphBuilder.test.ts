import { GraphBuilder } from '../GraphBuilder';

describe('GraphBuilder', () => {
  it('builds graph from nodes and edges', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addNode({ id: 'src/B', label: 'B', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({
      source: 'src/A',
      target: 'src/B',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      crossRepo: false,
    });
    const g = builder.build();
    expect(g.order).toBe(2);
    expect(g.size).toBe(1);
  });

  it('deduplicates edges', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addNode({ id: 'src/B', label: 'B', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({
      source: 'src/A',
      target: 'src/B',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      crossRepo: false,
    });
    builder.addEdge({
      source: 'src/A',
      target: 'src/B',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      crossRepo: false,
    });
    const g = builder.build();
    expect(g.size).toBe(1);
  });

  it('skips edges for unknown nodes', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({
      source: 'src/A',
      target: 'src/UNKNOWN',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      crossRepo: false,
    });
    const g = builder.build();
    expect(g.size).toBe(0);
  });
});
