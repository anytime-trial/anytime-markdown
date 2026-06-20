/**
 * 型付きノート関係の語彙（拡張ホスト側のローカルミラー）。
 *
 * 語彙の単一の真実は graph-core の `presets/relationStyle.ts`。ただしホストが
 * graph-core を直接 import するとビルド境界を侵す（graph-core src は host の
 * `rootDir` 外＝TS6059／canvas・DOM 型を host バンドルへ持ち込む）。そのため
 * {@link ./types} の `NoteDocInput` と同様に、構造的に一致する最小ミラーをここに置く。
 * webview 側は graph-core の同名型を使い、データは plain object（{ to, type }）で授受する。
 *
 * **語彙を増減する際は graph-core 側と同時に更新すること。**
 */

/** 関係種別の controlled vocabulary（graph-core と一致）。 */
export type RelationType =
  | 'references'
  | 'depends-on'
  | 'implements'
  | 'part-of'
  | 'supersedes'
  | 'refines';

/** 語彙の順序付き一覧（UI 表示順と一致）。先頭の references が既定（型なし互換）。 */
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
 * 未知の非空文字列は {@link DEFAULT_RELATION_TYPE} へフォールバックし警告する（silent 無視禁止）。
 * 空・未指定は既定として扱い、警告は出さない。
 */
export function coerceRelationType(value: unknown): RelationType {
  if (isRelationType(value)) return value;
  if (value !== undefined && value !== null && value !== '') {
    console.warn(
      `[noteGraph] unknown relation type ${JSON.stringify(value)}; falling back to '${DEFAULT_RELATION_TYPE}'`,
    );
  }
  return DEFAULT_RELATION_TYPE;
}
