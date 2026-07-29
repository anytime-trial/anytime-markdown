import { ARROW_HEAD_ANGLE, ARROW_HEAD_MAX, ARROW_HEAD_MIN, ARROW_HEAD_RATIO, ARROW_TIP_GAP } from './scales';

export interface ArrowPoint {
  x: number;
  y: number;
}

export interface ArrowHead {
  /** 矢頭の頂点。向き先の円周の手前に置く。 */
  tip: ArrowPoint;
  left: ArrowPoint;
  right: ArrowPoint;
}

/**
 * 線幅から矢頭の長さを決める。下限・上限で頭打ちにする（設計書 §3.1）。
 *
 * Why not 線幅にそのまま比例させるか: 太さは強度の符号、矢頭は向きの符号であり、別々に読める
 * 必要がある。最も細い共起で矢頭が潰れると、符号が 1 つ失われる。
 */
export function arrowHeadLength(lineWidth: number): number {
  return Math.min(ARROW_HEAD_MAX, Math.max(ARROW_HEAD_MIN, lineWidth * ARROW_HEAD_RATIO));
}

/**
 * source から target へ向かう矢頭の 3 点を返す。座標は図と同じ world 座標系で扱う。
 *
 * @param targetRadius 向き先の円の半径。矢頭を円に重ねない（設計書 §3.1）。
 *
 * Why not Canvas の描画側で直接計算するか: Canvas の描画結果は jsdom から検査できず、矢頭が
 * 円に重なる・向きが反転するといった退行を単体で捕まえられない。幾何だけを純関数へ出す。
 */
export function arrowHeadPoints(
  source: ArrowPoint,
  target: ArrowPoint,
  targetRadius: number,
  lineWidth: number,
): ArrowHead {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  // 端点が重なると向きが定まらない。0 除算で NaN を作らず、右向きを既定にする。
  const ux = distance === 0 ? 1 : dx / distance;
  const uy = distance === 0 ? 0 : dy / distance;
  const tip = {
    x: target.x - ux * (targetRadius + ARROW_TIP_GAP),
    y: target.y - uy * (targetRadius + ARROW_TIP_GAP),
  };
  const length = arrowHeadLength(lineWidth);
  const angle = Math.atan2(uy, ux);
  return {
    tip,
    left: {
      x: tip.x - length * Math.cos(angle - ARROW_HEAD_ANGLE),
      y: tip.y - length * Math.sin(angle - ARROW_HEAD_ANGLE),
    },
    right: {
      x: tip.x - length * Math.cos(angle + ARROW_HEAD_ANGLE),
      y: tip.y - length * Math.sin(angle + ARROW_HEAD_ANGLE),
    },
  };
}
