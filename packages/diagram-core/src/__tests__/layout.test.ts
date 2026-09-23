/**
 * 自動配置・刻みの適用・配置差分の適用と、升目の広がり。
 *
 * 移植元は anytime-travel の `tests/genealogy.test.tsx` のうち純粋関数の節。
 */

import {
  applyDiagramPlacements,
  applyDiagramSpacing,
  diagramChart,
  familyConnector,
  layoutDiagram,
  type ChartNode,
} from '../layout';
import {
  MAX_GRID_CELLS,
  freeCellsPath,
  gridBounds,
  gridExtent,
  nearestCell,
  nearestFreeCell,
  paintableExtent,
} from '../grid';
import { DEFAULT_DIAGRAM_SPACING, cellKey, cellPosition, columnPitch, rowPitch } from '../spacing';
import { chartPoint, fitChart, placementFromDrag, zoomAt, MAX_SCALE, MIN_SCALE } from '../view';
import { SAMPLE, node, occupancy } from './fixture';

const families = SAMPLE.families;
const byName = (nodes: readonly ChartNode[]) => new Map(nodes.map((item) => [item.name, item]));

describe('自動配置', () => {
  const chart = layoutDiagram(families);

  it('全人物を一度ずつ配置する', () => {
    const names = chart.nodes.map((item) => item.name).sort();
    expect(names).toEqual(['化生', '叔父', '妹', '子', '母', '父', '独神', '祖母', '祖父']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('親は必ず子より手前の列に置く', () => {
    const nodes = byName(chart.nodes);
    for (const family of families) {
      const parentColumn = Math.max(...family.parents.map((name) => nodes.get(name)!.column));
      for (const child of family.children) {
        expect(nodes.get(child)!.column).toBeGreaterThan(parentColumn);
      }
    }
  });

  it('親の記録が無い配偶者を相手の列へ寄せる', () => {
    // 寄せないと子が長い斜めの線で結ばれ、同世代に見えなくなる。
    const nodes = byName(chart.nodes);
    expect(nodes.get('母')!.column).toBe(nodes.get('父')!.column);
  });

  it('同じ升目に 2 人を置かない', () => {
    const keys = chart.nodes.map((item) => cellKey(item));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('独立した系統の切れ目で 1 行あける', () => {
    // 同じ列に別々の系統が並ぶとき、詰めると親子線が隣の箱に重なって読めない。
    const column0 = chart.nodes.filter((item) => item.column === 0).sort((a, b) => a.row - b.row);
    expect(column0.length).toBeGreaterThan(1);
    const gaps = column0.slice(1).map((item, index) => item.row - column0[index]!.row);
    expect(Math.max(...gaps)).toBeGreaterThan(1);
  });

  it('配偶と親子の線を重複なく引く', () => {
    const keys = chart.edges.map((edge) => `${edge.from}/${edge.to}/${edge.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(chart.edges).toContainEqual({ from: '祖父', to: '祖母', kind: 'spouse' });
    expect(chart.edges).toContainEqual({ from: '独神', to: '化生', kind: 'creation' });
  });

  it('循環する親子関係は読み込み時に落とさず例外で知らせる', () => {
    expect(() => layoutDiagram([
      { parents: ['あ'], children: ['い'], kind: 'birth', groups: {} },
      { parents: ['い'], children: ['あ'], kind: 'birth', groups: {} },
    ])).toThrow(/Cyclic diagram/);
  });
});

describe('刻みの適用', () => {
  const automatic = layoutDiagram(families);

  it('既定の刻みでは図をそのまま返す（写像を 1 回増やさない）', () => {
    expect(applyDiagramSpacing(automatic, DEFAULT_DIAGRAM_SPACING)).toBe(automatic);
  });

  it('刻みを変えると座標だけが引き直され、升目の番号は変わらない', () => {
    const spacing = { ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 240, rowGap: 100 };
    const spaced = applyDiagramSpacing(automatic, spacing);
    const before = byName(automatic.nodes);
    for (const item of spaced.nodes) {
      const original = before.get(item.name)!;
      expect(item.column).toBe(original.column);
      expect(item.row).toBe(original.row);
      expect(item).toMatchObject(cellPosition(spacing, item));
    }
  });

  it('すべての列の間隔が同じだけ変わる', () => {
    const spacing = { ...DEFAULT_DIAGRAM_SPACING, columnGap: 300 };
    const spaced = applyDiagramSpacing(automatic, spacing);
    const columns = [...new Set(spaced.nodes.map((item) => item.column))].sort((a, b) => a - b);
    expect(columns.length).toBeGreaterThan(1);
    const xs = columns.map((column) => spaced.nodes.find((item) => item.column === column)!.x);
    for (const [index, x] of xs.slice(1).entries()) {
      // 列の番号が飛んでいても、間隔はその差の倍数で揃う（列ごとの刻みを持たない）。
      expect(x - xs[index]!).toBe((columns[index + 1]! - columns[index]!) * columnPitch(spacing));
    }
  });
});

describe('配置差分の適用', () => {
  it('指定した人物だけを動かし、残りは自動配置のままにする', () => {
    const base = diagramChart(families);
    const moved = diagramChart(families, { placements: { 子: { column: 5, row: 7 } } });
    const before = byName(base.nodes);
    for (const item of moved.nodes) {
      if (item.name === '子') continue;
      expect(item).toEqual(before.get(item.name));
    }
    const child = moved.nodes.find((item) => item.name === '子')!;
    expect(child).toMatchObject({ column: 5, row: 7, ...cellPosition(DEFAULT_DIAGRAM_SPACING, child) });
  });

  it('知らない人物の差分は描画に影響しない', () => {
    const base = diagramChart(families);
    const withGhost = diagramChart(families, { placements: { 居ない人: { column: 9, row: 9 } } });
    expect(withGhost.nodes).toEqual(base.nodes);
  });

  it('手で動かした人物は刻みを変えても同じ升目に居る', () => {
    // px で保存していたら、刻みを 1 目盛り動かしただけで手で置いた人物だけが升目から外れる。
    const placements = { 子: { column: 4, row: 2 } };
    for (const spacing of [DEFAULT_DIAGRAM_SPACING, { ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 300, nodeHeight: 200 }]) {
      const chart = diagramChart(families, { placements, spacing });
      const child = chart.nodes.find((item) => item.name === '子')!;
      expect({ column: child.column, row: child.row }).toEqual(placements.子);
      expect({ x: child.x, y: child.y }).toEqual(cellPosition(spacing, placements.子));
    }
  });

  it('図の広さは最も右下の箱に余白を足した大きさになる', () => {
    const chart = diagramChart(families);
    const right = Math.max(...chart.nodes.map((item) => item.x));
    expect(chart.width).toBe(right + DEFAULT_DIAGRAM_SPACING.nodeWidth + 30);
  });
});

describe('関係線', () => {
  it('折れ線の家族は両親それぞれから線を出して合流させ、両親を結ぶ線は引かない', () => {
    const chart = diagramChart(families);
    const nodes = byName(chart.nodes);
    const connector = familyConnector(families[0]!, nodes, { spacing: DEFAULT_DIAGRAM_SPACING, direction: 'LR' });
    expect(connector.marriage).toBeNull();
    expect(connector.descent).not.toBeNull();
    // 親ごとの線は、その親の右面の中央から出る。
    for (const name of families[0]!.parents) {
      const parent = nodes.get(name)!;
      expect(connector.descent).toContain(`M ${parent.x + DEFAULT_DIAGRAM_SPACING.nodeWidth} ${parent.y + DEFAULT_DIAGRAM_SPACING.nodeHeight / 2}`);
    }
  });

  it('子の居ない家族は、合流先が無いので両親を結ぶ線だけを引く', () => {
    const chart = diagramChart(families);
    const childless = { ...families[0]!, children: [] };
    const connector = familyConnector(childless, byName(chart.nodes), { spacing: DEFAULT_DIAGRAM_SPACING, direction: 'LR' });
    expect(connector.marriage).not.toBeNull();
    expect(connector.descent).toBeNull();
  });

  it('片親の家族には配偶の線を作らない', () => {
    const chart = diagramChart(families);
    const connector = familyConnector(families[2]!, byName(chart.nodes), { spacing: DEFAULT_DIAGRAM_SPACING, direction: 'LR' });
    expect(connector.marriage).toBeNull();
    expect(connector.points.some((point) => point.kind === 'junction')).toBe(true);
  });

  it('箱の大きさは線の取り付き位置に効く', () => {
    const spacing = { ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 300 };
    const chart = diagramChart(families, { placements: {}, spacing });
    const narrow = familyConnector(families[0]!, byName(chart.nodes), { spacing: DEFAULT_DIAGRAM_SPACING, direction: 'LR' });
    const wide = familyConnector(families[0]!, byName(chart.nodes), { spacing, direction: 'LR' });
    expect(wide.junction.x).not.toBe(narrow.junction.x);
  });
});

describe('升目の広がりと塗り', () => {
  it('自動配置の範囲に列と行を 1 つずつ足す', () => {
    // 足さないと、いちばん右・いちばん下の人物は動かせる先が 1 つも無い。
    const nodes = [node('あ', 0, 0), node('い', 2, 3)];
    expect(gridExtent(nodes)).toEqual({ columns: 4, rows: 5 });
  });

  it('遠くの升目を指す差分があっても、塗る升目は天井を超えない', () => {
    const automatic = [node('あ', 0, 0)];
    const far = [node('あ', 5000, 5000)];
    const extent = paintableExtent(far, automatic);
    expect(extent.columns * extent.rows).toBeLessThanOrEqual(MAX_GRID_CELLS);
    expect(extent).toEqual(gridExtent(automatic));
  });

  it('埋まった升目は塗らない', () => {
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const extent = { columns: 2, rows: 2 };
    const path = freeCellsPath(spacing, extent, occupancy({ column: 0, row: 0 }));
    expect(path.split('Z').length - 1).toBe(3);
    const origin = cellPosition(spacing, { column: 0, row: 0 });
    expect(path).not.toContain(`M ${origin.x} ${origin.y} h`);
  });

  it('塗った升目はすべて図の枠の内側に収まる', () => {
    // 外縁の升目が切り落とされると、置けるのに塗られない升目が残る。
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const extent = { columns: 3, rows: 4 };
    const bounds = gridBounds(spacing, extent);
    const last = cellPosition(spacing, { column: extent.columns - 1, row: extent.rows - 1 });
    expect(bounds.width).toBeGreaterThanOrEqual(last.x + spacing.nodeWidth);
    expect(bounds.height).toBeGreaterThanOrEqual(last.y + spacing.nodeHeight);
  });

  it('升目の外へは置けず、升目の間へも置けない', () => {
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const extent = { columns: 3, rows: 3 };
    expect(nearestCell(spacing, extent, { x: -9999, y: -9999 })).toEqual({ column: 0, row: 0 });
    expect(nearestCell(spacing, extent, { x: 9999, y: 9999 })).toEqual({ column: 2, row: 2 });
    // 升目の中央付近を指せばその升目へ収まる（間には置けない）。
    const centre = cellPosition(spacing, { column: 1, row: 1 });
    expect(nearestCell(spacing, extent, { x: centre.x + 10, y: centre.y + 10 })).toEqual({ column: 1, row: 1 });
  });

  it('埋まった升目へは落とさず、最も近い空いた升目へ寄せる', () => {
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const extent = { columns: 4, rows: 4 };
    const target = cellPosition(spacing, { column: 1, row: 1 });
    const placed = nearestFreeCell(spacing, extent, occupancy({ column: 1, row: 1 }), target, { column: 0, row: 0 });
    expect(placed).not.toEqual({ column: 1, row: 1 });
    expect(Math.abs(placed.column - 1) + Math.abs(placed.row - 1)).toBe(1);
  });

  it('空きが 1 つも無ければ元の位置へ返す（図の隅へ飛ばさない）', () => {
    const spacing = DEFAULT_DIAGRAM_SPACING;
    const extent = { columns: 2, rows: 2 };
    const all = occupancy(
      { column: 0, row: 0 }, { column: 1, row: 0 }, { column: 0, row: 1 }, { column: 1, row: 1 },
    );
    const fallback = { column: 1, row: 1 };
    expect(nearestFreeCell(spacing, extent, all, cellPosition(spacing, { column: 0, row: 0 }), fallback))
      .toEqual(fallback);
  });
});

describe('図の見え方', () => {
  it('拡大縮小は中心を保ち、倍率の上下限を守る', () => {
    const view = { x: 0, y: 0, scale: 1 };
    const zoomed = zoomAt(view, 2, 100, 50);
    // 掴んだ点は動かない。
    expect(chartPoint(zoomed, { left: 0, top: 0 }, 100, 50))
      .toEqual(chartPoint(view, { left: 0, top: 0 }, 100, 50));
    expect(zoomAt(view, 1000, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, 0.0001, 0, 0).scale).toBe(MIN_SCALE);
  });

  it('全体表示は枠に収まり、拡大はしない', () => {
    const fit = fitChart(1000, 600, 11000, 4300);
    expect(fit.scale).toBeLessThanOrEqual(1);
    expect(11000 * fit.scale).toBeLessThanOrEqual(1000);
    expect(fitChart(1000, 600, 10, 10).scale).toBe(1);
  });

  it('掴んだ点と箱のずれを保ったまま図の座標へ写す', () => {
    const view = { x: 20, y: 10, scale: 0.5 };
    const rect = { left: 5, top: 7 };
    const point = chartPoint(view, rect, 105, 107);
    expect(placementFromDrag(view, rect, 105, 107, { x: 4, y: 6 }))
      .toEqual({ x: Math.round(point.x - 4), y: Math.round(point.y - 6) });
  });

  it('枠の外（負の座標）へは置かない', () => {
    expect(placementFromDrag({ x: 0, y: 0, scale: 1 }, { left: 0, top: 0 }, -100, -100, { x: 0, y: 0 }))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('差分を当てた図の升目', () => {
  it('行の番号は刻みで変わらない', () => {
    const rows = (spacing: typeof DEFAULT_DIAGRAM_SPACING) =>
      applyDiagramPlacements(applyDiagramSpacing(layoutDiagram(families), spacing), { placements: {}, spacing })
        .nodes.map((item) => `${item.name}:${item.row}`).sort();
    expect(rows({ ...DEFAULT_DIAGRAM_SPACING, rowGap: 200 })).toEqual(rows(DEFAULT_DIAGRAM_SPACING));
  });

  it('箱の高さは図の高さに効く', () => {
    const tall = { ...DEFAULT_DIAGRAM_SPACING, nodeHeight: 200 };
    expect(diagramChart(families, { placements: {}, spacing: tall }).height)
      .toBeGreaterThan(diagramChart(families).height);
    expect(rowPitch(tall)).toBeGreaterThan(rowPitch(DEFAULT_DIAGRAM_SPACING));
  });
});
