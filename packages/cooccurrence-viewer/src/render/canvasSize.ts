import type { CanvasSize } from '../types';

/**
 * canvas のバッキングストアを親要素の寸法へ合わせ、CSS ピクセル単位の表示サイズを返す。
 *
 * `canvas.width` への代入は、同じ値であっても内容を消す。呼び出したら必ず描き直すこと。
 *
 * Why not 各所で同じ計算を書くか: 図・ミニマップ・スケジューラの 3 箇所で必要になる。
 * devicePixelRatio の扱いが 1 箇所でもずれると、その canvas だけ描画位置が dpr 倍へ飛ぶ。
 */
export function updateCanvasSize(canvas: HTMLCanvasElement): CanvasSize {
  const parent = canvas.parentElement;
  const width = parent?.clientWidth ?? 0;
  const height = parent?.clientHeight ?? 0;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  return { width, height };
}
