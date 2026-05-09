import { refineCategories } from '../../../src/ingest/review/extractFindings';
import type { OllamaClient } from '../../../src/ollama/client';
import type { ParsedFinding } from '../../../src/ingest/review/findingHelpers';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<ParsedFinding> & { finding_index: number }): ParsedFinding {
  return {
    finding_index: overrides.finding_index,
    target_file_path: null,
    target_symbol: null,
    target_line_start: null,
    target_line_end: null,
    category: 'other',
    severity: 'info',
    finding_text: 'test finding text',
    suggestion_text: 'test suggestion',
    chapter_path: '1. テスト',
    is_category_inferred: false,
    ...overrides,
  };
}

function makeOllama(response: string): { client: OllamaClient; spy: jest.Mock } {
  const spy = jest.fn().mockResolvedValue({ response });
  const client: OllamaClient = {
    generate: spy,
    embeddings: jest.fn(),
  };
  return { client, spy };
}

function makeLogger(): { warn: jest.Mock } {
  return { warn: jest.fn() };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('refineCategories', () => {
  // Test 1: inferred=true, LLM returns valid category
  test('updates category when LLM returns valid JSON', async () => {
    const finding = makeFinding({ finding_index: 0, is_category_inferred: true, category: 'other' });
    const { client, spy } = makeOllama(JSON.stringify({ category: 'a11y', confidence: 0.9 }));
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [finding],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.llm_calls).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe('a11y');
    expect(result.findings[0].is_category_inferred).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Test 2: inferred=false only → llm_calls=0
  test('skips LLM when no findings need refinement', async () => {
    const finding = makeFinding({ finding_index: 0, is_category_inferred: false, category: 'design' });
    const { client, spy } = makeOllama('{}');
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [finding],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.llm_calls).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(result.findings[0].category).toBe('design');
  });

  // Test 3: mix 1 inferred + 1 not → llm_calls=1, both returned
  test('processes only inferred findings and returns all', async () => {
    const inferredFinding = makeFinding({
      finding_index: 0,
      is_category_inferred: true,
      category: 'other',
    });
    const knownFinding = makeFinding({
      finding_index: 1,
      is_category_inferred: false,
      category: 'security',
    });
    const { client, spy } = makeOllama(JSON.stringify({ category: 'perf', confidence: 0.75 }));
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [inferredFinding, knownFinding],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.llm_calls).toBe(1);
    expect(result.findings).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);

    const f0 = result.findings.find((f) => f.finding_index === 0)!;
    const f1 = result.findings.find((f) => f.finding_index === 1)!;
    expect(f0.category).toBe('perf');
    expect(f1.category).toBe('security');
  });

  // Test 4: LLM returns invalid JSON → logger.warn, category stays 'other', no throw
  test('handles invalid JSON from LLM gracefully', async () => {
    const finding = makeFinding({ finding_index: 0, is_category_inferred: true, category: 'other' });
    const { client, spy } = makeOllama('NOT_VALID_JSON');
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [finding],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.llm_calls).toBe(1);
    expect(result.findings[0].category).toBe('other');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Test 5: LLM returns valid JSON but category not in enum → zod fails, warn called
  test('handles invalid enum value via zod validation failure', async () => {
    const finding = makeFinding({ finding_index: 0, is_category_inferred: true, category: 'other' });
    const { client, spy } = makeOllama(JSON.stringify({ category: 'INVALID', confidence: 0.8 }));
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [finding],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.llm_calls).toBe(1);
    expect(result.findings[0].category).toBe('other');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Test 6: empty array input
  test('returns empty findings and llm_calls=0 for empty input', async () => {
    const { client, spy } = makeOllama('{}');
    const logger = makeLogger();

    const result = await refineCategories({
      findings: [],
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(result.findings).toEqual([]);
    expect(result.llm_calls).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  // Test 7: spy called exactly N times (N = inferred count)
  test('calls generate exactly N times for N inferred findings', async () => {
    const findings = [
      makeFinding({ finding_index: 0, is_category_inferred: true }),
      makeFinding({ finding_index: 1, is_category_inferred: true }),
      makeFinding({ finding_index: 2, is_category_inferred: false }),
      makeFinding({ finding_index: 3, is_category_inferred: true }),
    ];
    const { client, spy } = makeOllama(JSON.stringify({ category: 'logic', confidence: 0.7 }));
    const logger = makeLogger();

    const result = await refineCategories({
      findings,
      ollama: client,
      model: 'llama3',
      logger,
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.llm_calls).toBe(3);
    expect(result.findings).toHaveLength(4);
  });

  // Additional: input array is not mutated
  test('does not mutate the input array', async () => {
    const finding = makeFinding({ finding_index: 0, is_category_inferred: true, category: 'other' });
    const inputFindings = [finding];
    const { client } = makeOllama(JSON.stringify({ category: 'a11y', confidence: 0.9 }));
    const logger = makeLogger();

    await refineCategories({
      findings: inputFindings,
      ollama: client,
      model: 'llama3',
      logger,
    });

    // Original object should not be mutated
    expect(inputFindings[0].category).toBe('other');
    expect(inputFindings[0].is_category_inferred).toBe(true);
  });
});
