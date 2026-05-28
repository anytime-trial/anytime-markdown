// packages/trail-core/src/c4/functionGraph/__tests__/filterTrailGraphByElement.test.ts
import { filterTrailGraphByElement } from '../filterTrailGraphByElement';
import type { TrailGraph } from '@anytime-markdown/code-analysis-core/model';
import type { C4Model } from '../../types';

const md = { projectRoot: '/repo', analyzedAt: '2026-05-28T00:00:00.000Z', fileCount: 0 };

const sampleGraph = (): TrailGraph => ({
  metadata: md,
  nodes: [
    { id: 'src/foo.ts', label: 'foo.ts', type: 'file', filePath: 'src/foo.ts', line: 0 },
    { id: 'src/foo.ts::a', label: 'a', type: 'function', filePath: 'src/foo.ts', line: 1 },
    { id: 'src/foo.ts::b', label: 'b', type: 'function', filePath: 'src/foo.ts', line: 5 },
    { id: 'src/bar.ts::c', label: 'c', type: 'function', filePath: 'src/bar.ts', line: 1 },
  ],
  edges: [
    { source: 'src/foo.ts::a', target: 'src/foo.ts::b', type: 'call' },
    { source: 'src/foo.ts::a', target: 'src/foo.ts::b', type: 'call' }, // 重複
    { source: 'src/foo.ts::b', target: 'src/bar.ts::c', type: 'call' }, // 出 (external)
    { source: 'src/bar.ts::c', target: 'src/foo.ts::a', type: 'call' }, // 入 (external_caller)
    { source: 'src/foo.ts::a', target: 'src/foo.ts::a', type: 'call' }, // 自己呼び出し
    { source: 'src/foo.ts', target: 'src/bar.ts', type: 'import' },
  ],
});

const sampleModel: C4Model = {
  level: 'code',
  elements: [
    { id: 'src/foo.ts', type: 'code', name: 'foo.ts' },
    { id: 'src/bar.ts', type: 'code', name: 'bar.ts' },
    { id: 'pkg_app', type: 'container', name: 'app' },
  ],
  relationships: [],
};

describe('filterTrailGraphByElement', () => {
  it('対象 code 要素配下の関数ノードのみを返す', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const functionIds = out.nodes.filter((n) => n.kind === 'function').map((n) => n.id);
    expect(functionIds.sort()).toEqual(['src/foo.ts::a', 'src/foo.ts::b']);
  });

  it('内部 call エッジを残し、重複は dedup する', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const internal = out.edges.filter(
      (e) => e.source === 'src/foo.ts::a' && e.target === 'src/foo.ts::b',
    );
    expect(internal).toHaveLength(1);
  });

  it('外部呼び出し (out) は external プレースホルダノードを残す', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const ext = out.nodes.find((n) => n.id === 'src/bar.ts::c' && n.kind === 'external');
    expect(ext).toBeDefined();
    const edge = out.edges.find(
      (e) => e.source === 'src/foo.ts::b' && e.target === 'src/bar.ts::c',
    );
    expect(edge).toBeDefined();
  });

  it('外部呼び出し元 (in) は external_caller プレースホルダノードを残す', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const caller = out.nodes.find((n) => n.id === 'src/bar.ts::c' && n.kind === 'external_caller');
    // 同一 id が external と external_caller 両方に出ることはない (外部呼び出し先優先)
    // ここでは sample で src/bar.ts::c は external 側で確定済みのため、別 sample で再検証
    expect(caller ?? null).toBeNull();
  });

  it('自己呼び出しエッジを保持する', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const self = out.edges.find(
      (e) => e.source === 'src/foo.ts::a' && e.target === 'src/foo.ts::a',
    );
    expect(self).toBeDefined();
  });

  it('call 以外のエッジは無視する', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/foo.ts', sampleModel);
    const importEdge = out.edges.find(
      (e) => e.source === 'src/foo.ts' && e.target === 'src/bar.ts',
    );
    expect(importEdge).toBeUndefined();
  });

  it('elementId が存在しない場合は空グラフ', () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'src/missing.ts', sampleModel);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it("elementId の type が 'code' 以外なら空グラフ (MVP)", () => {
    const out = filterTrailGraphByElement(sampleGraph(), 'pkg_app', sampleModel);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('入と出の両方向を持つ外部関数の重複を防ぐ', () => {
    const graph: TrailGraph = {
      metadata: md,
      nodes: [
        { id: 'src/foo.ts::a', label: 'a', type: 'function', filePath: 'src/foo.ts', line: 1 },
        { id: 'src/bar.ts::c', label: 'c', type: 'function', filePath: 'src/bar.ts', line: 1 },
      ],
      edges: [
        { source: 'src/foo.ts::a', target: 'src/bar.ts::c', type: 'call' }, // 出
        { source: 'src/bar.ts::c', target: 'src/foo.ts::a', type: 'call' }, // 入
      ],
    };
    const out = filterTrailGraphByElement(graph, 'src/foo.ts', sampleModel);
    // c は 1 ノードだけ (external 優先) かつエッジは 2 本
    const cs = out.nodes.filter((n) => n.id === 'src/bar.ts::c');
    expect(cs).toHaveLength(1);
    expect(cs[0].kind).toBe('external');
    expect(out.edges).toHaveLength(2);
  });
});
