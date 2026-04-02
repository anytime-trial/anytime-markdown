import { toGraphDocument } from '../toGraphDocument';
import type { TrailGraph } from '../../model/types';

const graph: TrailGraph = {
  nodes: [
    { id: 'file::src/index.ts', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 1 },
    { id: 'file::src/index.ts::App', label: 'App', type: 'class', filePath: 'src/index.ts', line: 3, parent: 'file::src/index.ts' },
    { id: 'file::src/index.ts::App::run', label: 'run', type: 'function', filePath: 'src/index.ts', line: 5, parent: 'file::src/index.ts::App' },
  ],
  edges: [
    { source: 'file::src/index.ts::App::run', target: 'file::src/index.ts::App', type: 'call' },
  ],
  metadata: { projectRoot: '/project', analyzedAt: '2026-04-02T00:00:00Z', fileCount: 1 },
};

describe('toGraphDocument', () => {
  it('should convert TrailGraph to GraphDocument', () => {
    const doc = toGraphDocument(graph, 'test-analysis');
    expect(doc.name).toBe('test-analysis');
    expect(doc.nodes).toHaveLength(3);
    expect(doc.edges).toHaveLength(1);
  });

  it('should map node types to graph-core shapes', () => {
    const doc = toGraphDocument(graph, 'test');
    const fileNode = doc.nodes.find(n => n.text === 'index.ts');
    expect(fileNode?.type).toBe('doc');
    const classNode = doc.nodes.find(n => n.text === 'App');
    expect(classNode?.type).toBe('rect');
    const funcNode = doc.nodes.find(n => n.text === 'run');
    expect(funcNode?.type).toBe('ellipse');
  });

  it('should create arrow edges', () => {
    const doc = toGraphDocument(graph, 'test');
    expect(doc.edges[0].type).toBe('arrow');
    expect(doc.edges[0].from.nodeId).toBeDefined();
    expect(doc.edges[0].to.nodeId).toBeDefined();
  });

  it('should store trail metadata in node metadata field', () => {
    const doc = toGraphDocument(graph, 'test');
    const fileNode = doc.nodes.find(n => n.text === 'index.ts');
    expect(fileNode?.metadata?.trailType).toBe('file');
    expect(fileNode?.metadata?.line).toBe(1);
  });
});
