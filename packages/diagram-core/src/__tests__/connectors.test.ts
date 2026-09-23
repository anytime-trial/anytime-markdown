import {
  arrowHeadPath,
  borderPoint,
  type ConnectorEnd,
  type ConnectorLook,
  connectorGeometry as geometryIn,
  DEFAULT_CONNECTOR_LOOK,
} from '../connectors';

/**
 * 向きは既定（左→右）で測る。向きごとの折れ線は `direction.test.ts` が測る。箱の一覧は空で渡す
 * （同じ列・行の間が空いているかの判定は `direction.test.ts` が測る）。
 */
const connectorGeometry = (...args: Parameters<typeof geometryIn> extends [...infer Head, unknown, unknown] ? Head : never) =>
  geometryIn(...(args as unknown as [ConnectorEnd, ConnectorEnd, DiagramSpacing, ConnectorLook]), 'LR', []);
import { DEFAULT_DIAGRAM_SPACING } from '../spacing';
import type { DiagramSpacing } from '../types';
import { node } from './fixture';

/** 検査用の節は px を持つ必要があるので、fixture の節に座標を足して使う。 */
const at = (name: string, x: number, y: number) => ({ ...node(name, 0, 0), x, y });

const SPACING: DiagramSpacing = DEFAULT_DIAGRAM_SPACING;
const { nodeWidth: W, nodeHeight: H } = SPACING;

describe('borderPoint', () => {
  it('真右を向いていれば右辺の中央に当たる', () => {
    const box = at('左', 0, 0);
    expect(borderPoint(box, SPACING, { x: 1000, y: H / 2 })).toEqual({ x: W, y: H / 2 });
  });

  it('真下を向いていれば下辺の中央に当たる', () => {
    const box = at('上', 0, 0);
    expect(borderPoint(box, SPACING, { x: W / 2, y: 1000 })).toEqual({ x: W / 2, y: H });
  });

  it('辺の選択は縦横の比で決まる（角度で場合分けしていない）', () => {
    // 幅 200 × 高さ 100 の箱で、右へ 200・下へ 200。縦の縁が先に来るので下辺へ当たる。
    const narrow: DiagramSpacing = { columnGap: 100, nodeWidth: 200, rowGap: 100, nodeHeight: 100 };
    const box = at('箱', 0, 0);
    const point = borderPoint(box, narrow, { x: 300, y: 250 });
    expect(point.y).toBe(100);
    expect(point.x).toBeLessThan(200);
  });

  it('向き先が中心と同じなら中心を返す（0 除算で NaN を出さない）', () => {
    const box = at('箱', 10, 20);
    expect(borderPoint(box, SPACING, { x: 10 + W / 2, y: 20 + H / 2 })).toEqual({ x: 10 + W / 2, y: 20 + H / 2 });
  });
});

describe('connectorGeometry', () => {
  it('両端は箱の縁に取り付き、線はその 2 点を結ぶ', () => {
    const from = at('左', 0, 0);
    const to = at('右', 400, 0);
    const geometry = connectorGeometry(from, to, SPACING, DEFAULT_CONNECTOR_LOOK)!;
    expect(geometry.start).toMatchObject({ x: W, y: H / 2 });
    expect(geometry.end).toMatchObject({ x: 400, y: H / 2 });
    expect(geometry.path).toBe(`M ${W} ${H / 2} L 400 ${H / 2}`);
  });

  it('終端の向きは始端の逆（矢尻が内側を向かない）', () => {
    const geometry = connectorGeometry(at('左', 0, 0), at('右', 400, 0), SPACING, DEFAULT_CONNECTOR_LOOK)!;
    expect(geometry.start.angle).toBeCloseTo(0);
    expect(geometry.end.angle).toBeCloseTo(Math.PI);
  });

  it('中心が重なった 2 つには線を引かない（向きが決まらない）', () => {
    expect(connectorGeometry(at('甲', 30, 30), at('乙', 30, 30), SPACING, DEFAULT_CONNECTOR_LOOK)).toBeNull();
  });
});

describe('arrowHeadPath', () => {
  it('先端は端の点そのもので、開くのは線が来た側', () => {
    // 右向きに進む線の終端は angle = π（そこから線が伸びていく向き）を持つ。矢尻は右を向き、
    // 三角形は線の来た左側へ開く。
    const d = arrowHeadPath({ x: 100, y: 50 }, Math.PI, 10);
    const points = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    expect(points[0]).toEqual({ x: 100, y: 50 });
    expect(points[1]!.x).toBeLessThan(100);
    expect(points[2]!.x).toBeLessThan(100);
    // 上下に開く（線の上に潰れない）。
    expect(Math.sign(points[1]!.y - 50)).toBe(-Math.sign(points[2]!.y - 50));
  });

  it('始端の矢尻は終端と反対を向く（同じ角度の約束で両端を描ける）', () => {
    const start = arrowHeadPath({ x: 0, y: 50 }, 0, 10);
    const points = [...start.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x]) => Number(x));
    expect(points[0]).toBe(0);
    expect(points[1]).toBeGreaterThan(0);
    expect(points[2]).toBeGreaterThan(0);
  });
});
