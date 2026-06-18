/** 数値スケールと目盛り計算（純粋関数）。 */

/** domain [d0,d1] を range [r0,r1] へ線形写像する関数を返す。 */
export function linearScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/**
 * 0 を下限に固定した「綺麗な」目盛り列を返す（ガイドブック: 原点は原則 0）。
 * 返り値は昇順、先頭は 0（min が正のときも）、末尾は max 以上。
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.min(0, min);
  const span = max - lo || 1;
  const rawStep = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const niceNorm = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const step = niceNorm * magnitude;
  const ticks: number[] = [];
  for (let v = lo; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}
