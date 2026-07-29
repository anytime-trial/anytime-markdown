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

/**
 * 到達先ホストを許可リストで制限し、429 のみ指数バックオフでリトライする fetch。
 *
 * 許可ホストは tickets-core の providerDefaultHosts() から合成する。
 * プロバイダ追加時に許可リストの追随漏れが起きないための単一供給経路である。
 */
export function createRetryingFetch(options: RetryingFetchOptions): typeof fetch {
  const inner = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const retryingFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (!options.allowedHosts.includes(url.host)) {
      throw new Error(`許可されていないホストへの要求です: ${url.host}`);
    }
    for (let attempt = 1; ; attempt += 1) {
      const response = await inner(input, init);
      if (response.status !== 429 || attempt >= maxAttempts) {
        return response;
      }
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
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
