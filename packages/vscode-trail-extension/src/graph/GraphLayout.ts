import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { random } from 'graphology-layout';

export class GraphLayout {
  apply(graph: Graph, iterations = 100): void {
    if (graph.order === 0) return;
    random.assign(graph);
    forceAtlas2.assign(graph, {
      iterations,
      settings: forceAtlas2.inferSettings(graph),
    });
  }
}
