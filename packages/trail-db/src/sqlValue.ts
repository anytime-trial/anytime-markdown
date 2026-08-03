/**
 * SQL 行から読み出した値 (sql.js の `unknown` / `SqlValue` 相当) を安全に文字列化する。
 *
 * `String(v ?? '')` は `v` が `Uint8Array` (BLOB) や object のとき
 * `[object Object]` 等の既定文字列化になりうる (SonarCloud S6551)。本ヘルパーは
 * 型を絞り込んでから変換するため S6551 を発火させず、TEXT 列の想定外 BLOB も
 * `TextDecoder` で実テキストに復元する。
 *
 * - `null` / `undefined` → `''`
 * - `string` → そのまま
 * - `number` / `bigint` / `boolean` → `String(v)` (object でないため S6551 対象外)
 * - `Uint8Array` (BLOB) → UTF-8 デコード
 * - その他 object → JSON 文字列 (最終フォールバック)
 */
export function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return JSON.stringify(v);
}
