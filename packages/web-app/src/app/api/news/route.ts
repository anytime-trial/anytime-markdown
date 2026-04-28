import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../lib/api-helpers';

export interface NewsArticle {
    id: string;
    title: string;
    description: string;
    url: string;
    source: string;
    author: string;
    publishedAt: string;
    section: string;
}

interface GuardianResult {
    id: string;
    type: string;
    sectionId: string;
    sectionName: string;
    webPublicationDate: string;
    webTitle: string;
    webUrl: string;
    fields?: {
        trailText?: string;
        byline?: string;
    };
}

interface GuardianResponse {
    response: {
        status: string;
        results: GuardianResult[];
    };
}

const REVALIDATE = 3600;

export async function GET() {
    try {
        const apiKey = process.env.GUARDIAN_API_KEY ?? 'test';

        const url = new URL('https://content.guardianapis.com/search');
        url.searchParams.set('section', 'world|politics|business|us-news');
        url.searchParams.set('show-fields', 'trailText,byline');
        url.searchParams.set('page-size', '8');
        url.searchParams.set('order-by', 'newest');
        // liveblog は本文が空になりがちなので article のみに絞る
        url.searchParams.set('type', 'article');
        url.searchParams.set('api-key', apiKey);

        const res = await fetch(url.toString(), {
            next: { revalidate: REVALIDATE },
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Guardian API unavailable' }, { status: 502 });
        }

        const data = (await res.json()) as GuardianResponse;

        const articles: NewsArticle[] = data.response.results
            .filter((r) => r.fields?.trailText)
            .slice(0, 3)
            .map((r) => ({
                id: r.id,
                title: r.webTitle,
                description: r.fields?.trailText ?? '',
                url: r.webUrl,
                source: 'The Guardian',
                author: r.fields?.byline ?? 'Guardian staff',
                publishedAt: r.webPublicationDate,
                section: r.sectionName,
            }));

        return NextResponse.json({ articles });
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/news] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
