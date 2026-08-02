/**
 * デザイン編集モードのドロップ位置判定。
 *
 * 描画済みの子要素の矩形とポインタ座標から「コンテナの何番目に挿入するか」を決める。
 * DOM もイベントも触らない純粋関数にして、レイアウトを持たない jsdom でも並び方向ごとの
 * 判定を検証できるようにしている。
 */

export interface DropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DropCandidate {
  path: string;
  rect: DropRect;
}

export interface DropPoint {
  x: number;
  y: number;
}

export interface DropTarget {
  index: number;
}

export type DropDirection = "vertical" | "horizontal";

/** どの兄弟の手前にもならない場合は末尾（= 候補数）を返す。 */
export function resolveDropTarget(
  candidates: DropCandidate[],
  point: DropPoint,
  direction: DropDirection,
): DropTarget {
  for (const [index, candidate] of candidates.entries()) {
    const middle =
      direction === "horizontal"
        ? candidate.rect.left + candidate.rect.width / 2
        : candidate.rect.top + candidate.rect.height / 2;
    const coordinate = direction === "horizontal" ? point.x : point.y;
    if (coordinate < middle) return { index };
  }
  return { index: candidates.length };
}
