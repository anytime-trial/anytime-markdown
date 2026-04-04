import { toMermaid } from '../transform/toMermaid';
import type { TrailGraph } from '../model/types';

const FIXTURE_GRAPH: TrailGraph = {
  nodes: [
    { id: 'src/index.ts', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 0 },
    { id: 'src/utils.ts', label: 'utils.ts', type: 'file', filePath: 'src/utils.ts', line: 0 },
    { id: 'src/types.ts', label: 'types.ts', type: 'file', filePath: 'src/types.ts', line: 0 },
    { id: 'src/index.ts::App', label: 'App', type: 'class', filePath: 'src/index.ts', line: 5, parent: 'src/index.ts' },
    { id: 'src/utils.ts::greet', label: 'greet', type: 'function', filePath: 'src/utils.ts', line: 1, parent: 'src/utils.ts' },
    { id: 'src/types.ts::Runnable', label: 'Runnable', type: 'interface', filePath: 'src/types.ts', line: 1, parent: 'src/types.ts' },
  ],
  edges: [
    { source: 'src/index.ts', target: 'src/utils.ts', type: 'import' },
    { source: 'src/index.ts', target: 'src/types.ts', type: 'import' },
    { source: 'src/index.ts::App', target: 'src/utils.ts::greet', type: 'call' },
    { source: 'src/index.ts::App', target: 'src/types.ts::Runnable', type: 'implementation' },
  ],
  metadata: { projectRoot: '/project', analyzedAt: '2026-04-03', fileCount: 3 },
};

describe('toMermaid', () => {
  describe('module granularity', () => {
    it('should output only file nodes and import edges', () => {
      const result = toMermaid(FIXTURE_GRAPH, { granularity: 'module' });
      expect(result).toContain('graph TD');
      expect(result).toContain('src_index_ts["src/index.ts"]');
      expect(result).toContain('src_utils_ts["src/utils.ts"]');
      expect(result).toContain('src_index_ts -->|import| src_utils_ts');
      expect(result).toContain('src_index_ts -->|import| src_types_ts');
      // symbol nodes should NOT appear
      expect(result).not.toContain('App');
      expect(result).not.toContain('greet');
    });

    it('should respect direction option', () => {
      const result = toMermaid(FIXTURE_GRAPH, { granularity: 'module', direction: 'LR' });
      expect(result).toContain('graph LR');
    });

    it('should handle empty graph', () => {
      const empty: TrailGraph = {
        nodes: [],
        edges: [],
        metadata: { projectRoot: '/project', analyzedAt: '2026-04-03', fileCount: 0 },
      };
      const result = toMermaid(empty, { granularity: 'module' });
      expect(result).toBe('graph TD\n');
    });
  });

  describe('symbol granularity', () => {
    it('should group symbols in subgraphs by file', () => {
      const result = toMermaid(FIXTURE_GRAPH, { granularity: 'symbol' });
      expect(result).toContain('graph TD');
      expect(result).toContain('subgraph src_index_ts ["src/index.ts"]');
      expect(result).toContain('src_index_ts__App["App"]');
      expect(result).toContain('end');
    });

    it('should output symbol-level edges', () => {
      const result = toMermaid(FIXTURE_GRAPH, { granularity: 'symbol' });
      expect(result).toContain('src_index_ts__App -.->|call| src_utils_ts__greet');
      expect(result).toContain('src_index_ts__App ==>|implementation| src_types_ts__Runnable');
    });

    it('should filter edges by edgeTypes option', () => {
      const result = toMermaid(FIXTURE_GRAPH, {
        granularity: 'symbol',
        edgeTypes: ['call'],
      });
      expect(result).toContain('call');
      expect(result).not.toContain('implementation');
      expect(result).not.toContain('import');
    });
  });
});
