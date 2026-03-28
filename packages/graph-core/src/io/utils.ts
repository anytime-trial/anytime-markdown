/** XML 特殊文字のエスケープ */
export function escapeXml(s: string): string {
  return s.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;').replaceAll(/"/g, '&quot;').replaceAll(/'/g, '&apos;');
}

/** rgba/hex 色文字列から # 付き hex を返す。アルファ値は別途 `toAlpha` で取得する */
export function toHexColor(color: string): string {
  if (color.startsWith('#')) return color;
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (match) {
    const r = Number.parseInt(match[1], 10);
    const g = Number.parseInt(match[2], 10);
    const b = Number.parseInt(match[3], 10);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  }
  return color;
}

/** rgba 色文字列からアルファ値（0-100）を返す。アルファなしまたは hex の場合は 100 を返す */
export function toAlpha(color: string): number {
  const match = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(color);
  if (match) return Math.round(Number.parseFloat(match[1]) * 100);
  return 100;
}
