/**
 * trailGraphToCodeGraphInputs の追加テスト — 未カバー分岐を補完する。
 *
 * 既存テストでカバーされていない分岐（63% branch）:
 * - trailGraph が undefined のとき（line 39 の空ループ）
 * - エッジで source/target が fileByNodeId に存在しないとき (line 61 continue)
 * - エッジで sourceId/targetId が seenNodeIds に存在しないとき (line 66 continue)
 * - docFiles が undefined のとき（line 48 の空ループ）
 * - stripExt が .mdx? 拡張子も除去する
 */
import type { TrailGraph } from '@anytime-markdown/trail-core';
import { trailGraphToCodeGraphInputs } from '../trailGraphToCodeGraphInputs';

function fileNode(relPath: string) {
  return {
    id: `file::${relPath}`,
    label: relPath.split('/').pop() ?? relPath,
    type: 'file' as const,
    filePath: relPath,
    line: 1,
  };
}

function symbolNode(id: string, filePath: string, label: string) {
  return { id, label, type: 'function' as const, filePath, line: 10 };
}

function makeTrailGraph(
  nodes: readonly { id: string; label: string; type: string; filePath: string; line: number }[],
  edges: readonly { source: string; target: string; type?: string }[],
): TrailGraph {
  return {
    nodes: nodes as readonly TrailGraph['nodes'][number][],
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: (e.type ?? 'import') as TrailGraph['edges'][number]['type'],
    })),
    metadata: { projectRoot: '/repo', analyzedAt: '2026-01-01', fileCount: 0 },
  };
}

describe('trailGraphToCodeGraphInputs — 追加テスト', () => {
  // -----------------------------------------------------------------------
  // trailGraph が undefined のとき
  // -----------------------------------------------------------------------

  it('trailGraph が undefined のとき nodes/edges が空で返る', () => {
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph: undefined,
    });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('trailGraph が undefined で docFiles がある場合は doc ノードのみ返る', () => {
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Docs',
      repoRootPath: '/repo',
      trailGraph: undefined,
      docFiles: ['/repo/docs/README.md', '/repo/docs/guide.mdx'],
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].fileType).toBe('document');
    expect(result.nodes[1].fileType).toBe('document');
    // mdx 拡張子も stripExt で除去される
    expect(result.nodes[1].id).toBe('Docs:docs/guide');
  });

  // -----------------------------------------------------------------------
  // docFiles が undefined のとき
  // -----------------------------------------------------------------------

  it('docFiles が undefined のとき doc ノードは追加されない', () => {
    const trailGraph = makeTrailGraph(
      [fileNode('packages/a/src/foo.ts')],
      [],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
      docFiles: undefined,
    });
    expect(result.nodes.every((n) => n.fileType === 'code')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // エッジで source/target が fileByNodeId に存在しないケース
  // -----------------------------------------------------------------------

  it('エッジで source が fileByNodeId にない場合はスキップ', () => {
    const trailGraph = makeTrailGraph(
      [fileNode('packages/a/src/foo.ts')],
      // source が存在しないシンボル ID（fileByNodeId に入らない）
      [{ source: 'unknown::ghost', target: 'file::packages/a/src/foo.ts' }],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.edges).toHaveLength(0);
  });

  it('エッジで target が fileByNodeId にない場合はスキップ', () => {
    const trailGraph = makeTrailGraph(
      [fileNode('packages/a/src/foo.ts')],
      [{ source: 'file::packages/a/src/foo.ts', target: 'file::packages/b/src/missing.ts' }],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.edges).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // エッジで sourceId/targetId が seenNodeIds にない場合
  // -----------------------------------------------------------------------

  it('エッジで変換後の file ID が nodes に含まれない場合はスキップ', () => {
    // fileByNodeId には登録されるが、seenNodeIds には含まれないケース:
    // symbol→file の edge で symbol の filePath が node 一覧にない file を指す
    const trailGraph = makeTrailGraph(
      [
        fileNode('packages/a/src/foo.ts'),
        // bar.ts は file ノードとして未登録（symbolNode のみ）
        symbolNode('sym::bar:fn', 'packages/b/src/bar.ts', 'fn'),
      ],
      [{ source: 'sym::bar:fn', target: 'file::packages/a/src/foo.ts' }],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    // bar.ts が seenNodeIds に含まれないのでエッジはスキップ
    expect(result.edges).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // doc node の重複除去
  // -----------------------------------------------------------------------

  it('同じ docFile が 2 回含まれていても 1 ノードのみ追加される', () => {
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Docs',
      repoRootPath: '/repo',
      trailGraph: undefined,
      docFiles: ['/repo/docs/README.md', '/repo/docs/README.md'],
    });
    expect(result.nodes).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // stripExt のカバレッジ — .ts / .tsx / .md / .mdx
  // -----------------------------------------------------------------------

  it('.tsx 拡張子を持つ file ノードが正しく変換される', () => {
    const trailGraph = makeTrailGraph(
      [fileNode('packages/ui/src/Button.tsx')],
      [],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'UI',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.nodes[0].id).toBe('UI:packages/ui/src/Button');
  });

  it('.md doc ノードの拡張子が除去される', () => {
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Docs',
      repoRootPath: '/repo',
      trailGraph: undefined,
      docFiles: ['/repo/docs/spec.md'],
    });
    expect(result.nodes[0].id).toBe('Docs:docs/spec');
  });

  // -----------------------------------------------------------------------
  // package 抽出 — segments[1] が undefined のケース（最上位ファイル）
  // -----------------------------------------------------------------------

  it('relPath のセグメントが 1 つだけの場合は repoId を package として使う', () => {
    // packages/ 配下にないファイル（例: root.ts）
    const trailGraph = makeTrailGraph(
      [{ id: 'file::root.ts', label: 'root', type: 'file', filePath: 'root.ts', line: 1 }],
      [],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.nodes[0].package).toBe('Workspace');
  });

  // -----------------------------------------------------------------------
  // crossRepo フラグ確認
  // -----------------------------------------------------------------------

  it('生成されるエッジの crossRepo は false', () => {
    const trailGraph = makeTrailGraph(
      [
        fileNode('packages/a/src/a.ts'),
        fileNode('packages/b/src/b.ts'),
      ],
      [{ source: 'file::packages/a/src/a.ts', target: 'file::packages/b/src/b.ts' }],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].crossRepo).toBe(false);
    expect(result.edges[0].confidence).toBe('EXTRACTED');
    expect(result.edges[0].confidence_score).toBe(1.0);
  });
});
