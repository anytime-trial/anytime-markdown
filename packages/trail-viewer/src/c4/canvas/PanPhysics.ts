export interface PanBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export class PanPhysics {
  viewX: number;
  viewY: number;
  zoom: number;

  private vx = 0;
  private vy = 0;
  private bounds: PanBounds = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };

  private static readonly FRICTION = 0.88;
  private static readonly SPRING_K = 0.12;
  private static readonly IDLE_THRESHOLD = 0.01;

  constructor(viewX = 0, viewY = 0, zoom = 1) {
    this.viewX = viewX;
    this.viewY = viewY;
    this.zoom = zoom;
  }

  setBounds(bounds: PanBounds): void {
    this.bounds = bounds;
  }

  applyImpulse(dvx: number, dvy: number): void {
    this.vx += dvx;
    this.vy += dvy;
  }

  /** Move view by canvas pixel delta (drag-while-moving helper). */
  pan(dx: number, dy: number): void {
    this.viewX -= dx / this.zoom;
    this.viewY += dy / this.zoom;
  }

  /**
   * Advance physics by one frame.
   * @returns true if still moving (caller should schedule next frame)
   */
  tick(): boolean {
    this.vx *= PanPhysics.FRICTION;
    this.vy *= PanPhysics.FRICTION;

    const { minX, maxX, minY, maxY } = this.bounds;
    if (this.viewX < minX) this.vx += (minX - this.viewX) * PanPhysics.SPRING_K;
    if (this.viewX > maxX) this.vx += (maxX - this.viewX) * PanPhysics.SPRING_K;
    if (this.viewY < minY) this.vy += (minY - this.viewY) * PanPhysics.SPRING_K;
    if (this.viewY > maxY) this.vy += (maxY - this.viewY) * PanPhysics.SPRING_K;

    this.viewX += this.vx;
    this.viewY += this.vy;

    return (
      Math.abs(this.vx) >= PanPhysics.IDLE_THRESHOLD ||
      Math.abs(this.vy) >= PanPhysics.IDLE_THRESHOLD
    );
  }

  /**
   * Zoom around a data-space anchor point.
   * Anchor stays at the same canvas pixel before/after zoom.
   */
  zoomAt(factor: number, anchorDataX: number, anchorDataY: number): void {
    this.viewX = anchorDataX - (anchorDataX - this.viewX) / factor;
    this.viewY = anchorDataY - (anchorDataY - this.viewY) / factor;
    this.zoom *= factor;
  }

  /** Fit all points into the canvas, resetting velocity. */
  fitToData(
    points: readonly { x: number; y: number }[],
    canvasW: number,
    canvasH: number,
    padding = 40,
  ): void {
    if (points.length === 0) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const newZoom = Math.min(
      (canvasW - 2 * padding) / rangeX,
      (canvasH - 2 * padding) / rangeY,
    );
    this.zoom = Math.max(0.1, Math.min(newZoom, 20));
    this.viewX = minX - padding / this.zoom;
    this.viewY = minY - padding / this.zoom;
    this.vx = 0;
    this.vy = 0;
  }
}
