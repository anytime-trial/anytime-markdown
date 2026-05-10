import { computeCentrality } from '../computeCentrality';
import { DEFAULT_CENTRALITY_WEIGHTS } from '../types';

describe('computeCentrality', () => {
  it('edges 0 件で空配列を返す', () => {
    const result = computeCentrality({ edges: [] }, {});
    expect(result).toEqual([]);
  });

  it('自パッケージ内のみの edge は crossPkgIn=0、externalConsumerPkgs=0', () => {
    const result = computeCentrality(
      {
        edges: [
          {
            source: 'packages/trail-core/src/a.ts',
            target: 'packages/trail-core/src/b.ts',
          },
        ],
      },
      {},
    );
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.filePath).toBe('packages/trail-core/src/b.ts');
    expect(r.crossPkgIn).toBe(0);
    expect(r.externalConsumerPkgs).toBe(0);
    expect(r.totalIn).toBe(1);
  });

  it('別パッケージから 2 本の inbound で crossPkgIn=2', () => {
    const result = computeCentrality(
      {
        edges: [
          {
            source: 'packages/pkg-a/src/x.ts',
            target: 'packages/trail-core/src/b.ts',
          },
          {
            source: 'packages/pkg-b/src/y.ts',
            target: 'packages/trail-core/src/b.ts',
          },
        ],
      },
      {},
    );
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.crossPkgIn).toBe(2);
    expect(r.totalIn).toBe(2);
  });

  it('3 つの異なる外部パッケージからの inbound で externalConsumerPkgs=3', () => {
    const target = 'packages/trail-core/src/b.ts';
    const result = computeCentrality(
      {
        edges: [
          { source: 'packages/pkg-a/src/x.ts', target },
          { source: 'packages/pkg-b/src/y.ts', target },
          { source: 'packages/pkg-c/src/z.ts', target },
        ],
      },
      {},
    );
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.externalConsumerPkgs).toBe(3);
  });

  it('barrel ファイル (index.ts + functionCount=0) は score が同条件の非 barrel の半分', () => {
    const barrelPath = 'packages/trail-core/src/index.ts';
    const normalPath = 'packages/trail-core/src/util.ts';
    const sourcePkg = 'packages/pkg-a/src/x.ts';

    const result = computeCentrality(
      {
        edges: [
          { source: sourcePkg, target: barrelPath },
          { source: sourcePkg, target: normalPath },
        ],
      },
      {
        [barrelPath]: { functionCount: 0, cognitiveComplexityMax: 0 },
        [normalPath]: { functionCount: 5, cognitiveComplexityMax: 3 },
      },
      DEFAULT_CENTRALITY_WEIGHTS,
    );

    const barrelResult = result.find((r) => r.filePath === barrelPath);
    const normalResult = result.find((r) => r.filePath === normalPath);

    expect(barrelResult).toBeDefined();
    expect(normalResult).toBeDefined();
    expect(barrelResult!.isBarrel).toBe(true);
    expect(normalResult!.isBarrel).toBe(false);

    // barrel の raw_score は非 barrel の半分 → normalScore が 100 なら barrelScore は 50
    expect(normalResult!.centralityScore).toBe(100);
    expect(barrelResult!.centralityScore).toBe(50);
  });

  it('.next/types/validator のような自動生成パスは結果に含まれない', () => {
    const result = computeCentrality(
      {
        edges: [
          {
            source: 'packages/trail-core/src/a.ts',
            target: 'packages/web-app/.next/types/validator.ts',
          },
          {
            source: 'packages/trail-core/src/a.ts',
            target: 'packages/trail-core/src/b.ts',
          },
        ],
      },
      {},
    );
    // .next/ パスは除外され、b.ts のみ残る
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('packages/trail-core/src/b.ts');
  });
});
