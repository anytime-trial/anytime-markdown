/**
 * HTML テキストコンテキスト用の最小エスケープ（& < > のみ）。
 *
 * 属性値コンテキスト（クォート含む）には不十分なので、属性へ埋め込む場合は
 * 引用符のエスケープを別途行うこと。embedFenceRenderer と markdown-rich の
 * dialogHelpers が同実装を重複私有していたものの集約。
 */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
