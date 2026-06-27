import type {
  WebImportFetchResult,
  WebImportProvider,
} from '@anytime-markdown/markdown-viewer';

import { getVsCodeApi } from './vscodeApi';

export const FETCH_WEB_PAGE_MESSAGE_TYPE = 'fetchWebPage';
export const FETCH_WEB_PAGE_RESULT_MESSAGE_TYPE = 'fetchWebPageResult';
export const WEB_IMPORT_FETCH_TIMEOUT_MS = 15_000;

type WebImportResolver = {
  resolve: (data: WebImportFetchResult) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type WebImportResultMessage = {
  type?: string;
  requestId?: string;
  html?: unknown;
  finalUrl?: unknown;
  contentType?: unknown;
  error?: unknown;
};

type MessageTargetLike = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WebImportResultMessage>) => void,
  ): void;
};

export type WebImportPostMessage = (message: {
  type: typeof FETCH_WEB_PAGE_MESSAGE_TYPE;
  requestId: string;
  url: string;
}) => void;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWebImportBridgeProvider(
  postMessage: WebImportPostMessage = (message) => getVsCodeApi().postMessage(message),
  target: MessageTargetLike = window,
  timeoutMs = WEB_IMPORT_FETCH_TIMEOUT_MS,
): WebImportProvider {
  const waiters = new Map<string, WebImportResolver>();

  target.addEventListener('message', (event: MessageEvent<WebImportResultMessage>) => {
    if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
    const raw = event.data;
    if (!raw || typeof raw !== 'object') return;
    if (raw.type !== FETCH_WEB_PAGE_RESULT_MESSAGE_TYPE) return;
    if (typeof raw.requestId !== 'string') return;
    const waiter = waiters.get(raw.requestId);
    if (!waiter) return;

    waiters.delete(raw.requestId);
    clearTimeout(waiter.timeout);
    if (typeof raw.error === 'string' && raw.error) {
      waiter.reject(new Error(raw.error));
      return;
    }
    if (typeof raw.html !== 'string' || typeof raw.finalUrl !== 'string') {
      waiter.reject(new Error('no-data'));
      return;
    }
    waiter.resolve({
      html: raw.html,
      finalUrl: raw.finalUrl,
      contentType: typeof raw.contentType === 'string' ? raw.contentType : undefined,
    });
  });

  return {
    fetch: (url: string) =>
      new Promise<WebImportFetchResult>((resolve, reject) => {
        const requestId = newId();
        const timeout = setTimeout(() => {
          waiters.delete(requestId);
          reject(new Error('timeout'));
        }, timeoutMs);
        waiters.set(requestId, { resolve, reject, timeout });
        postMessage({ type: FETCH_WEB_PAGE_MESSAGE_TYPE, requestId, url });
      }),
  };
}
