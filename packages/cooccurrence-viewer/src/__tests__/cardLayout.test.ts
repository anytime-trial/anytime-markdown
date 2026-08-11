import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import {
  CARD_COLUMN_HEADER_HEIGHT,
  CARD_GAP_Y,
  CARD_HEIGHT,
  CARD_MAX_ROWS,
  CARD_WIDTH,
  cardLinkAnchors,
  computeCardLayout,
  type CardColumnPlacement,
} from '../render/cardLayout';

interface FixtureNode {
  label: string;
  frequency: number;
}

function fileWith(
  nodes: FixtureNode[],
  clusters?: Array<{ label: string; members: number[]; subclusters?: Array<{ label: string; members: number[] }> }>,
): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-08-08T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes,
      links: [],
      ...(clusters === undefined ? {} : { clusters }),
    },
  };
}

function allVisible(file: CooccurrenceFile): Set<number> {
  return new Set(file.spec.nodes.map((_node, index) => index));
}

/** カラムが占める x 区間。カラムどうしの重なり検査に使う。 */
function columnSpan(column: CardColumnPlacement): { min: number; max: number } {
  return { min: column.x, max: column.x + column.width };
}

describe('computeCardLayout', () => {
  it('クラスタごとにカラムが spec 順で並び、未分類が末尾に来る', () => {
    // クラスタ A = 語 0,1 / クラスタ B = 語 3 / 未分類 = 語 2,4
    const file = fileWith(
      [
        { label: 'a', frequency: 1 },
        { label: 'b', frequency: 2 },
        { label: 'c', frequency: 3 },
        { label: 'd', frequency: 4 },
        { label: 'e', frequency: 5 },
      ],
      [
        { label: 'A', members: [0, 1] },
        { label: 'B', members: [3] },
      ],
    );
    const result = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    expect(result.columns.map((column) => column.cluster)).toEqual([0, 1, undefined]);
    // カラムは左から右へ、重ならず並ぶ
    for (let i = 0; i + 1 < result.columns.length; i++) {
      expect(columnSpan(result.columns[i + 1]).min).toBeGreaterThan(columnSpan(result.columns[i]).max);
    }
    expect(result.state).toEqual({
      columnCount: 3,
      cardCount: 5,
      hasUnclustered: true,
      subHeaderCount: 0,
      maxRows: CARD_MAX_ROWS,
    });
  });

  it('カラム内は頻度降順、同値はラベル順で並ぶ', () => {
    const file = fileWith(
      [
        { label: 'bravo', frequency: 2 },
        { label: 'alpha', frequency: 2 },
        { label: 'zulu', frequency: 9 },
      ],
      [{ label: 'A', members: [0, 1, 2] }],
    );
    const result = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    // zulu(9) → alpha(2) → bravo(2)
    expect(result.columns[0].members).toEqual([2, 1, 0]);
    // 表示順どおり y が増える（カードは重ならない）
    const ys = result.columns[0].members.map((index) => result.positions[index][1]);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(CARD_HEIGHT);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(CARD_HEIGHT);
  });

  it('クラスタを持たないファイルは未分類 1 カラムに全語が入る', () => {
    const file = fileWith([
      { label: 'a', frequency: 1 },
      { label: 'b', frequency: 2 },
    ]);
    const result = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].cluster).toBeUndefined();
    expect(result.state.hasUnclustered).toBe(true);
    expect(result.state.columnCount).toBe(1);
  });

  it('絞り込みで空になったクラスタはカラムを作らない', () => {
    const file = fileWith(
      [
        { label: 'a', frequency: 1 },
        { label: 'b', frequency: 2 },
      ],
      [
        { label: 'A', members: [0] },
        { label: 'B', members: [1] },
      ],
    );
    const result = computeCardLayout({ file, visibleNodeIndexes: new Set([1]) });
    expect(result.columns.map((column) => column.cluster)).toEqual([1]);
    expect(result.state.cardCount).toBe(1);
    expect(result.state.hasUnclustered).toBe(false);
  });

  it('サブクラスタを持つクラスタは名前付きグループの数だけ見出しを持ち、残余は見出しを持たない', () => {
    const file = fileWith(
      [
        { label: 'a', frequency: 1 },
        { label: 'b', frequency: 2 },
        { label: 'c', frequency: 3 },
        { label: 'd', frequency: 4 },
      ],
      [
        {
          label: 'A',
          members: [0, 1, 2, 3],
          subclusters: [
            { label: 'S1', members: [0, 1] },
            { label: 'S2', members: [2] },
          ],
        },
      ],
    );
    const result = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    // 見出しは S1・S2 の 2 つ（残余 = 語 3 には付かない）
    expect(result.columns[0].subHeaders.map((header) => header.subcluster)).toEqual([0, 1]);
    expect(result.state.subHeaderCount).toBe(2);
    // 並びはグループ順（S1 → S2 → 残余）で、グループ内は頻度降順
    expect(result.columns[0].members).toEqual([1, 0, 2, 3]);
  });

  it('カラム内のカードが上限行数を超えると折り返し、カラム幅が広がる', () => {
    const count = CARD_MAX_ROWS + 5;
    const nodes = Array.from({ length: count }, (_value, index) => ({ label: `w${index}`, frequency: 1 }));
    const file = fileWith(nodes, [{ label: 'A', members: nodes.map((_node, index) => index) }]);
    const result = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    const column = result.columns[0];
    // 2 レーンぶんの幅
    expect(column.width).toBeGreaterThan(CARD_WIDTH);
    // どのカードも上限行数を超えた縦位置に置かれない
    const maxY = CARD_COLUMN_HEADER_HEIGHT + CARD_MAX_ROWS * (CARD_HEIGHT + CARD_GAP_Y);
    for (const index of column.members) {
      expect(result.positions[index][1]).toBeLessThanOrEqual(maxY);
    }
    // 折り返し先の x はカラム内に収まる
    const xs = column.members.map((index) => result.positions[index][0]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(column.x + column.width);
    expect(new Set(xs).size).toBe(2);
  });

  it('maxRows で 1 レーンに積む枚数が変わる（未指定は既定の CARD_MAX_ROWS）', () => {
    const count = 12;
    const nodes = Array.from({ length: count }, (_value, index) => ({ label: `w${index}`, frequency: 1 }));
    const file = fileWith(nodes, [{ label: 'A', members: nodes.map((_node, index) => index) }]);
    const visibleNodeIndexes = allVisible(file);

    // 既定（20）では 12 枚が 1 レーンに収まり折り返さない
    const byDefault = computeCardLayout({ file, visibleNodeIndexes });
    expect(byDefault.state.maxRows).toBe(CARD_MAX_ROWS);
    expect(byDefault.columns[0].width).toBe(CARD_WIDTH);

    // 5 枚に絞ると 12 枚は 3 レーン（5 / 5 / 2）へ折り返す
    const narrow = computeCardLayout({ file, visibleNodeIndexes, maxRows: 5 });
    expect(narrow.state.maxRows).toBe(5);
    const laneXs = new Set(narrow.columns[0].members.map((index) => narrow.positions[index][0]));
    expect(laneXs.size).toBe(3);
    const maxY = CARD_COLUMN_HEADER_HEIGHT + 5 * (CARD_HEIGHT + CARD_GAP_Y);
    for (const index of narrow.columns[0].members) {
      expect(narrow.positions[index][1]).toBeLessThanOrEqual(maxY);
    }
  });

  it('maxRows が 1 未満・小数でも 1 レーン 1 枚以上に正規化する（レーンが無限に増えない）', () => {
    const nodes = Array.from({ length: 3 }, (_value, index) => ({ label: `w${index}`, frequency: 1 }));
    const file = fileWith(nodes, [{ label: 'A', members: [0, 1, 2] }]);
    const visibleNodeIndexes = allVisible(file);

    for (const maxRows of [0, -5, 0.4]) {
      const result = computeCardLayout({ file, visibleNodeIndexes, maxRows });
      expect(result.state.maxRows).toBe(1);
      // 1 枚ずつ別レーンへ並ぶ（縦は 1 段だけ）
      expect(new Set(result.columns[0].members.map((index) => result.positions[index][0])).size).toBe(3);
    }
    // 小数は切り捨てる（2.9 行 = 2 行）
    expect(computeCardLayout({ file, visibleNodeIndexes, maxRows: 2.9 }).state.maxRows).toBe(2);
  });

  it('同一入力に対して常に同一の出力を返す（決定性）', () => {
    const file = fileWith(
      [
        { label: 'a', frequency: 3 },
        { label: 'b', frequency: 1 },
        { label: 'c', frequency: 2 },
      ],
      [{ label: 'A', members: [0, 2] }],
    );
    const first = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    const second = computeCardLayout({ file, visibleNodeIndexes: allVisible(file) });
    expect(second).toEqual(first);
  });

  it('非表示の語の座標は使われない（カラムの members に現れない）', () => {
    const file = fileWith(
      [
        { label: 'a', frequency: 1 },
        { label: 'b', frequency: 2 },
      ],
      [{ label: 'A', members: [0, 1] }],
    );
    const result = computeCardLayout({ file, visibleNodeIndexes: new Set([0]) });
    expect(result.columns[0].members).toEqual([0]);
    expect(result.state.cardCount).toBe(1);
  });
});

describe('cardLinkAnchors', () => {
  const halfW = CARD_WIDTH / 2;
  const halfH = CARD_HEIGHT / 2;

  it('横に離れたカードは左右の辺で結ぶ', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 400, y: 100 };
    const anchors = cardLinkAnchors(source, target, halfW, halfH);
    expect(anchors.from.x).toBeCloseTo(halfW);
    expect(anchors.from.y).toBeCloseTo(0);
    expect(anchors.to.x).toBeCloseTo(400 - halfW);
    expect(anchors.to.y).toBeCloseTo(100);
    // 外向きの方向が水平
    expect(anchors.from.dx).toBe(1);
    expect(anchors.to.dx).toBe(-1);
  });

  it('右から左へ向かう共起は辺が入れ替わる', () => {
    const source = { x: 400, y: 0 };
    const target = { x: 0, y: 0 };
    const anchors = cardLinkAnchors(source, target, halfW, halfH);
    expect(anchors.from.x).toBeCloseTo(400 - halfW);
    expect(anchors.to.x).toBeCloseTo(halfW);
    expect(anchors.from.dx).toBe(-1);
    expect(anchors.to.dx).toBe(1);
  });

  it('同じカラム（x がほぼ同じ）のカードは上下の辺で結ぶ', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 0, y: 200 };
    const anchors = cardLinkAnchors(source, target, halfW, halfH);
    expect(anchors.from.y).toBeCloseTo(halfH);
    expect(anchors.to.y).toBeCloseTo(200 - halfH);
    expect(anchors.from.dy).toBe(1);
    expect(anchors.to.dy).toBe(-1);
  });
});
