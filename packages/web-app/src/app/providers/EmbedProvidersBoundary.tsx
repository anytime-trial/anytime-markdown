'use client';

import { EmbedProvidersProvider } from '@anytime-markdown/markdown-core/src/contexts/EmbedProvidersContext';
import type {
  EmbedProviders,
  OembedData,
  OgpData,
  RssLatestData,
} from '@anytime-markdown/markdown-core/src/types/embedProvider';
import { useMemo, type ReactNode } from 'react';

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

export function EmbedProvidersBoundary({ children }: { children: ReactNode }) {
  const providers = useMemo<EmbedProviders>(() => ({ fetchOgp, fetchOembed, fetchRss }), []);
  return <EmbedProvidersProvider value={providers}>{children}</EmbedProvidersProvider>;
}
