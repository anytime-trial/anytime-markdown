import { z } from 'zod';
import type { OllamaClient } from '@anytime-markdown/ollama-core';
import { buildSpecPrompt } from '../../ollama/prompts/spec';
import type { MemoryLogger } from '../../logger';
import type { FilteredParagraph } from './preFilterClaims';

// ── Re-exports ────────────────────────────────────────────────────────────────

export type { FilteredParagraph };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Claim {
  subject: { type: string; name: string };
  predicate: string;
  object: { type: string; name: string };
  modality: 'mandatory' | 'forbidden' | 'recommended';
  line_hint: number;
  confidence: number;
}

export interface ExtractResult {
  summary: string;
  claims: Claim[];
}

export interface ExtractClaimsInput {
  paragraphs: FilteredParagraph[];
  c4Scope: string[];
  ollama: OllamaClient;
  model?: string;
  logger: MemoryLogger;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const EndpointSchema = z.object({
  type: z.string(),
  name: z.string(),
});

const ClaimSchema = z.object({
  subject: EndpointSchema,
  predicate: z.string(),
  object: EndpointSchema,
  modality: z.enum(['mandatory', 'forbidden', 'recommended']),
  line_hint: z.number(),
  confidence: z.number().min(0).max(1),
});

// summary は本来必須としてプロンプトに記載しているが、qwen2.5 系を含む LLM が
// 省略するケースが観測される (2026-05-14)。欠落で claims 全体を捨てるのは過剰なため、
// optional + default '' に緩和し、欠落時のみ warn ログで記録する。
const ExtractResultSchema = z.object({
  summary: z.string().optional().default(''),
  claims: z.array(ClaimSchema).default([]),
});

// ── Implementation ────────────────────────────────────────────────────────────

const MIN_CONFIDENCE = 0.6;

/**
 * Extract requirement claims from filtered spec paragraphs via Ollama.
 * Returns null on any failure (network, JSON parse, schema validation).
 * Never silently swallows errors — always logs via logger.error before returning null.
 */
export async function extractClaims(
  input: ExtractClaimsInput,
): Promise<ExtractResult | null> {
  const { paragraphs, c4Scope, ollama, logger } = input;
  const model =
    input.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen2.5:7b';

  const prompt = buildSpecPrompt({ paragraphs, c4Scope });

  let responseText: string;
  try {
    const result = await ollama.generate({ model, prompt, format: 'json' });
    responseText = result.response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[anytime-memory] Ollama generate failed during spec claim extraction: ${msg}`,
      err,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    logger.error(
      `[anytime-memory] JSON.parse failed for spec claim extraction response`,
      err,
    );
    return null;
  }

  const validated = ExtractResultSchema.safeParse(parsed);
  if (!validated.success) {
    logger.error(
      `[anytime-memory] Zod validation failed for spec claim extraction: ${validated.error.message}`,
      validated.error,
    );
    return null;
  }

  const data = validated.data;
  if (!hasSummaryField(parsed)) {
    logger.warn?.(
      `[anytime-memory] spec claim extraction: LLM omitted 'summary' field (continuing with empty summary)`,
    );
  }
  const filteredClaims = data.claims.filter(
    (c) => c.confidence >= MIN_CONFIDENCE,
  );

  return {
    summary: data.summary,
    claims: filteredClaims,
  };
}

function hasSummaryField(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  return 'summary' in raw && typeof (raw as Record<string, unknown>)['summary'] === 'string';
}
