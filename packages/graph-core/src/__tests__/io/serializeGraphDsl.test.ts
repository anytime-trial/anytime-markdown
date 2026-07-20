import { parseGraphDsl } from '../../io/parseGraphDsl';
import { serializeGraphDsl } from '../../io/serializeGraphDsl';
import type { ThinkingDiagramSpec } from '../../presets/index';

/** parse → serialize → parse の構造一致（ラウンドトリップ）を検証するヘルパ。 */
function expectRoundTrip(dsl: string): ThinkingDiagramSpec {
  const spec = parseGraphDsl(dsl);
  const out = serializeGraphDsl(spec);
  const reparsed = parseGraphDsl(out);
  expect(reparsed).toEqual(spec);
  return spec;
}

describe('serializeGraphDsl', () => {
  it('出力の先頭は "type: <図種>" 行', () => {
    const out = serializeGraphDsl({ type: 'swot', strengths: [], weaknesses: [], opportunities: [], threats: [] });
    expect(out.split('\n')[0]).toBe('type: swot');
  });

  it('cooccurrence をラウンドトリップする（title / subject / クラスタあり）', () => {
    expectRoundTrip(
      [
        'type: cooccurrence',
        'title: 納期遅延の要因',
        'subject: 納期遅延',
        '- 納期遅延: 40',
        '- 仕様変更: 25',
        '- レビュー待ち: 18',
        '- 納期遅延 -- 仕様変更: 0.8',
        '- 納期遅延 -- レビュー待ち: 0.5',
        'cluster 工程: 納期遅延, レビュー待ち',
        'cluster 要求: 仕様変更',
      ].join('\n'),
    );
  });

  it('cooccurrence をラウンドトリップする（共起・クラスタ・subject なし）', () => {
    expectRoundTrip(['type: cooccurrence', '- A: 1', '- B: 2'].join('\n'));
  });

  it('fishbone をラウンドトリップする（空カテゴリ含む）', () => {
    expectRoundTrip(
      ['type: fishbone', 'problem: 不良率が高い', '- 人: 教育不足, 経験不足', '- 機械: 老朽化', '- 方法:'].join('\n'),
    );
  });

  it('causal-loop をラウンドトリップする（title あり/極性 +/-）', () => {
    expectRoundTrip(['type: causal-loop', 'title: 在庫', '在庫 -> 出荷: +', '出荷 -> 在庫: -'].join('\n'));
  });

  it('causal-loop をラウンドトリップする（title なし）', () => {
    expectRoundTrip(['type: causal-loop', 'a -> b: +', 'b -> c: -'].join('\n'));
  });

  it('pyramid をラウンドトリップする（desc あり/なし混在）', () => {
    expectRoundTrip(['type: pyramid', 'title: 抽象度', '- 理念: 長期', '- 戦略', '- 戦術'].join('\n'));
  });

  it('mindmap をラウンドトリップする（ネスト 2 段）', () => {
    expectRoundTrip(['type: mindmap', 'root: 新規事業', '- 市場', '  - B2B', '  - B2C', '- 技術'].join('\n'));
  });

  it('logic-tree をラウンドトリップする（3 階層）', () => {
    expectRoundTrip(
      ['type: logic-tree', 'root: 売上', '- 客数', '  - 新規', '    - 広告', '  - 既存', '- 客単価'].join('\n'),
    );
  });

  it('why-chain をラウンドトリップする', () => {
    expectRoundTrip(['type: why-chain', 'problem: 売上低下', '- 来客減', '- 認知不足'].join('\n'));
  });

  it('double-diamond をラウンドトリップする（空フェーズ含む）', () => {
    expectRoundTrip(['type: double-diamond', 'discover: 観察, 取材', 'deliver: 検証, 公開'].join('\n'));
  });

  it('swot をラウンドトリップする', () => {
    expectRoundTrip(['type: swot', 'strengths: 技術, ブランド', 'threats: 競合'].join('\n'));
  });

  it('morph-box をラウンドトリップする', () => {
    expectRoundTrip(['type: morph-box', 'title: 配送', '- 手段: トラック, ドローン', '- 時間: 即日, 翌日'].join('\n'));
  });

  it('affinity をラウンドトリップする', () => {
    expectRoundTrip(['type: affinity', 'title: 課題', '- UI: 迷う, 重い', '- 価格: 高い'].join('\n'));
  });

  it('structure-map をラウンドトリップする（関係・他領域あり）', () => {
    expectRoundTrip(
      [
        'type: structure-map',
        'whole: 検索体験',
        '- 入力: クエリ補完, 履歴',
        '- ランキング: スコア',
        '- 表示',
        'relations:',
        '- 入力 -> ランキング',
        '- ランキング -> 表示',
        'domains: 推薦システム, データ基盤',
      ].join('\n'),
    );
  });

  it('structure-map をラウンドトリップする（関係・他領域なし）', () => {
    expectRoundTrip(['type: structure-map', 'whole: W', '- A: x', '- B'].join('\n'));
  });

  it('全図種のエイリアス正規形でラウンドトリップする', () => {
    // double-diamond は全フェーズ空でも構造維持
    const empty = serializeGraphDsl({
      type: 'double-diamond',
      discover: [],
      define: [],
      develop: [],
      deliver: [],
    });
    expect(parseGraphDsl(empty)).toEqual({
      type: 'double-diamond',
      discover: [],
      define: [],
      develop: [],
      deliver: [],
    });
  });
});
