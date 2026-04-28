import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../lib/api-helpers';

export interface TrendingRepo {
    id: number;
    fullName: string;
    description: string | null;
    url: string;
    stars: number;
    language: string | null;
    owner: string;
    name: string;
}

export interface TrendingResponse {
    daily: TrendingRepo[];
    weekly: TrendingRepo[];
    monthly: TrendingRepo[];
}

export const dynamic = 'force-dynamic';
const REVALIDATE_SECONDS = 3600;
const PER_PAGE = 5;

function daysAgoIso(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

function buildHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: 'application/vnd.github.v3+json' };
    if (process.env.DOCS_GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.DOCS_GITHUB_TOKEN}`;
    }
    return headers;
}

async function fetchTrending(since: string, headers: HeadersInit): Promise<TrendingRepo[]> {
    const url = `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=${PER_PAGE}`;
    const res = await fetch(url, { headers, next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = (await res.json()) as { items: Record<string, unknown>[] };
    return data.items.map((r) => ({
        id: r.id as number,
        fullName: r.full_name as string,
        description: (r.description as string | null) ?? null,
        url: r.html_url as string,
        stars: r.stargazers_count as number,
        language: (r.language as string | null) ?? null,
        owner: (r.owner as Record<string, string>).login,
        name: r.name as string,
    }));
}

export async function GET() {
    try {
        const headers = buildHeaders();
        const [daily, weekly, monthly] = await Promise.all([
            fetchTrending(daysAgoIso(1), headers),
            fetchTrending(daysAgoIso(7), headers),
            fetchTrending(daysAgoIso(30), headers),
        ]);
        return NextResponse.json({ daily, weekly, monthly } satisfies TrendingResponse);
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/github-trending] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ daily: [], weekly: [], monthly: [] } satisfies TrendingResponse);
    }
}
