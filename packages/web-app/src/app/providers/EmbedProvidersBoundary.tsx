'use client';

import { setEmbedProviders } from '@anytime-markdown/markdown-viewer/src/embedProviders';
import type {
  EmbedProviders,
  OembedData,
  OgpData,
  RssLatestData,
} from '@anytime-markdown/markdown-viewer/src/types/embedProvider';
import { type ReactNode } from 'react';

async function fetchOgp(url: string): Promise<OgpData> {
  const res = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as OgpData;
}

async function fetchOembed(url: string): Promise<OembedData> {
  const res = await fetch(`/api/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as OembedData;
}

async function fetchRss(feedUrl: string): Promise<RssLatestData> {
  const res = await fetch(`/api/rss?url=${encodeURIComponent(feedUrl)}`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as RssLatestData;
}

// embed プレビュー（vanilla）へ Next API 経由の fetcher を注入する（モジュール初期化時に一度）。
const providers: EmbedProviders = { fetchOgp, fetchOembed, fetchRss };
setEmbedProviders(providers);

export function EmbedProvidersBoundary({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
