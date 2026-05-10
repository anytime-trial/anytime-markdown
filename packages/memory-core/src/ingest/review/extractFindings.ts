import { z } from 'zod';
import type { OllamaClient } from '../../ollama/client';
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
}): Promise<{
  findings: ParsedFinding[];
  llm_calls: number;
}> {
  const { findings, ollama, model, logger } = input;

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
    } catch (err) {
      logger.warn(
        `[extractFindings] LLM category refinement failed for finding_index=${finding.finding_index}: ${err instanceof Error ? err.message : String(err)}`,
      );
      finding.category = 'other';
    }
  }

  // Merge back preserving original order
  const allFindings = [...kept, ...needsLLM].sort(
    (a, b) => a.finding_index - b.finding_index,
  );

  return { findings: allFindings, llm_calls };
}
