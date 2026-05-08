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
  summary: z.string(),
  entities: z.array(EntitySchema).optional().default([]),
  relations: z.array(RelationSchema).optional().default([]),
  questions: z.array(QuestionSchema).optional().default([]),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

function hasQuestionMark(text: string): boolean {
  return /[?？]/.test(text);
}

export async function extractFactsFromEpisode(opts: {
  ollama: OllamaClient;
  episode: EpisodeInput;
  model?: string;
  logger: MemoryLogger;
}): Promise<ExtractionResult | null> {
  const { ollama, episode, logger } = opts;
  const model = opts.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen3.5:9b';

  const hasQuestion = hasQuestionMark(episode.raw_excerpt);
  const prompt = hasQuestion
    ? buildConversationPrompt(episode)
    : buildConversationPromptNoQuestion(episode);

  let responseText: string;
  try {
    const result = await ollama.generate({ model, prompt, format: 'json' });
    responseText = result.response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[memory-core] Ollama generate failed: ${msg}`, err);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    logger.error(
      `[memory-core] JSON.parse failed for episode ${episode.message_uuid_start}`,
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
