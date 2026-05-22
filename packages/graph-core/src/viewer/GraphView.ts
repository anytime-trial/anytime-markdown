import type { GraphDocument, GraphEdge, GraphNode, Viewport } from '../types';
import { fitToContent as computeFit, hitTest, pan, render, resolveEdgesForRender, screenToWorld, zoom } from '../engine/index';

export interface GraphViewOptions {
  theme?: 'dark' | 'light';
  /** ノードの選択 + ドラッグ移動を許可する（既定 false = 純読み取り） */
  movableNodes?: boolean;
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
  private userInteracted = false;
  private movableNodes: boolean;
  private edges: readonly GraphEdge[] = [];
  private selectedNodeId: string | null = null;
  private pressNodeId: string | null = null;
  private dragMode: 'none' | 'pan' | 'node' = 'none';
  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = () => this.handlePointerUp();
  private readonly onWheel = (e: WheelEvent) => this.handleWheel(e);

  constructor(canvas: HTMLCanvasElement, opts: GraphViewOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[GraphView] 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.isDark = (opts.theme ?? 'dark') === 'dark';
    this.movableNodes = opts.movableNodes ?? false;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setDocument(doc: GraphDocument): void {
    this.nodes = doc.nodes;
    this.edges = doc.edges;
    this.selectedNodeId = null;
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

  /** ノード選択 + 移動の許可を切り替える。無効化時は選択を解除する。 */
  setMovableNodes(movable: boolean): void {
    this.movableNodes = movable;
    if (!movable && this.selectedNodeId !== null) {
      this.selectedNodeId = null;
      this.requestRender();
    }
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
    this.nodeClickHandlers.push(cb);
  }

  /** コンテナサイズ変更時に呼ぶ。ユーザー操作前は再 fit、操作後は viewport を保持して再描画。 */
  resize(): void {
    if (this.userInteracted) this.requestRender();
    else this.fitToContent();
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

  /**
   * CSS(クライアント)座標を canvas backing(デバイス)座標へ変換する。
   * backing store は CSS 表示サイズの devicePixelRatio 倍のため、viewport/描画と座標系を揃える。
   */
  private toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width ? this.canvas.width / rect.width : 1;
    const sy = rect.height ? this.canvas.height / rect.height : 1;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  /** ポインタ位置にあるノード id を返す（無ければ null）。 */
  private hitNodeAt(e: PointerEvent): string | null {
    const p = this.toCanvasPoint(e.clientX, e.clientY);
    const world = screenToWorld(this.viewport, p.x, p.y);
    const result = hitTest({
      nodes: [...this.nodes],
      edges: this.resolvedEdges,
      wx: world.x,
      wy: world.y,
      scale: this.viewport.scale,
      selectedNodeIds: this.selectedNodeId ? [this.selectedNodeId] : [],
      selectedEdgeIds: [],
    });
    return result.type === 'node' && result.id ? result.id : null;
  }

  /** ノードをワールド座標で移動し、接続エッジを再解決する。 */
  private moveNode(id: string, dwx: number, dwy: number): void {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return;
    node.x += dwx;
    node.y += dwy;
    try {
      this.resolvedEdges = resolveEdgesForRender(this.nodes, this.edges);
    } catch (err) {
      console.error('[GraphView] edge resolution failed during move', err);
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.moved = 0;
    const p = this.toCanvasPoint(e.clientX, e.clientY);
    this.lastX = p.x;
    this.lastY = p.y;
    this.pressNodeId = this.hitNodeAt(e);
    this.dragMode = this.pressNodeId && this.movableNodes ? 'node' : 'pan';
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const p = this.toCanvasPoint(e.clientX, e.clientY);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.lastX = p.x;
    this.lastY = p.y;
    if (this.dragMode === 'node' && this.pressNodeId) {
      this.moveNode(this.pressNodeId, dx / this.viewport.scale, dy / this.viewport.scale);
      this.selectedNodeId = this.pressNodeId;
    } else {
      this.viewport = pan(this.viewport, dx, dy);
      this.userInteracted = true;
    }
    this.requestRender();
  }

  private handlePointerUp(): void {
    this.dragging = false;
    const wasClick = this.moved <= CLICK_MOVE_THRESHOLD;
    this.dragMode = 'none';
    if (!wasClick) {
      this.pressNodeId = null;
      return;
    }
    // クリック: movableNodes 時のみ選択ハイライトを更新。node-click は常に通知。
    if (this.movableNodes) {
      this.selectedNodeId = this.pressNodeId;
      this.requestRender();
    }
    if (this.pressNodeId) {
      for (const cb of this.nodeClickHandlers) cb(this.pressNodeId);
    }
    this.pressNodeId = null;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.toCanvasPoint(e.clientX, e.clientY);
    // zoom() は内部で sensitivity と符号反転を行うため生の deltaY を渡す
    this.viewport = zoom(this.viewport, p.x, p.y, e.deltaY);
    this.userInteracted = true;
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
      selection: { nodeIds: this.selectedNodeId ? [this.selectedNodeId] : [], edgeIds: [] },
      showGrid: false,
      isDark: this.isDark,
    });
  }
}
