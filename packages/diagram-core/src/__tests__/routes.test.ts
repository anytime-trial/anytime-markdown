import type { ConnectorLook } from '../connectors';
import { anchorKey, connectorGeometry, midpointOf, sameAnchor } from '../connectors';
import { DEFAULT_DIAGRAM_SPACING } from '../spacing';
import type { DiagramEndpoint, DiagramLineRoute } from '../types';
import { elementAnchor, lineAnchor } from '../types';
import { node } from './fixture';

const SPACING = DEFAULT_DIAGRAM_SPACING;
const { nodeWidth: W, nodeHeight: H } = SPACING;
const at = (name: string, x: number, y: number) => ({ ...node(name, 0, 0), x, y });

/** 引き回しと端の印。印を書かなければ両端とも無印。 */
const look = (
  route: DiagramLineRoute,
  marks: { readonly start?: DiagramEndpoint; readonly end?: DiagramEndpoint } = {},
): ConnectorLook => ({ route, start: 'none', end: 'none', ...marks });

/** 箱でなく点で端を渡すとき（別の線の中点に取り付いた端）。 */
const point = (x: number, y: number) => ({ x, y });

describe('経路', () => {
  const left = at('左', 0, 0);
  const right = at('右', 400, 200);

  it('直線は縁どうしを 1 本で結ぶ', () => {
    const path = connectorGeometry(left, right, SPACING, look('straight'))!.path;
    expect(path.split('L')).toHaveLength(2);
    expect(path).toMatch(/^M /);
  });

  it('折れ線は縦横だけで曲がる（斜めの区間が無い）', () => {
    const path = connectorGeometry(left, right, SPACING, look('orthogonal'))!.path;
    const commands = path.match(/[MLHV]/g) ?? [];
    expect(commands.filter((c) => c === 'L')).toHaveLength(0);
    expect(commands).toContain('H');
    expect(commands).toContain('V');
  });

  it('カーブは 3 次ベジェで描く', () => {
    expect(connectorGeometry(left, right, SPACING, look('curved'))!.path).toContain('C ');
  });

  it('折れ線とカーブの端は辺の中央に取り付く（斜めに離れていても角から生えない）', () => {
    // 中心は (97, 56) と (497, 256)。横のほうが離れているので、右辺と左辺の**中央**に付く。
    for (const route of ['orthogonal', 'curved'] as const) {
      const geometry = connectorGeometry(left, right, SPACING, look(route))!;
      expect([geometry.start.x, geometry.start.y]).toEqual([W, H / 2]);
      expect([geometry.end.x, geometry.end.y]).toEqual([400, 200 + H / 2]);
    }
  });

  it('縦に離れていれば上辺・下辺の中央に取り付く', () => {
    const below = at('下', 40, 600);
    const geometry = connectorGeometry(left, below, SPACING, look('orthogonal'))!;
    expect([geometry.start.x, geometry.start.y]).toEqual([W / 2, H]);
    expect([geometry.end.x, geometry.end.y]).toEqual([40 + W / 2, 600]);
  });

  it('折れ線の端の印は軸に揃う（真横から入る線に斜めの矢尻を付けない）', () => {
    const geometry = connectorGeometry(left, right, SPACING, look('orthogonal'))!;
    expect(geometry.start.angle).toBeCloseTo(0);
    expect(geometry.end.angle).toBeCloseTo(Math.PI);
  });

  it('直線の端は相手の中心を向いたまま（経路ごとに取り付きの決め方が違う）', () => {
    const geometry = connectorGeometry(left, right, SPACING, look('straight'))!;
    expect(geometry.start.y).toBeGreaterThan(H / 2);
    expect(geometry.start.angle).toBeCloseTo(Math.atan2(200, 400));
  });

  it('箱の代わりに点を渡すと、その点が端になる（線の中点に取り付いた端）', () => {
    const geometry = connectorGeometry(point(50, 50), right, SPACING, look('straight'))!;
    expect([geometry.start.x, geometry.start.y]).toEqual([50, 50]);
  });

  it('中心が同じなら向きが決まらないので描かない', () => {
    expect(connectorGeometry(at('重', 0, 0), at('なり', 0, 0), SPACING, look('straight'))).toBeNull();
  });
});

describe('揃って並んだ 2 つのカーブ', () => {
  /** `M x y C c1x c1y c2x c2y ex ey` の数を順に取り出す。 */
  const numbers = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  /** 2 つの制御点。 */
  const controls = (path: string) => {
    const [, , c1x, c1y, c2x, c2y] = numbers(path);
    return [{ x: c1x, y: c1y }, { x: c2x, y: c2y }] as const;
  };

  const above = at('上', 0, 0);
  const below = at('下', 0, 600);
  const leftBox = at('左', 0, 0);
  const rightBox = at('右', 600, 0);

  it('上下に並んでいて終点が矢印なら、右へ張り出して曲がる', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved', { end: 'arrow' }))!;
    // 取り付きは下辺・上辺の中央のまま。曲げるのは間だけ。
    expect([geometry.start.x, geometry.start.y]).toEqual([W / 2, H]);
    expect([geometry.end.x, geometry.end.y]).toEqual([W / 2, 600]);
    for (const control of controls(geometry.path)) expect(control.x).toBeGreaterThan(W / 2);
  });

  it('始点が矢印なら進む向きが逆なので、左へ張り出す', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved', { start: 'arrow' }))!;
    for (const control of controls(geometry.path)) expect(control.x).toBeLessThan(W / 2);
  });

  it('左右に並んでいて終点が矢印なら、上へ張り出す（右回り）', () => {
    const geometry = connectorGeometry(leftBox, rightBox, SPACING, look('curved', { end: 'arrow' }))!;
    for (const control of controls(geometry.path)) expect(control.y).toBeLessThan(H / 2);
  });

  it('端の印は曲線の接線を向く（矢尻だけ線から浮かない）', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved', { end: 'arrow' }))!;
    const [first, second] = controls(geometry.path);
    expect(geometry.start.angle).toBeCloseTo(Math.atan2(first.y - H, first.x - W / 2));
    expect(geometry.end.angle).toBeCloseTo(Math.atan2(second.y - 600, second.x - W / 2));
    // 真下（π/2）のままではない＝軸で決めた向きを使い回していない。
    expect(geometry.start.angle).not.toBeCloseTo(Math.PI / 2);
  });

  it('矢印の無い線は曲げない（向きの無い線では右回りが読めない）', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved'))!;
    for (const control of controls(geometry.path)) expect(control.x).toBe(W / 2);
  });

  it('斜めに離れていれば張り出さない（これまでの形のまま）', () => {
    const geometry = connectorGeometry(above, at('斜', 400, 600), SPACING, look('curved', { end: 'arrow' }))!;
    // 縦へ離れているので、制御点は軸（x）の上に載ったまま縦だけ動く。
    const [first, second] = controls(geometry.path);
    expect(first.x).toBe(geometry.start.x);
    expect(second.x).toBe(geometry.end.x);
  });

  it('両端が矢印なら書いてある順（始点 → 終点）を進む向きとする', () => {
    const both = connectorGeometry(above, below, SPACING, look('curved', { start: 'arrow', end: 'arrow' }))!;
    const forward = connectorGeometry(above, below, SPACING, look('curved', { end: 'arrow' }))!;
    expect(both.path).toBe(forward.path);
  });

  it('丸印は矢印ではないので曲げない', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved', { end: 'circle' }))!;
    for (const control of controls(geometry.path)) expect(control.x).toBe(W / 2);
  });

  it('下から上へ引けば張り出す側も逆になる', () => {
    const upward = connectorGeometry(below, above, SPACING, look('curved', { end: 'arrow' }))!;
    for (const control of controls(upward.path)) expect(control.x).toBeLessThan(W / 2);
  });

  it('遠く離れても札の半分より深くは張り出さない（図の縁で切られない）', () => {
    // 描画面は札の占める升目からしか決まらないので、制御点が札の縁より外へ出ると切れる。
    const far = at('遠', 0, 4000);
    const geometry = connectorGeometry(above, far, SPACING, look('curved', { end: 'arrow' }))!;
    for (const control of controls(geometry.path)) expect(control.x).toBeLessThanOrEqual(W);
  });

  it('張り出した線でも中点は線の上にある（取っ手と添え字が浮かない）', () => {
    const geometry = connectorGeometry(above, below, SPACING, look('curved', { end: 'arrow' }))!;
    const [first, second] = controls(geometry.path);
    // 3 次ベジェの t=0.5。両端と 2 つの制御点から出す。
    const half = (
      p0: number, p1: number, p2: number, p3: number,
    ) => (p0 + 3 * p1 + 3 * p2 + p3) / 8;
    const middle = midpointOf(geometry);
    expect(middle.x).toBeCloseTo(half(geometry.start.x, first.x, second.x, geometry.end.x), 1);
    expect(middle.y).toBeCloseTo(half(geometry.start.y, first.y, second.y, geometry.end.y), 1);
  });

  it('隣り合っていても札の大きさぶんは張り出す（ほぼ直線に潰れない）', () => {
    const near = at('直下', 0, H + 8);
    const geometry = connectorGeometry(above, near, SPACING, look('curved', { end: 'arrow' }))!;
    const [first] = controls(geometry.path);
    expect(first.x - W / 2).toBeGreaterThan(W / 8);
  });
});

describe('中点', () => {
  it('直線の中点は両端の真ん中', () => {
    const geometry = connectorGeometry(at('左', 0, 0), at('右', 400, 0), SPACING, look('straight'))!;
    expect(midpointOf(geometry)).toEqual({
      x: (geometry.start.x + geometry.end.x) / 2,
      y: (geometry.start.y + geometry.end.y) / 2,
    });
  });

  it('折れ線の中点も自分の両端の真ん中（引き回しの折れ方で取っ手が動かない）', () => {
    const bent = connectorGeometry(at('左', 0, 0), at('右', 400, 200), SPACING, look('orthogonal'))!;
    expect(midpointOf(bent)).toEqual({
      x: (bent.start.x + bent.end.x) / 2,
      y: (bent.start.y + bent.end.y) / 2,
    });
  });
});

describe('端の同一性', () => {
  it('種別が違えば別の端（同じ名前の要素と線を混同しない）', () => {
    expect(sameAnchor(elementAnchor('c1'), lineAnchor('c1'))).toBe(false);
    expect(anchorKey(elementAnchor('c1'))).not.toBe(anchorKey(lineAnchor('c1')));
  });

  it('同じ種別・同じ名前なら同じ端', () => {
    expect(sameAnchor(elementAnchor('甲'), elementAnchor('甲'))).toBe(true);
  });
});
