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

/**
 * `input` が `Request` の場合、その `method` / `headers` / `credentials` を `init` へ引き継ぐ
 * （`init` 側で明示された項目はそちらを優先する）。`redirect` は常に `'manual'` を最後に上書きする。
 *
 * SHORTCUT: Request からは method/headers/credentials のみ引き継ぐ. ceiling: mode/cache/integrity/signal
 * 等は非対応（現状の呼び出し元 createProvider は文字列 URL しか使わず未使用）. upgrade: それらを渡す
 * Request を実際に扱う呼び出し元が出たら都度追加する.
 *
 * body を持つ Request は非対応としエラーにする（呼び出し側で決定）。理由は throwIfUnsupportedBody を参照。
 */
function resolveRequestInit(input: RequestInfo | URL, init: RequestInit | undefined): RequestInit {
  if (input instanceof Request) {
    throwIfUnsupportedBody(input);
    return {
      method: input.method,
      headers: input.headers,
      credentials: input.credentials,
      ...init,
      redirect: 'manual',
    };
  }
  return { ...init, redirect: 'manual' };
}

/**
 * body を持つ Request を明示的に拒否する。
 *
 * Why not: Request#body は ReadableStream であり、一度読み出すと再利用できない。
 * このモジュールは 429 リトライとリダイレクト追従のために inner() を複数回呼び得るため、
 * body を保持したまま複数ホップ・複数試行へ安全に転送する手段が無い
 * （clone() での複製は fetch 実装依存の消費タイミング差異を持ち込み、検証コストに見合わない）。
 * 黙って 2 回目以降が空ボディになる事故を避けるため、サポート外として明示的に例外にする。
 * body 無しの Request（GET/DELETE 等）は本関数を通らず正常に扱える。
 */
function throwIfUnsupportedBody(request: Request): void {
  if (request.body !== null) {
    throw new Error(
      'body を持つ Request はサポートしていません（429 リトライ・リダイレクト追従で ReadableStream を再送できないため）。' +
        '文字列 URL または URL インスタンス + init.body の形で呼び出してください。',
    );
  }
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
 *
 * 既定値（`maxAttempts=3` / `MAX_REDIRECTS=5`）での上限（Task 9 でタイムアウトを設計する際の参考値）:
 * - 最大外部リクエスト回数: `maxAttempts × (MAX_REDIRECTS + 1)` = 3 × 6 = 18 回
 *   （全ホップで 429 が続いた最悪ケース）
 * - 最大待機時間: 1 ホップあたり最大 `500ms + 1000ms` = 1,500ms（429 の指数バックオフ）
 *   × (MAX_REDIRECTS + 1) ホップ = 最大 約 9,000ms（9 秒）
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
    const manualInit = resolveRequestInit(input, init);

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
