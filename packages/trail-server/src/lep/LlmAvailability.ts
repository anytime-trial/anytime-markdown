import type { Analyzer } from '@anytime-markdown/memory-core';

/**
 * Wave 3 (memory) 開始前の LLM プロバイダ Pre-flight ヘルスチェック (設計書 12 章)。
 *
 * Ollama 等の可用性は Layer 1/2 が依存する外部ソース (git / JSONL) とは独立に変動する
 * (起動忘れ / Dev Container の `localhost` 到達不可 / モデル未 pull 等)。これを事前判定し、
 * LLM を必要とする analyzer のみ skip する (LLM 非依存の Code / BugHistory / Drift は実行)。
 *
 * `checkOllamaModelAvailable` は `packages/ollama-core/src/healthCheck.ts` のロジックを
 * ミラーしたもの (ollama-core は trail-server の依存ではないため再実装)。
 */

export interface LlmCapabilityStatus {
  ok: boolean;
  detail?: string;
}

export interface LlmProviderAvailability {
  ollama_chat: LlmCapabilityStatus;
  ollama_embedding: LlmCapabilityStatus;
}

export interface CheckLlmAvailabilityOptions {
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  /** テスト注入用。省略時 global `fetch`。 */
  fetchImpl?: typeof fetch;
  /** ヘルスチェックのタイムアウト (既定 3000ms、設計書 12.8)。 */
  timeoutMs?: number;
}

interface OllamaTagsResponse {
  models?: ReadonlyArray<{ name: string }>;
}

/** `${baseUrl}/api/tags` を叩き、指定 model が pull 済みかを確認する。 */
export async function checkOllamaModelAvailable(
  baseUrl: string,
  model: string,
  fetchImpl: typeof fetch,
  timeoutMs = 3000,
): Promise<LlmCapabilityStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = (await res.json()) as OllamaTagsResponse;
    const hasModel = (data.models ?? []).some(
      (m) => m.name === model || m.name.startsWith(`${model}:`),
    );
    return hasModel
      ? { ok: true }
      : { ok: false, detail: `Model ${model} not pulled. Run: ollama pull ${model}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** chat / embedding 両モデルの可用性を並行チェックする。 */
export async function checkLlmAvailability(
  opts: CheckLlmAvailabilityOptions,
): Promise<LlmProviderAvailability> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [ollama_chat, ollama_embedding] = await Promise.all([
    checkOllamaModelAvailable(opts.baseUrl, opts.chatModel, fetchImpl, opts.timeoutMs),
    checkOllamaModelAvailable(opts.baseUrl, opts.embedModel, fetchImpl, opts.timeoutMs),
  ]);
  return { ollama_chat, ollama_embedding };
}

/** analyzer の `requiresLlm` を availability と照合する。 */
export function evaluateLlmRequirement(
  requiresLlm: Analyzer['requiresLlm'],
  availability: LlmProviderAvailability,
): { satisfied: boolean; missing: string[]; detail: string } {
  const missing: string[] = [];
  const details: string[] = [];
  if (requiresLlm?.chat && !availability.ollama_chat.ok) {
    missing.push('chat');
    if (availability.ollama_chat.detail) details.push(`chat: ${availability.ollama_chat.detail}`);
  }
  if (requiresLlm?.embedding && !availability.ollama_embedding.ok) {
    missing.push('embedding');
    if (availability.ollama_embedding.detail) {
      details.push(`embedding: ${availability.ollama_embedding.detail}`);
    }
  }
  return { satisfied: missing.length === 0, missing, detail: details.join('; ') };
}

/** Ollama 不在時のスキップ理由に添える環境別ヒント (設計書 12.6)。 */
export function ollamaUnavailableHint(baseUrl = 'http://localhost:11434'): string {
  return (
    `Ollama unreachable at ${baseUrl}. ` +
    `Dev Container 内なら anytimeTrail.memory.ollama.baseUrl を "http://host.docker.internal:11434" に設定 / ` +
    `ホストで \`ollama serve\` 起動を確認 / モデル未 pull なら \`ollama pull <model>\``
  );
}
