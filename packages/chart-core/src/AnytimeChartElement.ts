/**
 * `<anytime-chart>` Custom Element — chart-core の vanilla `ChartView`（canvas レンダラ）を
 * フレームワーク非依存の Web Component で包む。
 *
 * graph-core の `AnytimeGraphElement` と同じ anytime WC 規約に揃える（shadow DOM・DPR 補正・
 * ResizeObserver）。React は一切含まない（配布対象 React/MUI フリーの不変条件）。
 *
 * I/F:
 * - 属性: `theme`（dark/light）/ `palette`（blue 等）
 * - プロパティ: `spec`（`ChartSpec`。長大データのため属性ではなく property）
 * - メソッド: `toPng(scale)`
 * - a11y: `role="img"` + `aria-label`（タイトル + 系列要約）
 */

import type { ChartSpec, PaletteKey } from "./types";
import { ChartView } from "./viewer/ChartView";

/** SSR/Node 安全化: HTMLElement 未定義環境でも class 定義時に ReferenceError を投げない。 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

export class AnytimeChartElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ["theme", "palette"];
  }

  private view: ChartView | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private chartSpec: ChartSpec | null = null;

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.replaceChildren();
    const style = document.createElement("style");
    style.textContent =
      ":host{display:block;width:100%;height:100%}canvas{display:block;width:100%;height:100%}";
    const canvas = document.createElement("canvas");
    root.append(style, canvas);
    this.canvas = canvas;

    this.setAttribute("role", "img");

    this.view = new ChartView(canvas, {
      theme: this.currentTheme(),
      palette: this.currentPalette(),
    });

    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(this);
    this.syncCanvasSize();
    if (this.chartSpec) this.applySpec(this.chartSpec);
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
    if (name === "theme") this.view.setTheme(this.currentTheme());
    else if (name === "palette") this.view.setPalette(this.currentPalette());
  }

  /** `ChartSpec` を property で受け取る（`element.spec = ...`）。 */
  set spec(value: ChartSpec) {
    this.chartSpec = value;
    if (this.view) this.applySpec(value);
  }

  get spec(): ChartSpec | null {
    return this.chartSpec;
  }

  toPng(scale = 1): Promise<Blob> {
    if (!this.view) return Promise.reject(new Error("[anytime-chart] not connected"));
    return this.view.toPng(scale);
  }

  private applySpec(spec: ChartSpec): void {
    try {
      this.view?.setSpec(spec);
      this.updateAriaLabel(spec);
    } catch (err) {
      console.error("[anytime-chart] failed to apply spec", err);
    }
  }

  private updateAriaLabel(spec: ChartSpec): void {
    const KIND_LABELS: Record<ChartSpec["kind"], string> = {
      line: "折れ線",
      bar: "棒",
      scatter: "散布図",
      area: "面",
      pie: "円",
      combo: "複合",
    };
    const kindLabel = KIND_LABELS[spec.kind];
    const names = spec.series.map((s) => s.name).join(", ");
    this.setAttribute("aria-label", `${spec.title ?? kindLabel}グラフ。系列: ${names}`);
  }

  private currentTheme(): "dark" | "light" {
    return this.getAttribute("theme") === "dark" ? "dark" : "light";
  }

  private currentPalette(): PaletteKey {
    return (this.getAttribute("palette") as PaletteKey) || "blue";
  }

  private syncCanvasSize(): void {
    if (!this.canvas) return;
    const rect = this.getBoundingClientRect();
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
