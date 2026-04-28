import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../../lib/api-helpers';

export interface WsjArticle {
    id: string;
    title: string;
    description: string;
    url: string;
    author: string;
    publishedAt: string;
    section: string;
}

const REVALIDATE = 3600;

const RSS_FEEDS = [
    {
        url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
        section: 'World',
    },
    {
        url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
        section: 'Markets',
    },
];

function extractTag(xml: string, tag: string): string {
    const cdataMatch = new RegExp(String.raw`<${tag}[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*</${tag}>`).exec(xml);
    if (cdataMatch?.[1]) return cdataMatch[1].trim();
    const match = new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)</${tag}>`).exec(xml);
    return match?.[1]?.trim() ?? '';
}

function parseItems(xml: string, section: string): WsjArticle[] {
    const items: WsjArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;

    while ((m = itemRegex.exec(xml)) !== null) {
        const block = m[1];
        const title = extractTag(block, 'title');
        const link = extractTag(block, 'link') || extractTag(block, 'guid');
        const description = extractTag(block, 'description');
        const pubDate = extractTag(block, 'pubDate');
        const creator = extractTag(block, 'dc:creator') || extractTag(block, 'author');

        if (!title || !link) continue;

        items.push({
            id: link,
            title,
            description,
            url: link,
            author: creator || 'WSJ Staff',
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            section,
        });
    }

    return items;
}

export async function GET() {
    try {
        const results = await Promise.allSettled(
            RSS_FEEDS.map(async ({ url, section }) => {
                const res = await fetch(url, { next: { revalidate: REVALIDATE } });
                if (!res.ok) throw new Error(`${section} feed returned ${res.status}`);
                const xml = await res.text();
                return parseItems(xml, section).slice(0, 2);
            }),
        );

        const articles: WsjArticle[] = results
            .filter((r): r is PromiseFulfilledResult<WsjArticle[]> => r.status === 'fulfilled')
            .flatMap((r) => r.value)
            .slice(0, 3);

        return NextResponse.json({ articles });
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/news/wsj] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
