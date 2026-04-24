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
}
