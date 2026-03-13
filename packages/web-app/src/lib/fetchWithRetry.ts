/**
 * Fetch with exponential backoff retry for transient errors (5xx, 429).
 * Non-retryable errors (4xx except 429) are returned immediately.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
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

  return lastResponse!;
}
