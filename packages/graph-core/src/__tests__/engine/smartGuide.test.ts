import { computeSmartGuides } from '../../engine/smartGuide';

describe('computeSmartGuides', () => {
  const otherNodes = [
    { id: '1', x: 100, y: 100, width: 100, height: 50 },
    { id: '2', x: 300, y: 200, width: 100, height: 50 },
  ];

  it('should snap to left edge of other node', () => {
    // Moving node at x=98, other node at x=100, within threshold
    const result = computeSmartGuides(98, 50, 80, 40, otherNodes, 5);
    expect(result.snappedX).toBe(100);
    expect(result.guides.some(g => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('should snap to center of other node horizontally', () => {
    // Moving node center = 110 + 40 = 150, other node center = 100 + 50 = 150
    const result = computeSmartGuides(110, 50, 80, 40, otherNodes, 5);
    expect(result.snappedX).toBe(110);
    expect(result.guides.some(g => g.axis === 'x' && g.position === 150)).toBe(true);
  });

  it('should snap to top edge of other node', () => {
    const result = computeSmartGuides(50, 97, 80, 40, otherNodes, 5);
    expect(result.snappedY).toBe(100);
    expect(result.guides.some(g => g.axis === 'y' && g.position === 100)).toBe(true);
  });

  it('should return no guides when no snap within threshold', () => {
    const result = computeSmartGuides(50, 50, 80, 40, otherNodes, 5);
    expect(result.guides.length).toBe(0);
    expect(result.snappedX).toBe(50);
    expect(result.snappedY).toBe(50);
  });

  it('should use default threshold when not specified', () => {
    const result = computeSmartGuides(98, 50, 80, 40, otherNodes);
    expect(result.snappedX).toBe(100);
  });

  it('should snap to right edge of other node', () => {
    // Moving node right edge = 118 + 80 = 198, other node right edge = 200
    const result = computeSmartGuides(118, 50, 80, 40, otherNodes, 5);
    expect(result.snappedX).toBe(120);
    expect(result.guides.some(g => g.axis === 'x' && g.position === 200)).toBe(true);
  });
});
