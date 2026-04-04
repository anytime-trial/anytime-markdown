import { toMermaid } from '../transform/toMermaid';
import type { TrailGraph } from '../model/types';

const FIXTURE_GRAPH: TrailGraph = {
  nodes: [
    { id: 'src/index.ts', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 0 },
    { id: 'src/utils.ts', label: 'utils.ts', type: 'file', filePath: 'src/utils.ts', line: 0 },
    { id: 'src/types.ts', label: 'types.ts', type: 'file', filePath: 'src/types.ts', line: 0 },
  ],
  edges: [
    { source: 'src/index.ts', target: 'src/utils.ts', type: 'import' },
    { source: 'src/index.ts', target: 'src/types.ts', type: 'import' },
  ],
  metadata: { projectRoot: '/project', analyzedAt: '2026-04-03', fileCount: 3 },
};

describe('toMermaid', () => {
  it('should output C4Component format via trailToC4 pipeline', () => {
    const result = toMermaid(FIXTURE_GRAPH);
    expect(result).toContain('C4Component');
    expect(result).toContain('title Project Analysis');
    // L4 ファイルは Code 要素
    expect(result).toContain('Code(');
    expect(result).toContain('index.ts');
    // リレーションシップ
    expect(result).toContain('Rel(');
    expect(result).toContain('imports');
  });

  it('should handle empty graph', () => {
    const empty: TrailGraph = {
      nodes: [],
      edges: [],
      metadata: { projectRoot: '/project', analyzedAt: '2026-04-03', fileCount: 0 },
    };
    const result = toMermaid(empty);
    expect(result).toContain('C4Component');
  });
});
