import { trailToC4 } from '../toC4';
import type { TrailGraph } from '../../model/types';

function makeTrailGraph(overrides?: Partial<TrailGraph>): TrailGraph {
  return {
    nodes: [],
    edges: [],
    metadata: { projectRoot: '/app', analyzedAt: '2026-01-01', fileCount: 0 },
    ...overrides,
  };
}

describe('trailToC4', () => {
  describe('L2 Container', () => {
    it('should create containers from packages directory pattern', () => {
      const graph = makeTrailGraph({
        nodes: [
          { id: 'f1', label: 'index.ts', type: 'file', filePath: 'packages/web-app/src/index.ts', line: 0 },
          { id: 'f2', label: 'types.ts', type: 'file', filePath: 'packages/graph-core/src/types.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const containers = model.elements.filter(e => e.type === 'container');
      expect(containers.some(c => c.name === 'web-app')).toBe(true);
      expect(containers.some(c => c.name === 'graph-core')).toBe(true);
    });

    it('should resolve package name from projectRoot when path has no packages/ prefix', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 1 },
        nodes: [
          { id: 'f1', label: 'analyze.ts', type: 'file', filePath: 'src/analyze.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const containers = model.elements.filter(e => e.type === 'container');
      expect(containers).toHaveLength(1);
      expect(containers[0].name).toBe('trail-core');
    });

    it('should create L2 relationships from import edges between packages', () => {
      const graph = makeTrailGraph({
        nodes: [
          { id: 'f1', label: 'App.tsx', type: 'file', filePath: 'packages/web-app/src/App.tsx', line: 0 },
          { id: 'f2', label: 'types.ts', type: 'file', filePath: 'packages/graph-core/src/types.ts', line: 0 },
        ],
        edges: [
          { source: 'f1', target: 'f2', type: 'import' },
        ],
      });
      const model = trailToC4(graph);
      const l2Rels = model.relationships.filter(
        r => r.from === 'pkg_web-app' && r.to === 'pkg_graph-core',
      );
      expect(l2Rels).toHaveLength(1);
    });
  });

  describe('L3 Component', () => {
    it('should create component elements from src subdirectories', () => {
      const graph = makeTrailGraph({
        nodes: [
          { id: 'f1', label: 'ProjectAnalyzer.ts', type: 'file', filePath: 'packages/trail-core/src/analyzer/ProjectAnalyzer.ts', line: 0 },
          { id: 'f2', label: 'toCytoscape.ts', type: 'file', filePath: 'packages/trail-core/src/transform/toCytoscape.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const components = model.elements.filter(e => e.type === 'component');
      expect(components.some(c => c.name === 'analyzer' && c.boundaryId === 'pkg_trail-core')).toBe(true);
      expect(components.some(c => c.name === 'transform' && c.boundaryId === 'pkg_trail-core')).toBe(true);
    });

    it('should extract components from src/ subdirectories when projectRoot is a package', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 2 },
        nodes: [
          { id: 'f1', label: 'ProjectAnalyzer.ts', type: 'file', filePath: 'src/analyzer/ProjectAnalyzer.ts', line: 0 },
          { id: 'f2', label: 'toCytoscape.ts', type: 'file', filePath: 'src/transform/toCytoscape.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const components = model.elements.filter(e => e.type === 'component');
      expect(components.some(c => c.name === 'analyzer')).toBe(true);
      expect(components.some(c => c.name === 'transform')).toBe(true);
    });

    it('should create L3 relationships between components', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 2 },
        nodes: [
          { id: 'f1', label: 'toCytoscape.ts', type: 'file', filePath: 'src/transform/toCytoscape.ts', line: 0 },
          { id: 'f2', label: 'types.ts', type: 'file', filePath: 'src/model/types.ts', line: 0 },
        ],
        edges: [
          { source: 'f1', target: 'f2', type: 'import' },
        ],
      });
      const model = trailToC4(graph);
      const l3Rels = model.relationships.filter(
        r => r.from === 'pkg_trail-core/transform' && r.to === 'pkg_trail-core/model',
      );
      expect(l3Rels).toHaveLength(1);
    });

    it('should not create L3 relationship for same component', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 2 },
        nodes: [
          { id: 'f1', label: 'SymbolExtractor.ts', type: 'file', filePath: 'src/analyzer/SymbolExtractor.ts', line: 0 },
          { id: 'f2', label: 'ProjectAnalyzer.ts', type: 'file', filePath: 'src/analyzer/ProjectAnalyzer.ts', line: 0 },
        ],
        edges: [
          { source: 'f1', target: 'f2', type: 'import' },
        ],
      });
      const model = trailToC4(graph);
      const l3Rels = model.relationships.filter(
        r => r.from.startsWith('pkg_trail-core/') && r.to.startsWith('pkg_trail-core/'),
      );
      expect(l3Rels).toHaveLength(0);
    });
  });

  describe('L4 Code', () => {
    it('should map file nodes to code elements', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/app', analyzedAt: '2026-01-01', fileCount: 1 },
        nodes: [
          { id: 'f1', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      expect(model.elements.some(e => e.type === 'code' && e.name === 'index.ts')).toBe(true);
    });

    it('should assign code elements to component boundary', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 1 },
        nodes: [
          { id: 'f1', label: 'ProjectAnalyzer.ts', type: 'file', filePath: 'src/analyzer/ProjectAnalyzer.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const code = model.elements.find(e => e.type === 'code' && e.name === 'ProjectAnalyzer.ts');
      expect(code?.boundaryId).toBe('pkg_trail-core/analyzer');
    });

    it('should assign root files to container boundary', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 1 },
        nodes: [
          { id: 'f1', label: 'analyze.ts', type: 'file', filePath: 'src/analyze.ts', line: 0 },
        ],
      });
      const model = trailToC4(graph);
      const code = model.elements.find(e => e.type === 'code' && e.name === 'analyze.ts');
      expect(code?.boundaryId).toBe('pkg_trail-core');
    });

    it('should create L4 relationships for all file imports', () => {
      const graph = makeTrailGraph({
        metadata: { projectRoot: '/workspace/packages/trail-core', analyzedAt: '2026-01-01', fileCount: 2 },
        nodes: [
          { id: 'f1', label: 'analyze.ts', type: 'file', filePath: 'src/analyze.ts', line: 0 },
          { id: 'f2', label: 'types.ts', type: 'file', filePath: 'src/model/types.ts', line: 0 },
        ],
        edges: [
          { source: 'f1', target: 'f2', type: 'import' },
        ],
      });
      const model = trailToC4(graph);
      const l4Rels = model.relationships.filter(
        r => r.from === 'f1' && r.to === 'f2',
      );
      expect(l4Rels).toHaveLength(1);
    });
  });

  it('should set level to code', () => {
    const graph = makeTrailGraph();
    const model = trailToC4(graph);
    expect(model.level).toBe('code');
  });
});
