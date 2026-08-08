/**
 * 知識グラフの視野駆動配信で「取り直すほど視野が変わったか」を判定する（純粋関数）。
 *
 * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md §3.2
 */

export interface ViewportBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 倍率がこの比を超えて変わったら取り直す（拡大 / 縮小）。 */
const SCALE_CHANGE_RATIO = 1.25;
/** 中心が前回の幅・高さのこの割合を超えて動いたら取り直す。 */
const CENTER_SHIFT_RATIO = 0.25;

function width(box: ViewportBox): number {
  return box.maxX - box.minX;
}

function height(box: ViewportBox): number {
  return box.maxY - box.minY;
}

/**
 * 前回取得した視野 `last` に対し、`next` がデータを取り直すに値する変化かを返す。
 *
 * デバウンスは「操作が終わったか」しか見ない。わずかな移動でも取得が走るのを防ぐため、
 * 変化の大きさはここで別途見る。判定は倍率と中心の移動の 2 つだけで、面積比だけを見ないのは
 * 同じ面積のまま別の場所へ移動した視野（純粋なパン）を取りこぼすため。
 */
export function shouldRefetchForViewport(last: ViewportBox | null, next: ViewportBox): boolean {
  if (last === null) return true;
  const lastWidth = width(last);
  const lastHeight = height(last);
  // 退化した矩形（幅 0）を基準にすると比が発散する。基準にできないので取り直す
  if (!(lastWidth > 0) || !(lastHeight > 0)) return true;

  const scaleX = width(next) / lastWidth;
  const scaleY = height(next) / lastHeight;
  const scaled = [scaleX, scaleY].some(
    (ratio) => ratio > SCALE_CHANGE_RATIO || ratio < 1 / SCALE_CHANGE_RATIO,
  );
  if (scaled) return true;

  const dx = Math.abs((next.minX + next.maxX) / 2 - (last.minX + last.maxX) / 2);
  const dy = Math.abs((next.minY + next.maxY) / 2 - (last.minY + last.maxY) / 2);
  return dx > lastWidth * CENTER_SHIFT_RATIO || dy > lastHeight * CENTER_SHIFT_RATIO;
}

/** クエリ文字列に載せる形（`minX,minY,maxX,maxY`）。サーバの parseBbox と対。 */
export function formatBboxParam(box: ViewportBox): string {
  return [box.minX, box.minY, box.maxX, box.maxY].map((n) => String(n)).join(',');
}
