/**
 * md ファイルの key から画像パス解決用の baseDir を算出する。
 * 例: "docs/guide/index.md" → "docs/guide/"
 *     "docs/flat-file.md"   → "docs/"
 */
export function getBaseDir(key: string): string {
  const lastSlash = key.lastIndexOf('/');
  return lastSlash >= 0 ? key.slice(0, lastSlash + 1) : '';
}

/**
 * 単一の画像URLを解決する。
 * - 絶対URL / data URL → そのまま返す
 * - 相対パス + CloudFront設定あり → CDN URL
 * - 相対パス + CloudFront未設定 → /api/docs/image?key=... URL
 */
export function resolveImageUrl(
  src: string,
  baseDir: string,
  cloudfrontUrl: string,
): string {
  // 絶対URL・data URL・アンカーはスキップ
  if (/^(https?:\/\/|data:|#)/.test(src)) return src;

  // "./" プレフィックスを除去
  const relativePath = src.replace(/^\.\//, '');
  const imageKey = baseDir + relativePath;

  if (cloudfrontUrl) {
    // 末尾スラッシュを正規化
    const base = cloudfrontUrl.replace(/\/+$/, '');
    return `${base}/${imageKey}`;
  }

  return `/api/docs/image?key=${encodeURIComponent(imageKey)}`;
}

/**
 * Markdown テキスト内の画像相対パスを絶対URLに一括変換する。
 * 対象: ![alt](src) と <img src="src">
 */
export function transformMarkdownImageUrls(
  markdown: string,
  baseDir: string,
  cloudfrontUrl: string,
): string {
  // Markdown: ![alt](src) — src 部分のみ置換
  let result = markdown.replace(
    /(!\[[^\]]*\]\()([^)]+)(\))/g,
    (_match, prefix, src, suffix) =>
      prefix + resolveImageUrl(src, baseDir, cloudfrontUrl) + suffix,
  );

  // HTML: <img src="src"> — src 属性のみ置換（ダブルクオート・シングルクオート両対応）
  result = result.replace(
    /(<img\s[^>]*src=)(["'])([^"']+)\2/g,
    (_match, prefix, quote, src) =>
      prefix + quote + resolveImageUrl(src, baseDir, cloudfrontUrl) + quote,
  );

  return result;
}
