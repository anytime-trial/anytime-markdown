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
  yAxisLabel?: string,
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

  // 左 Y 軸ラベル（縦書き）
  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = palette.text;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(plot.x - 38, plot.y + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
  }
}

/**
 * 第2Y軸（右軸）の値ラベルを右端に描く。グリッドは左軸が担うため引かない。
 */
export function drawRightAxis(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  ticks: ReadonlyArray<number>,
  rightScale: (v: number) => number,
  theme: ChartTheme,
  rightAxisLabel?: string,
): void {
  ctx.save();
  ctx.fillStyle = theme.palette.label;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of ticks) {
    ctx.fillText(formatValue(t), plot.x + plot.width + 6, Math.round(rightScale(t)));
  }
  ctx.restore();

  // 右 Y 軸ラベル（縦書き）
  if (rightAxisLabel) {
    ctx.save();
    ctx.fillStyle = theme.palette.text;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(plot.x + plot.width + 38, plot.y + plot.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(rightAxisLabel, 0, 0);
    ctx.restore();
  }
}

/**
 * 横棒グラフ用の軸とグリッドを描く（数量軸＝下/x、分類軸＝左/y）。
 * 縦グリッド（値の目盛）＋下に値ラベル、左に分類ラベルを配置する。
 */
export function drawAxesHorizontal(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  ticks: ReadonlyArray<number>,
  xScale: (v: number) => number,
  categoryLabels: ReadonlyArray<string>,
  theme: ChartTheme,
): void {
  const { palette } = theme;

  // 縦グリッド + 値ラベル（下）
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.fillStyle = palette.label;
  ctx.lineWidth = 1;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of ticks) {
    const x = Math.round(xScale(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.height);
    ctx.stroke();
    ctx.fillText(formatValue(t), x, plot.y + plot.height + 6);
  }
  ctx.restore();

  // 分類ラベル（左・カテゴリ等間隔）
  if (categoryLabels.length > 0) {
    ctx.save();
    ctx.fillStyle = palette.label;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const step = plot.height / categoryLabels.length;
    categoryLabels.forEach((label, i) => {
      const cy = plot.y + step * (i + 0.5);
      ctx.fillText(label, plot.x - 8, cy);
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
