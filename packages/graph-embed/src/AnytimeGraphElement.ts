import { GraphView } from '@anytime-markdown/graph-core/viewer';
import { normalizeGraphInput } from './normalizeGraphInput';
import type { GraphInput, NodeClickDetail } from './types';

export class AnytimeGraphElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['theme', 'movable-nodes', 'collapsible', 'minimap'];
  }

  private view: GraphView | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private input: GraphInput | null = null;
  private readonly nodeLabels = new Map<string, NodeClickDetail>();

  connectedCallback(): void {
    // 再挿入時は shadow root を再利用し中身を作り直す（attachShadow の二重呼び出しを避ける）
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = ':host{display:block;width:100%;height:100%}canvas{display:block;width:100%;height:100%}';
    const canvas = document.createElement('canvas');
    root.append(style, canvas);
    this.canvas = canvas;

    this.view = new GraphView(canvas, {
      theme: this.currentTheme(),
      movableNodes: this.hasAttribute('movable-nodes'),
      collapsible: this.hasAttribute('collapsible'),
      minimap: this.hasAttribute('minimap'),
    });
    this.view.on('nodeClick', (id) => this.emitNodeClick(id));

    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this);
    this.syncCanvasSize();
    if (this.input) this.applyInput(this.input, { fit: true });
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.view?.destroy();
    this.view = null;
    this.canvas = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'theme') {
      const theme = value === 'light' ? 'light' : 'dark';
      this.view?.setTheme(theme);
      // 既定スタイル（fill 等）はテーマ依存のため再正規化して再描画する。viewport は保持（fit しない）
      if (this.input) this.applyInput(this.input, { fit: false });
    } else if (name === 'movable-nodes') {
      this.view?.setMovableNodes(this.hasAttribute('movable-nodes'));
    } else if (name === 'collapsible') {
      this.view?.setCollapsible(this.hasAttribute('collapsible'));
    } else if (name === 'minimap') {
      this.view?.setMinimap(this.hasAttribute('minimap'));
    }
  }

  /** GraphInput を property で受け取る（属性ではなく element.data = ... ） */
  set data(value: GraphInput) {
    this.input = value;
    if (this.view) this.applyInput(value, { fit: true });
  }

  get data(): GraphInput | null {
    return this.input;
  }

  fitToContent(): void {
    this.view?.fitToContent();
  }

  toPng(scale = 1): Promise<Blob> {
    if (!this.view) return Promise.reject(new Error('[anytime-graph] not connected'));
    return this.view.toPng(scale);
  }

  private currentTheme(): 'dark' | 'light' {
    return this.getAttribute('theme') === 'light' ? 'light' : 'dark';
  }

  private applyInput(input: GraphInput, opts: { fit: boolean }): void {
    this.nodeLabels.clear();
    for (const n of input.nodes) this.nodeLabels.set(n.id, { id: n.id, label: n.label, metadata: n.metadata });
    try {
      const doc = normalizeGraphInput(input, { theme: this.currentTheme() });
      this.view?.setDocument(doc);
      if (opts.fit) this.view?.fitToContent();
    } catch (err) {
      console.error('[anytime-graph] failed to apply data', err);
    }
  }

  private emitNodeClick(id: string): void {
    const detail: NodeClickDetail = this.nodeLabels.get(id) ?? { id };
    this.dispatchEvent(new CustomEvent<NodeClickDetail>('node-click', { detail, bubbles: true, composed: true }));
  }

  private syncCanvasSize(): void {
    if (!this.canvas) return;
    const rect = this.getBoundingClientRect();
    // 文字を鮮明に保つ: backing を整数 device px に丸め、表示 CSS を backing/dpr に固定する。
    // これで「表示の device px（= cssW×dpr）== backing」が厳密一致し、分数 dpr（Windows の
    // 125%/150% 表示スケール等）でもブラウザの拡大縮小補間によるぼけが出ない。
    const dpr = globalThis.devicePixelRatio || 1;
    const backingW = Math.max(1, Math.round(rect.width * dpr));
    const backingH = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.width = backingW;
    this.canvas.height = backingH;
    this.canvas.style.width = `${backingW / dpr}px`;
    this.canvas.style.height = `${backingH / dpr}px`;
    this.view?.resize();
  }
}
