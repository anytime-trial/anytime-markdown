export interface OgpData {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
    favicon: string | null;
    rawHtml?: string | null;
}

export interface OembedData {
    url: string;
    provider: "twitter";
    html: string;
    authorName: string | null;
}

export interface RssLatestData {
    guid: string;
    pubDate: string;
    title: string;
}

export interface EmbedProviders {
    fetchOgp: (url: string) => Promise<OgpData>;
    fetchOembed: (url: string) => Promise<OembedData>;
    fetchRss: (feedUrl: string) => Promise<RssLatestData>;
    /**
     * 描画済みの tweet コンテナをプラットフォームのウィジェットへ昇格させる任意フック。
     *
     * Twitter/X の `widgets.js` のようなリモートスクリプトの読み込みは consumer が担う。
     * 共有モジュール（markdown-viewer）はリモートエンドポイントを一切持たない。これにより
     * リモートホストコードを禁じる Chrome Manifest V3 拡張（browser-extension）は本フックを
     * 提供しないことで、バンドルにリモート参照を含めずに済む。
     *
     * 未提供の場合、tweet はサニタイズ済み oEmbed の blockquote として静的表示される
     * （リンクは機能する）。
     */
    loadTweetWidgets?: (tweetContainer: Element) => void;
}
