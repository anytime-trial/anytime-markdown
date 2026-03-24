import { alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV, distributeH, distributeV } from '../../engine/alignment';

const nodes = [
  { id: '1', x: 10, y: 10, width: 100, height: 50 },
  { id: '2', x: 200, y: 80, width: 100, height: 50 },
  { id: '3', x: 120, y: 40, width: 100, height: 50 },
];

describe('alignLeft', () => {
  it('should align all nodes to the leftmost x', () => {
    const result = alignLeft(nodes);
    expect(result.every(n => n.x === 10)).toBe(true);
  });
});

describe('alignRight', () => {
  it('should align all nodes to the rightmost right edge', () => {
    const result = alignRight(nodes);
    expect(result.every(n => n.x + n.width === 300)).toBe(true);
  });
});

describe('alignTop', () => {
  it('should align all nodes to the topmost y', () => {
    const result = alignTop(nodes);
    expect(result.every(n => n.y === 10)).toBe(true);
  });
});

describe('alignBottom', () => {
  it('should align all nodes to the bottommost bottom edge', () => {
    const result = alignBottom(nodes);
    expect(result.every(n => n.y + n.height === 130)).toBe(true);
  });
});

describe('alignCenterH', () => {
  it('should align centers horizontally', () => {
    const result = alignCenterH(nodes);
    const centers = result.map(n => n.x + n.width / 2);
    expect(new Set(centers).size).toBe(1);
  });
});

describe('alignCenterV', () => {
  it('should align centers vertically', () => {
    const result = alignCenterV(nodes);
    const centers = result.map(n => n.y + n.height / 2);
    expect(new Set(centers).size).toBe(1);
  });
});

describe('distributeH', () => {
  it('should distribute nodes with equal horizontal spacing', () => {
    const result = distributeH(nodes);
    const sorted = [...result].sort((a, b) => a.x - b.x);
    const gap1 = sorted[1].x - (sorted[0].x + sorted[0].width);
    const gap2 = sorted[2].x - (sorted[1].x + sorted[1].width);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1);
  });

  it('should return unchanged if less than 3 nodes', () => {
    const two = nodes.slice(0, 2);
    expect(distributeH(two)).toEqual(two);
  });
});

describe('distributeV', () => {
  it('should distribute nodes with equal vertical spacing', () => {
    const result = distributeV(nodes);
    const sorted = [...result].sort((a, b) => a.y - b.y);
    const gap1 = sorted[1].y - (sorted[0].y + sorted[0].height);
    const gap2 = sorted[2].y - (sorted[1].y + sorted[1].height);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1);
  });
});
