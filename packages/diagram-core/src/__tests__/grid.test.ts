/**
 * 複数選択での移動と、空の行・列の増減、図の縁に置くアイコンの位置。
 *
 * 移植元は anytime-travel の `tests/genealogy-grid-edit.test.tsx` のうち純粋関数の節。
 * 押下・ドラッグは node 環境で実行できないので、**動きの判定は純粋関数で測る**。
 */

import { MAX_PLACEMENTS_PER_DIAGRAM } from '../document';
import {
  GUTTER_ICON_PX,
  columnBoundaryX,
  columnCentreX,
  fittingShift,
  gridLineEdits,
  gridLineOccupant,
  insertGridLine,
  isNoShift,
  nudgeShift,
  removeGridLine,
  rowBoundaryY,
  rowCentreY,
  visibleGutterIndices,
  type GridCell,
  type GridExtent,
} from '../grid';
import { DEFAULT_DIAGRAM_SPACING, DIAGRAM_MARGIN, columnPitch, rowPitch } from '../spacing';
import { fitChart } from '../view';
import { applied, cellOf, homes, node, occupancy } from './fixture';

const EXTENT: GridExtent = { columns: 6, rows: 6 };
/** 升目の番号の上限。実際の刻みから導く値の代わりに、検査では十分大きい数を置く。 */
const NO_LIMIT = { column: 10_000, row: 10_000 };

describe('複数選択での移動', () => {
  const pair: readonly GridCell[] = [{ column: 1, row: 1 }, { column: 2, row: 1 }];

  it('選んだ全員が同じ升目数だけ動く', () => {
    expect(fittingShift(EXTENT, occupancy(), pair, { columns: 1, rows: 0 })).toEqual({ columns: 1, rows: 0 });
    expect(fittingShift(EXTENT, occupancy(), pair, { columns: 0, rows: 2 })).toEqual({ columns: 0, rows: 2 });
  });

  it('1 人でも行き先が埋まっていれば誰も動かさない（別の差へ寄せない）', () => {
    // 寄せると、指を止めていても群が升目の間を往復する（採った差の次のフレームで望んだ差が
    // 引き直されるため）。置けないなら動かさない。
    expect(isNoShift(fittingShift(EXTENT, occupancy({ column: 3, row: 1 }), pair, { columns: 1, rows: 0 }))).toBe(true);
    expect(isNoShift(fittingShift(EXTENT, occupancy({ column: 2, row: 2 }), pair, { columns: 0, rows: 1 }))).toBe(true);
  });

  it('枠の外へ出る差は採らない', () => {
    expect(isNoShift(fittingShift(EXTENT, occupancy(), pair, { columns: -2, rows: 0 }))).toBe(true);
    expect(isNoShift(fittingShift(EXTENT, occupancy(), pair, { columns: 4, rows: 0 }))).toBe(true);
  });

  it('矢印キーの移動は群で向きを保ち、その向きの最初の空きへ揃って進む', () => {
    const cells: readonly GridCell[] = [{ column: 1, row: 1 }, { column: 1, row: 2 }];
    // 右隣（列 2）の片方が埋まっているので、群は 1 升では動けず 2 升先へ揃って進む。
    expect(nudgeShift(EXTENT, occupancy({ column: 2, row: 1 }), cells, { columns: 1, rows: 0 }))
      .toEqual({ columns: 2, rows: 0 });
    // 向きの先が全部埋まっていれば動かさない（最近傍へ寄せて別の向きへ飛ばさない）。
    const walled = occupancy(
      { column: 2, row: 1 }, { column: 3, row: 1 }, { column: 4, row: 1 }, { column: 5, row: 1 },
    );
    expect(isNoShift(nudgeShift(EXTENT, walled, cells, { columns: 1, rows: 0 }))).toBe(true);
    // 採った差は必ず押した向きと同符号（逆や横へ飛ばない）。
    const shift = nudgeShift(EXTENT, occupancy({ column: 1, row: 3 }), cells, { columns: 0, rows: 1 });
    expect(shift.columns).toBe(0);
    expect(shift.rows).toBeGreaterThan(0);
  });

  it('枠の端では動かさない', () => {
    expect(isNoShift(nudgeShift(EXTENT, occupancy(), [{ column: 0, row: 0 }], { columns: -1, rows: 0 }))).toBe(true);
  });

  it('Shift の粗い移動は跳んだ先が枠の外なら手前へ戻りながら探す', () => {
    // 跳んだ先が枠の外というだけで動かさないと、端の手前に空きがあるのに「キーが効かない」
    // ように見える。
    const shift = nudgeShift(EXTENT, occupancy(), [{ column: 1, row: 1 }], { columns: 5, rows: 0 });
    expect(shift).toEqual({ columns: 4, rows: 0 });
  });

  it('群の中の升目は「空き」として扱える（入れ替わりが起こるため呼ぶ側が外す）', () => {
    expect(fittingShift(EXTENT, occupancy(), pair, { columns: 1, rows: 0 })).toEqual({ columns: 1, rows: 0 });
    // 除かずに渡すと動けない（呼ぶ側の責任であることを明示する）。
    expect(isNoShift(fittingShift(EXTENT, occupancy(...pair), pair, { columns: 1, rows: 0 }))).toBe(true);
  });
});

describe('空の行・列の増減', () => {
  const nodes = [node('あ', 0, 0), node('い', 1, 0), node('う', 2, 0)];
  const auto = homes(nodes);

  it('挿入は、その位置から後ろの人物だけを 1 升ずらして固定する', () => {
    expect(insertGridLine(nodes, {}, 'column', 1, auto))
      .toEqual({ い: { column: 2, row: 0 }, う: { column: 3, row: 0 } });
  });

  it('動かない人物の差分は残し、動く人物の差分だけを書き換える', () => {
    const placements = { あ: { column: 0, row: 5 }, う: { column: 4, row: 0 } };
    const moved = applied(nodes, placements);
    expect(insertGridLine(moved, placements, 'row', 3, auto))
      .toEqual({ あ: { column: 0, row: 6 }, う: { column: 4, row: 0 } });
  });

  it('詰めると升目も固定も挿入の前へ戻る', () => {
    const inserted = insertGridLine(nodes, {}, 'column', 1, auto);
    const restored = removeGridLine(applied(nodes, inserted), inserted, 'column', 1, auto);
    expect(applied(nodes, restored).map(cellOf)).toEqual(nodes.map(cellOf));
    // 升目だけでなく**差分そのもの**が戻る。残すと、1 度の押し間違いで図の右側が全員
    // 「手で置いた」扱いになり、以後データを足しても自動配置へ追従しない。
    expect(restored).toEqual({});
  });

  it('自動配置と違う升目へ手で置いた人物は、詰めても固定が残る', () => {
    const placements = { う: { column: 4, row: 2 } };
    const moved = applied(nodes, placements);
    expect(removeGridLine(moved, placements, 'column', 3, auto)).toEqual({ う: { column: 3, row: 2 } });
  });

  it('その行・列に居る人物を告げる。図に出ない古い差分も数える', () => {
    expect(gridLineOccupant(nodes, {}, 'column', 1)).toBe('い');
    expect(gridLineOccupant(nodes, {}, 'column', 3)).toBeNull();
    // 人物名を直した後に残った差分。描かれないが保存はされるので、詰めると升目が重なる。
    expect(gridLineOccupant(nodes, { 古い名: { column: 3, row: 0 } }, 'column', 3)).toBe('古い名');
  });

  it('挿入と削除は同じ位置で互いの逆になる', () => {
    const inserted = gridLineEdits(nodes, {}, 'column', 1, NO_LIMIT, auto).insert!;
    const back = gridLineEdits(applied(nodes, inserted), inserted, 'column', 1, NO_LIMIT, auto).remove;
    expect(back).toEqual({});
  });

  it('詰められるのはその行・列が空いているときだけ', () => {
    expect(gridLineEdits(nodes, {}, 'column', 1, NO_LIMIT, auto).remove).toBeNull();
    expect(gridLineEdits(nodes, {}, 'column', 0, NO_LIMIT, auto).remove).toBeNull();
    // 自動配置が列 2 に置いている人物を列 1 へ詰めるので、その人物は固定される。
    const gapped = [node('あ', 0, 0), node('う', 2, 0)];
    expect(gridLineEdits(gapped, {}, 'column', 1, NO_LIMIT, homes(gapped)).remove)
      .toEqual({ う: { column: 1, row: 0 } });
  });

  it('すでに同じ升目に 2 人居る図では、挿入も削除もさせない', () => {
    // 画面は何も変わらないのに、差分へ引き写すと保存の入口（同一升目の検査）が断る。
    const crowded = [node('A', 5, 3), node('B', 5, 3)];
    const placements = { A: { column: 5, row: 3 } };
    const auto2 = new Map([['A', cellOf({ column: 0, row: 0 })], ['B', cellOf({ column: 5, row: 3 })]]);
    expect(gridLineEdits(crowded, placements, 'column', 5, NO_LIMIT, auto2).insert).toBeNull();
    // 空いている列 4 を詰めると、重なったまま 2 人とも列 4 へ載る。
    expect(gridLineEdits(crowded, placements, 'column', 4, NO_LIMIT, auto2).remove).toBeNull();
  });

  it('固定する件数が 1 図の上限を超えるなら、挿入も削除もさせない', () => {
    const many = Array.from({ length: MAX_PLACEMENTS_PER_DIAGRAM + 1 }, (_, index) => node(`人${index}`, 2, index));
    expect(gridLineEdits(many, {}, 'column', 2, NO_LIMIT, homes(many)).insert).toBeNull();
    // 削除も同じ件数を固定する。片側だけ見ていると、押せるのに保存だけが断られる。
    expect(gridLineEdits(many, {}, 'column', 1, NO_LIMIT, homes(many)).remove).toBeNull();
    const few = many.slice(0, MAX_PLACEMENTS_PER_DIAGRAM);
    expect(gridLineEdits(few, {}, 'column', 2, NO_LIMIT, homes(few)).insert).not.toBeNull();
  });

  it('ずれた先が升目の番号の上限を超えるなら挿入させない', () => {
    const one = [node('あ', 5, 0)];
    expect(gridLineEdits(one, {}, 'column', 5, { column: 5, row: 5 }, homes(one)).insert).toBeNull();
    expect(gridLineEdits(one, {}, 'column', 5, { column: 6, row: 5 }, homes(one)).insert)
      .toEqual({ あ: { column: 6, row: 0 } });
    // 行の上限を列の上限で代用しない（刻みが違えば上限も違う）。
    const deep = [node('あ', 0, 5)];
    expect(gridLineEdits(deep, {}, 'row', 5, { column: 10, row: 5 }, homes(deep)).insert).toBeNull();
  });
});

describe('図の縁に置くアイコンの位置', () => {
  const spacing = DEFAULT_DIAGRAM_SPACING;

  it('切れ目はすき間の中央。左端・上端だけは余白の中央へ寄せる', () => {
    expect(columnBoundaryX(spacing, 1)).toBe(DIAGRAM_MARGIN + columnPitch(spacing) - spacing.columnGap / 2);
    expect(rowBoundaryY(spacing, 1)).toBe(DIAGRAM_MARGIN + rowPitch(spacing) - spacing.rowGap / 2);
    // 左端・上端の手前にすき間は無い。中央を取ると図の外（負）になり、画面に出ない。
    expect(columnBoundaryX(spacing, 0)).toBe(DIAGRAM_MARGIN / 2);
    expect(rowBoundaryY(spacing, 0)).toBe(DIAGRAM_MARGIN / 2);
  });

  it('詰めるアイコンは列・行の中央に置き、切れ目と重ならない', () => {
    for (const index of [0, 1, 5]) {
      expect(columnCentreX(spacing, index)).toBeGreaterThan(columnBoundaryX(spacing, index));
      expect(columnCentreX(spacing, index)).toBeLessThan(columnBoundaryX(spacing, index + 1));
      expect(rowCentreY(spacing, index)).toBeGreaterThan(rowBoundaryY(spacing, index));
      expect(rowCentreY(spacing, index)).toBeLessThan(rowBoundaryY(spacing, index + 1));
    }
  });
});

describe('図の縁に描くアイコンの本数', () => {
  const at = (index: number) => index * 100;

  it('画面に映る切れ目だけを返す', () => {
    // 枠 300px・倍率 1・平行移動なし → 0〜300px に入る 0〜3 番（端の遊びぶんを含む）。
    expect(visibleGutterIndices({ count: 10, at, offset: 0, scale: 1, frame: 300, pitch: 100 }))
      .toEqual([0, 1, 2, 3]);
    // 左へ 250px 流すと、手前の 0〜2 番が枠の外へ出る代わりに後ろが入る。
    expect(visibleGutterIndices({ count: 10, at, offset: -250, scale: 1, frame: 300, pitch: 100 }))
      .toEqual([3, 4, 5]);
  });

  it('枠が未計測（0）のときは絞らない', () => {
    // 絞ると、計測が届くまでアイコンが 1 つも出ない。
    expect(visibleGutterIndices({ count: 4, at, offset: 0, scale: 1, frame: 0, pitch: 100 })).toEqual([0, 1, 2, 3]);
  });

  it('隣と重なる倍率では 1 つも出さない', () => {
    // 重なった所では後から描いたほうが押下を取り、狙った切れ目と違う位置へ挿入される。
    expect(visibleGutterIndices({ count: 10, at, offset: 0, scale: GUTTER_ICON_PX / 100, frame: 0, pitch: 100 }))
      .toHaveLength(10);
    expect(visibleGutterIndices({ count: 10, at, offset: 0, scale: GUTTER_ICON_PX / 100 - 0.001, frame: 0, pitch: 100 }))
      .toEqual([]);
    // 全体表示（幅 1 万 px の図を 1000px の枠へ）の倍率でも、既定の刻みなら重ならない。
    const fit = fitChart(1000, 600, 11000, 4300);
    expect(visibleGutterIndices({
      count: 3, at, offset: fit.x, scale: fit.scale, frame: 0, pitch: columnPitch(DEFAULT_DIAGRAM_SPACING),
    })).toHaveLength(3);
  });
});
