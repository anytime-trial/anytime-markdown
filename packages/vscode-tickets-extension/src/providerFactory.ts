import {
  createTicketProvider,
  providerDefaultHosts,
  type TicketProvider,
} from '@anytime-markdown/tickets-core';

import type { TicketSource } from './repoResolver';

export interface RetryingFetchOptions {
  allowedHosts: string[];
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
/** リダイレクト追従の最大ホップ数（無限リダイレクトループ対策）。 */
const MAX_REDIRECTS = 5;

/**
 * 許可ホスト判定で拒否されたことを示す。呼び出し元がメッセージ文言に依存せず
 * `instanceof` で判定できるよう、専用クラスとして export する。
 */
export class DisallowedHostError extends Error {
  constructor(host: string) {
    super(`許可されていないホストへの要求です: ${host}`);
    this.name = 'DisallowedHostError';
  }
}

function resolveRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return new URL(input);
  }
  // input: Request — Request#url は常に解決済みの絶対 URL 文字列を保持する。
  // Request は独自の toString() を持たず Object.prototype.toString を継承するため
  // （"[object Request]" を返す）、input.toString() 経由では new URL() が Invalid URL で throw する。
  return new URL(input.url);
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

/**
 * 429 のみ指数バックオフでリトライし、その他の応答（3xx を含む）はそのまま返す。
 * リダイレクト追従はここでは行わない（呼び出し側がホップごとに許可ホスト判定を挟むため）。
 */
async function fetchWithRetry(
  inner: typeof fetch,
  url: URL,
  init: RequestInit,
  sleep: (ms: number) => Promise<void>,
  maxAttempts: number,
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await inner(url, init);
    if (response.status !== 429 || attempt >= maxAttempts) {
      return response;
    }
    await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
  }
}

/**
 * 到達先ホストを許可リストで制限し、429 のみ指数バックオフでリトライする fetch。
 *
 * 許可ホストは tickets-core の providerDefaultHosts() から合成する。
 * プロバイダ追加時に許可リストの追随漏れが起きないための単一供給経路である。
 *
 * リダイレクト追従: 初回 URL の許可ホスト判定だけでは、許可ホストが 30x で
 * 任意の非許可ホストへリダイレクトした場合に到達先の検証を素通りしてしまう
 * （素の fetch の既定 `redirect: 'follow'` に委譲すると SSRF ガードが無効化される）。
 * そのため `init.redirect` を常に `'manual'` へ上書きし、Location ヘッダーを
 * 自前で追跡してホップごとに許可ホスト判定を行う。呼び出し元が `init.redirect` を
 * 指定していても上書きする（このガードを迂回できる正当なユースケースは無い）。
 */
export function createRetryingFetch(options: RetryingFetchOptions): typeof fetch {
  const inner = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const checkAllowed = (url: URL): void => {
    if (!options.allowedHosts.includes(url.host)) {
      throw new DisallowedHostError(url.host);
    }
  };

  const retryingFetch: typeof fetch = async (input, init) => {
    let currentUrl = resolveRequestUrl(input);
    checkAllowed(currentUrl);
    const manualInit: RequestInit = { ...init, redirect: 'manual' };

    for (let redirectsFollowed = 0; ; redirectsFollowed += 1) {
      const response = await fetchWithRetry(inner, currentUrl, manualInit, sleep, maxAttempts);
      if (!isRedirectStatus(response.status)) {
        return response;
      }
      const location = response.headers.get('location');
      // Location を伴わない 3xx は追従先が無いため、リダイレクトとして扱わずそのまま返す
      // （呼び出し元が redirect: 'manual' を直接指定した場合と同じ挙動に揃える）。
      if (location === null) {
        return response;
      }
      // MAX_REDIRECTS 回まで追従を許可し、それでもなお 3xx が続くなら打ち切る
      // （合計の inner 呼び出し回数は最大で MAX_REDIRECTS + 1 回になる）。
      if (redirectsFollowed >= MAX_REDIRECTS) {
        throw new Error(`リダイレクトの上限(${MAX_REDIRECTS})を超えました: ${currentUrl.href}`);
      }
      currentUrl = new URL(location, currentUrl);
      checkAllowed(currentUrl);
    }
  };

  return retryingFetch;
}

export function createProvider(source: TicketSource, token: string): TicketProvider {
  const fetchFn = createRetryingFetch({ allowedHosts: providerDefaultHosts(source.provider) });
  if (source.provider === 'github-contents') {
    return createTicketProvider({
      provider: 'github-contents',
      token,
      repo: source.repo,
      branch: source.branch,
      fetchFn,
    });
  }
  return createTicketProvider({
    provider: 'github-issues',
    token,
    repo: source.repo,
    fetchFn,
  });
}
