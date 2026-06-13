/**
 * `<anytime-graph>` Custom Element — graph-core の vanilla `GraphView`（canvas レンダラ）を
 * フレームワーク非依存の Web Component で包む。
 *
 * mindmap-viewer の `MindmapViewerElement` と同じ anytime WC 規約に揃える。`GraphView` のみに依存し
 * React は一切含まない（配布対象 React/MUI フリーの不変条件）。mindmap-viewer が `GraphInput` を
 * 正規化して受けるのに対し、本要素は graph-core ネイティブの `GraphDocument` を直接受ける汎用版。
 *
 * I/F:
 * - 属性: `theme`（dark/light）/ `movable-nodes` / `collapsible` / `minimap`
 * - プロパティ: `data`（`GraphDocument`。長大データのため属性ではなく property）
 * - イベント: `node-click`（`detail.id` にノード ID。composed: true）
 * - メソッド: `fitToContent()` / `toPng(scale)`
 */

import type { GraphDocument } from "./types";
import { GraphView } from "./viewer/index";

/** `detail` が `{ id }` の `node-click` イベント。 */
export interface GraphNodeClickDetail {
  id: string;
}

export class AnytimeGraphElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["theme", "movable-nodes", "collapsible", "minimap"];
  }

  private view: GraphView | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private doc: GraphDocument | null = null;

  connectedCallback(): void {
    // 再挿入時は shadow root を再利用する（attachShadow の二重呼び出しを避ける）。
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.replaceChildren();
    const style = document.createElement("style");
    style.textContent =
      ":host{display:block;width:100%;height:100%}canvas{display:block;width:100%;height:100%}";
    const canvas = document.createElement("canvas");
    root.append(style, canvas);
    this.canvas = canvas;

    this.view = new GraphView(canvas, {
      theme: this.currentTheme(),
      movableNodes: this.hasAttribute("movable-nodes"),
      collapsible: this.hasAttribute("collapsible"),
      minimap: this.hasAttribute("minimap"),
    });
    this.view.on("nodeClick", (id) => this.emitNodeClick(id));

    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this);
    this.syncCanvasSize();
    if (this.doc) this.applyDocument(this.doc, { fit: true });
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.view?.destroy();
    this.view = null;
    this.canvas = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.view) return;
    if (name === "theme") {
      this.view.setTheme(this.currentTheme());
    } else if (name === "movable-nodes") {
      this.view.setMovableNodes(this.hasAttribute("movable-nodes"));
    } else if (name === "collapsible") {
      this.view.setCollapsible(this.hasAttribute("collapsible"));
    } else if (name === "minimap") {
      this.view.setMinimap(this.hasAttribute("minimap"));
    }
  }

  /** graph-core ネイティブの `GraphDocument` を property で受け取る（`element.data = ...`）。 */
  set data(value: GraphDocument) {
    this.doc = value;
    if (this.view) this.applyDocument(value, { fit: true });
  }

  get data(): GraphDocument | null {
    return this.doc;
  }

  fitToContent(): void {
    this.view?.fitToContent();
  }

  toPng(scale = 1): Promise<Blob> {
    if (!this.view) return Promise.reject(new Error("[anytime-graph] not connected"));
    return this.view.toPng(scale);
  }

  private currentTheme(): "dark" | "light" {
    return this.getAttribute("theme") === "light" ? "light" : "dark";
  }

  private applyDocument(doc: GraphDocument, opts: { fit: boolean }): void {
    try {
      this.view?.setDocument(doc);
      if (opts.fit) this.view?.fitToContent();
    } catch (err) {
      console.error("[anytime-graph] failed to apply data", err);
    }
  }

  private emitNodeClick(id: string): void {
    const detail: GraphNodeClickDetail = { id };
    this.dispatchEvent(
      new CustomEvent<GraphNodeClickDetail>("node-click", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private syncCanvasSize(): void {
    if (!this.canvas) return;
    const rect = this.getBoundingClientRect();
    // 文字を鮮明に保つ: backing を整数 device px に丸め、表示 CSS を backing/dpr に固定する
    // （MindmapViewerElement と同一の DPR 補正）。
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
