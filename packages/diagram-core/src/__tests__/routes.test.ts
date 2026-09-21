import { anchorKey, connectorGeometry, midpointOf, sameAnchor } from '../connectors';
import { DEFAULT_DIAGRAM_SPACING } from '../spacing';
import { elementAnchor, lineAnchor } from '../types';
import { node } from './fixture';

const SPACING = DEFAULT_DIAGRAM_SPACING;
const { nodeWidth: W, nodeHeight: H } = SPACING;
const at = (name: string, x: number, y: number) => ({ ...node(name, 0, 0), x, y });

/** 箱でなく点で端を渡すとき（別の線の中点に取り付いた端）。 */
const point = (x: number, y: number) => ({ x, y });

describe('経路', () => {
  const left = at('左', 0, 0);
  const right = at('右', 400, 200);

  it('直線は縁どうしを 1 本で結ぶ', () => {
    const path = connectorGeometry(left, right, SPACING, 'straight')!.path;
    expect(path.split('L')).toHaveLength(2);
    expect(path).toMatch(/^M /);
  });

  it('折れ線は縦横だけで曲がる（斜めの区間が無い）', () => {
    const path = connectorGeometry(left, right, SPACING, 'orthogonal')!.path;
    const commands = path.match(/[MLHV]/g) ?? [];
    expect(commands.filter((c) => c === 'L')).toHaveLength(0);
    expect(commands).toContain('H');
    expect(commands).toContain('V');
  });

  it('カーブは 3 次ベジェで描く', () => {
    expect(connectorGeometry(left, right, SPACING, 'curved')!.path).toContain('C ');
  });

  it('経路を変えても端の点は変わらない（印の位置が経路で跳ばない）', () => {
    const straight = connectorGeometry(left, right, SPACING, 'straight')!;
    for (const route of ['orthogonal', 'curved'] as const) {
      const other = connectorGeometry(left, right, SPACING, route)!;
      expect([other.start.x, other.start.y]).toEqual([straight.start.x, straight.start.y]);
      expect([other.end.x, other.end.y]).toEqual([straight.end.x, straight.end.y]);
    }
  });

  it('箱の代わりに点を渡すと、その点が端になる（線の中点に取り付いた端）', () => {
    const geometry = connectorGeometry(point(50, 50), right, SPACING, 'straight')!;
    expect([geometry.start.x, geometry.start.y]).toEqual([50, 50]);
  });

  it('中心が同じなら向きが決まらないので描かない', () => {
    expect(connectorGeometry(at('重', 0, 0), at('なり', 0, 0), SPACING, 'straight')).toBeNull();
  });
});

describe('中点', () => {
  it('直線の中点は両端の真ん中', () => {
    const geometry = connectorGeometry(at('左', 0, 0), at('右', 400, 0), SPACING, 'straight')!;
    expect(midpointOf(geometry)).toEqual({
      x: (geometry.start.x + geometry.end.x) / 2,
      y: (geometry.start.y + geometry.end.y) / 2,
    });
  });

  it('折れ線の中点も両端の真ん中に置く（経路で取っ手が跳ばない）', () => {
    const straight = connectorGeometry(at('左', 0, 0), at('右', 400, 200), SPACING, 'straight')!;
    const bent = connectorGeometry(at('左', 0, 0), at('右', 400, 200), SPACING, 'orthogonal')!;
    expect(midpointOf(bent)).toEqual(midpointOf(straight));
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
