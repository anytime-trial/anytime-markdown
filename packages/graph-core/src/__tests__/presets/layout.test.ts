import {
  pyramidTiers,
  gridCells,
  ringPoints,
  chainPositions,
  fishboneGeometry,
  tidyTreeLayout,
  radialBranches,
  partitionBalanced,
  type TreeInput,
} from '../../presets/layout';

describe('pyramidTiers', () => {
  it('上段ほど幅が狭く下段ほど広い', () => {
    const tiers = pyramidTiers(3, { topWidth: 100, bottomWidth: 400, tierHeight: 50, gap: 10 });
    expect(tiers).toHaveLength(3);
    expect(tiers[0].width).toBeLessThan(tiers[1].width);
    expect(tiers[1].width).toBeLessThan(tiers[2].width);
    expect(tiers[0].width).toBe(100);
    expect(tiers[2].width).toBe(400);
  });

  it('各段は y が単調増加し中央揃え', () => {
    const tiers = pyramidTiers(3, { centerX: 0, tierHeight: 50, gap: 10 });
    expect(tiers[1].y).toBeGreaterThan(tiers[0].y);
    for (const t of tiers) expect(t.x).toBeCloseTo(-t.width / 2);
  });

  it('count<=0 は空配列', () => {
    expect(pyramidTiers(0)).toEqual([]);
  });
});

describe('gridCells', () => {
  it('row 優先で rows*cols セルを返す', () => {
    const cells = gridCells(2, 2, { cellWidth: 100, cellHeight: 80, gap: 10, originX: 0, originY: 0 });
    expect(cells).toHaveLength(4);
    // index 0=左上, 1=右上, 2=左下, 3=右下
    expect(cells[0]).toMatchObject({ x: 0, y: 0 });
    expect(cells[1].x).toBe(110);
    expect(cells[2].y).toBe(90);
    expect(cells[3]).toMatchObject({ x: 110, y: 90 });
  });
});

describe('ringPoints', () => {
  it('0番目は真上、点数だけ返す', () => {
    const pts = ringPoints(4, { radius: 100, centerX: 0, centerY: 0 });
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-100);
    // 時計回り: 1番目は右
    expect(pts[1].x).toBeCloseTo(100);
    expect(pts[1].y).toBeCloseTo(0);
  });

  it('n<=0 は空配列', () => {
    expect(ringPoints(0)).toEqual([]);
  });
});

describe('chainPositions', () => {
  it('vertical は y 単調増加', () => {
    const rects = chainPositions(3, { nodeHeight: 50, gap: 20, direction: 'vertical' });
    expect(rects[1].y).toBe(70);
    expect(rects[2].y).toBe(140);
    expect(rects.every((r) => r.x === rects[0].x)).toBe(true);
  });

  it('horizontal は x 単調増加', () => {
    const rects = chainPositions(2, { nodeWidth: 100, gap: 30, direction: 'horizontal' });
    expect(rects[1].x).toBe(130);
  });
});

describe('fishboneGeometry', () => {
  it('背骨は水平・頭は右端', () => {
    const geo = fishboneGeometry(4, { spineLength: 600, centerY: 0, originX: 0 });
    expect(geo.spine.from.y).toBe(geo.spine.to.y);
    expect(geo.head.x).toBe(600);
    expect(geo.bones).toHaveLength(4);
  });

  it('カテゴリは上下交互で接続点 x は単調増加', () => {
    const geo = fishboneGeometry(4);
    expect(geo.bones[0].above).toBe(true);
    expect(geo.bones[1].above).toBe(false);
    expect(geo.bones[2].above).toBe(true);
    for (let i = 1; i < geo.bones.length; i++) {
      expect(geo.bones[i].attach.x).toBeGreaterThan(geo.bones[i - 1].attach.x);
    }
    // above の label は背骨より上（y が小さい）
    expect(geo.bones[0].label.y).toBeLessThan(geo.spine.from.y);
    expect(geo.bones[1].label.y).toBeGreaterThan(geo.spine.from.y);
  });
});

describe('tidyTreeLayout', () => {
  const tree: TreeInput = {
    id: 'root',
    children: [
      { id: 'a', children: [{ id: 'a1' }, { id: 'a2' }] },
      { id: 'b' },
    ],
  };

  it('LR: 深さで x が進む', () => {
    const map = tidyTreeLayout(tree, { nodeWidth: 100, levelGap: 50, direction: 'LR' });
    expect(map.get('root')!.x).toBe(0);
    expect(map.get('a')!.x).toBe(150);
    expect(map.get('a1')!.x).toBe(300);
  });

  it('親は子の中央に配置される', () => {
    const map = tidyTreeLayout(tree, { direction: 'LR' });
    const a = map.get('a')!;
    const a1 = map.get('a1')!;
    const a2 = map.get('a2')!;
    const aCenter = a.y + a.height / 2;
    const childMid = (a1.y + a1.height / 2 + a2.y + a2.height / 2) / 2;
    expect(aCenter).toBeCloseTo(childMid);
  });

  it('全ノードに座標が割り当てられる', () => {
    const map = tidyTreeLayout(tree);
    expect(new Set(map.keys())).toEqual(new Set(['root', 'a', 'a1', 'a2', 'b']));
  });
});

describe('partitionBalanced', () => {
  it('空配列は空を返す', () => {
    expect(partitionBalanced([])).toEqual([]);
  });

  it('重み降順に貪欲割当して左右の累計を均等化する', () => {
    // [5,4,3,2] → 5=右, 4=左, 3=左(累計4<5), 2=右? いや 右5 左7 → 2は右(5)へ
    const sides = partitionBalanced([5, 4, 3, 2]);
    const right = [5, 4, 3, 2].filter((_, i) => sides[i]).reduce((a, b) => a + b, 0);
    const left = [5, 4, 3, 2].filter((_, i) => !sides[i]).reduce((a, b) => a + b, 0);
    expect(Math.abs(right - left)).toBeLessThanOrEqual(2);
  });

  it('決定的（同入力は同出力）', () => {
    const a = partitionBalanced([1, 1, 1, 1, 1]);
    const b = partitionBalanced([1, 1, 1, 1, 1]);
    expect(a).toEqual(b);
  });

  it('各サイドに少なくとも要素が1つは入る（2要素以上）', () => {
    const sides = partitionBalanced([3, 1]);
    expect(sides.some((s) => s)).toBe(true);
    expect(sides.some((s) => !s)).toBe(true);
  });
});

describe('radialBranches', () => {
  it('ブランチ数ぶん返り、単位ベクトルの大きさは1', () => {
    const br = radialBranches(3, { radius: 200 });
    expect(br).toHaveLength(3);
    for (const b of br) {
      const mag = Math.hypot(b.outward.x, b.outward.y);
      expect(mag).toBeCloseTo(1);
    }
  });
});
