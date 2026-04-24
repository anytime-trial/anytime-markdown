/** @anytime-markdown/markdown-core/embed-utils サブパスエクスポート
 *  サーバーサイド / 拡張ホスト環境（DOM 非依存）から使える embed 関連ユーティリティのみ。 */
export { parseOgpHtml } from "../utils/ogpParser";
export { assertSafeUrl, isPrivateAddress } from "../utils/ssrfGuard";
export { sanitizeTweetHtml } from "../utils/tweetSanitize";
export { classifyEmbedUrl } from "../utils/embedClassifier";
export { parseEmbedInfoString } from "../utils/embedInfoString";
export type { EmbedKind } from "../utils/embedClassifier";
export type { EmbedVariant } from "../utils/embedInfoString";
export type { EmbedProviders, OembedData, OgpData } from "../types/embedProvider";
