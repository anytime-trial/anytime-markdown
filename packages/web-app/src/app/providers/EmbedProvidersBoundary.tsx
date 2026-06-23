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

// Twitter/X の widgets.js を読み込み、描画済み blockquote をウィジェットへ昇格させる。
// リモートスクリプトの読み込みは web-app（通常の web ページ）でのみ許容されるため、
// 共有モジュールではなく consumer 側の本フックに実装する。Chrome MV3 拡張は本フックを
// 提供しないことで、バンドルにリモート参照を含めない。
const WIDGETS_JS_SRC = 'https://platform.twitter.com/widgets.js';
let widgetsLoaded = false;

function loadWidgetsJs(): void {
  if (typeof window === 'undefined') return;
  if (widgetsLoaded) return;
  if ((globalThis as { twttr?: unknown }).twttr) {
    widgetsLoaded = true;
    return;
  }
  if (document.querySelector(`script[src="${WIDGETS_JS_SRC}"]`)) {
    widgetsLoaded = true;
    return;
  }
  const script = document.createElement('script');
  script.src = WIDGETS_JS_SRC;
  script.async = true;
  document.head.appendChild(script);
  widgetsLoaded = true;
}

function loadTweetWidgets(tweetContainer: Element): void {
  loadWidgetsJs();
  // widgets.js は async 読み込みのため初回は twttr が未定義のことが多い。その場合は
  // widgets.js がロード完了時に DOM 上の .twitter-tweet を自動昇格させる。ここでの
  // 明示 load 呼び出しは、既に widgets.js がロード済みで後続の tweet が描画された
  // 2 回目以降の昇格を担う。
  const twttr = (globalThis as { twttr?: { widgets?: { load?: (el?: Element) => void } } }).twttr;
  twttr?.widgets?.load?.(tweetContainer);
}

// embed プレビュー（vanilla）へ Next API 経由の fetcher を注入する（モジュール初期化時に一度）。
const providers: EmbedProviders = { fetchOgp, fetchOembed, fetchRss, loadTweetWidgets };
setEmbedProviders(providers);

export function EmbedProvidersBoundary({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
