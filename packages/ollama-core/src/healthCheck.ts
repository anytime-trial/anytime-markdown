import type { HealthCheckResult } from '@anytime-markdown/llm-core';

interface OllamaTagsResponse {
  models: ReadonlyArray<{ name: string }>;
}

export async function checkOllamaModelAvailable(
  baseUrl: string,
  model: string,
  fetchImpl: typeof fetch,
): Promise<HealthCheckResult> {
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = (await res.json()) as OllamaTagsResponse;
    const hasModel = data.models.some(
      (m) => m.name === model || m.name.startsWith(`${model}:`),
    );
    return hasModel
      ? { ok: true }
      : {
          ok: false,
          detail: `Model ${model} not pulled. Run: ollama pull ${model}`,
        };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
