import type { ChartSpec, ChartTheme, PlottedPoint, Rect } from "../../types";
import { formatValue } from "./style";

const START_ANGLE = -Math.PI / 2; // 12 時起点
const TWO_PI = Math.PI * 2;

/**
 * 円グラフ（pie / doughnut）を描く。
 * categories = スライス分類、series[0].values = 各スライス値。12 時起点・時計回り、
 * スライスごとにパレット色。各スライスに「分類名 N%」ラベル。donut 時は中心をくり抜き
 * 中央に全体総量を表示する。total<=0（空データ）は muted のプレースホルダー円で見た目とサイズを保つ。
 * 返り値はスライス重心の hit-test 点。
 */
export function drawPie(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  spec: ChartSpec,
  theme: ChartTheme,
  options: { donut?: boolean },
): PlottedPoint[] {
  const { palette } = theme;
  const categories = spec.categories ?? [];
  const rawValues = spec.series[0]?.values ?? [];
  const values = rawValues.map((v) => (v == null || !Number.isFinite(v) || v < 0 ? 0 : v));
  const total = values.reduce((a, b) => a + b, 0);

  // legend="none" はスライス外周ラベルを描かない（コンパクト表示。色＋中央総量＋hover で識別）。
  const showLabels = spec.options?.legend !== "none";
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.max(8, (Math.min(rect.width, rect.height) / 2) * (showLabels ? 0.62 : 0.82));
  const points: PlottedPoint[] = [];

  // total<=0 でも無描画にせず muted のプレースホルダー円を描く
  // （空データ時にカード間でグラフサイズが揃わなくなるのを防ぐ。donut 時は後段で中央に 0 が入る）。
  if (total <= 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette.muted;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  let angle = START_ANGLE;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const slice = (v / total) * TWO_PI;
    const end = angle + slice;
    const color = palette.series[i % palette.series.length];

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, end);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ラベル「分類名 N%」（スライス外側中点）
    const mid = angle + slice / 2;
    if (showLabels) {
      const pct = Math.round((v / total) * 100);
      const lx = cx + Math.cos(mid) * radius * 1.15;
      const ly = cy + Math.sin(mid) * radius * 1.15;
      ctx.save();
      ctx.fillStyle = palette.label;
      ctx.font = "11px sans-serif";
      ctx.textAlign = Math.cos(mid) >= 0 ? "left" : "right";
      ctx.textBaseline = "middle";
      const label = categories[i] ? `${categories[i]} ${pct}%` : `${pct}%`;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }

    // hit-test 点（スライス重心）
    points.push({
      seriesIndex: 0,
      dataIndex: i,
      cx: cx + Math.cos(mid) * radius * 0.6,
      cy: cy + Math.sin(mid) * radius * 0.6,
      value: v,
    });
    angle = end;
  });

  // donut: 中心をくり抜き全体総量を表示
  if (options.donut) {
    ctx.save();
    ctx.fillStyle = palette.background;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = palette.text;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatValue(total), cx, cy);
    ctx.restore();
  }

  return points;
}
