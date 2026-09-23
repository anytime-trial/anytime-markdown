/**
 * 図の向きと人物の並び。上→下では世代を行、兄弟を列に置く（左→右の列と行を入れ替える）。
 */

import { diagramChart, layoutDiagram, orientDiagramChart, transposeDiagramPlacements } from '../layout';
import { DEFAULT_DIAGRAM_SPACING, cellPosition } from '../spacing';
import { SAMPLE } from './fixture';

const families = SAMPLE.families;

describe('自動配置の向き', () => {
  it('左→右はそのまま（世代＝列）', () => {
    const chart = layoutDiagram(families);
    expect(orientDiagramChart(chart, 'LR')).toBe(chart);
  });

  it('上→下では列と行を入れ替え、座標も升目から引き直す', () => {
    const chart = layoutDiagram(families);
    const oriented = orientDiagramChart(chart, 'TB');
    for (const node of chart.nodes) {
      const turned = oriented.automatic.get(node.name)!;
      expect({ column: turned.column, row: turned.row }).toEqual({ column: node.row, row: node.column });
      expect({ x: turned.x, y: turned.y })
        .toEqual(cellPosition(DEFAULT_DIAGRAM_SPACING, { column: node.row, row: node.column }));
    }
    expect(oriented.nodes.map((node) => node.name)).toEqual(chart.nodes.map((node) => node.name));
  });

  it('diagramChart は配置差分の向きで自動配置を組む', () => {
    const lr = diagramChart(families);
    const tb = diagramChart(families, { placements: {}, direction: 'TB' });
    const first = lr.nodes.find((node) => node.column !== node.row);
    const turned = tb.nodes.find((node) => node.name === first!.name)!;
    expect({ column: turned.column, row: turned.row }).toEqual({ column: first!.row, row: first!.column });
  });
});

describe('配置差分の転置', () => {
  it('列と行を入れ替える', () => {
    expect(transposeDiagramPlacements({ 甲: { column: 2, row: 5 }, 乙: { column: 0, row: 1 } }))
      .toEqual({ 甲: { column: 5, row: 2 }, 乙: { column: 1, row: 0 } });
  });

  it('2 回で元に戻る', () => {
    const placements = { 甲: { column: 2, row: 5 } };
    expect(transposeDiagramPlacements(transposeDiagramPlacements(placements))).toEqual(placements);
  });
});
