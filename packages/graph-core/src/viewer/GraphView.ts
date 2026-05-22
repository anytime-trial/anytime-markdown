import type { GraphDocument, GraphEdge, GraphNode, Viewport } from '../types';
import { fitToContent as computeFit, hitTest, pan, render, resolveEdgesForRender, screenToWorld, zoom } from '../engine/index';

export interface GraphViewOptions {
  theme?: 'dark' | 'light';
}

type NodeClickHandler = (nodeId: string) => void;

const CLICK_MOVE_THRESHOLD = 4;

export class GraphView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private isDark: boolean;
  private nodes: readonly GraphNode[] = [];
  private resolvedEdges: GraphEdge[] = [];
  private viewport: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
  private readonly nodeClickHandlers: NodeClickHandler[] = [];
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private rafId = 0;
  private dirty = false;
  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
  private readonly onWheel = (e: WheelEvent) => this.handleWheel(e);

  constructor(canvas: HTMLCanvasElement, opts: GraphViewOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[GraphView] 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.isDark = (opts.theme ?? 'dark') === 'dark';
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setDocument(doc: GraphDocument): void {
    this.nodes = doc.nodes;
    try {
      this.resolvedEdges = resolveEdgesForRender(doc.nodes, doc.edges);
    } catch (err) {
      console.error('[GraphView] edge resolution failed', err);
      this.resolvedEdges = [...doc.edges];
    }
    this.requestRender();
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.isDark = theme === 'dark';
    this.requestRender();
  }

  fitToContent(): void {
    const b = this.contentBounds();
    if (!b) return;
    this.viewport = computeFit(this.canvas.width, this.canvas.height, b);
    this.requestRender();
  }

  async toPng(scale = 1): Promise<Blob> {
    this.renderNow();
    const source = this.canvas;
    let target: HTMLCanvasElement = source;
    if (scale !== 1) {
      target = document.createElement('canvas');
      target.width = source.width * scale;
      target.height = source.height * scale;
      const tctx = target.getContext('2d');
      if (!tctx) throw new Error('[GraphView] toPng: 2D context unavailable');
      tctx.scale(scale, scale);
      tctx.drawImage(source, 0, 0);
    }
    return await new Promise<Blob>((resolve, reject) => {
      target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('[GraphView] toBlob returned null'))), 'image/png');
    });
  }

  on(event: 'nodeClick', cb: NodeClickHandler): void {
    if (event === 'nodeClick') this.nodeClickHandlers.push(cb);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return { minX, minY, maxX, maxY };
  }

  private handlePointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.moved = 0;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.viewport = pan(this.viewport, dx, dy);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.requestRender();
  }

  private handlePointerUp(e: PointerEvent): void {
    this.dragging = false;
    if (this.moved > CLICK_MOVE_THRESHOLD) return;
    const rect = this.canvas.getBoundingClientRect();
    const world = screenToWorld(this.viewport, e.clientX - rect.left, e.clientY - rect.top);
    const result = hitTest({
      nodes: [...this.nodes],
      edges: this.resolvedEdges,
      wx: world.x,
      wy: world.y,
      scale: this.viewport.scale,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
    if (result.type === 'node' && result.id) {
      for (const cb of this.nodeClickHandlers) cb(result.id);
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const delta = -e.deltaY * 0.001;
    this.viewport = zoom(this.viewport, e.clientX - rect.left, e.clientY - rect.top, delta);
    this.requestRender();
  }

  private requestRender(): void {
    // RAF が無い環境（jest node / SSR）では描画をスケジュールしない（座標計算のみ）
    if (this.dirty || typeof requestAnimationFrame === 'undefined') return;
    this.dirty = true;
    this.rafId = requestAnimationFrame(() => {
      this.dirty = false;
      this.renderNow();
    });
  }

  private renderNow(): void {
    render({
      ctx: this.ctx,
      width: this.canvas.width,
      height: this.canvas.height,
      nodes: this.nodes,
      edges: this.resolvedEdges,
      viewport: this.viewport,
      selection: { nodeIds: [], edgeIds: [] },
      showGrid: false,
      isDark: this.isDark,
    });
  }
}
