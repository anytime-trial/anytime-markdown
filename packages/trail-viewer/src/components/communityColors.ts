// 型のみ import（値を import すると codeGraph.ts の node:crypto を webview バンドルに巻き込む）。
import type { ArchitectureLayer } from '@anytime-markdown/trail-core/codeGraph';
import { getC4Colors } from '../theme/c4Tokens';

/**
 * アーキテクチャ層 → i18n ラベルキー（`c4.layer.*`）。凡例・トグルで共有する。
 * Record<ArchitectureLayer, ...> なので 9 層すべての列挙を型レベルで強制する
 * （core 側の層追加は trail-server の consuming ビルドで検出され、ここは網羅漏れで検出される）。
 */
export const LAYER_LABEL_KEYS: Record<ArchitectureLayer, string> = {
  foundation: 'c4.layer.foundation',
  analysis: 'c4.layer.analysis',
  data: 'c4.layer.data',
  'service-domain': 'c4.layer.serviceDomain',
  'service-server': 'c4.layer.serviceServer',
  integration: 'c4.layer.integration',
  'presentation-ui': 'c4.layer.presentationUi',
  'presentation-extension': 'c4.layer.presentationExtension',
  utility: 'c4.layer.utility',
};

/** 凡例の表示順（LAYER_LABEL_KEYS のキー順＝網羅保証付き）。 */
export const ARCHITECTURE_LAYER_ORDER: readonly ArchitectureLayer[] = Object.keys(
  LAYER_LABEL_KEYS,
) as ArchitectureLayer[];

/**
 * CodeGraph のコミュニティ番号 → 色の対応表。
 * `CodeGraphCanvas` と C4 モデルタブの Community オーバーレイで共有する。
 */
export const COMMUNITY_COLORS: readonly string[] = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
];

export function communityColor(community: number): string {
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length];
}

/**
 * アーキテクチャ層 → 色。`architecture-layer` overlay と code graph パネルの層配色で共有する。
 * 層が未付与（旧グラフ）の場合は utility 色にフォールバックする。
 */
export function layerColor(
  layer: ArchitectureLayer | undefined,
  isDark: boolean,
): string {
  const colors = getC4Colors(isDark).layerColors;
  return colors[layer ?? 'utility'];
}
