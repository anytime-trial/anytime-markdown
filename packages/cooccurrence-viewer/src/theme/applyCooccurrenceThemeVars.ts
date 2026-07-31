/**
 * @file 共起ビューアのテーマ変数とクラスタパレット。
 *
 * クラスタパレットは「4 色相系統 × 2 段」で並べる。添字 0-1 / 2-3 / 4-5 / 6-7 がそれぞれ 1 系統で、
 * `.cooc.json` のクラスタをカテゴリごとに 2 つずつ並べると、同じカテゴリのクラスタが同系統の色で描かれる。
 *
 * Why not クラスタ側に色（あるいはカテゴリ）を持たせるか: `.cooc.json` は語・共起・クラスタという
 * 図の意味だけを持ち、見た目はスキンが決める（設計書 §2.1）。ファイルに色を書けるようにすると、
 * 同じファイルがスキンごとに違う正解を持つ。色の割当はクラスタの並び順だけで決まり、
 * `readTheme.ts` の `clusterColorVarName` が単一の正である。
 *
 * SHORTCUT: 系統をパレットの並び順で表す. ceiling: クラスタが 9 個以上あると
 * `clusterColorVarName` の `% 8` で添字が巻き戻り、9 個目以降は系統の対応が崩れる.
 * upgrade: 9 クラスタ以上の `.cooc.json` を扱うようになったら 4 系統 × 3 段の 12 色へ広げる.
 */
import type { CooccurrenceSkin, ThemeMode } from '../types';

/**
 * 標準スキンのクラスタパレット（ライト/ダーク共通）。
 *
 * 色は design.md のトークンを流用する（`error` / `primary.dark` / `primary.main` /
 * `warning`（紫苑）/ `adm-tip` / `success`）。系統内の 2 段は明度で分ける。
 *
 * Why not アンバーゴールド `#E8A012` を残すか: design.md §1 が「すべての CTA・強調に使う
 * 唯一の差し色。装飾には使わない」と定めており、`--cooc-accent` と同色のクラスタができる。
 *
 * Why not モード別に分けるか: 同じグラフをモードを切り替えて見たときに語の色まで変わると、
 * 色でクラスタを覚えられない。かつてのライト用パレットは彩度を落とした暗色系で、8 色のうち
 * 4 色がグレー寄り（#3D4A52 / #4A5A6B / #8A918F / #222A30）に潰れて識別しにくかった。
 */
export const CLUSTER_COLORS_STANDARD = [
  '#F44336', // 赤系・濃（design.md error）
  '#FF8A80', // 赤系・淡
  '#42A5F5', // 青系・濃（design.md primary.dark / info）
  '#90CAF9', // 青系・淡（design.md primary.main）
  '#6A3FB5', // 紫系・濃
  '#9B7BD8', // 紫系・淡（design.md warning 紫苑）
  '#238636', // 緑系・濃（design.md adm-tip）
  '#66BB6A', // 緑系・淡（design.md success）
];

/**
 * OZ スキンのキャンディパレット（ライト/ダーク共通）。
 *
 * 標準スキンと同じ「4 系統 × 2 段」で並べる。スキンを切り替えても同じカテゴリのクラスタが
 * 同系統に見えるようにするためで、色相の並び（赤・青・紫・緑）も標準スキンと揃える。
 *
 * Why not モード別に分けるか: OZ の球はどちらのモードでも同じ高彩度色で浮かぶのが
 * 視覚言語の要（白の OZ / 夜の OZ の差は空間側の色で出す。要件書 §2.2・§2.3）。
 */
export const CLUSTER_COLORS_OZ = [
  '#FF6B6B', // 赤系・濃
  '#FFB3B3', // 赤系・淡
  '#4FC3F7', // 青系・濃
  '#A7DEF9', // 青系・淡
  '#7E57C2', // 紫系・濃
  '#B39DDB', // 紫系・淡
  '#2FB170', // 緑系・濃
  '#7ADFA8', // 緑系・淡
];

const OZ_VARS_LIGHT: Record<string, string> = {
  // v2: シーン背景（ozRenderer の paletteOf）と同じ淡ラベンダー白。純白はピル地に譲る。
  '--cooc-bg': '#F4F5FB',
  '--cooc-surface': '#FFFFFF',
  '--cooc-text': '#1B2A4A',
  '--cooc-text-secondary': '#5A6B8C',
  '--cooc-text-disabled': '#9AA7C4',
  '--cooc-divider': 'rgba(27,42,74,0.12)',
  '--cooc-action-hover': 'rgba(27,42,74,0.05)',
  '--cooc-action-selected': 'rgba(27,42,74,0.10)',
  '--cooc-primary': '#4FC3F7',
  '--cooc-accent': '#FF6B6B',
  '--cooc-link': 'rgba(91,124,153,0.35)',
  '--cooc-muted-alpha': '0.18',
  '--cooc-tooltip-bg': '#FFFFFF',
};

const OZ_VARS_DARK: Record<string, string> = {
  '--cooc-bg': '#0A0F2E',
  '--cooc-surface': '#12183F',
  '--cooc-text': 'rgba(255,255,255,0.92)',
  '--cooc-text-secondary': 'rgba(255,255,255,0.62)',
  '--cooc-text-disabled': 'rgba(255,255,255,0.45)',
  '--cooc-divider': 'rgba(255,255,255,0.14)',
  '--cooc-action-hover': 'rgba(255,255,255,0.08)',
  '--cooc-action-selected': 'rgba(255,255,255,0.16)',
  '--cooc-primary': '#4FC3F7',
  '--cooc-accent': '#FFD54F',
  '--cooc-link': 'rgba(160,190,255,0.38)',
  '--cooc-muted-alpha': '0.2',
  '--cooc-tooltip-bg': '#12183F',
};

export function applyCooccurrenceThemeVars(
  target: HTMLElement,
  mode: ThemeMode,
  skin: CooccurrenceSkin = 'standard',
): void {
  const vars: Record<string, string> = skin === 'oz'
    ? (mode === 'dark' ? OZ_VARS_DARK : OZ_VARS_LIGHT)
    : mode === 'dark'
    ? {
      '--cooc-bg': '#0D1117',
      '--cooc-surface': '#121212',
      '--cooc-text': 'rgba(255,255,255,0.87)',
      '--cooc-text-secondary': 'rgba(255,255,255,0.60)',
      '--cooc-text-disabled': 'rgba(255,255,255,0.45)',
      '--cooc-divider': 'rgba(255,255,255,0.12)',
      '--cooc-action-hover': 'rgba(255,255,255,0.08)',
      '--cooc-action-selected': 'rgba(255,255,255,0.16)',
      '--cooc-primary': '#90CAF9',
      '--cooc-accent': '#E8A012',
      '--cooc-link': 'rgba(255,255,255,0.34)',
      '--cooc-muted-alpha': '0.2',
      '--cooc-tooltip-bg': '#121212',
    }
    : {
      '--cooc-bg': '#F2EFE8',
      '--cooc-surface': '#FBF9F3',
      '--cooc-text': '#1F1E1C',
      '--cooc-text-secondary': '#5C5A55',
      '--cooc-text-disabled': '#A9A6A0',
      '--cooc-divider': 'rgba(31,30,28,0.12)',
      '--cooc-action-hover': 'rgba(31,30,28,0.04)',
      '--cooc-action-selected': 'rgba(31,30,28,0.08)',
      '--cooc-primary': '#3D4A52',
      '--cooc-accent': '#E8A012',
      '--cooc-link': 'rgba(31,30,28,0.32)',
      '--cooc-muted-alpha': '0.18',
      '--cooc-tooltip-bg': '#FBF9F3',
    };

  for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value);
  const clusters = skin === 'oz' ? CLUSTER_COLORS_OZ : CLUSTER_COLORS_STANDARD;
  clusters.forEach((value, index) => target.style.setProperty(`--cooc-cluster-${index}`, value));
}
