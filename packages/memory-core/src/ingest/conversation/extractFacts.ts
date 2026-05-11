import { z } from 'zod';
import type { OllamaClient } from '../../ollama/client';
import {
  buildConversationPrompt,
  buildConversationPromptNoQuestion,
  type EpisodeInput,
} from '../../ollama/prompts/conversation';
import type { MemoryLogger } from '../../logger';

// Re-export EpisodeInput for consumers of this module
export type { EpisodeInput };

const EntitySchema = z.object({
  type: z.enum([
    'Person',
    'Project',
    'Package',
    'File',
    'Library',
    'Tool',
    'Concept',
    'Decision',
    'Bug',
    'Task',
    'Skill',
    'Rule',
    'Commit',
    'Question',
  ]),
  name: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  attributes: z.record(z.string(), z.unknown()).optional().default({}),
});

const RelationEndpointSchema = z.object({
  type: z.string(),
  name: z.string(),
});

const RelationSchema = z.object({
  subject: RelationEndpointSchema,
  predicate: z.enum([
    'prefers',
    'dislikes',
    'depends_on',
    'replaces',
    'relates_to',
    'mentioned_in',
    'authored_by',
    'works_on',
    'uses',
    'fixes',
    'affects',
    'caused_by',
    'introduced_by',
    'asked_by',
    'answered_in',
  ]),
  object: RelationEndpointSchema,
  valid_from: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.8),
});

const QuestionSchema = z.object({
  text: z.string(),
  target_spec_path: z.string().nullable().optional(),
  target_symbol: z.string().nullable().optional(),
  asked_by: z.string().optional(),
  answered_in: z.boolean().optional(),
});

const ExtractionResultSchema = z.object({
  summary: z.string().nullable().optional().transform(v => v ?? ''),
  // Use .catch(null) to silently drop items with unknown type/predicate instead of
  // failing the whole episode, then filter out the nulls.
  entities: z.array(EntitySchema.catch(null as unknown as z.infer<typeof EntitySchema>))
    .optional().default([])
    .transform(arr => arr.filter((x): x is z.infer<typeof EntitySchema> => x !== null)),
  relations: z.array(RelationSchema.catch(null as unknown as z.infer<typeof RelationSchema>))
    .optional().default([])
    .transform(arr => arr.filter((x): x is z.infer<typeof RelationSchema> => x !== null)),
  questions: z.array(QuestionSchema).optional().default([]),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

function hasQuestionMark(text: string): boolean {
  return /[?？]/.test(text);
}

const DEFAULT_NUM_CTX = 4096;
const DEFAULT_NUM_PREDICT = 1024;

function resolveOllamaOptions(): Record<string, unknown> {
  // num_ctx=4096 + NUM_PARALLEL=2 では各 slot effective 2048 token のため
  // 長い episode で JSON output が途中切断 (~1.4%) する。一度 num_ctx=8192
  // を試したが、KV cache 倍化で wall-clock が +47% 遅化したため既定は
  // 4096 に戻し、切断した episode は memory_failed_items 経由で後段
  // (Phase 5 等) で再処理する設計を選ぶ。
  // 失敗を抑えたい運用では MEMORY_CORE_NUM_CTX=8192 で override 可。
  // 環境変数 MEMORY_CORE_NUM_PREDICT も同様に override 可。
  const numCtxRaw = process.env['MEMORY_CORE_NUM_CTX'];
  const numCtx = numCtxRaw && Number.isFinite(Number(numCtxRaw)) && Number(numCtxRaw) > 0
    ? Number(numCtxRaw)
    : DEFAULT_NUM_CTX;
  const numPredictRaw = process.env['MEMORY_CORE_NUM_PREDICT'];
  const numPredict = numPredictRaw && Number.isFinite(Number(numPredictRaw)) && Number(numPredictRaw) > 0
    ? Number(numPredictRaw)
    : DEFAULT_NUM_PREDICT;
  return { num_ctx: numCtx, num_predict: numPredict };
}

export async function extractFactsFromEpisode(opts: {
  ollama: OllamaClient;
  episode: EpisodeInput;
  model?: string;
  logger: MemoryLogger;
}): Promise<ExtractionResult | null> {
  const { ollama, episode, logger } = opts;
  const model = opts.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';

  const hasQuestion = hasQuestionMark(episode.raw_excerpt);
  const prompt = hasQuestion
    ? buildConversationPrompt(episode)
    : buildConversationPromptNoQuestion(episode);

  let responseText: string;
  try {
    const result = await ollama.generate({
      model,
      prompt,
      format: 'json',
      options: resolveOllamaOptions(),
    });
    responseText = result.response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[memory-core] Ollama generate failed: ${msg}`, err);
    return null;
  }

  if (!responseText) {
    logger.error(`[memory-core] Empty response from Ollama for episode ${episode.message_uuid_start}`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    logger.error(
      `[memory-core] JSON.parse failed for episode ${episode.message_uuid_start}: ${responseText.slice(0, 200)}`,
      err,
    );
    return null;
  }

  const validation = ExtractionResultSchema.safeParse(parsed);
  if (!validation.success) {
    logger.error(
      `[memory-core] zod validation failed for episode ${episode.message_uuid_start}: ${validation.error?.message ?? JSON.stringify(validation.error)}`,
    );
    return null;
  }

  return validation.data;
}
