import type { CodeGraphNodeDiffStatus } from '@anytime-markdown/trail-activity/codeGraphDiff';

/**
 * State Replay（前版との差分）の配色。
 *
 * 色だけに情報を載せない。3 色の緑・赤・橙は色覚多様性で区別できなくなるため、
 * ラベル接頭辞（`+` / `-` / `~`）と輪郭・サイズを併用する（仕様 §4.4）。
 */
export const DIFF_NODE_COLORS: Record<CodeGraphNodeDiffStatus, { dark: string; light: string }> = {
  // 追加: 緑
  added: { dark: '#66bb6a', light: '#2e7d32' },
  // 削除: 赤。対象時点に存在しないノードをベースラインから借りて描く（ゴースト）
  removed: { dark: '#ef5350', light: '#c62828' },
  // 変更: 橙。依存関係が変わったノード
  changed: { dark: '#ffa726', light: '#ef6c00' },
  // 不変: 減光した中立色。差分の側を読ませるため背景に退かせる
  unchanged: { dark: '#3A4046', light: '#D5D1C8' },
};

/** ラベル接頭辞。色を読めなくても区分が分かるようにする。 */
export const DIFF_LABEL_PREFIX: Record<CodeGraphNodeDiffStatus, string> = {
  added: '+ ',
  removed: '- ',
  changed: '~ ',
  unchanged: '',
};

export function diffNodeColor(status: CodeGraphNodeDiffStatus, isDark: boolean): string {
  const pair = DIFF_NODE_COLORS[status];
  return isDark ? pair.dark : pair.light;
}

/** 追加・削除エッジの色。ノードと同じ意味づけ（緑＝追加 / 赤＝削除）を保つ。 */
export function diffEdgeColor(kind: 'added' | 'removed', isDark: boolean): string {
  return diffNodeColor(kind, isDark);
}
