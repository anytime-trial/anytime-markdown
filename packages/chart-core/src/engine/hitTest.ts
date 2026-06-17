import type { ChartHit, ChartLayout } from "../types";

/** ヒット判定の最大距離（px）。 */
const HIT_RADIUS = 14;

/**
 * 座標 (x,y) に最も近い描画済みデータ点を返す。しきい値外なら null。
 * ツールチップ・フォーカス時の数値表示に使う。
 */
export function hitTest(layout: ChartLayout, x: number, y: number): ChartHit | null {
  let best: ChartHit | null = null;
  let bestDist = HIT_RADIUS * HIT_RADIUS;
  for (const p of layout.points) {
    const dx = p.cx - x;
    const dy = p.cy - y;
    const dist = dx * dx + dy * dy;
    if (dist <= bestDist) {
      bestDist = dist;
      const series = layout.spec.series[p.seriesIndex];
      const category = layout.spec.categories?.[p.dataIndex];
      const label = category ? `${series?.name ?? ""} ${category}` : (series?.name ?? "");
      best = { seriesIndex: p.seriesIndex, dataIndex: p.dataIndex, value: p.value, label };
    }
  }
  return best;
}
