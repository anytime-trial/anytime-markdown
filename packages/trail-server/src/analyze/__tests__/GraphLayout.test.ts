import Graph from 'graphology';
import { GraphLayout } from '../GraphLayout';

describe('GraphLayout', () => {
  it('assigns x and y to every node', () => {
    const g = new Graph();
    g.addNode('A', { size: 1 });
    g.addNode('B', { size: 1 });
    g.addEdge('A', 'B');

    const layout = new GraphLayout();
    layout.apply(g);

    g.forEachNode((node) => {
      expect(typeof g.getNodeAttribute(node, 'x')).toBe('number');
      expect(typeof g.getNodeAttribute(node, 'y')).toBe('number');
    });
  });
});
