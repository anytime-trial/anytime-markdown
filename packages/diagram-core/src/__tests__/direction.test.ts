import { directedConnectorRoute, directedFamilyRoute } from '../direction';
import { cellPosition, DEFAULT_DIAGRAM_SPACING } from '../spacing';
import type { ChartNode } from '../layout';

const SPACING = DEFAULT_DIAGRAM_SPACING;

/**
 * 升目に載った箱。座標は刻みから引く（既定の刻みでは列の間隔 380・行の間隔 180・余白 30）。
 *
 * 箱の大きさは幅 194・高さ 112。列 1 の手前のすき間の中央は x = 410 − 186 / 2 = 317、
 * 行 1 の手前のすき間の中央は y = 210 − 68 / 2 = 176。
 */
const box = (name: string, column: number, row: number): ChartNode =>
  ({ name, column, row, ...cellPosition(SPACING, { column, row }) });

const subpaths = (path: string): readonly string[] =>
  path.split(/(?=M )/).map((part) => part.trim()).filter((part) => part !== '');

describe('手で引いた折れ線（左→右）', () => {
  it('上位の右面の中央から出て、下位の左面の中央へ入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR', [])!;
    expect(route.start).toMatchObject({ x: 224, y: 86 });
    expect(route.end).toMatchObject({ x: 410, y: 266 });
  });

  it('下位の直前のすき間の中央で折れる', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 224 86 H 317 V 266 H 410');
  });

  it('同じ行なら折れずに 1 本で入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 0), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 224 86 H 410');
  });

  it('列を 1 つ飛ばした下位でも、折れるのは下位の直前のすき間', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 2, 1), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 224 86 H 697 V 266 H 790');
  });

  it('端の印は先頭へ向かって出て、末尾から入る向きを持つ', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR', [])!;
    expect(route.start.angle).toBe(0);
    expect(route.end.angle).toBe(Math.PI);
  });

  it('同じ列なら、上側の下面の中央と下側の上面の中央を結ぶ', () => {
    const route = directedConnectorRoute(box('上', 0, 0), box('下', 0, 1), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 127 142 V 210');
    expect(route.start).toEqual({ x: 127, y: 142, angle: Math.PI / 2 });
    expect(route.end).toEqual({ x: 127, y: 210, angle: -Math.PI / 2 });
  });

  it('同じ列でも間に別の箱が居れば真っ直ぐ結ばず、先頭の面から出て回り込む', () => {
    const [upper, middle, lower] = [box('上', 0, 0), box('間', 0, 1), box('下', 0, 2)];
    const route = directedConnectorRoute(upper, lower, SPACING, 'LR', [upper, middle, lower])!;
    expect(route.path).toBe('M 224 86 H 317 V 176 H 15 V 446 H 30');
    // 別の列の箱は間を塞がない。
    expect(directedConnectorRoute(upper, lower, SPACING, 'LR', [upper, box('隣', 1, 1), lower])!.path)
      .toBe('M 127 142 V 390');
  });

  it('同じ列で下から上へ引いた線は、下側の上面から出て上側の下面へ入る', () => {
    const route = directedConnectorRoute(box('下', 0, 1), box('上', 0, 0), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 127 210 V 142');
    expect(route.start).toEqual({ x: 127, y: 210, angle: -Math.PI / 2 });
    expect(route.end).toEqual({ x: 127, y: 142, angle: Math.PI / 2 });
  });

  it('重なった 2 つは向きが決まらないので描かない', () => {
    expect(directedConnectorRoute(box('a', 1, 1), box('b', 1, 1), SPACING, 'LR', [])).toBeNull();
  });
});

describe('手で引いた折れ線（上→下）', () => {
  it('上位の下面の中央から出て、下位の上面の中央へ入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'TB', [])!;
    expect(route.start).toMatchObject({ x: 127, y: 142, angle: Math.PI / 2 });
    expect(route.end).toMatchObject({ x: 507, y: 210, angle: -Math.PI / 2 });
    expect(route.path).toBe('M 127 142 V 176 H 507 V 210');
  });

  it('真下なら折れずに 1 本で入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 0, 1), SPACING, 'TB', [])!;
    expect(route.path).toBe('M 127 142 V 210');
  });

  it('同じ行なら、左側の右面の中央と右側の左面の中央を結ぶ', () => {
    const route = directedConnectorRoute(box('左', 0, 0), box('右', 1, 0), SPACING, 'TB', [])!;
    expect(route.path).toBe('M 224 86 H 410');
    expect(route.start).toEqual({ x: 224, y: 86, angle: 0 });
    expect(route.end).toEqual({ x: 410, y: 86, angle: Math.PI });
  });
});

describe('線の中点に取り付いた端', () => {
  it('下位が点なら、その点で終わり、両端の中ほどで折れる', () => {
    const route = directedConnectorRoute(box('親', 0, 0), { x: 424, y: 300 }, SPACING, 'LR', [])!;
    expect(route.path).toBe('M 224 86 H 324 V 300 H 424');
  });

  it('上位が点なら、その点から出る', () => {
    const route = directedConnectorRoute({ x: 100, y: 300 }, box('子', 1, 0), SPACING, 'LR', [])!;
    expect(route.path).toBe('M 100 300 H 317 V 86 H 410');
  });
});

describe('家族の折れ線', () => {
  it('同じ列の両親は上側の下面と下側の上面を結び、その中点から子へ降ろす', () => {
    const route = directedFamilyRoute(
      [box('父', 0, 0), box('母', 0, 2)],
      [box('子1', 1, 0), box('子2', 1, 1)],
      SPACING,
      'LR',
      [],
    );
    // 同じ列の両親は、上側の下面の中央から下側の上面の中央へ結ぶ。
    expect(route.marriage).toBe('M 127 142 V 390');
    expect(subpaths(route.path)).toEqual([
      'M 127 266 H 317',
      'M 317 86 V 266',
      'M 317 86 H 410',
      'M 317 266 H 410',
    ]);
    expect(route.junction).toEqual({ x: 127, y: 266 });
    expect(route.starts).toEqual([{ x: 127, y: 142 }, { x: 127, y: 390 }]);
    expect(route.ends).toEqual([
      { x: 410, y: 86, angle: Math.PI },
      { x: 410, y: 266, angle: Math.PI },
    ]);
  });

  it('同じ列の両親の間に別の箱が居れば、先頭の面から出てすき間の手前半分で結ぶ', () => {
    const [father, other, mother] = [box('父', 0, 0), box('他', 0, 1), box('母', 0, 2)];
    const route = directedFamilyRoute([father, mother], [box('子', 1, 1)], SPACING, 'LR', [father, other, mother]);
    expect(route.marriage).toBe('M 224 86 H 270.5 V 446 H 224');
    expect(route.junction).toEqual({ x: 270.5, y: 266 });
    expect(route.starts).toEqual([{ x: 224, y: 86 }, { x: 224, y: 446 }]);
  });

  it('上→下で同じ行の両親は、左側の右面と右側の左面を結ぶ', () => {
    const route = directedFamilyRoute([box('父', 0, 0), box('母', 2, 0)], [box('子', 1, 1)], SPACING, 'TB', []);
    // 同じ行の両親は、左側の右面の中央から右側の左面の中央へ結ぶ。
    expect(route.marriage).toBe('M 224 86 H 790');
    expect(route.junction).toEqual({ x: 507, y: 86 });
    expect(subpaths(route.path)).toEqual(['M 507 86 V 176', 'M 507 176 V 210']);
  });

  it('3 人目以降の親は、婚姻の線に入らず自分の面から子への幹へ合流する', () => {
    const route = directedFamilyRoute(
      [box('父', 0, 0), box('母', 0, 2), box('三', 0, 4)],
      [box('子', 1, 1)],
      SPACING,
      'LR',
      [],
    );
    expect(route.marriage).toBe('M 127 142 V 390');
    expect(subpaths(route.path)).toEqual([
      'M 127 266 H 317',
      'M 224 806 H 317',
      'M 317 266 V 806',
      'M 317 266 H 410',
    ]);
  });

  it('片親の家族には婚姻の線が無い', () => {
    const route = directedFamilyRoute([box('親', 0, 0)], [box('子', 1, 0)], SPACING, 'LR', []);
    expect(route.marriage).toBeNull();
  });

  it('別の列の両親は先頭の面から出て、先の親のすき間の手前半分で結ぶ', () => {
    const route = directedFamilyRoute([box('父', 0, 0), box('母', 1, 2)], [box('子', 2, 1)], SPACING, 'LR', []);
    expect(route.marriage).toBe('M 224 86 H 650.5 V 446 H 604');
    expect(route.junction).toEqual({ x: 650.5, y: 266 });
  });

  it('子より先の列に居る両親は、結び目から箱を貫かずに回り込んで降ろす', () => {
    const route = directedFamilyRoute([box('父', 1, 0), box('母', 1, 2)], [box('子', 0, 1)], SPACING, 'LR', []);
    expect(route.marriage).toBe('M 507 142 V 390');
    expect(subpaths(route.path)).toEqual([
      'M 507 266 H 697 V 176 H 15',
      'M 15 176 V 266',
      'M 15 266 H 30',
    ]);
  });

  it('上→下では下面から出て、子の直前の行のすき間で横へ渡る', () => {
    const route = directedFamilyRoute(
      [box('親', 0, 0)],
      [box('子1', 0, 1), box('子2', 1, 1)],
      SPACING,
      'TB',
      [],
    );
    expect(subpaths(route.path)).toEqual([
      'M 127 142 V 176',
      'M 127 176 H 507',
      'M 127 176 V 210',
      'M 507 176 V 210',
    ]);
    expect(route.junction).toEqual({ x: 127, y: 176 });
    expect(route.startAngle).toBe(Math.PI / 2);
  });

  it('子が別々の列に居れば、それぞれの子の直前で折れる', () => {
    const route = directedFamilyRoute([box('親', 0, 0)], [box('近', 1, 0), box('遠', 2, 1)], SPACING, 'LR', []);
    expect(subpaths(route.path)).toEqual([
      'M 224 86 H 317',
      'M 317 86 H 410',
      'M 317 86 H 697',
      'M 697 86 V 266',
      'M 697 266 H 790',
    ]);
  });

  it('子より先の列に居る親は、箱を貫かずに回り込んで合流する', () => {
    const route = directedFamilyRoute([box('親', 1, 0)], [box('子', 1, 1)], SPACING, 'LR', []);
    expect(subpaths(route.path)).toEqual([
      'M 604 86 H 697 V 176 H 317',
      'M 317 176 V 266',
      'M 317 266 H 410',
    ]);
  });
});
