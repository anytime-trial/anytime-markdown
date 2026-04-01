/**
 * 線形スケール関数を返す。
 * domain [domainMin, domainMax] -> range [rangeMin, rangeMax]
 * domain が等しい場合は range の中央値を返す。
 */
export function linearScale(
  domainMin: number, domainMax: number,
  rangeMin: number, rangeMax: number,
): (value: number) => number {
  if (domainMin === domainMax) {
    const mid = (rangeMin + rangeMax) / 2;
    return () => mid;
  }
  return (value: number): number => {
    const t = Math.max(0, Math.min(1, (value - domainMin) / (domainMax - domainMin)));
    return rangeMin + t * (rangeMax - rangeMin);
  };
}

/** hex 色文字列をパースして [r, g, b] を返す */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** [r, g, b] を hex 色文字列に変換 */
function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/**
 * 2つの hex 色を t (0-1) で線形補間する。
 * t は [0, 1] にクランプされる。
 */
export function interpolateColor(colorA: string, colorB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseHex(colorA);
  const [r2, g2, b2] = parseHex(colorB);
  return toHex(
    r1 + (r2 - r1) * clamped,
    g1 + (g2 - g1) * clamped,
    b1 + (b2 - b1) * clamped,
  );
}
