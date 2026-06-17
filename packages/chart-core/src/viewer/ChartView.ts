import type { ChartLayout, ChartSpec, PaletteKey } from "../types";
import { getChartTheme } from "../theme";
import { renderChart } from "../engine/renderChart";
import { hitTest } from "../engine/hitTest";
import { formatValue } from "../engine/render/style";

export interface ChartViewOptions {
  readonly theme?: "light" | "dark";
  readonly palette?: PaletteKey;
}

/**
 * canvas に ChartSpec を描画する vanilla ビューア（React 非依存）。
 * DPR 補正のうえ CSS px 座標系で描画し、hover/focus で hitTest によるツールチップを表示する。
 */
export class ChartView {
  private readonly ctx: CanvasRenderingContext2D;
  private spec: ChartSpec | null = null;
  private mode: "light" | "dark";
  private palette: PaletteKey;
  private layout: ChartLayout | null = null;
  private tooltip: HTMLDivElement | null = null;
  private readonly onMove: (e: MouseEvent) => void;
  private readonly onLeave: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: ChartViewOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[anytime-chart] 2D context unavailable");
    this.ctx = ctx;
    this.mode = opts.theme ?? "light";
    this.palette = opts.palette ?? "blue";
    this.onMove = (e) => this.handleHover(e);
    this.onLeave = () => this.hideTooltip();
    canvas.addEventListener("mousemove", this.onMove);
    canvas.addEventListener("mouseleave", this.onLeave);
  }

  setSpec(spec: ChartSpec): void {
    this.spec = spec;
    this.draw();
  }

  setTheme(mode: "light" | "dark"): void {
    this.mode = mode;
    this.draw();
  }

  setPalette(palette: PaletteKey): void {
    this.palette = palette;
    this.draw();
  }

  resize(): void {
    this.draw();
  }

  getLayout(): ChartLayout | null {
    return this.layout;
  }

  destroy(): void {
    this.canvas.removeEventListener("mousemove", this.onMove);
    this.canvas.removeEventListener("mouseleave", this.onLeave);
    this.tooltip?.remove();
    this.tooltip = null;
  }

  async toPng(scale = 1): Promise<Blob> {
    return await new Promise((resolve, reject) => {
      const target = document.createElement("canvas");
      target.width = this.canvas.width * scale;
      target.height = this.canvas.height * scale;
      const tctx = target.getContext("2d");
      if (!tctx) return reject(new Error("[anytime-chart] toPng context unavailable"));
      tctx.drawImage(this.canvas, 0, 0, target.width, target.height);
      target.toBlob((b) => (b ? resolve(b) : reject(new Error("[anytime-chart] toBlob failed"))), "image/png");
    });
  }

  private cssSize(): { width: number; height: number; dpr: number } {
    const dpr = this.canvas.width / (this.canvas.clientWidth || this.canvas.width || 1);
    return {
      width: this.canvas.clientWidth || this.canvas.width,
      height: this.canvas.clientHeight || this.canvas.height,
      dpr: Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
    };
  }

  private draw(): void {
    if (!this.spec) return;
    const { width, height, dpr } = this.cssSize();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    const theme = getChartTheme(this.mode, this.palette);
    this.layout = renderChart(this.ctx, { x: 0, y: 0, width, height }, this.spec, theme);
  }

  private handleHover(e: MouseEvent): void {
    if (!this.layout || this.spec?.options?.valueLabels === "always") return;
    const r = this.canvas.getBoundingClientRect();
    const hit = hitTest(this.layout, e.clientX - r.left, e.clientY - r.top);
    if (!hit) return this.hideTooltip();
    this.showTooltip(e.clientX, e.clientY, `${hit.label}: ${formatValue(hit.value)}`);
  }

  private ensureTooltip(): HTMLDivElement {
    if (this.tooltip) return this.tooltip;
    const el = document.createElement("div");
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;padding:2px 6px;border-radius:4px;" +
      "font:11px sans-serif;background:#1E1E22;color:#fff;white-space:nowrap;transform:translate(-50%,-130%)";
    document.body.appendChild(el);
    this.tooltip = el;
    return el;
  }

  private showTooltip(x: number, y: number, text: string): void {
    const el = this.ensureTooltip();
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = "block";
  }

  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.display = "none";
  }
}
