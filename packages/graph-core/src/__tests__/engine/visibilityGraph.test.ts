import {
  buildMarginRects,
  buildVisibilityGraph,
  isVisible,
} from '../../engine/visibilityGraph';

describe('buildMarginRects', () => {
  it('should expand rects by margin', () => {
    const rects = buildMarginRects(
      [{ x: 100, y: 100, width: 50, height: 50 }],
      20,
    );
    expect(rects).toEqual([{ x: 80, y: 80, width: 90, height: 90 }]);
  });
});

describe('isVisible', () => {
  it('should return true for horizontally aligned visible pair', () => {
    const a = { x: 0, y: 50, id: 0 };
    const b = { x: 200, y: 50, id: 1 };
    expect(isVisible(a, b, [])).toBe(true);
  });

  it('should return true for vertically aligned visible pair', () => {
    const a = { x: 50, y: 0, id: 0 };
    const b = { x: 50, y: 200, id: 1 };
    expect(isVisible(a, b, [])).toBe(true);
  });

  it('should return false for non-aligned pair', () => {
    const a = { x: 0, y: 0, id: 0 };
    const b = { x: 100, y: 50, id: 1 };
    expect(isVisible(a, b, [])).toBe(false);
  });

  it('should return false when obstacle blocks line of sight', () => {
    const a = { x: 0, y: 50, id: 0 };
    const b = { x: 200, y: 50, id: 1 };
    const obstacles = [{ x: 80, y: 30, width: 40, height: 40 }];
    expect(isVisible(a, b, obstacles)).toBe(false);
  });
});

describe('buildVisibilityGraph', () => {
  it('should create edges between visible vertex pairs with no obstacles', () => {
    const nodes = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 0, id: 1 },
    ];
    const graph = buildVisibilityGraph(nodes, []);
    const edge = graph.find(
      (e) =>
        (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0),
    );
    expect(edge).toBeDefined();
    expect(edge!.horizontal).toBe(true);
    expect(edge!.distance).toBe(100);
  });

  it('should not create edges for non-aligned pairs', () => {
    const nodes = [
      { x: 0, y: 0, id: 0 },
      { x: 100, y: 50, id: 1 },
    ];
    const graph = buildVisibilityGraph(nodes, []);
    expect(graph.length).toBe(0);
  });

  it('should not create edges blocked by obstacle', () => {
    const nodes = [
      { x: 0, y: 50, id: 0 },
      { x: 200, y: 50, id: 1 },
    ];
    const obstacles = [{ x: 80, y: 30, width: 40, height: 40 }];
    const graph = buildVisibilityGraph(nodes, obstacles);
    const edge = graph.find(
      (e) =>
        (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0),
    );
    expect(edge).toBeUndefined();
  });
});
