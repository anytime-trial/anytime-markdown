import type {
  EmbedProviders,
  OembedData,
  OgpData,
  RssLatestData,
} from '@anytime-markdown/markdown-core/src/types/embedProvider';

import { getVsCodeApi } from './vscodeApi';

type OgpResolver = {
  resolve: (data: OgpData) => void;
  reject: (err: Error) => void;
};

type OembedResolver = {
  resolve: (data: OembedData) => void;
  reject: (err: Error) => void;
};

type RssResolver = {
  resolve: (data: RssLatestData) => void;
  reject: (err: Error) => void;
};

const ogpWaiters = new Map<string, OgpResolver>();
const oembedWaiters = new Map<string, OembedResolver>();
const rssWaiters = new Map<string, RssResolver>();
let installed = false;

function ensureInstalled(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const raw = event.data as { type?: string; requestId?: string; data?: unknown; error?: string };
    if (!raw || typeof raw !== 'object') return;
    if (typeof raw.requestId !== 'string') return;
    if (raw.type === 'ogpResult') {
      const waiter = ogpWaiters.get(raw.requestId);
      if (!waiter) return;
      ogpWaiters.delete(raw.requestId);
      if (raw.error) {
        waiter.reject(new Error(raw.error));
      } else if (raw.data) {
        waiter.resolve(raw.data as OgpData);
      } else {
        waiter.reject(new Error('no-data'));
      }
    } else if (raw.type === 'oembedResult') {
      const waiter = oembedWaiters.get(raw.requestId);
      if (!waiter) return;
      oembedWaiters.delete(raw.requestId);
      if (raw.error) {
        waiter.reject(new Error(raw.error));
      } else if (raw.data) {
        waiter.resolve(raw.data as OembedData);
      } else {
        waiter.reject(new Error('no-data'));
      }
    } else if (raw.type === 'rssResult') {
      const waiter = rssWaiters.get(raw.requestId);
      if (!waiter) return;
      rssWaiters.delete(raw.requestId);
      if (raw.error) {
        waiter.reject(new Error(raw.error));
      } else if (raw.data) {
        waiter.resolve(raw.data as RssLatestData);
      } else {
        waiter.reject(new Error('no-data'));
      }
    }
  });
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createVsCodeEmbedProviders(): EmbedProviders {
  ensureInstalled();
  const vscode = getVsCodeApi();
  return {
    fetchOgp: (url: string) =>
      new Promise<OgpData>((resolve, reject) => {
        const requestId = newId();
        ogpWaiters.set(requestId, { resolve, reject });
        vscode.postMessage({ type: 'fetchOgp', requestId, url });
      }),
    fetchOembed: (url: string) =>
      new Promise<OembedData>((resolve, reject) => {
        const requestId = newId();
        oembedWaiters.set(requestId, { resolve, reject });
        vscode.postMessage({ type: 'fetchOembed', requestId, url });
      }),
    fetchRss: (feedUrl: string) =>
      new Promise<RssLatestData>((resolve, reject) => {
        const requestId = newId();
        rssWaiters.set(requestId, { resolve, reject });
        vscode.postMessage({ type: 'fetchRss', requestId, feedUrl });
      }),
  };
}
