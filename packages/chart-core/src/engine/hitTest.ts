import type { ChartHit, ChartLayout } from "../types";

/** ヒット判定の最大距離（px）。 */
const HIT_RADIUS = 14;

/**
 * x 座標が属するカテゴリ（分類軸バンド）のインデックスを返す。プロット領域外/pie/カテゴリ無しは null。
 * 棒・折れ線・複合の「カテゴリ単位クリック」（日付ドリルダウン等）に使う。
 */
export function categoryIndexAt(layout: ChartLayout, x: number): number | null {
  const cats = layout.spec.categories?.length ?? 0;
  if (cats <= 0 || layout.spec.kind === "pie" || layout.spec.kind === "scatter") return null;
  const { x: px, width } = layout.plotRect;
  if (x < px || x > px + width) return null;
  const i = Math.floor((x - px) / (width / cats));
  return Math.min(cats - 1, Math.max(0, i));
}

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
