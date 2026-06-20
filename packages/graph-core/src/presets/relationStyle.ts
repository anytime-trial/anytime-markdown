/**
 * ノート網の「型付き関係」語彙とエッジ描画スタイル。
 *
 * frontmatter `related` の各エントリに付与する関係種別（controlled vocabulary）と、
 * 種別ごとの決定論的なエッジスタイル（色・線幅・破線・ラベル）を定義する。
 * パレットは {@link ./palette} 経由でダーク/ライト両モードに対応する。
 *
 * 単一ソース原則: 関係の真実は frontmatter にあり、グラフ描画はその二表現の一つ。
 * 語彙・既定値はホスト（拡張）/ webview からも参照されるため graph-core から export する。
 */

import type { ThinkingPalette } from './palette';
import { withAlpha } from './palette';
import type { EndpointShape } from '../types';

/** 関係種別の controlled vocabulary。 */
export type RelationType =
  | 'references'
  | 'depends-on'
  | 'implements'
  | 'part-of'
  | 'supersedes'
  | 'refines';

/**
 * 語彙の順序付き一覧（UI のボタン列・凡例の表示順と一致）。
 * 先頭の `references` が既定（型なし互換）。
 */
export const RELATION_TYPES: readonly RelationType[] = [
  'references',
  'depends-on',
  'implements',
  'part-of',
  'supersedes',
  'refines',
];

/** `type` 省略時の既定種別（型なし `related` の後方互換）。 */
export const DEFAULT_RELATION_TYPE: RelationType = 'references';

/** 正規化済みの型付き参照。`to` は root 相対 POSIX パス。 */
export interface RelatedRef {
  to: string;
  type: RelationType;
}

/** 語彙に含まれる関係種別かを判定する型ガード。 */
export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as readonly string[]).includes(value);
}

/**
 * 任意入力を `RelationType` へ正規化する。
 * 未知の非空文字列は {@link DEFAULT_RELATION_TYPE} にフォールバックし、警告を出す（silent 無視禁止）。
 * 空・未指定は既定として扱い、警告は出さない。
 */
export function coerceRelationType(value: unknown): RelationType {
  if (isRelationType(value)) return value;
  if (value !== undefined && value !== null && value !== '') {
    console.warn(
      `[graph-core] unknown relation type ${JSON.stringify(value)}; falling back to '${DEFAULT_RELATION_TYPE}'`,
    );
  }
  return DEFAULT_RELATION_TYPE;
}

/** 型付きエッジの描画スタイル。`label` は型なし(references)では undefined。 */
export interface RelationEdgeStyle {
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  endShape: EndpointShape;
  label?: string;
}

/**
 * 関係種別 → エッジスタイルの決定論的マップ（design.md パレット準拠）。
 *
 * - references : 弱い参照。細・破線・ラベルなし（既定/型なし互換）。
 * - depends-on : 依存。実線・矢印（カテゴリ青）。
 * - implements : 実装関係。実線・矢印（カテゴリ緑）。
 * - part-of    : 包含（子→親）。実線・矢印（カテゴリ紫）。
 * - supersedes : 置換（新→旧）。強調色（accent）・太め・矢印。
 * - refines    : 詳細化/派生。細・実線・矢印（淡いテキスト色）。
 */
export function relationEdgeStyle(type: RelationType, pal: ThinkingPalette): RelationEdgeStyle {
  switch (type) {
    case 'depends-on':
      return { stroke: pal.categories[0], strokeWidth: 2, dashed: false, endShape: 'arrow', label: 'depends-on' };
    case 'implements':
      return { stroke: pal.categories[1], strokeWidth: 2, dashed: false, endShape: 'arrow', label: 'implements' };
    case 'part-of':
      return { stroke: pal.categories[2], strokeWidth: 2, dashed: false, endShape: 'arrow', label: 'part-of' };
    case 'supersedes':
      return { stroke: pal.accent, strokeWidth: 2.4, dashed: false, endShape: 'arrow', label: 'supersedes' };
    case 'refines':
      return { stroke: withAlpha(pal.text, 0.55), strokeWidth: 1.3, dashed: false, endShape: 'arrow', label: 'refines' };
    case 'references':
    default:
      return { stroke: withAlpha(pal.accent, 0.55), strokeWidth: 1.4, dashed: true, endShape: 'arrow' };
  }
}
