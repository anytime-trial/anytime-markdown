import { forceDirectedLayout, type ForceLink } from '../../presets/layout';

/** 2 点間のユークリッド距離。 */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('forceDirectedLayout', () => {
  it('ノード数だけ座標を返す', () => {
    const pts = forceDirectedLayout(4, []);
    expect(pts).toHaveLength(4);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('ノード 0 件では空配列を返す', () => {
    expect(forceDirectedLayout(0, [])).toEqual([]);
  });

  it('同一入力に対して同一座標を返す（乱数を使わない）', () => {
    const links: ForceLink[] = [
      { source: 0, target: 1, weight: 0.9 },
      { source: 1, target: 2, weight: 0.2 },
    ];
    const a = forceDirectedLayout(5, links);
    const b = forceDirectedLayout(5, links);
    expect(a).toEqual(b);
  });

  it('共起が強いペアは、弱いペアより近くに配置される', () => {
    // 0-1 は強く結合、2-3 は弱く結合。両ペアは互いに無関係。
    const links: ForceLink[] = [
      { source: 0, target: 1, weight: 1 },
      { source: 2, target: 3, weight: 0.05 },
    ];
    const pts = forceDirectedLayout(4, links);
    expect(dist(pts[0], pts[1])).toBeLessThan(dist(pts[2], pts[3]));
  });

  it('連結されていないノード同士は斥力で重ならない', () => {
    const pts = forceDirectedLayout(6, []);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(dist(pts[i], pts[j])).toBeGreaterThan(1);
      }
    }
  });

  it('リンクを持たない孤立ノードが発散せず、原点周辺に収まる', () => {
    // 斥力は全ペアに働くのに引力は結合ペアにしか働かないため、求心力が無いと
    // 孤立ノードは反復のあいだ一方的に飛び続け、図全体のスケールが破綻する。
    const spacing = 100;
    for (const n of [2, 3, 5, 8, 12]) {
      const pts = forceDirectedLayout(n, [], { spacing });
      const farthest = Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
      expect(farthest).toBeLessThan(spacing * (1 + Math.sqrt(n)));
    }
  });

  it('一部だけが結合したグラフでも、孤立ノードが結合成分から極端に離れない', () => {
    const spacing = 100;
    // 0-1 は結合、2 は孤立
    const pts = forceDirectedLayout(3, [{ source: 0, target: 1, weight: 1 }], { spacing });
    const farthest = Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
    expect(farthest).toBeLessThan(spacing * 3);
  });

  it('初期配置のグループ指定が異なれば結果も異なる（クラスタが初期区画に反映される）', () => {
    const links: ForceLink[] = [{ source: 0, target: 1, weight: 0.5 }];
    const grouped = forceDirectedLayout(4, links, { groups: [0, 0, 1, 1] });
    const flat = forceDirectedLayout(4, links, { groups: [0, 0, 0, 0] });
    expect(grouped).not.toEqual(flat);
  });

  it('座標は原点中心に正規化される', () => {
    const pts = forceDirectedLayout(5, [{ source: 0, target: 1, weight: 0.5 }]);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    expect(Math.abs(cx)).toBeLessThan(1e-6);
    expect(Math.abs(cy)).toBeLessThan(1e-6);
  });
});
