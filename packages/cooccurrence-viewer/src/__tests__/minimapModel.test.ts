import { centerOnMinimapPoint, minimapViewport, visibleRect, zoomViewportCenter } from '../ui/minimapModel';
import { screenToWorld, worldToScreen } from '../viewport/viewport';
import type { ViewportState } from '../types';

const BOUNDS = { minX: -200, minY: -100, maxX: 200, maxY: 100 };
const MINI_SIZE = { width: 240, height: 120 };
const MAIN_SIZE = { width: 800, height: 600 };

describe('minimap model', () => {
  it('fits the whole graph into the minimap', () => {
    const mini = minimapViewport(BOUNDS, MINI_SIZE);

    // 全体の 4 隅がミニマップの内側に入る。
    for (const corner of [
      { x: BOUNDS.minX, y: BOUNDS.minY },
      { x: BOUNDS.maxX, y: BOUNDS.maxY },
    ]) {
      const screen = worldToScreen(corner, mini);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(MINI_SIZE.width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(MINI_SIZE.height);
    }
  });

  it('keeps working when there is nothing to draw', () => {
    // 語が 0 件のファイル、および描画前でサイズが 0 の canvas（隠れているタブ）。
    expect(() => minimapViewport(null, MINI_SIZE)).not.toThrow();
    expect(() => minimapViewport(BOUNDS, { width: 0, height: 0 })).not.toThrow();
    const rect = visibleRect({ scale: 1, offsetX: 0, offsetY: 0 }, { width: 0, height: 0 }, minimapViewport(null, MINI_SIZE));
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('maps the visible area of the graph onto the minimap', () => {
    const mini = minimapViewport(BOUNDS, MINI_SIZE);
    const main: ViewportState = { scale: 2, offsetX: 400, offsetY: 300 };

    const rect = visibleRect(main, MAIN_SIZE, mini);

    // 図で見えている world 範囲（左上・右下）と一致する。
    const topLeft = worldToScreen(screenToWorld({ x: 0, y: 0 }, main), mini);
    const bottomRight = worldToScreen(screenToWorld({ x: MAIN_SIZE.width, y: MAIN_SIZE.height }, main), mini);
    expect(rect.x).toBeCloseTo(topLeft.x, 6);
    expect(rect.y).toBeCloseTo(topLeft.y, 6);
    expect(rect.width).toBeCloseTo(bottomRight.x - topLeft.x, 6);
    expect(rect.height).toBeCloseTo(bottomRight.y - topLeft.y, 6);
  });

  it('shrinks the frame as the graph is zoomed in', () => {
    const mini = minimapViewport(BOUNDS, MINI_SIZE);
    const wide = visibleRect({ scale: 1, offsetX: 400, offsetY: 300 }, MAIN_SIZE, mini);
    const close = visibleRect({ scale: 4, offsetX: 400, offsetY: 300 }, MAIN_SIZE, mini);

    expect(close.width).toBeLessThan(wide.width);
    expect(close.height).toBeLessThan(wide.height);
  });

  it('moves the frame in the same direction as the graph', () => {
    const mini = minimapViewport(BOUNDS, MINI_SIZE);
    const before = visibleRect({ scale: 1, offsetX: 400, offsetY: 300 }, MAIN_SIZE, mini);
    // 図を左へドラッグする（offsetX を減らす）と、見えている world は右へ移る。
    const after = visibleRect({ scale: 1, offsetX: 300, offsetY: 300 }, MAIN_SIZE, mini);

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('brings the clicked point of the minimap to the centre of the graph', () => {
    const mini = minimapViewport(BOUNDS, MINI_SIZE);
    const main: ViewportState = { scale: 3, offsetX: 10, offsetY: 20 };
    const point = { x: 30, y: 90 };

    const next = centerOnMinimapPoint(main, MAIN_SIZE, point, mini);

    // 押した位置の world 座標が、図の中心に来る。
    const world = screenToWorld(point, mini);
    const onScreen = worldToScreen(world, next);
    expect(onScreen.x).toBeCloseTo(MAIN_SIZE.width / 2, 6);
    expect(onScreen.y).toBeCloseTo(MAIN_SIZE.height / 2, 6);
    // 倍率は変えない。位置合わせで拡大率まで動くと、押すたびに見え方が変わる。
    expect(next.scale).toBe(main.scale);
  });

  it('keeps the centre of the graph while zooming', () => {
    const main: ViewportState = { scale: 1, offsetX: 120, offsetY: 40 };
    const centre = { x: MAIN_SIZE.width / 2, y: MAIN_SIZE.height / 2 };
    const before = screenToWorld(centre, main);

    const zoomed = zoomViewportCenter(main, MAIN_SIZE, 1.2);

    expect(zoomed.scale).toBeCloseTo(1.2, 6);
    const after = screenToWorld(centre, zoomed);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('respects the zoom limits of the graph viewport', () => {
    // 縮小を押し続けても下限で止まる（`zoomAt` と同じ制限に従う）。
    let viewport: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 };
    for (let i = 0; i < 50; i += 1) viewport = zoomViewportCenter(viewport, MAIN_SIZE, 1 / 1.2);
    expect(viewport.scale).toBeGreaterThanOrEqual(0.05);
  });
});
