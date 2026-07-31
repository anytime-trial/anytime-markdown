/**
 * @jest-environment jsdom
 */
import type { CooccurrenceSkin, ThemeMode } from '../types';
import {
  applyCooccurrenceThemeVars,
  CLUSTER_COLORS_OZ,
  CLUSTER_COLORS_STANDARD,
} from '../theme/applyCooccurrenceThemeVars';

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

/** WCAG 2.x の相対輝度。 */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.x のコントラスト比（1〜21）。 */
function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** スキンとモードに実際に適用される背景色を、テーマ変数の適用結果から取る。 */
function backgroundOf(skin: CooccurrenceSkin, mode: ThemeMode): string {
  const el = document.createElement('div');
  applyCooccurrenceThemeVars(el, mode, skin);
  return el.style.getPropertyValue('--cooc-bg');
}

const FAMILY_COUNT = 4;

/**
 * 現行パレットが両背景を通じて到達している最低コントラスト比（実測値の切り下げ）。
 *
 * 絶対値としては WCAG 1.4.11 の 3:1 に届かない。ライト/ダーク共通という制約
 * （`applyCooccurrenceThemeVars` の Why not）を保つ限り、淡色側はライト背景で沈む。
 * ここで固定するのは「現状より悪くしない」という下限である。
 *
 * Why not 差し替え前の最悪値（標準 1.01 / OZ 1.30）を下限にするか: 差し替え前は
 * ほぼ白の `#E3F2FD` がライト背景でほぼ見えておらず、そこを下限にすると
 * 「ほぼ白の色を足す」変更を素通しする（退行注入で実際に素通りした）。
 */
const CONTRAST_FLOOR: Record<string, number> = { 標準: 1.5, OZ: 1.33 };

/**
 * 明度の許容帯。彩度だけでは白潰れを検知できない
 * （HSL の彩度は白に近づくと 1.0 へ張り付くため、ほぼ白の色が彩度検査を通過する）。
 */
const LIGHTNESS_BAND = { min: 0.3, max: 0.86 };

const PALETTES: ReadonlyArray<readonly [string, readonly string[], CooccurrenceSkin]> = [
  ['標準', CLUSTER_COLORS_STANDARD, 'standard'],
  ['OZ', CLUSTER_COLORS_OZ, 'oz'],
];

describe('クラスタパレットは 4 色相系統 × 2 段', () => {
  test.each(PALETTES)('%s: 8 色ある', (_name, palette) => {
    expect(palette).toHaveLength(FAMILY_COUNT * 2);
  });

  /**
   * かつてのライト用パレットは彩度を落とした暗色系で、8 色のうち 4 色がグレー寄りに潰れて
   * 識別できなかった。明度の帯も併せて見るのは、彩度だけでは白潰れを止められないため。
   */
  test.each(PALETTES)('%s: すべての色が彩度を持ち、明度が帯の中にある', (_name, palette) => {
    for (const hex of palette) {
      const { s, l } = toHsl(hex);
      expect(s).toBeGreaterThan(0.2);
      expect(l).toBeGreaterThanOrEqual(LIGHTNESS_BAND.min);
      expect(l).toBeLessThanOrEqual(LIGHTNESS_BAND.max);
    }
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

  /**
   * 系統内の 2 色は、ライト背景では濃側・ダーク背景では淡側が識別を担う。
   * パレットはライト/ダーク共通なので、片方の背景で沈む色をもう片方の色が補う形でしか
   * 両モードを成立させられない。この役割が入れ替わると、どちらかのモードで系統ごと沈む。
   */
  test.each(PALETTES)('%s: 系統内の濃側がライト、淡側がダークで高コントラストになる', (_name, palette, skin) => {
    const light = backgroundOf(skin, 'light');
    const dark = backgroundOf(skin, 'dark');
    for (let family = 0; family < FAMILY_COUNT; family += 1) {
      const [darker, lighter] = [palette[family * 2], palette[family * 2 + 1]];
      expect(contrastRatio(darker, light)).toBeGreaterThan(contrastRatio(lighter, light));
      expect(contrastRatio(lighter, dark)).toBeGreaterThan(contrastRatio(darker, dark));
    }
  });

  /**
   * 絶対コントラストは既知の未達（WCAG 1.4.11 の 3:1 に届かない色がある）。
   * ここで止めるのは退行だけで、現行より沈む色へ踏み込む変更を落とす。
   */
  test.each(PALETTES)('%s: 最低コントラストが現行の下限を割らない', (_name, palette, skin) => {
    const backgrounds = [backgroundOf(skin, 'light'), backgroundOf(skin, 'dark')];
    const worst = Math.min(...palette.flatMap((hex) => backgrounds.map((bg) => contrastRatio(hex, bg))));
    expect(worst).toBeGreaterThanOrEqual(CONTRAST_FLOOR[_name]);
  });
});
