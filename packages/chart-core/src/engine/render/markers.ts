import type { ChartMarker, ChartTheme, Rect } from "../../types";

/**
 * カテゴリ位置にイベント印（縦線 / 上端ドット）を重ねて描く。
 * x はカテゴリバンドの中心に合わせる（line/bar/combo と同じ整列）。
 */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  categories: ReadonlyArray<string>,
  markers: ReadonlyArray<ChartMarker>,
  theme: ChartTheme,
): void {
  const bandW = plot.width / Math.max(1, categories.length);
  for (const m of markers) {
    const x = plot.x + bandW * (m.xIndex + 0.5);
    const color = m.color ?? theme.palette.label;
    ctx.save();
    if (m.style === "point") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, plot.y + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, plot.y);
      ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.height);
      ctx.stroke();
    }
    if (m.label) {
      ctx.fillStyle = theme.palette.label;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(m.label, x, plot.y - 1);
    }
    ctx.restore();
  }
}
