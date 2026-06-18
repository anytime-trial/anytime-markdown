import type { ChartTheme, Rect } from "../../types";
import { formatValue } from "./style";

/**
 * 軸とグリッドを描く。ガイドブック準拠で水平グリッドのみ・最小限・淡色、軸囲み枠は描かない。
 * x ラベルはカテゴリを等間隔に配置する（line/bar 用）。
 */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  ticks: ReadonlyArray<number>,
  yScale: (v: number) => number,
  xLabels: ReadonlyArray<string>,
  theme: ChartTheme,
): void {
  const { palette } = theme;

  // 水平グリッド + y 目盛ラベル
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.fillStyle = palette.label;
  ctx.lineWidth = 1;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of ticks) {
    const y = Math.round(yScale(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.width, y);
    ctx.stroke();
    ctx.fillText(formatValue(t), plot.x - 8, y);
  }
  ctx.restore();

  // x ラベル（カテゴリ等間隔）
  if (xLabels.length > 0) {
    ctx.save();
    ctx.fillStyle = palette.label;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = plot.width / xLabels.length;
    xLabels.forEach((label, i) => {
      const cx = plot.x + step * (i + 0.5);
      ctx.fillText(label, cx, plot.y + plot.height + 6);
    });
    ctx.restore();
  }
}

/** タイトルを描く。 */
export function drawTitle(ctx: CanvasRenderingContext2D, rect: Rect, title: string, theme: ChartTheme): void {
  ctx.save();
  ctx.fillStyle = theme.palette.text;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, rect.x + 4, rect.y + 4);
  ctx.restore();
}
