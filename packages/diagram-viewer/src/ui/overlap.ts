/**
 * 枠に貼り付く層どうしの重なり判定。
 *
 * 縁の ＋／−（`gutter.ts`）と空いた升目の ＋（`cellAdders.ts`）が、見え方の操作の区画と同じ
 * 判定を読むために置く。層ごとに書くと、区画を動かした日に片方だけが古い位置のまま残り、
 * 隠れたボタンが押せないまま出続ける。
 */

/** 枠の中で別のものが載っている場所（枠の左上を原点とする px）。 */
export interface BlockedBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * 中心 `(x, y)`・半径 `half` の丸いボタンが、その場所に掛かるか。
 *
 * 掛かるボタンは**描かない**。重ねると上に載っているほうが押下を取り、押したつもりと違う
 * 位置が動く（挿入も要素の追加も、取り消しが重い操作である）。
 */
export function overlapsBox(
  x: number,
  y: number,
  half: number,
  boxes: readonly BlockedBox[] | undefined,
): boolean {
  if (boxes === undefined) return false;
  return boxes.some((box) =>
    x + half >= box.left && x - half <= box.right && y + half >= box.top && y - half <= box.bottom);
}
