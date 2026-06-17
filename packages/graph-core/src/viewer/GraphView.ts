import type { GraphDocument, GraphEdge, GraphNode, Viewport } from '../types';
import { fitToContent as computeFit, getVisibleBounds, hitTest, pan, render, resolveEdgesForRender, screenToWorld, worldToScreen, zoom } from '../engine/index';
import { getCanvasColors } from '../theme';

export interface GraphViewOptions {
  theme?: 'dark' | 'light';
  /** ノードの選択 + ドラッグ移動を許可する（既定 false = 純読み取り） */
  movableNodes?: boolean;
  /** 子を持つノードのクリックで枝を折りたたむ（マインドマップ風・既定 false） */
  collapsible?: boolean;
  /** 全体俯瞰のミニマップを隅に表示する（既定 false） */
  minimap?: boolean;
}

type NodeClickHandler = (nodeId: string) => void;

interface Rect { x: number; y: number; w: number; h: number }

const CLICK_MOVE_THRESHOLD = 4;
const TOGGLE_RADIUS_CSS = 10;
const MINIMAP_W_CSS = 200;
const MINIMAP_H_CSS = 130;
const MINIMAP_MARGIN_CSS = 8;
const MINIMAP_BOUNDS_PAD = 10; // ワールド単位のコンテンツ余白（MinimapCanvas と同じ）
const MINIMAP_ZOOM_DELTA = 300;
const MINIMAP_BTN_CSS = 18; // ズーム/fit ボタンの一辺
const MINIMAP_BTN_GAP_CSS = 4;
const MINIMAP_RADIUS_CSS = 8;

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
  private collapsible: boolean;
  private minimap: boolean;
  private edges: readonly GraphEdge[] = [];
  private selectedNodeId: string | null = null;
  private pressNodeId: string | null = null;
  private pressEndpointNodeId: string | null = null;
  private hoverToggleNodeId: string | null = null;
  private dragMode: 'none' | 'pan' | 'node' | 'minimap' = 'none';
  private minimapDrag: { mode: 'viewport' | 'select'; startX: number; startY: number; curX: number; curY: number; initOffX: number; initOffY: number } | null = null;
  private readonly collapsed = new Set<string>();
  private readonly childrenMap = new Map<string, string[]>();
  private hidden = new Set<string>();
  private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = () => this.handlePointerUp();
  private readonly onPointerLeave = () => this.handlePointerLeave();
  private readonly onWheel = (e: WheelEvent) => this.handleWheel(e);

  constructor(canvas: HTMLCanvasElement, opts: GraphViewOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[GraphView] 2D context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.isDark = (opts.theme ?? 'dark') === 'dark';
    this.movableNodes = opts.movableNodes ?? false;
    this.collapsible = opts.collapsible ?? false;
    this.minimap = opts.minimap ?? false;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setDocument(doc: GraphDocument): void {
    this.nodes = doc.nodes;
    this.edges = doc.edges;
    this.selectedNodeId = null;
    this.hoverToggleNodeId = null;
    // 折りたたみ用に有向（from→子 to）の隣接を構築し、折りたたみ状態をリセット
    this.childrenMap.clear();
    for (const e of doc.edges) {
      const f = e.from.nodeId;
      const t = e.to.nodeId;
      if (!f || !t) continue;
      const arr = this.childrenMap.get(f);
      if (arr) arr.push(t);
      else this.childrenMap.set(f, [t]);
    }
    this.collapsed.clear();
    this.recomputeHidden();
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

  /** クリックでの枝折りたたみの許可を切り替える。無効化時は全展開する。 */
  setCollapsible(collapsible: boolean): void {
    this.collapsible = collapsible;
    if (!collapsible && this.collapsed.size > 0) {
      this.collapsed.clear();
      this.recomputeHidden();
      this.requestRender();
    }
  }

  /** ミニマップ表示を切り替える。 */
  setMinimap(minimap: boolean): void {
    if (minimap === this.minimap) return;
    this.minimap = minimap;
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
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    // 登録済みノードクリックハンドラを解放（destroy 後の再登録による二重発火を防ぐ）
    this.nodeClickHandlers.length = 0;
  }

  private contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const nodes = this.visibleNodeArray();
    if (nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
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

  /** ワールド座標位置にあるノード id を返す（無ければ null）。 */
  private hitNodeAtWorld(world: { x: number; y: number }): string | null {
    const result = hitTest({
      nodes: this.visibleNodeArray(),
      edges: this.resolvedEdges,
      wx: world.x,
      wy: world.y,
      scale: this.viewport.scale,
      selectedNodeIds: this.selectedNodeId ? [this.selectedNodeId] : [],
      selectedEdgeIds: [],
    });
    return result.type === 'node' && result.id ? result.id : null;
  }

  /** ノード N の折りたたみトグルボタン位置（ワールド）= N の最初の子コネクタの起点。 */
  private toggleWorldPos(nodeId: string): { x: number; y: number } | null {
    for (const e of this.resolvedEdges) {
      if (e.type === 'connector' && e.from.nodeId === nodeId) return { x: e.from.x, y: e.from.y };
    }
    return null;
  }

  /** CSS px → backing(device) px の倍率。 */
  private deviceScale(): number {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width ? this.canvas.width / rect.width : 1;
  }

  /** backing px のポインタが折りたたみトグルボタン上なら、その（子を持つ）ノード id を返す。 */
  private hitCollapseToggle(p: { x: number; y: number }): string | null {
    if (!this.collapsible) return null;
    const r = TOGGLE_RADIUS_CSS * this.deviceScale();
    for (const n of this.nodes) {
      if (this.hidden.has(n.id) || !this.childrenMap.get(n.id)?.length) continue;
      const w = this.toggleWorldPos(n.id);
      if (!w) continue;
      const s = worldToScreen(this.viewport, w.x, w.y);
      if (Math.hypot(p.x - s.x, p.y - s.y) <= r) return n.id;
    }
    return null;
  }

  /** 折りたたまれたノードの子孫集合（有向 from→to 到達）を hidden に再計算する。 */
  private recomputeHidden(): void {
    this.hidden = new Set<string>();
    for (const root of this.collapsed) {
      const stack = [...(this.childrenMap.get(root) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (this.hidden.has(id)) continue; // 循環/合流ガード
        this.hidden.add(id);
        for (const child of this.childrenMap.get(id) ?? []) stack.push(child);
      }
    }
  }

  /** 子を持つノードの折りたたみ状態をトグルする（端点=子なしは無視）。 */
  private toggleCollapse(id: string): void {
    if (!this.childrenMap.get(id)?.length) return;
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.recomputeHidden();
    this.requestRender();
  }

  /** どちらかの端点が hidden なエッジか。 */
  private isEdgeHidden(e: GraphEdge): boolean {
    return (!!e.from.nodeId && this.hidden.has(e.from.nodeId)) || (!!e.to.nodeId && this.hidden.has(e.to.nodeId));
  }

  /** 折りたたみで隠れていないノード配列。 */
  private visibleNodeArray(): GraphNode[] {
    return this.nodes.filter((n) => !this.hidden.has(n.id));
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
    if (this.pointInMinimap(p)) {
      // ミニマップ上: ボタン / 表示範囲枠ドラッグ / 範囲選択（ノード操作はしない）
      this.dragMode = 'minimap';
      this.pressNodeId = null;
      this.pressEndpointNodeId = null;
      const btn = this.hitMinimapButton(p);
      if (btn === 'zoomOut') { this.minimapZoom(MINIMAP_ZOOM_DELTA); return; }
      if (btn === 'zoomIn') { this.minimapZoom(-MINIMAP_ZOOM_DELTA); return; }
      if (btn === 'fit') { this.fitToContent(); return; }
      this.minimapDrag = this.isInsideViewportRect(p)
        ? { mode: 'viewport', startX: p.x, startY: p.y, curX: p.x, curY: p.y, initOffX: this.viewport.offsetX, initOffY: this.viewport.offsetY }
        : { mode: 'select', startX: p.x, startY: p.y, curX: p.x, curY: p.y, initOffX: 0, initOffY: 0 };
      return;
    }
    const world = screenToWorld(this.viewport, p.x, p.y);
    // 折りたたみトグルボタンを優先判定（矩形本体より先）。ボタンなら折りたたみ対象とし、ノード選択はしない。
    this.pressEndpointNodeId = this.hitCollapseToggle(p);
    this.pressNodeId = this.pressEndpointNodeId ? null : this.hitNodeAtWorld(world);
    this.dragMode = this.pressNodeId && this.movableNodes ? 'node' : 'pan';
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) {
      this.updateHover(e);
      return;
    }
    const p = this.toCanvasPoint(e.clientX, e.clientY);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.lastX = p.x;
    this.lastY = p.y;
    if (this.dragMode === 'minimap') {
      const dd = this.minimapDrag;
      if (dd?.mode === 'viewport') {
        dd.curX = p.x;
        dd.curY = p.y;
        const t = this.minimapTransform(this.minimapRect());
        if (t) {
          this.viewport = {
            ...this.viewport,
            offsetX: dd.initOffX - ((p.x - dd.startX) / t.s) * this.viewport.scale,
            offsetY: dd.initOffY - ((p.y - dd.startY) / t.s) * this.viewport.scale,
          };
          this.userInteracted = true;
        }
        this.requestRender();
      } else if (dd?.mode === 'select') {
        dd.curX = p.x;
        dd.curY = p.y;
        this.requestRender();
      }
      return;
    }
    if (this.dragMode === 'node' && this.pressNodeId) {
      this.moveNode(this.pressNodeId, dx / this.viewport.scale, dy / this.viewport.scale);
      this.selectedNodeId = this.pressNodeId;
    } else {
      this.viewport = pan(this.viewport, dx, dy);
      this.userInteracted = true;
    }
    this.requestRender();
  }

  /** ホバー中の「子を持つノード」（トグルボタン上 or ノード本体上）を更新し、変化時に再描画する。 */
  private updateHover(e: PointerEvent): void {
    let id: string | null = null;
    if (this.collapsible) {
      const p = this.toCanvasPoint(e.clientX, e.clientY);
      if (!this.pointInMinimap(p)) {
        id = this.hitCollapseToggle(p);
        if (!id) {
          const world = screenToWorld(this.viewport, p.x, p.y);
          const n = this.hitNodeAtWorld(world);
          if (n && this.childrenMap.get(n)?.length) id = n;
        }
      }
    }
    if (id !== this.hoverToggleNodeId) {
      this.hoverToggleNodeId = id;
      this.requestRender();
    }
  }

  private handlePointerLeave(): void {
    if (this.hoverToggleNodeId !== null) {
      this.hoverToggleNodeId = null;
      this.requestRender();
    }
  }

  private handlePointerUp(): void {
    this.dragging = false;
    const wasClick = this.moved <= CLICK_MOVE_THRESHOLD;
    const wasMinimap = this.dragMode === 'minimap';
    this.dragMode = 'none';
    if (wasMinimap) {
      this.handleMinimapPointerUp();
      return;
    }
    if (wasClick) {
      this.handleClickAction();
    }
    this.pressNodeId = null;
    this.pressEndpointNodeId = null;
  }

  private handleMinimapPointerUp(): void {
    const dd = this.minimapDrag;
    this.minimapDrag = null;
    if (dd?.mode === 'select') {
      // 範囲選択: 動いていれば範囲ズーム、クリックのみなら中心パン
      const moved = Math.abs(dd.curX - dd.startX) > 3 || Math.abs(dd.curY - dd.startY) > 3;
      if (moved) this.zoomToMinimapSelection({ x: dd.startX, y: dd.startY }, { x: dd.curX, y: dd.curY });
      else this.recenterFromMinimap({ x: dd.startX, y: dd.startY });
    }
    // viewport ドラッグは move 中にパン済み
    this.pressNodeId = null;
    this.pressEndpointNodeId = null;
  }

  private handleClickAction(): void {
    if (this.pressEndpointNodeId) {
      // コネクタ端点クリック: 枝を折りたたむ/展開する（node-click は出さない）
      this.toggleCollapse(this.pressEndpointNodeId);
    } else {
      // 矩形（ノード本体）クリック: movableNodes 時のみ選択ハイライト。node-click は常に通知。
      if (this.movableNodes) {
        this.selectedNodeId = this.pressNodeId;
        this.requestRender();
      }
      if (this.pressNodeId) {
        for (const cb of this.nodeClickHandlers) cb(this.pressNodeId);
      }
    }
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
      nodes: this.hidden.size ? this.visibleNodeArray() : this.nodes,
      edges: this.hidden.size ? this.resolvedEdges.filter((e) => !this.isEdgeHidden(e)) : this.resolvedEdges,
      viewport: this.viewport,
      selection: { nodeIds: this.selectedNodeId ? [this.selectedNodeId] : [], edgeIds: [] },
      showGrid: false,
      isDark: this.isDark,
    });
    this.drawCollapseToggles();
    this.drawMinimap();
  }

  /** ミニマップの矩形（backing px・右上）。 */
  private minimapRect(): { x: number; y: number; w: number; h: number } {
    const d = this.deviceScale();
    const w = MINIMAP_W_CSS * d;
    const h = MINIMAP_H_CSS * d;
    const m = MINIMAP_MARGIN_CSS * d;
    return { x: this.canvas.width - w - m, y: m, w, h };
  }

  /** 可視ノードのコンテンツ境界（PAD 付き・ワールド）。 */
  private minimapBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const b = this.contentBounds();
    if (!b) return null;
    return { minX: b.minX - MINIMAP_BOUNDS_PAD, minY: b.minY - MINIMAP_BOUNDS_PAD, maxX: b.maxX + MINIMAP_BOUNDS_PAD, maxY: b.maxY + MINIMAP_BOUNDS_PAD };
  }

  /** ワールド → ミニマップ矩形への変換（s 倍 + ox/oy 平行移動）。 */
  private minimapTransform(box: { x: number; y: number; w: number; h: number }): { s: number; ox: number; oy: number } | null {
    const b = this.minimapBounds();
    if (!b) return null;
    const bw = (b.maxX - b.minX) || 1;
    const bh = (b.maxY - b.minY) || 1;
    const s = Math.min(box.w / bw, box.h / bh);
    const ox = box.x + (box.w - bw * s) / 2 - b.minX * s;
    const oy = box.y + (box.h - bh * s) / 2 - b.minY * s;
    return { s, ox, oy };
  }

  private pointInMinimap(p: { x: number; y: number }): boolean {
    if (!this.minimap) return false;
    const b = this.minimapRect();
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  /** ズーム/fit ボタンの矩形（backing px・ミニマップ右下）。 */
  private minimapButtonRects(): { zoomOut: Rect; zoomIn: Rect; fit: Rect } {
    const box = this.minimapRect();
    const d = this.deviceScale();
    const sz = MINIMAP_BTN_CSS * d;
    const g = MINIMAP_BTN_GAP_CSS * d;
    const y = box.y + box.h - sz - g;
    const fit = { x: box.x + box.w - sz - g, y, w: sz, h: sz };
    const zoomIn = { x: fit.x - sz - g, y, w: sz, h: sz };
    const zoomOut = { x: zoomIn.x - sz - g, y, w: sz, h: sz };
    return { zoomOut, zoomIn, fit };
  }

  private hitMinimapButton(p: { x: number; y: number }): 'zoomOut' | 'zoomIn' | 'fit' | null {
    const b = this.minimapButtonRects();
    const inside = (r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (inside(b.fit)) return 'fit';
    if (inside(b.zoomIn)) return 'zoomIn';
    if (inside(b.zoomOut)) return 'zoomOut';
    return null;
  }

  /** 現在の表示範囲のミニマップ矩形（backing px）。 */
  private viewportRectScreen(): Rect | null {
    const box = this.minimapRect();
    const t = this.minimapTransform(box);
    if (!t) return null;
    const vb = getVisibleBounds(this.viewport, this.canvas.width, this.canvas.height, 0);
    return { x: vb.minX * t.s + t.ox, y: vb.minY * t.s + t.oy, w: (vb.maxX - vb.minX) * t.s, h: (vb.maxY - vb.minY) * t.s };
  }

  private isInsideViewportRect(p: { x: number; y: number }): boolean {
    const r = this.viewportRectScreen();
    return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /** ミニマップ上の点を主ビューの中心へパンする。 */
  private recenterFromMinimap(p: { x: number; y: number }): void {
    const box = this.minimapRect();
    const t = this.minimapTransform(box);
    if (!t) return;
    const wx = (p.x - t.ox) / t.s;
    const wy = (p.y - t.oy) / t.s;
    this.viewport = {
      ...this.viewport,
      offsetX: this.canvas.width / 2 - wx * this.viewport.scale,
      offsetY: this.canvas.height / 2 - wy * this.viewport.scale,
    };
    this.userInteracted = true;
    this.requestRender();
  }

  /** ミニマップ上の矩形選択範囲に fit する。 */
  private zoomToMinimapSelection(start: { x: number; y: number }, cur: { x: number; y: number }): void {
    const box = this.minimapRect();
    const t = this.minimapTransform(box);
    if (!t) return;
    const x1 = (Math.min(start.x, cur.x) - t.ox) / t.s;
    const y1 = (Math.min(start.y, cur.y) - t.oy) / t.s;
    const x2 = (Math.max(start.x, cur.x) - t.ox) / t.s;
    const y2 = (Math.max(start.y, cur.y) - t.oy) / t.s;
    if (x2 <= x1 || y2 <= y1) return;
    this.viewport = computeFit(this.canvas.width, this.canvas.height, { minX: x1, minY: y1, maxX: x2, maxY: y2 }, 20 * this.deviceScale());
    this.userInteracted = true;
    this.requestRender();
  }

  /** メインビュー中央を基点にズーム（delta>0 で縮小）。 */
  private minimapZoom(delta: number): void {
    this.viewport = zoom(this.viewport, this.canvas.width / 2, this.canvas.height / 2, delta);
    this.userInteracted = true;
    this.requestRender();
  }

  private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 全体俯瞰のミニマップを右上に描画する（MinimapCanvas 準拠）。screen(backing) px。 */
  private drawMinimap(): void {
    if (!this.minimap) return;
    const box = this.minimapRect();
    const t = this.minimapTransform(box);
    const colors = getCanvasColors(this.isDark);
    const d = this.deviceScale();
    const r = MINIMAP_RADIUS_CSS * d;
    const ctx = this.ctx;
    ctx.save();
    // パネル背景（角丸 + 影）
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8 * d;
    ctx.shadowOffsetY = 2 * d;
    ctx.fillStyle = this.isDark ? 'rgba(13,17,23,0.85)' : 'rgba(242,239,232,0.85)';
    this.roundRectPath(ctx, box.x, box.y, box.w, box.h, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.panelBorder;
    this.roundRectPath(ctx, box.x, box.y, box.w, box.h, r);
    ctx.stroke();
    this.roundRectPath(ctx, box.x, box.y, box.w, box.h, r);
    ctx.clip();
    if (t) {
      // ノード（各ノードの fill/stroke）
      ctx.lineWidth = 0.5 * d;
      for (const n of this.nodes) {
        if (this.hidden.has(n.id)) continue;
        const x = n.x * t.s + t.ox;
        const y = n.y * t.s + t.oy;
        const w = Math.max(n.width * t.s, 2 * d);
        const h = Math.max(n.height * t.s, 2 * d);
        ctx.fillStyle = n.style.fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = n.style.stroke;
        ctx.strokeRect(x, y, w, h);
      }
      // 現在の表示範囲（塗り + 枠）
      const vr = this.viewportRectScreen();
      if (vr) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(vr.x, vr.y, vr.w, vr.h);
        ctx.lineWidth = 1.5 * d;
        ctx.strokeStyle = this.minimapDrag?.mode === 'viewport' ? 'rgba(144,202,249,0.9)' : 'rgba(255,255,255,0.75)';
        ctx.strokeRect(vr.x, vr.y, vr.w, vr.h);
      }
      // 範囲選択（点線）
      if (this.minimapDrag?.mode === 'select') {
        const dd = this.minimapDrag;
        const sx = Math.min(dd.startX, dd.curX);
        const sy = Math.min(dd.startY, dd.curY);
        ctx.fillStyle = 'rgba(144,202,249,0.15)';
        ctx.fillRect(sx, sy, Math.abs(dd.curX - dd.startX), Math.abs(dd.curY - dd.startY));
        ctx.setLineDash([3 * d, 2 * d]);
        ctx.lineWidth = 1 * d;
        ctx.strokeStyle = 'rgba(144,202,249,0.9)';
        ctx.strokeRect(sx, sy, Math.abs(dd.curX - dd.startX), Math.abs(dd.curY - dd.startY));
        ctx.setLineDash([]);
      }
    }
    this.drawMinimapButtons(ctx);
    ctx.restore();
  }

  private drawMinimapButtons(ctx: CanvasRenderingContext2D): void {
    const b = this.minimapButtonRects();
    const d = this.deviceScale();
    const br = 4 * d;
    const fg = this.isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    const bg = this.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    const draw = (rect: Rect, glyph: '-' | '+' | 'fit') => {
      ctx.fillStyle = bg;
      this.roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, br);
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.fillStyle = fg;
      ctx.lineWidth = 1.4 * d;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const g = rect.w * 0.28;
      if (glyph === 'fit') {
        ctx.strokeRect(cx - g, cy - g, g * 2, g * 2);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(cx - g, cy);
      ctx.lineTo(cx + g, cy);
      if (glyph === '+') {
        ctx.moveTo(cx, cy - g);
        ctx.lineTo(cx, cy + g);
      }
      ctx.stroke();
    };
    draw(b.zoomOut, '-');
    draw(b.zoomIn, '+');
    draw(b.fit, 'fit');
  }

  /** ホバー中ノードの折りたたみトグル（−=展開中/＋=折りたたみ中）をコネクタ起点に描画する。screen(backing) px。 */
  private drawCollapseToggles(): void {
    if (!this.collapsible || this.hoverToggleNodeId === null) return;
    const id = this.hoverToggleNodeId;
    if (this.hidden.has(id) || !this.childrenMap.get(id)?.length) return;
    const w = this.toggleWorldPos(id);
    if (!w) return;
    const colors = getCanvasColors(this.isDark);
    const r = TOGGLE_RADIUS_CSS * this.deviceScale();
    const s = worldToScreen(this.viewport, w.x, w.y);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.canvasBg;
    ctx.fill();
    ctx.strokeStyle = colors.accentColor;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - r * 0.5, s.y);
    ctx.lineTo(s.x + r * 0.5, s.y);
    if (this.collapsed.has(id)) {
      ctx.moveTo(s.x, s.y - r * 0.5);
      ctx.lineTo(s.x, s.y + r * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }
}
