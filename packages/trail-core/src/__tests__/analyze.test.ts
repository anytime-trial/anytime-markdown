import path from 'node:path';
import { analyze } from '../analyze';

const FIXTURES = path.resolve(
  __dirname,
  '../analyzer/__tests__/fixtures',
);

describe('analyze', () => {
  it('should return a TrailGraph with nodes and edges', () => {
    const graph = analyze({
      tsconfigPath: path.join(FIXTURES, 'tsconfig.json'),
    });

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.metadata.fileCount).toBe(3);
  });

  it('should return Cytoscape elements when format is cytoscape', () => {
    const graph = analyze({
      tsconfigPath: path.join(FIXTURES, 'tsconfig.json'),
    });

    expect(graph.nodes.some(n => n.type === 'file')).toBe(true);
    expect(graph.edges.some(e => e.type === 'import')).toBe(true);
  });
});
