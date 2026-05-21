/**
 * GraphClusterer の追加テスト — 未カバー分岐を補完する。
 *
 * 既存テスト (GraphClusterer.test.ts) でカバーされていない分岐:
 * - cluster() 空グラフ早期リターン (line 22)
 * - buildCommunityLabels で communities[node] が undefined (line 62-63)
 * - extractComponentSegment で ':' がない場合 (line 104)
 * - pickTopName で bucket が空の場合 (line 120)
 */
import Graph from 'graphology';
import { GraphClusterer, buildCommunityLabels } from '../GraphClusterer';
import type { C4Element } from '@anytime-markdown/trail-core/c4';

function nodeAttrs(pkg: string) {
  return { package: pkg, repo: 'product', fileType: 'code', size: 0 } as const;
}

describe('GraphClusterer — 追加テスト', () => {
  // -----------------------------------------------------------------------
  // 空グラフ (order=0) の早期リターン
  // -----------------------------------------------------------------------

  it('空グラフ (order=0) を cluster() すると { communities: {}, labels: {} } を返す', () => {
    const g = new Graph();
    const result = new GraphClusterer().cluster(g);
    expect(result.communities).toEqual({});
    expect(result.labels).toEqual({});
  });

  // -----------------------------------------------------------------------
  // buildCommunityLabels で package 属性が空文字のとき 'unknown' にフォールバック (line 63)
  // -----------------------------------------------------------------------

  it('buildCommunityLabels: package 属性が空文字のとき "unknown" を返す', () => {
    const g = new Graph();
    // package 属性を空文字にする
    g.addNode('0:packages/x/Y', { package: '', repo: 'r', fileType: 'code', size: 0 });
    const communities = { '0:packages/x/Y': 0 };
    const labels = buildCommunityLabels(g, communities, []);
    expect(labels[0]).toBe('unknown');
  });

  // -----------------------------------------------------------------------
  // c4Elements なし（明示的に undefined を渡す）
  // -----------------------------------------------------------------------

  it('c4Elements=undefined のとき package 多数決で label が決まる', () => {
    const g = new Graph();
    g.addNode('A', nodeAttrs('my-pkg'));
    g.addNode('B', nodeAttrs('my-pkg'));
    g.addEdge('A', 'B');
    const result = new GraphClusterer().cluster(g, undefined);
    expect(Object.values(result.labels)).toContain('my-pkg');
  });

  // -----------------------------------------------------------------------
  // buildCommunityLabels — communities[node] が undefined のケース
  // -----------------------------------------------------------------------

  it('buildCommunityLabels: communities マップにないノードは label に寄与しない', () => {
    const g = new Graph();
    g.addNode('0:packages/a/X', nodeAttrs('a'));
    g.addNode('0:packages/b/Y', nodeAttrs('b'));
    // 'b/Y' のみ community 0 に割り当て（'a/X' は割り当てなし）
    const communities = { '0:packages/b/Y': 0 };
    const labels = buildCommunityLabels(g, communities);
    // community 0 のラベルは 'b' のみの票から決まる
    expect(labels[0]).toBe('b');
    // 'a/X' が community undefined なので label に "a" は混入しない
    expect(Object.values(labels)).not.toContain('a');
  });

  // -----------------------------------------------------------------------
  // extractComponentSegment — ':' がないノード ID のケース
  // -----------------------------------------------------------------------

  it('ノード ID に ":" がない場合も label が返る', () => {
    const g = new Graph();
    // ':' がない形式の node ID
    g.addNode('packages/a/src/foo', nodeAttrs('a'));
    const communities = { 'packages/a/src/foo': 0 };
    // C4 要素なしで package fallback を確認
    const labels = buildCommunityLabels(g, communities, []);
    expect(labels[0]).toBe('a');
  });

  // -----------------------------------------------------------------------
  // extractComponentSegment で result === 'packages' のとき undefined を返す
  // -----------------------------------------------------------------------

  it('node ID が packages 直下の場合は component を "packages" と判定せず package label に fallback', () => {
    const g = new Graph();
    g.addNode('0:packages', nodeAttrs('myPkg'));
    const communities = { '0:packages': 0 };
    const elements: readonly C4Element[] = [
      { id: 'pkg_myPkg', type: 'container', name: 'MyPkg Container' },
    ];
    const labels = buildCommunityLabels(g, communities, elements);
    // 'packages' は component として無効 → container にフォールバック
    expect(labels[0]).toBe('MyPkg Container');
  });

  // -----------------------------------------------------------------------
  // c4ElementsProvider が空配列のとき package fallback
  // -----------------------------------------------------------------------

  it('c4Elements が空配列のとき package 多数決で label が決まる', () => {
    const g = new Graph();
    g.addNode('0:packages/svc/src/A', nodeAttrs('svc'));
    const communities = { '0:packages/svc/src/A': 0 };
    const labels = buildCommunityLabels(g, communities, []);
    expect(labels[0]).toBe('svc');
  });

  // -----------------------------------------------------------------------
  // 同票時のアルファベット順最小選択（pickTopName）
  // -----------------------------------------------------------------------

  it('同票のとき alphabetical 最小の name が選ばれる', () => {
    const g = new Graph();
    // 2 ノードが同一コミュニティで異なるパッケージ
    g.addNode('0:packages/beta/X', nodeAttrs('beta'));
    g.addNode('0:packages/alpha/Y', nodeAttrs('alpha'));
    const communities = {
      '0:packages/beta/X': 0,
      '0:packages/alpha/Y': 0,
    };
    const labels = buildCommunityLabels(g, communities, []);
    expect(labels[0]).toBe('alpha'); // alpha < beta
  });
});
