/** innerHTML テンプレートへ埋め込む文字列の HTML エスケープ（属性値も対象のため引用符も置換）。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
