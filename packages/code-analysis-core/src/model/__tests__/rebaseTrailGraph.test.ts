import type { TrailGraph } from '../types';
import { rebaseTrailGraph } from '../rebaseTrailGraph';
import { mergeTrailGraphs } from '../../spi/runRepoAnalysis';

/** frontend/ 配下の tsconfig で解析された想定の TS graph（projectRoot=<root>/frontend）。 */
function tsGraph(): TrailGraph {
  return {
    nodes: [
      { id: 'file::src/app.ts', label: 'app.ts', type: 'file', filePath: 'src/app.ts', line: 1 },
      {
        id: 'file::src/app.ts::main',
        label: 'main',
        type: 'function',
        filePath: 'src/app.ts',
        line: 3,
        parent: 'file::src/app.ts',
        exported: true,
      },
      { id: 'file::src/util.ts', label: 'util.ts', type: 'file', filePath: 'src/util.ts', line: 1 },
      // 解析ルート外（../shared）への相対パス参照は join で正規化される
      {
        id: 'file::../shared/x.ts',
        label: 'x.ts',
        type: 'file',
        filePath: '../shared/x.ts',
        line: 1,
      },
    ],
    edges: [
      { source: 'file::src/app.ts', target: 'file::src/util.ts', type: 'import', importKind: 'static' },
      { source: 'file::src/app.ts::main', target: 'file::src/util.ts', type: 'call' },
    ],
    metadata: { projectRoot: '/repo/frontend', analyzedAt: '2026-08-29T00:00:00.000Z', fileCount: 3 },
  };
}

describe('rebaseTrailGraph', () => {
  it('prefix を id / filePath / parent / edge 端点へ一括適用する', () => {
    const rebased = rebaseTrailGraph(tsGraph(), 'frontend', '/repo');

    const file = rebased.nodes.find((n) => n.type === 'file' && n.label === 'app.ts');
    expect(file).toBeDefined();
    expect(file!.id).toBe('file::frontend/src/app.ts');
    expect(file!.filePath).toBe('frontend/src/app.ts');

    const fn = rebased.nodes.find((n) => n.type === 'function');
    expect(fn!.id).toBe('file::frontend/src/app.ts::main');
    expect(fn!.filePath).toBe('frontend/src/app.ts');
    expect(fn!.parent).toBe('file::frontend/src/app.ts');

    // ルート外相対パスは posix join で正規化される（frontend/../shared → shared）
    const outside = rebased.nodes.find((n) => n.label === 'x.ts');
    expect(outside!.id).toBe('file::shared/x.ts');
    expect(outside!.filePath).toBe('shared/x.ts');

    expect(rebased.edges).toEqual([
      {
        source: 'file::frontend/src/app.ts',
        target: 'file::frontend/src/util.ts',
        type: 'import',
        importKind: 'static',
      },
      { source: 'file::frontend/src/app.ts::main', target: 'file::frontend/src/util.ts', type: 'call' },
    ]);

    expect(rebased.metadata.projectRoot).toBe('/repo');
    expect(rebased.metadata.fileCount).toBe(tsGraph().metadata.fileCount);
  });

  it('prefix が空のときはパスを変換しない（tsconfig がルート直下の既存リポの挙動を固定）', () => {
    const graph = tsGraph();
    const rebased = rebaseTrailGraph(graph, '', '/repo/frontend');
    expect(rebased.nodes).toEqual(graph.nodes);
    expect(rebased.edges).toEqual(graph.edges);
    expect(rebased.metadata.projectRoot).toBe('/repo/frontend');
  });
});

describe('mergeTrailGraphs', () => {
  it('複数言語の graph を合成し fileCount を file ノード実数から再計算する', () => {
    const ts = rebaseTrailGraph(tsGraph(), 'frontend', '/repo');
    const py: TrailGraph = {
      nodes: [
        { id: 'file::backend/app.py', label: 'app.py', type: 'file', filePath: 'backend/app.py', line: 1 },
        {
          id: 'file::backend/app.py::adopt',
          label: 'adopt',
          type: 'function',
          filePath: 'backend/app.py',
          line: 2,
          parent: 'file::backend/app.py',
          exported: true,
        },
      ],
      edges: [],
      metadata: { projectRoot: '/repo', analyzedAt: '2026-08-29T00:00:01.000Z', fileCount: 1 },
    };

    // 既存 SPI の mergeTrailGraphs（(graphs, projectRoot) シグネチャ）を rebase 済み graph の
    // 合成に再利用できることを固定する（重複 API を作らない）。
    const merged = mergeTrailGraphs([ts, py], '/repo');

    expect(merged.metadata.projectRoot).toBe('/repo');
    const ids = merged.nodes.map((n) => n.id);
    expect(ids).toContain('file::frontend/src/app.ts');
    expect(ids).toContain('file::backend/app.py');
    expect(merged.edges.length).toBe(ts.edges.length);
    expect(merged.metadata.fileCount).toBe(merged.nodes.filter((n) => n.type === 'file').length);
  });
});
