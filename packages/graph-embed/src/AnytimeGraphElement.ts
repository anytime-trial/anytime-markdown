import { GraphView } from '@anytime-markdown/graph-core/viewer';
import { normalizeGraphInput } from './normalizeGraphInput';
import type { GraphInput, NodeClickDetail } from './types';

export class AnytimeGraphElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['theme'];
  }

  private view: GraphView | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private input: GraphInput | null = null;
  private readonly nodeLabels = new Map<string, NodeClickDetail>();

  connectedCallback(): void {
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{display:block;width:100%;height:100%}canvas{display:block;width:100%;height:100%}';
    const canvas = document.createElement('canvas');
    root.append(style, canvas);
    this.canvas = canvas;

    this.view = new GraphView(canvas, { theme: this.currentTheme() });
    this.view.on('nodeClick', (id) => this.emitNodeClick(id));

    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this);
    this.syncCanvasSize();
    if (this.input) this.applyInput(this.input);
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.view?.destroy();
    this.view = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name !== 'theme') return;
    const theme = value === 'light' ? 'light' : 'dark';
    this.view?.setTheme(theme);
    // 既定スタイル（fill 等）はテーマ依存のため、入力があれば再正規化して再描画する
    if (this.input) this.applyInput(this.input);
  }

  /** GraphInput を property で受け取る（属性ではなく element.data = ... ） */
  set data(value: GraphInput) {
    this.input = value;
    if (this.view) this.applyInput(value);
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

  private applyInput(input: GraphInput): void {
    this.nodeLabels.clear();
    for (const n of input.nodes) this.nodeLabels.set(n.id, { id: n.id, label: n.label, metadata: n.metadata });
    try {
      const doc = normalizeGraphInput(input, { theme: this.currentTheme() });
      this.view?.setDocument(doc);
      this.view?.fitToContent();
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
    const dpr = globalThis.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.view?.fitToContent();
  }
}
