export const RADIUS_MIN = 28;
export const RADIUS_MAX = 64;
export const LINK_WIDTH_MIN = 1;
export const LINK_WIDTH_MAX = 6;
export const LABEL_FONT_MIN = 10;
export const LABEL_FONT_MAX = 14;
export const NODE_STROKE_NORMAL = 2;
export const NODE_STROKE_SUBJECT = 4;
/** 矢頭の長さの下限・上限。線幅に比例させつつ、細い共起でも向きが読める大きさを保つ（設計書 §3.1）。 */
export const ARROW_HEAD_MIN = 6;
export const ARROW_HEAD_MAX = 14;
/** 線幅に対する矢頭の長さの比。 */
export const ARROW_HEAD_RATIO = 2.6;
/** 矢頭の開き（中心線からの半角・ラジアン）。 */
export const ARROW_HEAD_ANGLE = 0.42;
/** 矢頭の頂点と円周の間に空ける距離。円に重ねると輪郭と混ざって読めない。 */
export const ARROW_TIP_GAP = 2;

export function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return (value - min) / (max - min);
}

export function radiusForFrequency(frequency: number, min: number, max: number): number {
  const t = Math.sqrt(normalize(frequency, min, max));
  return RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * t;
}

export function widthForStrength(strength: number, min: number, max: number): number {
  return LINK_WIDTH_MIN + (LINK_WIDTH_MAX - LINK_WIDTH_MIN) * normalize(strength, min, max);
}

export function labelFontSizeForRadius(radius: number): number {
  return Math.max(LABEL_FONT_MIN, Math.min(LABEL_FONT_MAX, Math.round((radius / RADIUS_MAX) * LABEL_FONT_MAX)));
}
