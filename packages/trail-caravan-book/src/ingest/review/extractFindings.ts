import { z } from 'zod';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { ParsedFinding } from './findingHelpers';
import { buildReviewCategoryPrompt, CATEGORIES } from '../../ollama/prompts/reviewFindingCategory';

const LLMResultSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
});

export async function refineCategories(input: {
  findings: ParsedFinding[];
  ollama: OllamaClient;
  model: string;
  logger: { warn: (msg: string) => void };
  /**
   * chat model が使えるか。false のときは Ollama を 1 度も叩かず、未確定の指摘へ
   * 'pending_llm' の印を付けて返す。取込そのものは決定論パースで完結するので、
   * category 推論ができないことを理由に scope ごと落とさない。
   */
  chatAvailable?: boolean;
}): Promise<{
  findings: ParsedFinding[];
  llm_calls: number;
}> {
  const { findings, ollama, model, logger } = input;
  const chatAvailable = input.chatAvailable ?? true;

  const needsLLM: ParsedFinding[] = [];
  const kept: ParsedFinding[] = [];

  for (const f of findings) {
    if (f.is_category_inferred) {
      needsLLM.push({ ...f });
    } else {
      kept.push({ ...f });
    }
  }

  if (needsLLM.length === 0) {
    return { findings: [...kept], llm_calls: 0 };
  }

  if (!chatAvailable) {
    // 印だけ付けて返す。'other' で確定させないのは、後から埋め直す経路が消えるため。
    for (const finding of needsLLM) finding.category_inferred_by = 'pending_llm';
    logger.warn(
      `[extractFindings] chat model 不在のため category 推論を保留: ${needsLLM.length} 件を pending_llm として取り込む`,
    );
    const merged = [...kept, ...needsLLM].sort((a, b) => a.finding_index - b.finding_index);
    return { findings: merged, llm_calls: 0 };
  }

  let llm_calls = 0;

  for (const finding of needsLLM) {
    const prompt = buildReviewCategoryPrompt({
      text: finding.finding_text,
      chapter: finding.chapter_path || undefined,
    });

    llm_calls++;
    try {
      const result = await ollama.generate({ model, prompt, format: 'json' });
      const parsed = JSON.parse(result.response);
      const validated = LLMResultSchema.parse(parsed);
      finding.category = validated.category;
      finding.is_category_inferred = false;
      finding.category_inferred_by = 'llm';
    } catch (err) {
      logger.warn(
        `[extractFindings] LLM category refinement failed for finding_index=${finding.finding_index}: ${err instanceof Error ? err.message : String(err)}`,
      );
      finding.category = 'other';
      // is_category_inferred は true のまま残す。単発の失敗を確定扱いにすると、
      // Ollama の一時障害がそのまま恒久的な誤 category になる。
      finding.category_inferred_by = 'pending_llm';
    }
  }

  // Merge back preserving original order
  const allFindings = [...kept, ...needsLLM].sort(
    (a, b) => a.finding_index - b.finding_index,
  );

  return { findings: allFindings, llm_calls };
}
