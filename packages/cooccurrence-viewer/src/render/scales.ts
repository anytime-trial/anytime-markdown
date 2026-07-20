export const RADIUS_MIN = 28;
export const RADIUS_MAX = 64;
export const LINK_WIDTH_MIN = 1;
export const LINK_WIDTH_MAX = 6;
export const LABEL_FONT_MIN = 10;
export const LABEL_FONT_MAX = 14;
export const NODE_STROKE_NORMAL = 2;
export const NODE_STROKE_SUBJECT = 4;

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
