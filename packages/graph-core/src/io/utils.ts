/** XML 特殊文字のエスケープ */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** rgba/hex 色文字列から # 付き hex を返す。アルファ値は別途 `toAlpha` で取得する */
export function toHexColor(color: string): string {
  if (color.startsWith('#')) return color;
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  }
  return color;
}

/** rgba 色文字列からアルファ値（0-100）を返す。アルファなしまたは hex の場合は 100 を返す */
export function toAlpha(color: string): number {
  const match = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  if (match) return Math.round(parseFloat(match[1]) * 100);
  return 100;
}
