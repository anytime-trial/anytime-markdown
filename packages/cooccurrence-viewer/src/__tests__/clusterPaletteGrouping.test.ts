/**
 * @jest-environment node
 */
import { CLUSTER_COLORS_OZ, CLUSTER_COLORS_STANDARD } from '../theme/applyCooccurrenceThemeVars';

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function toHsl(hex: string): Hsl {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  if (max === r) return { h: 60 * (((g - b) / delta + 6) % 6), s, l };
  if (max === g) return { h: 60 * ((b - r) / delta + 2), s, l };
  return { h: 60 * ((r - g) / delta + 4), s, l };
}

/** 色相環上の最短距離（0〜180 度）。 */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const FAMILY_COUNT = 4;

const PALETTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['標準', CLUSTER_COLORS_STANDARD],
  ['OZ', CLUSTER_COLORS_OZ],
];

describe('クラスタパレットは 4 色相系統 × 2 段', () => {
  test.each(PALETTES)('%s: 8 色ある', (_name, palette) => {
    expect(palette).toHaveLength(FAMILY_COUNT * 2);
  });

  /**
   * かつてのライト用パレットは彩度を落とした暗色系で、8 色のうち 4 色がグレー寄りに潰れて
   * 識別できなかった。同じ状態へ戻す変更をここで止める。
   */
  test.each(PALETTES)('%s: すべての色が彩度を持つ', (_name, palette) => {
    for (const hex of palette) expect(toHsl(hex).s).toBeGreaterThan(0.2);
  });

  /**
   * 同じカテゴリのクラスタを隣り合う添字へ置くと同系統の色で描かれる、という契約。
   * 色相が離れると系統に見えず、明度が近すぎると系統内の 2 クラスタを見分けられない。
   */
  test.each(PALETTES)('%s: 系統内は色相が近く、明度が離れている', (_name, palette) => {
    for (let family = 0; family < FAMILY_COUNT; family += 1) {
      const dark = toHsl(palette[family * 2]);
      const light = toHsl(palette[family * 2 + 1]);
      expect(hueDistance(dark.h, light.h)).toBeLessThanOrEqual(20);
      expect(light.l - dark.l).toBeGreaterThanOrEqual(0.1);
    }
  });

  test.each(PALETTES)('%s: 系統どうしは色相が離れている', (_name, palette) => {
    const hues = Array.from({ length: FAMILY_COUNT }, (_, family) => toHsl(palette[family * 2]).h);
    for (let a = 0; a < hues.length; a += 1) {
      for (let b = a + 1; b < hues.length; b += 1) {
        expect(hueDistance(hues[a], hues[b])).toBeGreaterThanOrEqual(45);
      }
    }
  });
});
