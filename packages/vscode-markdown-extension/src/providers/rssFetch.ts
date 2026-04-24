// Inlined RSS fetch + parse for VS Code extension host.
// Kept intentionally in sync with markdown-core/src/utils/rssParser.ts.
import { DOMParser } from '@xmldom/xmldom';

import { assertSafeUrl } from './embedFetchHelpers.js';

export interface RssLatest {
  guid: string;
  pubDate: string;
  title: string;
}

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

function normalizeDate(raw: string | null | undefined): string {
  if (!raw) return new Date(0).toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
}

function textOf(el: Element | null | undefined, tag: string): string | null {
  if (!el) return null;
  const nodes = el.getElementsByTagName(tag);
  if (nodes.length === 0) return null;
  return nodes[0].textContent?.trim() ?? null;
}

export function parseRssLatestXml(xml: string): RssLatest | null {
  let doc: Document;
  try {
    doc = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: () => undefined,
        fatalError: () => undefined,
      },
    }).parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    return null;
  }
  if (!doc?.documentElement) return null;
  const root = doc.documentElement;
  const rootTag = root.tagName.toLowerCase();

  if (rootTag === 'rss') {
    const item = root.getElementsByTagName('item')[0];
    if (!item) return null;
    const el = item as unknown as Element;
    const guid = textOf(el, 'guid') ?? textOf(el, 'link');
    const pubDate = textOf(el, 'pubDate');
    const title = textOf(el, 'title') ?? '';
    if (!guid) return null;
    return { guid, pubDate: normalizeDate(pubDate), title };
  }

  if (rootTag === 'feed') {
    const entry = root.getElementsByTagName('entry')[0];
    if (!entry) return null;
    const el = entry as unknown as Element;
    const guid = textOf(el, 'id');
    const pubDate = textOf(el, 'updated') ?? textOf(el, 'published');
    const title = textOf(el, 'title') ?? '';
    if (!guid) return null;
    return { guid, pubDate: normalizeDate(pubDate), title };
  }

  return null;
}

export async function fetchRssLatest(feedUrl: string): Promise<RssLatest> {
  await assertSafeUrl(feedUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let xml: string;
  try {
    const res = await fetch(feedUrl, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`status-${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('too-large');
    xml = new TextDecoder('utf-8').decode(Buffer.from(buf));
  } finally {
    clearTimeout(timer);
  }
  const parsed = parseRssLatestXml(xml);
  if (!parsed) throw new Error('parse-failed');
  return parsed;
}
