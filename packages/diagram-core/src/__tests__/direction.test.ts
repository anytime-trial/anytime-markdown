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
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR')!;
    expect(route.start).toMatchObject({ x: 224, y: 86 });
    expect(route.end).toMatchObject({ x: 410, y: 266 });
  });

  it('下位の直前のすき間の中央で折れる', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR')!;
    expect(route.path).toBe('M 224 86 H 317 V 266 H 410');
  });

  it('同じ行なら折れずに 1 本で入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 0), SPACING, 'LR')!;
    expect(route.path).toBe('M 224 86 H 410');
  });

  it('列を 1 つ飛ばした下位でも、折れるのは下位の直前のすき間', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 2, 1), SPACING, 'LR')!;
    expect(route.path).toBe('M 224 86 H 697 V 266 H 790');
  });

  it('端の印は先頭へ向かって出て、末尾から入る向きを持つ', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'LR')!;
    expect(route.start.angle).toBe(0);
    expect(route.end.angle).toBe(Math.PI);
  });

  it('下位が同じ列に居るときは、箱を貫かずに回り込む', () => {
    // 右面から出てすき間を下り、行のすき間を左へ渡って、列 0 の手前（余白の中央）から入る。
    const route = directedConnectorRoute(box('上', 0, 0), box('下', 0, 1), SPACING, 'LR')!;
    expect(route.path).toBe('M 224 86 H 317 V 176 H 15 V 266 H 30');
    expect(route.start.angle).toBe(0);
    expect(route.end.angle).toBe(Math.PI);
  });

  it('重なった 2 つは向きが決まらないので描かない', () => {
    expect(directedConnectorRoute(box('a', 1, 1), box('b', 1, 1), SPACING, 'LR')).toBeNull();
  });
});

describe('手で引いた折れ線（上→下）', () => {
  it('上位の下面の中央から出て、下位の上面の中央へ入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 1, 1), SPACING, 'TB')!;
    expect(route.start).toMatchObject({ x: 127, y: 142, angle: Math.PI / 2 });
    expect(route.end).toMatchObject({ x: 507, y: 210, angle: -Math.PI / 2 });
    expect(route.path).toBe('M 127 142 V 176 H 507 V 210');
  });

  it('真下なら折れずに 1 本で入る', () => {
    const route = directedConnectorRoute(box('親', 0, 0), box('子', 0, 1), SPACING, 'TB')!;
    expect(route.path).toBe('M 127 142 V 210');
  });

  it('下位が同じ行に居るときは、箱を貫かずに回り込む', () => {
    const route = directedConnectorRoute(box('左', 0, 0), box('右', 1, 0), SPACING, 'TB')!;
    expect(route.path).toBe('M 127 142 V 176 H 317 V 15 H 507 V 30');
  });
});

describe('線の中点に取り付いた端', () => {
  it('下位が点なら、その点で終わり、両端の中ほどで折れる', () => {
    const route = directedConnectorRoute(box('親', 0, 0), { x: 424, y: 300 }, SPACING, 'LR')!;
    expect(route.path).toBe('M 224 86 H 324 V 300 H 424');
  });

  it('上位が点なら、その点から出る', () => {
    const route = directedConnectorRoute({ x: 100, y: 300 }, box('子', 1, 0), SPACING, 'LR')!;
    expect(route.path).toBe('M 100 300 H 317 V 86 H 410');
  });
});

describe('家族の折れ線', () => {
  it('両親は先頭のすき間の手前半分で婚姻の線に結ばれ、その中点から子へ降ろす', () => {
    const route = directedFamilyRoute(
      [box('父', 0, 0), box('母', 0, 2)],
      [box('子1', 1, 0), box('子2', 1, 1)],
      SPACING,
      'LR',
    );
    // 右面（224）とすき間の中央（317）の中ほど（270.5）で縦に結ぶ。子への幹（317）と重ねない。
    expect(route.marriage).toBe('M 224 86 H 270.5 V 446 H 224');
    expect(subpaths(route.path)).toEqual([
      'M 270.5 266 H 317',
      'M 317 86 V 266',
      'M 317 86 H 410',
      'M 317 266 H 410',
    ]);
    expect(route.junction).toEqual({ x: 270.5, y: 266 });
    expect(route.starts).toEqual([{ x: 224, y: 86 }, { x: 224, y: 446 }]);
    expect(route.ends).toEqual([
      { x: 410, y: 86, angle: Math.PI },
      { x: 410, y: 266, angle: Math.PI },
    ]);
  });

  it('上→下の両親は下面から出て、横に結ばれる', () => {
    const route = directedFamilyRoute([box('父', 0, 0), box('母', 2, 0)], [box('子', 1, 1)], SPACING, 'TB');
    expect(route.marriage).toBe('M 127 142 V 159 H 887 V 142');
    expect(route.junction).toEqual({ x: 507, y: 159 });
    expect(subpaths(route.path)).toEqual(['M 507 159 V 176', 'M 507 176 V 210']);
  });

  it('片親の家族には婚姻の線が無い', () => {
    const route = directedFamilyRoute([box('親', 0, 0)], [box('子', 1, 0)], SPACING, 'LR');
    expect(route.marriage).toBeNull();
  });

  it('子より先の列に居る両親は、結び目から箱を貫かずに回り込んで降ろす', () => {
    const route = directedFamilyRoute([box('父', 1, 0), box('母', 1, 2)], [box('子', 1, 1)], SPACING, 'LR');
    expect(route.marriage).toBe('M 604 86 H 650.5 V 446 H 604');
    expect(subpaths(route.path)).toEqual([
      'M 650.5 266 H 697 V 176 H 317',
      'M 317 176 V 266',
      'M 317 266 H 410',
    ]);
  });

  it('上→下では下面から出て、子の直前の行のすき間で横へ渡る', () => {
    const route = directedFamilyRoute(
      [box('親', 0, 0)],
      [box('子1', 0, 1), box('子2', 1, 1)],
      SPACING,
      'TB',
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
    const route = directedFamilyRoute([box('親', 0, 0)], [box('近', 1, 0), box('遠', 2, 1)], SPACING, 'LR');
    expect(subpaths(route.path)).toEqual([
      'M 224 86 H 317',
      'M 317 86 H 410',
      'M 317 86 H 697',
      'M 697 86 V 266',
      'M 697 266 H 790',
    ]);
  });

  it('子より先の列に居る親は、箱を貫かずに回り込んで合流する', () => {
    const route = directedFamilyRoute([box('親', 1, 0)], [box('子', 1, 1)], SPACING, 'LR');
    expect(subpaths(route.path)).toEqual([
      'M 604 86 H 697 V 176 H 317',
      'M 317 176 V 266',
      'M 317 266 H 410',
    ]);
  });
});
