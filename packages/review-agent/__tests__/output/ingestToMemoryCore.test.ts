import { AgentReviewInputSchema } from '../../src/types/AgentReviewInput';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const VALID_FIXTURE = {
  run_id: VALID_UUID,
  trigger_kind: 'manual',
  target_kind: 'code',
  target_refs: ['packages/web-app/src/Button.tsx'],
  model: 'qwen3.5:9b',
  prompt_kind: 'logic',
  prompt_hash: 'abc123',
  started_at: '2026-01-01T00:00:00.000Z',
  finished_at: '2026-01-01T00:01:00.000Z',
  input_tokens: 500,
  output_tokens: 800,
  gpu_used: '',
  ollama_endpoint: 'http://localhost:11434',
  findings: [
    {
      finding_index: 0,
      category: 'a11y',
      severity: 'warn',
      target_file_path: 'packages/web-app/src/Button.tsx',
      target_symbol: null,
      target_line_start: 10,
      target_line_end: 12,
      finding_text: 'aria-label missing on interactive element',
      suggestion_text: 'add aria-label="Submit"',
      confidence: 0.92,
    },
  ],
};

test('IF compatibility: valid fixture passes AgentReviewInputSchema.parse', () => {
  expect(() => AgentReviewInputSchema.parse(VALID_FIXTURE)).not.toThrow();
  const parsed = AgentReviewInputSchema.parse(VALID_FIXTURE);
  expect(parsed.run_id).toBe(VALID_UUID);
  expect(parsed.findings).toHaveLength(1);
  expect(parsed.findings[0].severity).toBe('warn');
});

test('IF compatibility: invalid severity throws ZodError', () => {
  const invalid = {
    ...VALID_FIXTURE,
    findings: [{ ...VALID_FIXTURE.findings[0], severity: 'UNKNOWN' }],
  };
  expect(() => AgentReviewInputSchema.parse(invalid)).toThrow();
});

test('IF compatibility: empty findings array is valid', () => {
  const noFindings = { ...VALID_FIXTURE, findings: [] };
  const parsed = AgentReviewInputSchema.parse(noFindings);
  expect(parsed.findings).toHaveLength(0);
});
