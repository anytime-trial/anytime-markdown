import { fitBounds, screenToWorld, worldToScreen, zoomAt } from '../viewport/viewport';

describe('viewport transforms', () => {
  it('round-trips world and screen coordinates', () => {
    const viewport = { scale: 2, offsetX: 10, offsetY: -6 };
    const world = { x: 12, y: 9 };
    expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
  });

  it('keeps the zoom anchor stable', () => {
    const viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const anchor = { x: 50, y: 50 };
    const before = screenToWorld(anchor, viewport);
    const after = zoomAt(viewport, anchor, 2);
    expect(screenToWorld(anchor, after)).toEqual(before);
  });

  it('fits bounds inside the target canvas with padding', () => {
    const viewport = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 300, height: 200 }, 50);
    expect(viewport.scale).toBe(2);
    expect(worldToScreen({ x: 50, y: 25 }, viewport)).toEqual({ x: 150, y: 100 });
  });
});
