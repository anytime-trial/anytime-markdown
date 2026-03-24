import { screenToWorld, worldToScreen, pan, zoom, fitToContent } from '../../../app/graph/engine/viewport';
import { Viewport } from '../../../app/graph/types';

describe('screenToWorld', () => {
  it('should convert with no offset/scale', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
    expect(screenToWorld(vp, 100, 200)).toEqual({ x: 100, y: 200 });
  });
  it('should apply offset and scale', () => {
    const vp: Viewport = { offsetX: 50, offsetY: 100, scale: 2 };
    expect(screenToWorld(vp, 150, 300)).toEqual({ x: 50, y: 100 });
  });
});

describe('worldToScreen', () => {
  it('should be inverse of screenToWorld', () => {
    const vp: Viewport = { offsetX: 30, offsetY: 60, scale: 1.5 };
    const world = screenToWorld(vp, 200, 300);
    const screen = worldToScreen(vp, world.x, world.y);
    expect(screen.x).toBeCloseTo(200);
    expect(screen.y).toBeCloseTo(300);
  });
});

describe('pan', () => {
  it('should add delta to offset', () => {
    const vp: Viewport = { offsetX: 10, offsetY: 20, scale: 1 };
    const result = pan(vp, 5, -3);
    expect(result.offsetX).toBe(15);
    expect(result.offsetY).toBe(17);
    expect(result.scale).toBe(1);
  });
});

describe('zoom', () => {
  it('should clamp scale between 0.1 and 10', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, scale: 0.11 };
    const zoomed = zoom(vp, 0, 0, 1);
    expect(zoomed.scale).toBeGreaterThanOrEqual(0.1);
  });
  it('should preserve the point under cursor', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
    const worldBefore = screenToWorld(vp, 400, 300);
    const zoomed = zoom(vp, 400, 300, -1);
    const worldAfter = screenToWorld(zoomed, 400, 300);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });
});

describe('fitToContent', () => {
  it('should return default for empty bounds', () => {
    const result = fitToContent(800, 600, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(result.scale).toBe(1);
  });
  it('should fit content within canvas', () => {
    const result = fitToContent(800, 600, { minX: 0, minY: 0, maxX: 400, maxY: 300 });
    expect(result.scale).toBeGreaterThan(0);
    expect(result.scale).toBeLessThanOrEqual(2);
  });
});
