import { z } from 'zod';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import { buildSpecSummaryPrompt } from '../../ollama/prompts/spec';
import type { MemoryLogger } from '../../logger';

// 2〜3 文の要約に十分な出力長。長文化を防ぐため抑制する。
const DEFAULT_NUM_PREDICT = 256;

const SummarySchema = z.object({
  summary: z.string().optional().default(''),
});

export interface SummarizeSpecDocInput {
  title: string;
  body: string;
  ollama: OllamaClient;
  model?: string;
  logger: MemoryLogger;
}

/**
 * 文書全体（title + body）から 2〜3 文の日本語要約を生成する。
 * claim 抽出（modality 段落限定）とは独立に文書全体を読ませることで、
 * 文書を代表する要約を得る。
 *
 * 失敗（ネットワーク / JSON parse / schema）時は null を返し、必ず logger に記録する。
 * 呼び出し側は null の場合に要約更新をスキップする（既存要約を温存）。
 */
export async function summarizeSpecDoc(
  input: SummarizeSpecDocInput,
): Promise<string | null> {
  const { title, body, ollama, logger } = input;
  const model = input.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';

  const prompt = buildSpecSummaryPrompt({ title, body });

  let responseText: string;
  try {
    const result = await ollama.generate({
      model,
      prompt,
      format: 'json',
      options: { num_predict: DEFAULT_NUM_PREDICT },
    });
    responseText = result.response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[anytime-memory] summarizeSpecDoc: Ollama generate failed for "${title}": ${msg}`,
      err,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    logger.error(
      `[anytime-memory] summarizeSpecDoc: JSON.parse failed for "${title}": ${responseText.slice(0, 200)}`,
      err,
    );
    return null;
  }

  const validated = SummarySchema.safeParse(parsed);
  if (!validated.success) {
    logger.error(
      `[anytime-memory] summarizeSpecDoc: zod validation failed for "${title}": ${validated.error.message}`,
      validated.error,
    );
    return null;
  }

  const summary = validated.data.summary.trim();
  if (!summary) {
    logger.warn?.(
      `[anytime-memory] summarizeSpecDoc: empty summary for "${title}" (skipping update)`,
    );
    return null;
  }
  return summary;
}
