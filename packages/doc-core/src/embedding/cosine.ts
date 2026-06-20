/**
 * コサイン類似度（純粋関数）。意味検索の top-k スコアリングに使う。
 */

/** a・b のコサイン類似度（-1..1）。長さ不一致は短い方に合わせる。ゼロベクトルは 0。 */
export function cosineSim(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
