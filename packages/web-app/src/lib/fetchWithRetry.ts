/**
 * Fetch with exponential backoff retry for transient errors (5xx, 429).
 * Non-retryable errors (4xx except 429) are returned immediately.
 *
 * SSRF 対策: 許可されたホストへのリクエストのみ実行する。
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

import { providerDefaultHosts, TICKET_PROVIDER_KINDS } from "@anytime-markdown/tickets-core";

/**
 * リクエスト先として許可するホスト。
 * 基本ホストに、チケットプロバイダが要求するホストを合成する（RFC 詳細設計 3）。
 * プロバイダ追加時は tickets-core の providerDefaultHosts がホストを供給するため、本ファイルの変更漏れが起こらない。
 */
const ALLOWED_HOSTS = new Set([
  "api.github.com",
  ...TICKET_PROVIDER_KINDS.flatMap((kind) => providerDefaultHosts(kind)),
]);

function validateUrl(input: string | URL | Request): void {
  const urlStr = input instanceof Request ? input.url : String(input);
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`fetchWithRetry: invalid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`fetchWithRetry: only HTTPS is allowed`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`fetchWithRetry: host "${parsed.hostname}" is not allowed`);
  }
}

/**
 * GitHub リポジトリ名 (owner/repo) のバリデーション。
 * パストラバーサルや不正文字を防止する。
 */
const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export function validateGitHubRepo(repo: string): boolean {
  return REPO_PATTERN.test(repo);
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
  validateUrl(input);

  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(input, init);

    if (res.ok || !RETRYABLE_STATUSES.has(res.status)) {
      return res;
    }

    lastResponse = res;

    if (attempt < maxRetries) {
      const delay = BASE_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastResponse ?? new Response(null, { status: 500 });
}
