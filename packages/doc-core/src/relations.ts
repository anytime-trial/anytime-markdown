/**
 * 型付きノート関係の語彙（doc-core ローカルミラー）。
 *
 * 語彙の単一の真実は graph-core の `presets/relationStyle.ts`。ただし doc-core は他パッケージ
 * （trail-server / mcp-trail 等）から consume され、graph-core を直接 import すると barrel の
 * DOM 型引込み・consumer 側 tsconfig の moduleResolution 差でビルドが壊れる。そのため
 * vscode 拡張の `noteGraph/relations.ts` と同様、構造的に一致する最小ミラーを置く。
 *
 * **語彙を増減する際は graph-core 側と同時に更新すること。**
 */

export type RelationType =
  | 'references'
  | 'depends-on'
  | 'implements'
  | 'part-of'
  | 'supersedes'
  | 'refines';

export const RELATION_TYPES: readonly RelationType[] = [
  'references',
  'depends-on',
  'implements',
  'part-of',
  'supersedes',
  'refines',
];

export const DEFAULT_RELATION_TYPE: RelationType = 'references';

export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as readonly string[]).includes(value);
}

/** 未知の非空文字列は references へフォールバックし警告（silent 無視禁止）。空・未指定は既定。 */
export function coerceRelationType(value: unknown): RelationType {
  if (isRelationType(value)) return value;
  if (value !== undefined && value !== null && value !== '') {
    console.warn(
      `[doc-core] unknown relation type ${JSON.stringify(value)}; falling back to '${DEFAULT_RELATION_TYPE}'`,
    );
  }
  return DEFAULT_RELATION_TYPE;
}
