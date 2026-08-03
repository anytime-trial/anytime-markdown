/**
 * Author Heatmap の配色。
 *
 * ノード ID → 色の対応表を作るだけの純粋関数群で、DOM にも sigma にも依存しない
 * （canvas は出来上がった Map を適用するだけ）。
 *
 * 配色方針:
 * - セッション色は Okabe-Ito のカラーユニバーサル配色を採る。コミュニティ配色
 *   （tableau 系）と併用されることはない（colorBy は排他）が、色覚多様性への配慮として
 *   質的配色にはこちらを使う。
 * - 色だけに依存しないよう、属人度の高いノードは輪郭でも識別できるようにする
 *   （`selectEmphasizedNodes`）。
 * - 「記録なし」は低頻度と別の中立色にする。同色にすると「編集されていない安定領域」と
 *   誤読される（実測でノードの約 4 割が記録なし）。
 */
import type { AuthorHeatmapEntry } from '@anytime-markdown/trail-core/authorHeatmap';

/** セッションへ割り当てる質的配色（Okabe-Ito）。既定の topSessions=8 と同数。 */
export const SESSION_COLORS: readonly string[] = [
  '#E69F00',
  '#56B4E9',
  '#009E73',
  '#F0E442',
  '#0072B2',
  '#D55E00',
  '#CC79A7',
  '#8C8C8C',
];

/** 上位に入らなかったセッションをまとめる色。 */
export function otherSessionColor(isDark: boolean): string {
  return isDark ? '#5B6169' : '#9A968D';
}

/** 集計に現れないノード（＝編集記録なし）の中立色。 */
export function noDataColor(isDark: boolean): string {
  return isDark ? '#3A4046' : '#D5D1C8';
}

/** 属人度がこの値以上のノードを輪郭で強調する（色以外の識別手段）。 */
export const EMPHASIS_TOP_SESSION_SHARE = 0.8;

/** 編集頻度の段階。境界は実測分布（p50=2 / p90=8）で校正した。 */
export const FREQUENCY_STEPS = [
  { id: 'low', maxCommits: 2 },
  { id: 'mid', maxCommits: 8 },
  { id: 'high', maxCommits: Number.POSITIVE_INFINITY },
] as const;

export type FrequencyStepId = (typeof FREQUENCY_STEPS)[number]['id'];

const FREQUENCY_COLORS: Record<FrequencyStepId, { dark: string; light: string }> = {
  low: { dark: '#37618E', light: '#A8C4DE' },
  mid: { dark: '#C98A2B', light: '#D9A441' },
  high: { dark: '#D65A4A', light: '#B23A2B' },
};

/** コミット数が属する頻度段階を返す。 */
export function frequencyStepOf(commitCount: number): FrequencyStepId {
  for (const step of FREQUENCY_STEPS) {
    if (commitCount <= step.maxCommits) return step.id;
  }
  return 'high';
}

export function frequencyColor(step: FrequencyStepId, isDark: boolean): string {
  const pair = FREQUENCY_COLORS[step];
  return isDark ? pair.dark : pair.light;
}

/**
 * 最終編集セッションごとの色を割り当てる。
 * `topSessions` に含まれるセッションは並び順で固有色、それ以外は「その他」色。
 */
export function buildLastEditorColorMap(
  entries: readonly AuthorHeatmapEntry[],
  topSessions: readonly string[],
  isDark: boolean,
): Map<string, string> {
  const colorBySession = new Map<string, string>();
  topSessions.forEach((sessionId, i) => {
    colorBySession.set(sessionId, SESSION_COLORS[i % SESSION_COLORS.length]);
  });
  const other = otherSessionColor(isDark);

  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(entry.nodeId, colorBySession.get(entry.lastEditorSessionId) ?? other);
  }
  return map;
}

/** 編集頻度の段階色を割り当てる。 */
export function buildEditFrequencyColorMap(
  entries: readonly AuthorHeatmapEntry[],
  isDark: boolean,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(entry.nodeId, frequencyColor(frequencyStepOf(entry.commitCount), isDark));
  }
  return map;
}

/** 属人度が閾値以上のノード ID（輪郭強調の対象）。 */
export function selectEmphasizedNodes(
  entries: readonly AuthorHeatmapEntry[],
  threshold: number = EMPHASIS_TOP_SESSION_SHARE,
): Set<string> {
  const set = new Set<string>();
  for (const entry of entries) {
    if (entry.topSessionShare >= threshold) set.add(entry.nodeId);
  }
  return set;
}
