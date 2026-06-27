/**
 * 本文カラム幅（measure = 行長）のプリセットと em 値マッピング（React 非依存・純粋関数）。
 *
 * measure を px でなく `em` 基準で定義することで、本文フォントサイズを変えても
 * 1 行あたりの全角字数が一定に保たれ、可読性が崩れない。
 *
 * 可読推奨域（和文 35〜45 全角字 / 欧文 45〜75 字）に沿って次の 4 段を用意する。
 * - focus    : 約 40em（没入して読む。最も狭い）
 * - standard : 約 46em（既定。通常の読み書き）
 * - wide     : 約 60em（表・コード主体の文書。従来幅に近い）
 * - full     : 上限なし（画面=コンテナ幅いっぱい。表・コードを最大限広げる）
 */

export type MeasurePreset = "focus" | "standard" | "wide" | "full";

/** プリセット → CSS `max-width` 値（focus/standard/wide は em 基準、`full` は上限撤廃の `none`）。 */
const MEASURE_MAX_WIDTH: Record<MeasurePreset, string> = {
  focus: "40em",
  standard: "46em",
  wide: "60em",
  full: "none",
};

/** 切替 UI で提示する順序（集中 → 標準 → 広い → 画面幅いっぱい）。 */
export const MEASURE_PRESETS: readonly MeasurePreset[] = ["focus", "standard", "wide", "full"];

/** 既定プリセット（CSS フォールバックと一致させる）。 */
export const DEFAULT_MEASURE: MeasurePreset = "standard";

/**
 * プリセット名を CSS `max-width` 値（focus/standard/wide は em 基準、`full` は `none`）へ変換する。
 * 未知値・undefined（旧 localStorage に measure 未設定のケース等）は既定（standard）へフォールバックする。
 */
export function measureToCssMaxWidth(preset: MeasurePreset | string | undefined): string {
  return MEASURE_MAX_WIDTH[preset as MeasurePreset] ?? MEASURE_MAX_WIDTH[DEFAULT_MEASURE];
}
