import { z } from 'zod';
import type { OllamaClient } from '../../ollama/client';
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

const ExtractResultSchema = z.object({
  summary: z.string(),
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
    input.model ?? process.env['MEMORY_CORE_GEN_MODEL'] ?? 'qwen3.5:9b';

  const prompt = buildSpecPrompt({ paragraphs, c4Scope });

  let responseText: string;
  try {
    const result = await ollama.generate({ model, prompt, format: 'json' });
    responseText = result.response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[memory-core] Ollama generate failed during spec claim extraction: ${msg}`,
      err,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    logger.error(
      `[memory-core] JSON.parse failed for spec claim extraction response`,
      err,
    );
    return null;
  }

  const validated = ExtractResultSchema.safeParse(parsed);
  if (!validated.success) {
    logger.error(
      `[memory-core] Zod validation failed for spec claim extraction: ${validated.error.message}`,
      validated.error,
    );
    return null;
  }

  const data = validated.data;
  const filteredClaims = data.claims.filter(
    (c) => c.confidence >= MIN_CONFIDENCE,
  );

  return {
    summary: data.summary,
    claims: filteredClaims,
  };
}
